"""Screenshot the CVS career cards and the top of the page (own headless Chrome)."""
import sys, time
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip("/")
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for scheme, w, h in [("light", 1440, 900), ("dark", 390, 844)]:
        pg = b.new_page(viewport={"width": w, "height": h}, color_scheme=scheme)
        pg.goto(base + "/", wait_until="load")
        time.sleep(1.5)
        for slug in ("cvs-ai-assistant", "cvs-scheduling"):
            pg.click(f"#tab-{slug}")
            time.sleep(0.8)
            if w < 600:
                pg.locator("#stage-panel").scroll_into_view_if_needed()
                time.sleep(0.3)
            pg.screenshot(path=f"qa/shots/career-{scheme}-{w}-{slug}.png")
            print("shot", slug, scheme, w)
        pg.close()
    b.close()
