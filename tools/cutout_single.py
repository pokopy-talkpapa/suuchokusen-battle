#!/usr/bin/env python3
"""マゼンタ#FF00FF背景の単体スプライトをクロマキー除去し、余白をトリムして保存する。
使い方: python3 tools/cutout_single.py <入力png> <出力png>"""
import sys
from PIL import Image

def chroma_key(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mag = min(r, b) - g  # マゼンタ度（高いほど背景）
            if r > 170 and b > 170 and g < 120:
                px[x, y] = (r, g, b, 0)
            elif mag > 70:
                ng = min(255, g + mag // 2)
                alpha = max(0, 255 - mag * 2)
                px[x, y] = (r, ng, b, alpha)
    return img

def trim(img):
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img

if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    img = trim(chroma_key(Image.open(src)))
    img.save(out)
    print(f"saved {out}: {img.size[0]}x{img.size[1]}")
