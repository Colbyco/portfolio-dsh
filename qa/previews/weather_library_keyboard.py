"""Keyboard-only check of the library console and the weather form (headless, temporary profile).

Usage (repo root, dev server on 4410): python qa/previews/weather_library_keyboard.py [origin]
"""
import sys
from playwright.sync_api import sync_playwright

ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4410"
results = []


def check(label, cond):
    results.append(cond)
    print(("ok   " if cond else "FAIL ") + label)


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    page.goto(f"{ORIGIN}/previews/library/", wait_until="networkidle")

    page.keyboard.press("Tab")
    check("first Tab reaches the skip link", page.evaluate("document.activeElement.className") == "skip")
    page.keyboard.press("Tab")
    check("second Tab reaches the theme toggle", page.evaluate("document.activeElement.id") == "theme")
    page.keyboard.press("Enter")
    check("Enter on theme toggle switches to light", page.evaluate("document.documentElement.dataset.theme") == "light")
    page.keyboard.press("Tab")
    check("next Tab reaches the first endpoint", "ep" in page.evaluate("document.activeElement.className"))
    for _ in range(4):
        page.keyboard.press("ArrowDown")
    label = page.evaluate("document.activeElement.getAttribute('aria-label')")
    check(f"ArrowDown moves through endpoints ({label.split(':')[0]})", label.startswith("GET /author/:authorId"))
    page.keyboard.press("Enter")
    check("Enter selects it and focuses the path parameter", page.evaluate("document.activeElement.id") == "param-authorId")
    page.keyboard.press("Control+A")
    page.keyboard.type("abc")
    page.keyboard.press("Control+Enter")
    page.wait_for_selector(".status")
    page.wait_for_timeout(200)
    check("Ctrl+Enter sends; invalid id shows 500 with database code", page.inner_text(".status").startswith("500")
          and "22P02" in page.inner_text("#res-body"))
    outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
    check("focused input has a visible focus style", outline != "none" or page.evaluate(
        "getComputedStyle(document.activeElement).borderColor") != "")
    page.evaluate("window.postMessage({type:'portfolio:theme', theme:'dark'}, '*')")
    page.wait_for_timeout(100)
    check("postMessage portfolio:theme dark is honored", page.evaluate("document.documentElement.dataset.theme") == "dark")

    page.goto(f"{ORIGIN}/api/weather/", wait_until="networkidle")
    check("weather: city input is focused on load (original autofocus)", page.evaluate("document.activeElement.id") == "city_name")
    page.keyboard.type("Boston")
    page.keyboard.press("Enter")
    page.wait_for_load_state("networkidle")
    first = page.locator("table tr:nth-child(2) td:first-child").inner_text()
    check(f"weather: Enter submits the form, new first row = {first}", first == "Boston")
    browser.close()

print(f"\n{sum(results)}/{len(results)} keyboard checks passed")
sys.exit(0 if all(results) else 1)
