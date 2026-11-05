"""Dump bounding boxes / key styles of the original layout elements for a URL.

Usage: python qa/inspect_layout.py <url> [width height]
"""
import json
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
w = int(sys.argv[2]) if len(sys.argv) > 2 else 1280
h = int(sys.argv[3]) if len(sys.argv) > 3 else 800
JS = """
() => {
  const out = [];
  for (const sel of ['.v-application', '.v-application .v-application', 'header.v-app-bar, .v-app-bar', '.v-toolbar', '.v-navigation-drawer', '.wrapper', '.wrapper > .v-main, .wrapper main', '.v-footer', '.messages', '#portfolio-bar']) {
    document.querySelectorAll(sel).forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      out.push({sel, i, tag: el.tagName, cls: el.className.toString().slice(0, 120),
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        position: cs.position, top: cs.top, transform: cs.transform, zIndex: cs.zIndex,
        padding: cs.padding, visibility: cs.visibility, display: cs.display});
    });
  }
  return out;
}
"""
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": w, "height": h})
    page.goto(url, wait_until="networkidle")
    page.wait_for_timeout(500)
    for row in page.evaluate(JS):
        print(json.dumps(row))
    browser.close()
