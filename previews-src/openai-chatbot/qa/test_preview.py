"""Headless QA for the OpenAI Chatbot preview.

Usage (static server on port 4430 serving the portfolio's public/ folder):
    python qa/test_preview.py [base_url] [screenshot_dir]

Checks: no console errors / page errors, no third-party requests without a key, no horizontal
scroll from 360 to 1400 px, the no-key notice renders inside the original UI, and (with a
*mocked* api.openai.com route, QA only) that a key from the bar produces the expected Chat
Completions request and the reply renders where the original code expects it.
"""
import json
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4430/previews/openai-chatbot/"
SHOTS = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parents[3] / "qa" / "previews")
SHOTS.mkdir(parents=True, exist_ok=True)
NOTICE = "[Preview notice - not an AI reply]"
SUBSET_ICONS = {"mdi-cog-outline", "mdi-github", "mdi-linkedin", "mdi-email"}
FAKE_KEY = "sk-qa-test-not-a-real-key"

failures = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)


def new_page(browser, w, h):
    page = browser.new_page(viewport={"width": w, "height": h})
    page.logs = []
    page.requests = []
    page.on("console", lambda m: page.logs.append((m.type, m.text)))
    page.on("pageerror", lambda e: page.logs.append(("pageerror", str(e))))
    page.on("request", lambda r: page.requests.append(r.url))
    page.goto(BASE, wait_until="networkidle")
    page.wait_for_selector(".v-footer input")
    page.wait_for_timeout(300)
    return page


def errors(page):
    return [l for l in page.logs if l[0] in ("error", "pageerror")]


def foreign(page):
    return sorted({u for u in page.requests if urlparse(u).hostname not in ("127.0.0.1", "localhost") and not u.startswith("data:")})


def send(page, text, via="enter"):
    field = page.locator(".v-footer input")
    field.click()
    field.fill(text)
    if via == "enter":
        field.press("Enter")
    else:
        page.get_by_role("button", name="Send").click()


def bubbles(page):
    return page.evaluate("""() => [...document.querySelectorAll('.userBubble, .aiBubble')]
        .map(b => [b.className, b.textContent.trim()])""")


