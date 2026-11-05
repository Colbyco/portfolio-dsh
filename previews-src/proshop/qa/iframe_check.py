"""Embed both previews in an iframe (like the portfolio stage) and check they render, accept the
theme message, and log no errors. Usage: python qa/iframe_check.py [origin]"""
import sys

from playwright.sync_api import sync_playwright

ORIGIN = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:4430"
bad = []
with sync_playwright() as p:
    browser = p.chromium.launch(channel="chrome", headless=True)
    page = browser.new_page(viewport={"width": 1100, "height": 760})
    logs = []
    page.on("console", lambda m: logs.append((m.type, m.text)))
    # host page on the same origin as the shell would be (served 404 page is replaced by set_content)
    page.goto(ORIGIN + "/previews/proshop/")
    page.set_content(
        '<iframe id="a" src="/previews/openai-chatbot/" style="width:1000px;height:640px;border:0"></iframe>'
        '<iframe id="b" src="/previews/proshop/" style="width:1000px;height:640px;border:0"></iframe>'
    )
    page.wait_for_timeout(2500)
    chat = page.frame_locator("#a")
    shop = page.frame_locator("#b")
    ok1 = chat.locator(".v-footer input").count() == 1 and chat.locator("#portfolio-bar").count() == 1
    ok2 = shop.locator("#tree .file").count() == 6
    page.evaluate("document.getElementById('b').contentWindow.postMessage({type:'portfolio:theme', theme:'light'}, '*')")
    page.wait_for_timeout(200)
    ok3 = shop.locator("html").get_attribute("data-theme") == "light"
    errs = [l for l in logs if l[0] == "error"]
    print("chatbot renders in iframe:", ok1)
    print("proshop renders in iframe:", ok2)
    print("proshop honours theme message from parent:", ok3)
    print("console errors:", errs)
    browser.close()
    sys.exit(0 if ok1 and ok2 and ok3 and not errs else 1)
