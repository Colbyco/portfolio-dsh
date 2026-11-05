"""Measure what a first visit downloads (URL, bytes) and first-paint timing for a preview URL.

Usage: python qa/measure_load.py <url>
"""
import gzip
import sys
import urllib.request

from playwright.sync_api import sync_playwright

url = sys.argv[1]
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    urls = []
    page.on("requestfinished", lambda r: urls.append(r.url))
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(300)
    fcp = page.evaluate("(performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime")
    browser.close()

total_raw = total_gz = 0
for u in urls:
    if u.startswith("data:"):
        continue
    body = urllib.request.urlopen(u).read()
    gz = len(gzip.compress(body, 9))
    total_raw += len(body)
    total_gz += gz
    print(f"{len(body):>9,} B raw {gz:>9,} B gzip  {u}")
print(f"{total_raw:>9,} B raw {total_gz:>9,} B gzip  TOTAL ({len(urls)} requests)")
print(f"first-contentful-paint: {fcp:.0f} ms" if fcp else "first-contentful-paint: n/a")
