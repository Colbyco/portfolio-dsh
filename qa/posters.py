"""Generate stage posters (public/posters/<slug>.webp) from each running preview.
Usage: python qa/posters.py <base_url> [slug ...]   (own headless Chrome, temp profile)
The poster is what paints first; the live iframe replaces it once loaded.
"""
import io, json, re, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image

root = Path(__file__).resolve().parent.parent
base = sys.argv[1].rstrip("/")
only = set(sys.argv[2:])
src = (root / "src" / "data" / "projects.ts").read_text(encoding="utf-8")
# slug -> url from the data file (simple parse: slug ... url within the same entry)
entries = re.findall(r'slug: "([^"]+)".*?preview: \{\s*mode: "(\w+)",(?:\s*url: "([^"]*)",)?', src, re.S)
out = root / "public" / "posters"
out.mkdir(parents=True, exist_ok=True)

def stamp(url):
    if "aspicio.app/chart" in url:
        from datetime import datetime
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("America/Los_Angeles"))
        url += f"&date={now:%Y-%m-%d}&time={now:%H:%M}"
    return url

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for slug, mode, url in entries:
        if not url or (only and slug not in only):
            continue
        full = stamp(url if url.startswith("http") else base + url)
        pg = b.new_page(viewport={"width": 1280, "height": 860}, color_scheme="dark")
        try:
            resp = pg.goto(full, wait_until="load", timeout=45000)
            time.sleep(6 if slug in ("aspicio", "music-search", "weather") else 2.5)
            png = pg.screenshot(type="png")
            img = Image.open(io.BytesIO(png)).convert("RGB")
            if resp is not None and resp.status >= 400:
                print(f"{slug:24} HTTP {resp.status}: skipped")
                continue
            dest = out / f"{slug}.webp"
            img.save(dest, "WEBP", quality=70, method=6)
            small = out / f"{slug}-800.webp"
            img.resize((800, round(800 * img.height / img.width)), Image.LANCZOS).save(small, "WEBP", quality=70, method=6)
            print(f"{slug:24} {resp.status if resp else '-'} -> {dest.stat().st_size // 1024} KB / {small.stat().st_size // 1024} KB")
        except Exception as e:
            print(f"{slug:24} FAILED: {e}")
        finally:
            pg.close()
    b.close()
