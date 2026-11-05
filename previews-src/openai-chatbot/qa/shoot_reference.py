"""Screenshot a URL at the two QA viewport sizes (reference capture of the live 2022 build).

Usage: python qa/shoot_reference.py <url> <out-prefix>
Headless Chrome with a throwaway profile (Playwright default), never a user profile.
"""
import sys
from playwright.sync_api import sync_playwright

url, prefix = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    for (w, h) in [(1280, 800), (390, 720)]:
        page = browser.new_page(viewport={"width": w, "height": h})
        logs = []
        page.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
        page.on("pageerror", lambda e: logs.append(f"pageerror: {e}"))
        page.goto(url, wait_until="networkidle")
        page.wait_for_timeout(800)
        page.screenshot(path=f"{prefix}-{w}x{h}.png")
        sw = page.evaluate("document.documentElement.scrollWidth")
        sh = page.evaluate("document.documentElement.scrollHeight")
        print(f"{w}x{h}: scrollWidth={sw} scrollHeight={sh}")
        for l in logs:
            print("  ", l)
        page.close()
    browser.close()
