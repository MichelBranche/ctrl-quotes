"""Builds the template photos shipped with the app from the design packages.

Usage: python3 scripts/build-template-assets.py /path/to/tpl
Writes WebP for the web preview (public/templates) and JPEG for the PDF (src/server/pdf/photos),
already cropped to the frame each template uses, so both renderers only need object-fit: cover.
"""
import os
import sys
from PIL import Image, ImageFile

ImageFile.LOAD_TRUNCATED_IMAGES = False
SRC = sys.argv[1] if len(sys.argv) > 1 else "/workspace/tpl"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "public", "templates")
PDF = os.path.join(ROOT, "src", "server", "pdf", "photos")

# (template, option, slot, source, aspect w/h, vertical anchor 0..1, horizontal anchor, pdf width px, web width px)
CE = "Corporate Executive/assets/covers"
EA = "Editorial Atelier/assets/photo_options/Editorial_Atelier_Immagini_HD"
SE = "Studio Editorial/assets"
BI = "Bold Impact/assets/covers"
JOBS = [
    ("corporate", "facciata", "cover", f"{CE}/Corporate_Executive_Covers_HD/01_cover_reference.png", 210 / 160, 1.0, 0.5, 1654, 1100),
    # The HD export of 02 arrived truncated: the original 1055 px render stands in for it.
    ("corporate", "ufficio", "cover", f"{CE}/Ufficio dirigenziale moderno al tramonto-1.png", 210 / 160, 0.75, 0.5, 1654, 1100),
    ("corporate", "boardroom", "cover", f"{CE}/Corporate_Executive_Covers_HD/03_boardroom.png", 210 / 160, 0.72, 0.5, 1654, 1100),
    ("corporate", "architettura", "cover", f"{CE}/Corporate_Executive_Covers_HD/04_corporate_architecture.png", 210 / 160, 0.6, 0.5, 1654, 1100),
    ("editorial", "villa", "cover", f"{EA}/01_reference_fedele/cover_villa.png", 210 / 231, 0.55, 0.5, 1654, 1100),
    ("editorial", "villa", "interior", f"{EA}/01_reference_fedele/interior_vaso.png", 1.26, 0.6, 0.5, 1200, 900),
    ("editorial", "arco", "cover", f"{EA}/02_alternativa_1/cover.png", 210 / 231, 0.5, 0.5, 1654, 1100),
    ("editorial", "arco", "interior", f"{EA}/02_alternativa_1/interior.png", 1.26, 0.6, 0.5, 1200, 900),
    ("editorial", "soggiorno", "cover", f"{EA}/03_alternativa_2/cover.png", 210 / 231, 0.5, 0.5, 1654, 1100),
    ("editorial", "soggiorno", "interior", f"{EA}/03_alternativa_2/interior.png", 1.26, 0.6, 0.5, 1200, 900),
    ("editorial", "salotto", "cover", f"{EA}/04_alternativa_3/cover.png", 210 / 231, 0.5, 0.5, 1654, 1100),
    ("editorial", "salotto", "interior", f"{EA}/04_alternativa_3/interior.png", 1.26, 0.6, 0.5, 1200, 900),
    ("studio", "archi", "cover", f"{SE}/cover_original_reference_crop.png", 210 / 117, 0.5, 0.5, 1654, 1100),
    ("studio", "blu", "cover", f"{SE}/cover_variant_1.png", 210 / 117, 1.0, 0.5, 1654, 1100),
    ("studio", "terracotta", "cover", f"{SE}/cover_variant_2.png", 210 / 117, 1.0, 0.5, 1654, 1100),
    ("studio", "salvia", "cover", f"{SE}/cover_variant_3.png", 210 / 117, 1.0, 0.5, 1654, 1100),
    ("bold", "aurora", "cover", f"{BI}/cover_abstract_01.png", 210 / 297, 0.5, 0.5, 1240, 900),
    ("bold", "eclissi", "cover", f"{BI}/cover_abstract_02.png", 210 / 297, 0.5, 0.5, 1240, 900),
    ("bold", "orizzonte", "cover", f"{BI}/cover_abstract_03.png", 210 / 297, 0.5, 0.5, 1240, 900),
]


def crop(image: Image.Image, aspect: float, vy: float, vx: float) -> Image.Image:
    w, h = image.size
    if w / h > aspect:
        nw = round(h * aspect)
        x = round((w - nw) * vx)
        return image.crop((x, 0, x + nw, h))
    nh = round(w / aspect)
    y = round((h - nh) * vy)
    return image.crop((0, y, w, y + nh))


def fit(image: Image.Image, width: int) -> Image.Image:
    if image.width <= width:
        return image
    return image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)


for key, option, slot, source, aspect, vy, vx, pdf_w, web_w in JOBS:
    image = Image.open(os.path.join(SRC, source)).convert("RGB")
    framed = crop(image, aspect, vy, vx)
    os.makedirs(os.path.join(WEB, key), exist_ok=True)
    os.makedirs(os.path.join(PDF, key), exist_ok=True)
    fit(framed, pdf_w).save(os.path.join(PDF, key, f"{option}-{slot}.jpg"), "JPEG", quality=82, optimize=True, progressive=True)
    fit(framed, web_w).save(os.path.join(WEB, key, f"{option}-{slot}.webp"), "WEBP", quality=78, method=6)
    if slot == "cover":
        fit(framed, 320).save(os.path.join(WEB, key, f"{option}-thumb.webp"), "WEBP", quality=72, method=6)
    print(key, option, slot, framed.size)
