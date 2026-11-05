"""Headless screenshots of the weather and library previews (temporary browser profile).

Usage (repo root, dev server running on 4410):
    python qa/previews/weather_library_screenshots.py [http://127.0.0.1:4410]
Writes qa/previews/{weather,library}-{1280x800,390x720}.png (+ a few extra review shots) and prints
basic layout checks (horizontal overflow, console errors).
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4410"
OUT = Path(__file__).resolve().parent
SIZES = [(1280, 800), (390, 720)]


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")


def main():
    problems = []
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome", headless=True)
        for w, h in SIZES:
            ctx = browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            # Expected non-2xx: the intentional 404 error page for an unknown city, and /favicon.ico
            # (only requested for top-level pages, never inside the stage iframe).
            page.on("response", lambda r: errors.append(f"{r.status} {r.url}")
                    if r.status >= 400 and not r.url.endswith("/favicon.ico")
                    and not (r.request.method == "POST" and r.status == 404) else None)

            # Weather: the stage may load /previews/weather/ which forwards to /api/weather/
            page.goto(f"{ORIGIN}/previews/weather/", wait_until="networkidle")
            assert page.url.endswith("/api/weather/"), page.url
            page.screenshot(path=str(OUT / f"weather-{w}x{h}.png"))
            print(f"weather {w}x{h}: url={page.url} overflow={overflow(page)} rows={page.locator('table tr').count() - 1}")
            if overflow(page) > 0:
                problems.append(f"weather {w}x{h} horizontal overflow {overflow(page)}px")
            if w == 1280:
                page.fill("#city_name", "Seattle")
                page.click("button[type=submit]")
                page.wait_for_load_state("networkidle")
                page.screenshot(path=str(OUT / f"weather-{w}x{h}-after-lookup.png"))
                page.goto(f"{ORIGIN}/api/weather/", wait_until="networkidle")
                page.evaluate("() => { const f = document.querySelector('form'); f.city_name.value = 'Qwzxvbnmkplo'; f.submit(); }")
                page.wait_for_load_state("networkidle")
                page.screenshot(path=str(OUT / f"weather-{w}x{h}-error.png"))

            # Library console
            page.goto(f"{ORIGIN}/previews/library/", wait_until="networkidle")
            page.click("#send")
            page.wait_for_selector(".status")
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(OUT / f"library-{w}x{h}.png"))
            page.screenshot(path=str(OUT / f"library-{w}x{h}-full.png"), full_page=True)
            print(f"library {w}x{h}: overflow={overflow(page)} status={page.inner_text('.status')}")
            if overflow(page) > 0:
                problems.append(f"library {w}x{h} horizontal overflow {overflow(page)}px")
            if w == 1280:
                page.evaluate("window.postMessage({type: 'portfolio:theme', theme: 'light'}, '*')")
                page.click(".ep[aria-label^='GET /author/:authorId']")
                page.click("#send")
                page.wait_for_timeout(300)
                page.screenshot(path=str(OUT / f"library-{w}x{h}-light.png"))
            if errors:
                problems.append(f"console errors at {w}x{h}: {errors}")
            ctx.close()

        # 360 px minimum stage width check
        ctx = browser.new_context(viewport={"width": 360, "height": 560})
        page = ctx.new_page()
        for url in ("/api/weather/", "/previews/library/"):
            page.goto(ORIGIN + url, wait_until="networkidle")
            o = overflow(page)
            print(f"360x560 {url}: overflow={o}")
            if o > 0:
                problems.append(f"360px overflow on {url}: {o}px")
        ctx.close()
        browser.close()
    print("PROBLEMS:" if problems else "no layout problems detected")
    for pr in problems:
        print(" -", pr)


if __name__ == "__main__":
    main()
