"""End-to-end interaction test of the stage (own headless Chrome, temp profile).
Usage: python qa/interact.py <base_url>
Checks every timeline entry loads (iframe 'load' or career card), details switch, routes, prev/next,
keyboard navigation, theme toggle; reports console errors from the shell and same-origin previews.
"""
import sys, time
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip("/")
fails, notes = [], []

with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    page = ctx.new_page()
    errors = []
    def on_console(m):
        if m.type == "error":
            loc = (m.location or {}).get("url", "")
            if "aspicio.app" not in loc:  # third-party site's own console is out of scope
                errors.append(f"{loc[-60:]} :: {m.text[:160]}")
    page.on("console", on_console)
    page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)[:200]))
    page.goto(base + "/", wait_until="load")
    time.sleep(1)

    slugs = page.eval_on_selector_all('[role="tab"]', "els => els.map(e => e.dataset.slug)")
    print("entries:", len(slugs))
    for slug in slugs:
        t0 = time.time()
        page.click(f'#tab-{slug}')
        kind = page.get_attribute(f'#tab-{slug}', "class")
        ok = False
        for _ in range(60):
            state = page.evaluate("""(slug) => {
              const card = document.querySelector(`[data-career="${slug}"]`);
              if (card && !card.hidden) return 'career';
              const f = [...document.querySelectorAll('.preview-frame.is-active')];
              const loading = !document.querySelector('[data-loading]').hidden;
              return f.length === 1 && !loading ? 'frame' : 'wait';
            }""", slug)
            if state != "wait":
                ok = True
                break
            time.sleep(0.25)
        detail_ok = page.evaluate("(s) => !document.querySelector(`[data-detail=\"${s}\"]`).hidden", slug)
        sel_ok = page.get_attribute(f"#tab-{slug}", "aria-selected") == "true"
        dt = time.time() - t0
        status = "OK " if ok and detail_ok and sel_ok else "FAIL"
        if status == "FAIL":
            fails.append(slug)
        # same-origin preview sanity: body has content and no "Not found"
        body = ""
        if state == "frame":
            try:
                fr = page.frame_locator(".preview-frame.is-active")
                body = fr.locator("body").inner_text(timeout=4000)[:80].replace("\n", " ")
            except Exception as e:
                body = f"(cross-origin or unreadable: {type(e).__name__})"
        print(f"{status} {slug:24} {state:6} {dt:4.1f}s  {body}")
        if "Not found" in body or "Cannot GET" in body:
            fails.append(slug + ":notfound")

    # Routes (Aspicio)
    page.click("#tab-aspicio")
    btns = page.locator(".route-btn")
    if btns.count() >= 2:
        btns.nth(1).click()
        time.sleep(0.5)
        addr = page.inner_text("[data-address-text]")
        pressed = btns.nth(1).get_attribute("aria-pressed")
        print("route switch:", addr, "pressed:", pressed)
        if pressed != "true":
            fails.append("routes")
        btns.nth(0).click()
    else:
        fails.append("routes-missing")

    # Prev / next
    page.click("#tab-summoner")
    page.click("[data-next]")
    if page.get_attribute("#tab-weather", "aria-selected") != "true":
        fails.append("next")
    page.click("[data-prev]")
    if page.get_attribute("#tab-summoner", "aria-selected") != "true":
        fails.append("prev")

    # Keyboard: focus first tab, ArrowDown x2, Enter
    page.focus("#tab-summoner")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("ArrowDown")
    page.keyboard.press("Enter")
    kb = page.evaluate("document.activeElement.dataset.slug")
    if page.get_attribute(f"#tab-{kb}", "aria-selected") != "true":
        fails.append("keyboard")
    print("keyboard selected:", kb)

    # Theme toggle
    page.click("[data-theme-toggle]")
    t1 = page.evaluate("document.documentElement.dataset.theme || 'system'")
    page.click("[data-theme-toggle]")
    t2 = page.evaluate("document.documentElement.dataset.theme || 'system'")
    print("theme cycle:", t1, "->", t2)

    # Deep link
    page.goto(base + "/#music-search", wait_until="load")
    time.sleep(0.5)
    if page.get_attribute("#tab-music-search", "aria-selected") != "true":
        fails.append("deeplink")

    print("console errors:", len(errors))
    for e in sorted(set(errors))[:15]:
        print("  ", e)
    print("RESULT:", "PASS" if not fails else f"FAIL {fails}")
    b.close()
