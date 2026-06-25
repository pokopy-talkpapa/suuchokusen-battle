#!/usr/bin/env python3
"""ものさし帯（マゼンタ#FF00FF背景）をクロマキー除去→トリミングして ruler-bg.png に。"""
import os
from PIL import Image

SRC = "/Users/pokopy/Downloads/ChatGPT Image 2026年6月25日 15_58_40.png"
OUT = "/Users/pokopy/Workspace/suuchokusen-battle/assets/ruler-bg.png"

def chroma_key(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            mag = min(r, b) - g
            if r > 170 and b > 170 and g < 120:
                px[x, y] = (r, g, b, 0)
            elif mag > 70:
                ng = min(255, g + mag // 2)
                alpha = max(0, 255 - mag * 2)
                px[x, y] = (r, ng, b, alpha)
    return img

img = chroma_key(Image.open(SRC))
bbox = img.getbbox()
img = img.crop(bbox) if bbox else img
img.save(OUT)
print(f"ruler-bg.png  {img.size}")
