"""Read-only audit of ChatGPT's live portfolio: what each project shows in its stage."""
import json, time
from playwright.sync_api import sync_playwright

URL = "https://colbyco.github.io/"
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(URL, wait_until="load"); time.sleep(4)
    items = pg.evaluate("""() => {
      const cands = [...document.querySelectorAll('nav a, nav button, [role=tab], aside a, aside button, ol a, ul a, li button')];
      return cands.filter(e => /20(21|22|23|24|25|26)/.test(e.innerText) || /Jul|Aug|Jun|Apr|Dec|Oct/.test(e.innerText))
        .map((e, i) => ({ i, text: e.innerText.replace(/\\s+/g, ' ').trim().slice(0, 60), tag: e.tagName }));
    }""")
    print("rail items:", len(items))
    results = []
    for it in items:
        try:
            pg.evaluate("""(i) => {
              const cands = [...document.querySelectorAll('nav a, nav button, [role=tab], aside a, aside button, ol a, ul a, li button')]
                .filter(e => /20(21|22|23|24|25|26)/.test(e.innerText) || /Jul|Aug|Jun|Apr|Dec|Oct/.test(e.innerText));
              cands[i].click();
            }""", it["i"])
            time.sleep(3)
            info = pg.evaluate("""() => {
              const frames = [...document.querySelectorAll('iframe')].filter(f => f.offsetParent !== null);
              const h = [...document.querySelectorAll('h2, h3')].filter(e => e.offsetParent !== null).map(e => e.innerText.trim()).slice(0, 3);
              return { iframes: frames.map(f => f.src || f.getAttribute('srcdoc')?.slice(0, 40) || '(no src)'), headings: h, url: location.href };
            }""")
            results.append({"item": it["text"], **info})
            print(json.dumps({"item": it["text"], **info})[:300])
        except Exception as e:
            print("item", it["text"], "error", e)
    pg.screenshot(path="qa/compare/chatgpt-after-audit.png")
    dark = b.new_page(viewport={"width": 1440, "height": 900}, color_scheme="dark")
    dark.goto(URL, wait_until="load"); time.sleep(3)
    bg = dark.evaluate("getComputedStyle(document.body).backgroundColor")
    print("dark-mode body background:", bg)
    dark.screenshot(path="qa/compare/chatgpt-dark-d1440.png")
    b.close()
