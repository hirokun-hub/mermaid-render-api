#!/usr/bin/env python3
"""PNG ピクセル解析: 各ノード矩形の内側余白を測定。
背景=透明 / ノード塗り=淡黄 (#ECECFF風のbase theme) / テキスト=濃色 という前提で、
- 不透明ピクセル全体の bounding box (ノード描画域)
- "濃い" ピクセルの bounding box (文字を含むエッジ・線)
- 各ノード塗りの大領域を flood-fill 的に切り出して内側のテキスト bbox を比較
までを簡易計測。完全なノード単位分割は難しいので、全体統計で済ませる。"""
import json
import pathlib
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
cases = json.loads((ROOT / "scripts/cases.json").read_text())

results = []
for c in cases:
    cid = c["id"]
    p = ROOT / f"renders/{cid}.png"
    img = Image.open(p).convert("RGBA")
    w, h = img.size
    px = img.load()

    # 不透明ピクセルの bbox = ダイアグラム全体
    bbox_all = img.getbbox()
    # 「濃い」ピクセル (R+G+B < 350 かつ alpha>200) は線・テキスト
    dark_xs, dark_ys = [], []
    for y in range(h):
        for x in range(w):
            r,g,b,a = px[x,y]
            if a > 200 and (r + g + b) < 350:
                dark_xs.append(x); dark_ys.append(y)
    if dark_xs:
        dark_bbox = (min(dark_xs), min(dark_ys), max(dark_xs)+1, max(dark_ys)+1)
    else:
        dark_bbox = None

    # 外周余白(透明部分)
    pad_top    = bbox_all[1] if bbox_all else 0
    pad_left   = bbox_all[0] if bbox_all else 0
    pad_right  = w - bbox_all[2] if bbox_all else 0
    pad_bottom = h - bbox_all[3] if bbox_all else 0

    results.append({
        "id": cid,
        "img_w": w, "img_h": h,
        "diagram_bbox": list(bbox_all) if bbox_all else None,
        "diagram_w": bbox_all[2]-bbox_all[0] if bbox_all else 0,
        "diagram_h": bbox_all[3]-bbox_all[1] if bbox_all else 0,
        "outer_pad": {"top": pad_top, "left": pad_left, "right": pad_right, "bottom": pad_bottom},
        "dark_bbox": list(dark_bbox) if dark_bbox else None,
    })

(ROOT / "png_measurements.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
print(json.dumps(results, ensure_ascii=False, indent=2))
