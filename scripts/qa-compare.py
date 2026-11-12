"""Side-by-side QA: reference mockup pages (top) against the rendered PDF pages (bottom).

Usage: python3 scripts/qa-compare.py <pdf-dir> <tpl-dir> <out-dir>
Needs pdftoppm (poppler) and Pillow. Reference pages are cut from the 1536x1024 mockups.
"""
import os
import subprocess
import sys
from PIL import Image, ImageDraw

pdf_dir, tpl_dir, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)
refs = {
    "minimal": ("Swiss Minimal/reference/Swiss_Minimal_mockup.png", [(22, 146, 484, 916), (502, 146, 1003, 916), (1018, 146, 1522, 916)]),
    "studio": ("Studio Editorial/reference/Studio Editorial.png", [(22, 138, 484, 916), (500, 138, 993, 916), (1006, 138, 1490, 916)]),
    "editorial": ("Editorial Atelier/reference/Editorial Atelier.png", [(14, 102, 478, 922), (494, 102, 996, 922), (1010, 102, 1522, 922)]),
    "corporate": ("Corporate Executive/reference/mockup_original.png", [(14, 100, 472, 926), (486, 100, 978, 926), (1000, 100, 1504, 926)]),
    "bold": ("Bold Impact/reference/Bold_Impact_mockup.png", [(12, 100, 472, 926), (486, 100, 990, 926), (1002, 100, 1524, 926)]),
}
W = 760
for key, (ref, boxes) in refs.items():
    pdf = os.path.join(pdf_dir, f"{key}.pdf")
    if not os.path.exists(pdf):
        continue
    prefix = os.path.join(out_dir, f"{key}-page")
    subprocess.run(["pdftoppm", "-r", "110", "-png", pdf, prefix], check=True)
    rendered = sorted(f for f in os.listdir(out_dir) if f.startswith(f"{key}-page") and f.endswith(".png"))
    reference = Image.open(os.path.join(tpl_dir, ref)).convert("RGB")
    tops = [reference.crop(box) for box in boxes]
    bottoms = [Image.open(os.path.join(out_dir, name)).convert("RGB") for name in rendered[:3]]
    cells = []
    for index in range(3):
        # Same width for both: the mockup pages are taller than A4, so the reference runs longer.
        top = tops[index].resize((W, round(tops[index].height * W / tops[index].width)))
        bottom = bottoms[index].resize((W, round(bottoms[index].height * W / bottoms[index].width))) if index < len(bottoms) else Image.new("RGB", (W, round(W * 1.414)), "white")
        cells.append((top, bottom))
    top_h = max(top.height for top, _ in cells)
    bottom_h = max(bottom.height for _, bottom in cells)
    sheet = Image.new("RGB", (3 * (W + 30) + 10, top_h + bottom_h + 100), "#E8E8E8")
    x = 20
    for top, bottom in cells:
        sheet.paste(top, (x, 50))
        sheet.paste(bottom, (x, top_h + 80))
        x += W + 30
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 18), f"{key}: mockup (sopra) / PDF generato (sotto)", fill="#111")
    sheet.save(os.path.join(out_dir, f"{key}-compare.png"))
    print(os.path.join(out_dir, f"{key}-compare.png"), len(rendered), "pagine")
