"""Capture both live portfolios at identical viewports and compose labeled side-by-side images.
Output: <out_dir>/compare-<size>.png and individual captures. Own headless Chrome, read-only."""
import sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
SITES = [("DeepSeek Harness version", "https://colby-portfolio-dsh.vercel.app/"), ("ChatGPT version", "https://colbyco.github.io/")]
SIZES = [("desktop-1440x900", 1440, 900, False), ("desktop-1920x1080", 1920, 1080, False), ("mobile-390x844", 390, 844, True)]
font_path = "C:/Windows/Fonts/segoeuib.ttf"

heights = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for size, w, h, mobile in SIZES:
        shots = []
        for label, url in SITES:
            ctx = b.new_context(viewport={"width": w, "height": h}, is_mobile=mobile, device_scale_factor=1)
            pg = ctx.new_page()
            pg.goto(url, wait_until="load")
            time.sleep(7)
            f = out / f"{'dsh' if 'DeepSeek' in label else 'chatgpt'}-{size}.png"
            pg.screenshot(path=str(f))
            heights[(label, size)] = pg.evaluate("document.documentElement.scrollHeight")
            shots.append((label, f))
            ctx.close()
        imgs = [Image.open(f) for _, f in shots]
        pad, head = 24, 56
        W = sum(i.width for i in imgs) + pad * (len(imgs) + 1)
        H = max(i.height for i in imgs) + head + pad
        canvas = Image.new("RGB", (W, H), (236, 234, 228))
        d = ImageDraw.Draw(canvas)
        ft = ImageFont.truetype(font_path, 26 if not mobile else 20)
        x = pad
        for (label, _), im in zip(shots, imgs):
            d.text((x, 14), label, fill=(20, 22, 28), font=ft)
            canvas.paste(im, (x, head))
            d.rectangle([x - 1, head - 1, x + im.width, head + im.height], outline=(180, 178, 170))
            x += im.width + pad
        dest = out / f"compare-{size}.png"
        canvas.save(dest, optimize=True)
        print("wrote", dest.name)
    b.close()
for (label, size), hh in heights.items():
    print(f"{label:26} {size:18} page height {hh}px")
