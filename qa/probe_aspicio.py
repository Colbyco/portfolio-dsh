import sys, time
from playwright.sync_api import sync_playwright
urls = sys.argv[1:]
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    pg = b.new_page(viewport={"width": 1100, "height": 800})
    for u in urls:
        pg.goto(u, wait_until="load")
        time.sleep(3)
        txt = pg.inner_text("body")
        print("URL in:", u)
        print("URL now:", pg.url)
        print("has POSITIONS:", "POSITIONS" in txt.upper(), "| has ASPECTS:", "ASPECTS" in txt.upper())
        print("snippet:", " ".join(txt.split())[:260])
        pg.screenshot(path="qa/shots/probe-aspicio.png")
    b.close()
