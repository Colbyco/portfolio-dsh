import time
from playwright.sync_api import sync_playwright
base = "https://aspicio.app/chart?loc=Seattle&lat=47.6062&lng=-122.3321&tz=America/Los_Angeles&date=2026-11-04&time=17:40"
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for suffix in ("", "&scroll=chart"):
        pg = b.new_page(viewport={"width": 390, "height": 640}, is_mobile=True)
        pg.goto(base + suffix, wait_until="load"); time.sleep(3)
        print(repr(suffix), "scrollY =", pg.evaluate("window.scrollY"), "| wheel visible:",
              pg.evaluate("(() => { const s = document.querySelector('svg'); if (!s) return null; const r = s.getBoundingClientRect(); return Math.round(r.top) })()"))
        pg.screenshot(path=f"qa/shots/probe-scroll{'-chart' if suffix else ''}.png")
        pg.close()
    b.close()
