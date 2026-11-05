"""Render public/og.png (1200x630) from an HTML card using the generated posters."""
import base64
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parent.parent
posters = root / "public" / "posters"
font = (root / "public" / "fonts" / "inter-latin-wght.woff2").read_bytes()
pick = ["aspicio", "summoner", "proshop", "library", "weather", "spotify-classic-lyrics"]
thumbs = [p for p in (posters / f"{s}-800.webp" for s in pick) if p.exists()][:4]

def data_uri(p, mime):
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes() if isinstance(p, Path) else p).decode()

imgs = "".join(f'<img src="{data_uri(t, "image/webp")}">' for t in thumbs)
html = f"""<!doctype html><html><head><style>
@font-face {{ font-family: Inter; src: url({data_uri(font, "font/woff2")}) format("woff2"); font-weight: 100 900; }}
* {{ box-sizing: border-box; margin: 0; }}
body {{ width: 1200px; height: 630px; font-family: Inter, sans-serif; background: #0c0e12; color: #eceef2;
  display: grid; grid-template-columns: 520px 1fr; overflow: hidden; }}
.copy {{ padding: 64px 0 56px 64px; display: flex; flex-direction: column; justify-content: space-between; }}
.mono {{ width: 56px; height: 56px; border-radius: 14px; background: #eceef2; color: #0c0e12; display: grid; place-items: center;
  font-weight: 760; font-size: 21px; }}
h1 {{ font-size: 66px; line-height: 1; letter-spacing: -0.04em; font-weight: 780; margin-top: 30px; }}
.role {{ font-size: 25px; color: #c9cdd6; margin-top: 16px; line-height: 1.35; }}
.pitch {{ font-size: 22px; color: #8aa4ff; font-weight: 640; line-height: 1.35; }}
.url {{ font-size: 18px; color: #9aa1ae; margin-top: 10px; }}
.wall {{ position: relative; padding: 40px 40px 40px 8px; display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: min-content;
  align-content: center; gap: 16px; transform: rotate(-4deg) translate(18px, -6px); }}
.wall img {{ width: 100%; aspect-ratio: 1280/860; object-fit: cover; object-position: top; border-radius: 12px;
  border: 1px solid #323844; box-shadow: 0 18px 40px -16px rgba(0,0,0,.8); }}
</style></head><body>
<div class="copy"><div><div class="mono">CB</div><h1>Colby Baker</h1>
<p class="role">Software engineer at CVS Health.<br>Backend APIs and LLM systems for healthcare.</p></div>
<div><p class="pitch">Every project runs live on the page,<br>with the stack behind each one.</p><p class="url">colbybaker.dev</p></div></div>
<div class="wall">{imgs}</div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    pg = b.new_page(viewport={"width": 1200, "height": 630})
    pg.set_content(html, wait_until="load")
    pg.wait_for_timeout(300)
    pg.screenshot(path=str(root / "public" / "og.png"))
    b.close()
print("og.png", (root / "public" / "og.png").stat().st_size // 1024, "KB with", len(thumbs), "thumbnails")
