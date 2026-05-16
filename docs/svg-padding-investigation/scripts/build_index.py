#!/usr/bin/env python3
"""Build a single HTML page embedding all rendered SVGs and PNGs side by side
for visual inspection and JS-based measurement in a real browser."""
import json
import pathlib
import base64

ROOT = pathlib.Path(__file__).resolve().parent.parent
cases = json.loads((ROOT / "scripts/cases.json").read_text())

rows = []
for c in cases:
    cid = c["id"]
    desc = c["desc"]
    svg = (ROOT / f"renders/{cid}.svg").read_text()
    png_bytes = (ROOT / f"renders/{cid}.png").read_bytes()
    png_b64 = base64.b64encode(png_bytes).decode()
    rows.append(f"""
<section class="case" data-id="{cid}">
  <h2>{cid} — {desc}</h2>
  <div class="cols">
    <div class="col">
      <h3>SVG (host browser, no Noto Sans CJK JP)</h3>
      <div class="svg-host">{svg}</div>
    </div>
    <div class="col">
      <h3>PNG (server-rasterized, has Noto Sans CJK JP)</h3>
      <img src="data:image/png;base64,{png_b64}" />
    </div>
  </div>
</section>
""")

html = f"""<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>SVG padding investigation</title>
<style>
  body {{ font-family: sans-serif; margin: 20px; background: #fafafa; }}
  .case {{ background: #fff; border: 1px solid #ddd; padding: 12px; margin-bottom: 24px; }}
  .cols {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  .col {{ border: 1px dashed #ccc; padding: 8px; background: #fff; }}
  .svg-host svg, .col img {{ max-width: 100%; height: auto; display: block; outline: 1px dotted #aaa; }}
  h2 {{ font-size: 14px; margin: 0 0 8px; }}
  h3 {{ font-size: 12px; margin: 0 0 6px; color: #555; }}
</style>
</head><body>
<h1>SVG padding investigation</h1>
{''.join(rows)}
</body></html>"""

(ROOT / "renders/index.html").write_text(html)
print("wrote", ROOT / "renders/index.html")