with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)

    # ---------- 1280x800: no key ----------
    page = new_page(browser, 1280, 800)
    bar = page.locator("#portfolio-bar")
    check("text-davinci-002 was retired by OpenAI" in bar.inner_text(), "bar shows retirement note")
    check(page.locator("#portfolio-key").get_attribute("type") == "password", "key input is type=password")
    check(page.evaluate("document.activeElement.closest('.v-footer') !== null"), "original autofocus on Message field kept")
    page.screenshot(path=str(SHOTS / "openai-chatbot-1280x800-initial.png"))
    send(page, "Hello there", "enter")
    page.wait_for_selector(".aiBubble")
    send(page, "Are you still online?", "button")
    page.wait_for_function("document.querySelectorAll('.aiBubble').length >= 2")
    b = bubbles(page)
    check(len(b) == 4, f"two exchanges rendered ({len(b)} bubbles)")
    check(b[0] == ["userBubble", "Hello there"], "user bubble text")
    check(b[1][0] == "aiBubble" and b[1][1].startswith(NOTICE), "no-key reply is a labelled notice in the original AI bubble")
    check(page.locator(".v-footer input").input_value() == "", "message field cleared after send (original behaviour)")
    check("Please Enter a Valid API Key" in page.locator(".v-footer").inner_text(), "original key hint still shown when no key is set")
    check(foreign(page) == [], f"no third-party requests without a key: {foreign(page)}")
    icons = set(page.evaluate("[...document.querySelectorAll('[class*=\"mdi-\"]')].flatMap(e => [...e.classList].filter(c => c.startsWith('mdi-')))"))
    check(icons <= SUBSET_ICONS, f"all rendered icons are in the subset font: {sorted(icons)}")
    page.screenshot(path=str(SHOTS / "openai-chatbot-1280x800.png"))
    # settings drawer (original UI) still opens
    page.locator("header .mdi-cog-outline").click()
    page.wait_for_timeout(500)
    check(page.locator(".v-navigation-drawer--active").count() == 1, "original settings drawer opens")
    page.screenshot(path=str(SHOTS / "openai-chatbot-1280x800-drawer.png"))
    page.keyboard.press("Escape")
    page.mouse.click(1000, 400)
    page.wait_for_timeout(400)
    # theme message is ignored without errors
    page.evaluate("window.postMessage({type:'portfolio:theme', theme:'light'}, '*')")
    page.wait_for_timeout(200)
    check(errors(page) == [], f"no console errors (1280): {errors(page)}")
    warns = [l for l in page.logs if l[0] == "warning"]
    print("  console warnings:", warns)
    page.close()

    # ---------- keyboard reachability of the bar ----------
    page = new_page(browser, 1280, 800)
    page.locator("#portfolio-key").focus()
    seq = []
    for _ in range(3):
        page.keyboard.press("Tab")
        seq.append(page.evaluate("document.activeElement.textContent.trim() || document.activeElement.id"))
    check(seq[:2] == ["Use", "Clear"], f"bar controls reachable by Tab: {seq}")
    page.close()

    # ---------- mocked key flow (QA only; nothing is sent to OpenAI) ----------
    page = new_page(browser, 1280, 800)
    captured = []
    mode = {"status": 200}

    def handle(route):
        req = route.request
        captured.append({"url": req.url, "method": req.method, "auth": req.headers.get("authorization"), "body": req.post_data_json})
        if mode["status"] == 200:
            route.fulfill(status=200, content_type="application/json", headers={"access-control-allow-origin": "*"},
                          body=json.dumps({"choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": "  (QA mock reply)  "}}]}))
        else:
            route.fulfill(status=401, content_type="application/json", headers={"access-control-allow-origin": "*"},
                          body=json.dumps({"error": {"message": "Incorrect API key provided.", "type": "invalid_request_error"}}))

    page.route("https://api.openai.com/**", handle)
    page.locator("#portfolio-key").fill(FAKE_KEY)
    page.locator("#portfolio-key").press("Enter")
    check(page.locator("#portfolio-key").input_value() == "", "key input emptied after Use")
    check("Key set" in page.locator("#portfolio-key-status").inner_text(), "status shows key set")
    check(page.evaluate("Object.keys(sessionStorage).length + Object.keys(localStorage).length + document.cookie.length") == 0, "key not persisted to storage/cookies")
    send(page, "Hi bot")
    page.wait_for_selector(".aiBubble")
    b = bubbles(page)
    req = captured[-1] if captured else {}
    body = req.get("body") or {}
    check(req.get("url") == "https://api.openai.com/v1/chat/completions" and req.get("method") == "POST", "request goes to Chat Completions")
    check(req.get("auth") == f"Bearer {FAKE_KEY}", "Authorization header carries the bar key")
    check(body.get("model") == "gpt-6-luna", f"model mapped: {body.get('model')}")
    check(body.get("messages") == [{"role": "developer", "content": "You are a chat bot"}, {"role": "user", "content": "Hi bot"}], f"prompt translated: {body.get('messages')}")
    check(body.get("max_completion_tokens") == 1000 and body.get("temperature") == 0.7 and body.get("reasoning_effort") == "none", "slider values forwarded")
    check(b[-1] == ["aiBubble", "(QA mock reply)"], f"reply rendered (trimmed) by original UI: {b[-1]}")
    page.locator(".v-footer input").fill("typing with a key")
    page.wait_for_timeout(300)
    check("Please Enter a Valid API Key" not in page.locator(".v-footer").inner_text(), "original key hint hidden while a bar key is set")
    page.screenshot(path=str(SHOTS / "openai-chatbot-1280x800-mocked-key.png"))
    mode["status"] = 401
    send(page, "again")
    page.wait_for_function("document.querySelectorAll('.aiBubble').length >= 2")
    b = bubbles(page)
    check(b[-1][1].startswith(NOTICE) and "401" in b[-1][1], f"API error shown as notice: {b[-1][1]}")
    page.get_by_role("button", name="Clear").click()
    n = len(captured)
    send(page, "after clear")
    page.wait_for_function("document.querySelectorAll('.aiBubble').length >= 3")
    check(len(captured) == n and bubbles(page)[-1][1].startswith(NOTICE), "after Clear no request is made and the notice returns")
    # pageerror/console errors other than the intentional 401 network log
    errs = [e for e in errors(page) if "401" not in e[1]]
    check(errs == [], f"no console errors in key flow (besides the mocked 401 resource log): {errs}")
    page.close()

    # ---------- responsive sizes ----------
    for (w, h) in [(390, 720), (360, 560), (768, 900), (1400, 900)]:
        page = new_page(browser, w, h)
        send(page, "Hello there")
        page.wait_for_selector(".aiBubble")
        sw = page.evaluate("document.documentElement.scrollWidth")
        footer = page.evaluate("(() => { const r = document.querySelector('.v-footer').getBoundingClientRect(); return [r.top, r.bottom] })()")
        appbar = page.evaluate("document.querySelector('.v-app-bar').getBoundingClientRect().top")
        check(sw <= w, f"{w}x{h}: no horizontal scroll (scrollWidth={sw})")
        check(footer[1] <= h + 0.5 and appbar >= 0, f"{w}x{h}: app bar and footer both visible (appbar top={appbar:.0f}, footer={footer})")
        check(errors(page) == [], f"{w}x{h}: no console errors {errors(page)}")
        if (w, h) == (390, 720):
            page.screenshot(path=str(SHOTS / "openai-chatbot-390x720.png"))
        if (w, h) == (360, 560):
            page.screenshot(path=str(SHOTS / "openai-chatbot-360x560.png"))
        page.close()

    browser.close()

print("\nRESULT:", "ALL PASS" if not failures else f"{len(failures)} FAILURE(S)")
sys.exit(1 if failures else 0)
