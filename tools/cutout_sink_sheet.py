#!/usr/bin/env python3
"""沈む船の3コマシート(マゼンタ#FF00FF背景)を3等分し、各コマをクロマキー除去して保存。
コマ間でサイズ・喫水線を揃えるため、各コマは同寸法(セル丸ごと)で保存しトリムしない。
使い方: python3 tools/cutout_sink_sheet.py <入力png> <出力プレフィックス>
  例)  python3 tools/cutout_sink_sheet.py sheet.png assets/ship-sink
       → assets/ship-sink-1.png / -2.png / -3.png
"""
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

if __name__ == "__main__":
    src, prefix = sys.argv[1], sys.argv[2]
    sheet = Image.open(src).convert("RGBA")
    w, h = sheet.size
    cw = w // 3
    for i in range(3):
        cell = sheet.crop((i * cw, 0, (i + 1) * cw if i < 2 else w, h))
        out = chroma_key(cell)
        path = f"{prefix}-{i+1}.png"
        out.save(path)
        print(f"saved {path}: {out.size[0]}x{out.size[1]}")
