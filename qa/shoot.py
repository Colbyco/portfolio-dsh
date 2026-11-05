"""Headless QA screenshots (own temporary Chrome profile; never touches user browsers).
Usage: python qa/shoot.py <base_url> <out_prefix> [slug ...]
Captures desktop (1440x900, 1920x1080), tablet (1024x1366) and mobile (390x844), light + dark,
and prints console errors / failed requests.
"""
import sys, time
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip("/")
prefix = sys.argv[2]
slugs = sys.argv[3:] or [""]
sizes = [("d1440", 1440, 900), ("d1920", 1920, 1080), ("t1024", 1024, 1366), ("m390", 390, 844)]

with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    for scheme in ("light", "dark"):
        for name, w, h in sizes:
            ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme=scheme, device_scale_factor=1)
            page = ctx.new_page()
            errors = []
            page.on("console", lambda m: m.type == "error" and errors.append(m.text[:200]))
            page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))
            page.on("requestfailed", lambda r: errors.append(f"failed: {r.url[:120]} {r.failure}"))
            for slug in slugs:
                url = f"{base}/#{slug}" if slug else f"{base}/"
                page.goto(url, wait_until="load")
                time.sleep(4.5 if slug in ("", "aspicio") else 2.5)
                out = f"{prefix}-{scheme}-{name}{'-' + slug if slug else ''}.png"
                page.screenshot(path=out, full_page=False)
                print("shot", out)
            if errors:
                print(f"  [{scheme} {name}] errors:", *sorted(set(errors))[:8], sep="\n   ")
            ctx.close()
    browser.close()
