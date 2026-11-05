"""Headless QA for the ProShop contribution viewer.

Usage (static server on port 4430 serving the portfolio's public/ folder):
    python qa/test_preview.py [base_url] [screenshot_dir]
"""
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4430/previews/proshop/"
SHOTS = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parents[3] / "qa" / "previews")
SHOTS.mkdir(parents=True, exist_ok=True)
failures = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def open_page(browser, w, h):
    page = browser.new_page(viewport={"width": w, "height": h})
    page.logs, page.requests = [], []
    page.on("console", lambda m: page.logs.append((m.type, m.text)))
    page.on("pageerror", lambda e: page.logs.append(("pageerror", str(e))))
    page.on("request", lambda r: page.requests.append(r.url))
    page.on("response", lambda r: r.status >= 400 and page.logs.append(("error", f"HTTP {r.status} {r.url}")))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector("#tree .file")
    return page


def errors(page):
    return [l for l in page.logs if l[0] in ("error", "pageerror", "warning")]


def foreign(page):
    return sorted({u for u in page.requests if urlparse(u).hostname not in ("127.0.0.1", "localhost")})


def no_hscroll(page, w):
    return page.evaluate("document.documentElement.scrollWidth") <= w


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)

    page = open_page(browser, 1280, 800)
    head = page.locator("header").inner_text()
    check("ProShop course project" in head and "MERN · Redux Toolkit · April 2024" in head, "header title")
    check("Brad Traversy" in head and "Colby's contributions are shown below" in head, "credit line")
    cards = page.locator("#cards").inner_text()
    check("10 Code Smells Completed" in cards and "Facebook and Google logic implemented" in cards, "cards quote PR body and commit message")
    check(page.locator("html").get_attribute("data-theme") == "dark", "default theme is dark")
    check(page.locator(".d-split").count() == 1, "split mode is the default at 1280px")
    page.screenshot(path=str(SHOTS / "proshop-1280x800.png"))
    page.screenshot(path=str(SHOTS / "proshop-1280x800-full.png"), full_page=True)

    # switch files by click
    page.locator('#tree .file[data-file$="ProfileScreen.jsx"]').click()
    check("frontend/src/screens/ProfileScreen.jsx" in page.locator(".dhead").inner_text(), "clicking a file shows its diff")
    check(page.locator("#diff .k").count() > 0 and page.locator("#diff .t").count() > 0 and page.locator("#diff .s").count() > 0, "JSX is syntax highlighted (keywords, tags, strings)")
    check("Code smell 4 fixed" in page.locator(".dby").inner_text(), "file shows the PR commit that changed it")
    # diff modes
    page.get_by_role("button", name="Unified").click()
    check(page.locator(".d-uni").count() == 1 and page.locator(".d-split").count() == 0, "unified mode renders")
    adds = page.locator(".d-uni tr.add").count()
    dels = page.locator(".d-uni tr.del").count()
    check((adds, dels) == (60, 50), f"ProfileScreen.jsx +60/-50 rows match GitHub stats ({adds}/{dels})")
    page.locator("#wrap").check()
    check(page.locator(".dscroll.wrap").count() == 1, "wrap toggle applies in unified mode")
    page.locator("#wrap").uncheck()
    page.get_by_role("button", name="Split").click()
    check(page.locator(".d-split").count() == 1, "split mode renders")
    check(page.locator("#wrap").is_disabled(), "split mode always wraps (toggle disabled)")
    overflow = page.evaluate("[...document.querySelectorAll('.d-split td.code')].filter(td => td.scrollWidth > td.clientWidth + 1).length")
    check(overflow == 0, f"no split code cell overflows its column ({overflow})")
    # keyboard: arrow navigation in the tree
    page.locator('#tree .file[aria-current="true"]').focus()
    page.keyboard.press("Home")
    check(page.evaluate("document.activeElement.dataset.file").endswith("CheckoutSteps.jsx"), "Home jumps to first file")
    page.keyboard.press("ArrowDown")
    cur = page.locator('#tree .file[aria-current="true"]').get_attribute("data-file")
    check(cur.endswith("components/SearchBox.jsx"), f"ArrowDown moves to next file ({cur})")
    page.keyboard.press("End")
    check(page.evaluate("document.activeElement.dataset.file").endswith("ProfileScreen.jsx"), "End jumps to last file")
    # keyboard: tabs
    page.locator("#tab-pr").focus()
    page.keyboard.press("ArrowRight")
    check(page.locator("#tab-commit").get_attribute("aria-selected") == "true", "ArrowRight selects the commit tab")
    check(page.evaluate("document.activeElement.id") == "tab-commit", "focus follows the selected tab")
    check("LoginScreen.jsx" in page.locator(".dhead").inner_text(), "commit tab opens LoginScreen.jsx")
    page.screenshot(path=str(SHOTS / "proshop-1280x800-commit.png"))
    page.locator('#tree .file[data-file="package-lock.json"]').click()
    check(page.locator(".collapsed").count() == 1, "lock file collapsed by default")
    page.get_by_role("button", name="Show diff").click()
    check(page.locator(".d-split tr").count() > 200, "lock file diff expands")
    # theme
    page.evaluate("window.postMessage({type:'portfolio:theme', theme:'light'}, '*')")
    page.wait_for_timeout(100)
    check(page.locator("html").get_attribute("data-theme") == "light", "portfolio:theme light honoured")
    page.locator("#tab-pr").click()
    page.locator('#tree .file[data-file$="CheckoutSteps.jsx"]').click()
    page.screenshot(path=str(SHOTS / "proshop-1280x800-light.png"))
    page.locator("#theme-btn").click()
    check(page.locator("html").get_attribute("data-theme") == "dark", "theme button toggles back to dark")
    page.evaluate("window.postMessage({type:'portfolio:theme', theme:'purple'}, '*')")
    check(page.locator("html").get_attribute("data-theme") == "dark", "invalid theme values ignored")
    links = page.eval_on_selector_all("a[href^='https://github.com']", "els => els.map(e => e.href)")
    check(any(l.endswith("/pull/1") for l in links) and any("/commit/704b9f6" in l for l in links), "links to PR and commit on GitHub")
    check(foreign(page) == [], f"no third-party requests: {foreign(page)}")
    check(errors(page) == [], f"no console errors/warnings: {errors(page)}")
    page.close()

    for (w, h) in [(390, 720), (360, 560), (768, 900), (1400, 900)]:
        page = open_page(browser, w, h)
        check(no_hscroll(page, w), f"{w}x{h}: no horizontal page scroll")
        page.get_by_role("button", name="Split").click()
        check(no_hscroll(page, w), f"{w}x{h}: no horizontal page scroll in split mode (diff scrolls inside)")
        page.get_by_role("button", name="Unified").click()
        if (w, h) == (390, 720):
            page.evaluate("window.scrollTo(0, 0)")
            page.screenshot(path=str(SHOTS / "proshop-390x720.png"))
            page.locator("#viewer").scroll_into_view_if_needed()
            page.evaluate("document.getElementById('viewer').scrollIntoView()")
            page.screenshot(path=str(SHOTS / "proshop-390x720-diff.png"))
        if (w, h) == (360, 560):
            page.evaluate("document.getElementById('viewer').scrollIntoView()")
            page.screenshot(path=str(SHOTS / "proshop-360x560-diff.png"))
        check(errors(page) == [], f"{w}x{h}: no console errors")
        page.close()

    browser.close()

print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAILURE(S)")
sys.exit(1 if failures else 0)
