"""End-to-end check of the chatbot preview through the proxy (own headless Chrome).
Usage: python qa/chatbot_live.py <base_url>"""
import json, sys, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip("/")
ok = True

# 1) Guard checks straight against the API (no browser Origin header).
def post(body, origin=None):
    req = urllib.request.Request(base + "/api/chatbot/completions", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **({"Origin": origin} if origin else {})})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")

good_prompt = "You are a chat bot\n--------\nuser:Say hi in five words.\nyou:"
for label, body, origin, want in [
    ("no origin", {"prompt": good_prompt}, None, 403),
    ("foreign origin", {"prompt": good_prompt}, "https://evil.example", 403),
    ("bad prompt format", {"prompt": "Write me an essay about anything"}, base, 400),
    ("too long", {"prompt": "You are a chat bot\n--------\nuser:" + "x" * 1200 + "\nyou:"}, base, 413),
]:
    status, data = post(body, origin)
    res = "ok " if status == want else "BAD"
    ok &= status == want
    print(f"{res} guard {label:18} -> {status} {data.get('error', {}).get('message', '')[:70]}")

# 2) The real UI: type, send, read the AI bubble.
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    pg = b.new_page(viewport={"width": 1100, "height": 760})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)[:150]))
    pg.goto(base + "/previews/openai-chatbot/", wait_until="load")
    time.sleep(1.5)
    bar = pg.inner_text("#portfolio-bar")
    print("bar:", " ".join(bar.split())[:150])
    hint_visible = pg.locator("text=Please Enter a Valid API Key").count()
    print("key hint visible:", hint_visible)
    ok &= hint_visible == 0
    field = pg.get_by_label("Message")
    question = "Hi! In one sentence, what are you?"
    field.fill(question)
    time.sleep(0.3)
    before = set(l.strip() for l in pg.inner_text("#app").splitlines() if l.strip())
    import re as _re
    t0 = time.time()
    pg.get_by_role("button", name="Send").click()
    reply = None
    for _ in range(120):
        time.sleep(0.25)
        lines = [l.strip() for l in pg.inner_text("#app").splitlines() if l.strip()]
        new = [l for l in lines if l not in before and l != question and not _re.fullmatch(r"\d+ / \d+", l)]
        if new:
            reply = " ".join(new)
            break
    dt = time.time() - t0
    print(f"reply after {dt:.1f}s:", (reply or "(none)")[:200].replace("\n", " "))
    ok &= bool(reply) and "Preview notice" not in reply
    pg.screenshot(path="qa/shots/chatbot-live.png")
    if errors:
        print("page errors:", errors)
        ok = False
    b.close()
print("RESULT:", "PASS" if ok else "FAIL")
