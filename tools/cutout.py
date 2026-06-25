#!/usr/bin/env python3
"""マゼンタ#FF00FF背景のスプライト束をクロマキー除去→横方向に3分割で切り出す。
Pillow 10.4 のみ使用（numpyは標準で入っているはず。無ければ純Pythonでも可だが遅い）。"""
import sys
from PIL import Image, ImageFilter

SRC_SPRITES = "/Users/pokopy/Downloads/763af6df-7214-49f1-ab07-0a818aa70d97.png"
SRC_SEA     = "/Users/pokopy/Downloads/9f8f3089-b2cf-46c0-86e8-1e3ce1b5a208.png"
OUT = "/Users/pokopy/Workspace/suuchokusen-battle/assets"

import os
os.makedirs(OUT, exist_ok=True)

def chroma_key(img):
    """マゼンタを透明化。縁のフリンジを軽くデスピル。"""
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mag = min(r, b) - g  # マゼンタ度（高いほど背景）
            if r > 170 and b > 170 and g < 120:
                px[x, y] = (r, g, b, 0)               # ベタ背景は完全透明
            elif mag > 70:
                # フリンジ：部分透明＋デスピル（Gを持ち上げて紫被り除去）
                ng = min(255, g + mag // 2)
                alpha = max(0, 255 - mag * 2)
                px[x, y] = (r, ng, b, alpha)
    return img

def column_alpha_max(img):
    w, h = img.size
    px = img.load()
    cols = []
    for x in range(w):
        m = 0
        for y in range(h):
            a = px[x, y][3]
            if a > m:
                m = a
        cols.append(m)
    return cols

def split_blocks(cols, thresh=20, min_gap=8, min_width=20):
    """非空列の連続ブロックを抽出。"""
    blocks = []
    start = None
    gap = 0
    for x, v in enumerate(cols):
        if v > thresh:
            if start is None:
                start = x
            gap = 0
        else:
            if start is not None:
                gap += 1
                if gap >= min_gap:
                    end = x - gap
                    if end - start >= min_width:
                        blocks.append((start, end))
                    start = None
                    gap = 0
    if start is not None:
        blocks.append((start, len(cols) - 1))
    return blocks

def trim_vertical(img):
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img

print("=== スプライト束を読み込み・クロマキー ===")
sprites = chroma_key(Image.open(SRC_SPRITES))
cols = column_alpha_max(sprites)
blocks = split_blocks(cols)
print(f"検出ブロック数: {len(blocks)}  bboxes(x): {blocks}")

names = ["cannon", "ship-enemy", "splash"]
if len(blocks) != 3:
    print(f"⚠️ 3分割できませんでした（{len(blocks)}個）。閾値調整が必要です。")
    sys.exit(1)

for (x0, x1), name in zip(blocks, names):
    sub = sprites.crop((x0, 0, x1 + 1, sprites.height))
    sub = trim_vertical(sub)
    out = os.path.join(OUT, f"{name}.png")
    sub.save(out)
    print(f"  {name}.png  {sub.size}")

print("=== 海背景 ===")
sea = Image.open(SRC_SEA).convert("RGB")
# 横幅1200に軽量化（rendererがキャンバス全体に伸縮するので比率は不問）
ratio = 1200 / sea.width
sea = sea.resize((1200, int(sea.height * ratio)))
sea.save(os.path.join(OUT, "sea-bg.png"))
print(f"  sea-bg.png  {sea.size}")
print("=== 完了 ===")
