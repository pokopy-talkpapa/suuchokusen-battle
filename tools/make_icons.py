#!/usr/bin/env python3
"""ホーム画面アイコンを生成。海色の角丸正方形に大砲スプライトを中央配置。"""
from PIL import Image, ImageDraw

CANNON = "/Users/pokopy/Workspace/suuchokusen-battle/assets/cannon.png"
OUT = "/Users/pokopy/Workspace/suuchokusen-battle/assets"
BG = (26, 111, 168, 255)  # #1a6fa8

def make(size):
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    # 角丸の海色背景
    bg = Image.new("RGBA", (size, size), BG)
    mask = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(mask)
    r = int(size * 0.22)
    d.rounded_rectangle([0, 0, size, size], radius=r, fill=255)
    canvas.paste(bg, (0, 0), mask)
    # 大砲を中央に（幅の約74%）
    cannon = Image.open(CANNON).convert("RGBA")
    tw = int(size * 0.74)
    th = int(cannon.height * tw / cannon.width)
    cannon = cannon.resize((tw, th))
    canvas.alpha_composite(cannon, ((size - tw) // 2, (size - th) // 2))
    out = f"{OUT}/icon-{size}.png"
    canvas.save(out)
    print(f"icon-{size}.png  {canvas.size}")

for s in (192, 512):
    make(s)
