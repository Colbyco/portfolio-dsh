"""Side-by-side reference capture: the live 2022 build vs. this preview.

Both are shown at the same *app* size (the preview gets extra height for the portfolio bar),
after typing one message without a key. Writes qa/previews/openai-chatbot-compare-*.png.
Usage: python qa/compare_live.py [preview_url]
"""
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

LIVE = "https://openai-chat-bot.pages.dev/"
PREVIEW = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4430/previews/openai-chatbot/"
SHOTS = Path(__file__).resolve().parents[3] / "qa" / "previews"
W, H = 1280, 1000


def capture(browser, url, extra_h, path, drawer=False):
    page = browser.new_page(viewport={"width": W, "height": H + extra_h})
    page.goto(url, wait_until="networkidle")
    page.wait_for_selector(".v-footer input")
    page.wait_for_timeout(500)
    field = page.locator(".v-footer input")
    field.click()
    field.fill("Hello there")
    field.press("Enter")
    page.wait_for_timeout(800)
    if drawer:
        page.locator("header .mdi-cog-outline").click()
        page.wait_for_timeout(600)
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=path)
    page.close()


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    for drawer in (False, True):
        suffix = "-drawer" if drawer else ""
        live_png = SHOTS / f"_live{suffix}.png"
        prev_png = SHOTS / f"_prev{suffix}.png"
        capture(browser, LIVE, 0, str(live_png), drawer)
        # measure the bar height so the original app area is the same size in both
        page = browser.new_page(viewport={"width": W, "height": H})
        page.goto(PREVIEW, wait_until="networkidle")
        bar_h = page.evaluate("Math.round(document.getElementById('portfolio-bar').getBoundingClientRect().height)")
        page.close()
        capture(browser, PREVIEW, bar_h, str(prev_png), drawer)
        a, b = Image.open(live_png), Image.open(prev_png)
        out = Image.new("RGB", (a.width + b.width + 16, max(a.height, b.height)), (255, 255, 255))
        out.paste(a, (0, 0))
        out.paste(b, (a.width + 16, 0))
        out.save(SHOTS / f"openai-chatbot-compare{suffix}.png", optimize=True)
        live_png.unlink()
        prev_png.unlink()
        print("bar height", bar_h, "->", SHOTS / f"openai-chatbot-compare{suffix}.png")
    browser.close()
