"""Headless checks for the Summoner preview, run side by side against the ORIGINAL Express app.

    cd previews-src/summoner
    node qa/original-server.cjs --port 4420        # serves public/ + original app.js at "/"
    python qa/test_preview.py                       # (another terminal)

    python qa/test_preview.py --preview-only        # with any static server on public/ instead

Both pages get the same click script; spell rules, console output, dialogs, final state, DOM and
pixels are compared. The original page's Bootstrap CDN request is answered with the vendored file
(its SRI hash must match), so the test makes no third-party requests.
"""
import argparse
import io
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parents[3]
SHOTS = REPO / "qa" / "previews"
VENDORED = REPO / "public" / "previews" / "summoner" / "vendor" / "bootstrap-5.0.2" / "bootstrap.min.css"
CDN = "https://cdn.jsdelivr.net/npm/bootstrap@5.0.2/dist/css/bootstrap.min.css"
SERVER_SPELLS = {"Heal", "Flash", "Teleport", "Smite", "Cleanse", "Ignite", "Ghost", "Barrier", "Exhaust", "Clarity"}
ALL_SPELLS = SERVER_SPELLS | {"Mark"}

failures = []


def check(ok, message):
    print(("PASS  " if ok else "FAIL  ") + message)
    if not ok:
        failures.append(message)


NAME = "el => el.getAttribute('src').replace(/^.*\\//, '').replace(/\\.png$/, '')"
ROLL = """n => {
  const name = %s;
  const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Randomize');
  const a = document.getElementById('spell-1'), b = document.getElementById('spell-2');
  const out = [];
  for (let i = 0; i < n; i++) { button.click(); out.push([name(a), name(b)]); }
  return out;
}""" % NAME
STATE = """() => {
  const name = %s;
  const filters = {};
  for (const img of document.querySelectorAll('.container .col > img')) filters[img.id] = img.style.filter;
  return { pair: [name(document.getElementById('spell-1')), name(document.getElementById('spell-2'))], filters };
}""" % NAME


class Session:
    def __init__(self, browser, url, base, viewport=(1280, 800)):
        self.url, self.base = url, base
        self.context = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]})
        self.page = self.context.new_page()
        self.console, self.errors, self.dialogs, self.requests, self.failed = [], [], [], [], []
        self.page.route(CDN, lambda route: route.fulfill(path=str(VENDORED), content_type="text/css",
                                                           headers={"access-control-allow-origin": "*"}))
        self.page.on("console", lambda m: self.console.append((m.type, m.text)))
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.on("request", lambda r: self.requests.append(r.url))
        self.page.on("requestfailed", lambda r: self.failed.append(r.url))
        self.page.on("dialog", lambda d: (self.dialogs.append(d.message), d.accept()))

    def load(self):
        self.page.goto(self.url)
        self.page.wait_for_load_state("networkidle")

    def state(self):
        return self.page.evaluate(STATE)

    def roll(self, n):
        return self.page.evaluate(ROLL, n)

    def active(self):
        return {k for k, v in self.state()["filters"].items() if "grayscale" not in v}


def rolls_ok(pairs, allowed):
    return all(a != b and a in allowed and b in allowed for a, b in pairs)


def scenario(s, label):
    """The same user script for both pages. Returns a transcript for parity comparison."""
    p = s.page
    s.load()
    pair = s.state()["pair"]
    check(pair[0] != pair[1] and set(pair) <= SERVER_SPELLS, f"[{label}] initial pair {pair} is two different server spells")
    check(s.active() == SERVER_SPELLS, f"[{label}] Summoner's Rift starts with every spell except Mark active")

    pairs = s.roll(300)
    seen = {x for pr in pairs for x in pr}
    check(rolls_ok(pairs, SERVER_SPELLS), f"[{label}] 300 rolls: never a duplicate, never Mark on Summoner's Rift")
    check(seen == SERVER_SPELLS, f"[{label}] 300 rolls cover all 10 active spells")

    p.click("#Flash"); p.click("#Heal")
    check("grayscale" in s.state()["filters"]["Flash"], f"[{label}] clicking Flash greys it out")
    check(rolls_ok(s.roll(300), SERVER_SPELLS - {"Flash", "Heal"}), f"[{label}] disabled Flash/Heal never rolled")

    p.click("#Mark")
    check("grayscale" in s.state()["filters"]["Mark"], f"[{label}] Mark cannot be enabled on Summoner's Rift")

    p.click("text=Toggle All")
    check(s.active() == {"Flash", "Heal"}, f"[{label}] Toggle All inverts every spell except Mark on SR")
    check(all(set(pr) == {"Flash", "Heal"} for pr in s.roll(100)), f"[{label}] with two active spells every roll is that pair")

    p.click("#Flash")
    before = s.state()["pair"]
    n = len(s.dialogs)
    p.click("text=Randomize")
    check(s.dialogs[n:] == ["Pick 2 or more spells"], f"[{label}] fewer than 2 active -> alert 'Pick 2 or more spells'")
    check(s.state()["pair"] == before, f"[{label}] ...and the shown pair is unchanged")

    p.click("label[for=danger-outlined]")
    check(s.active() == {"Heal", "Mark"}, f"[{label}] ARAM auto-enables Mark")
    check(all(set(pr) == {"Heal", "Mark"} for pr in s.roll(50)), f"[{label}] Mark rolls on ARAM")

    p.click("#Mark")
    check(s.active() == {"Heal"}, f"[{label}] Mark can be toggled off on ARAM")
    p.click("#Mark")
    p.click("text=Toggle All")
    expected = SERVER_SPELLS - {"Heal"}
    check(s.active() == expected, f"[{label}] Toggle All on ARAM includes Mark")
    pairs = s.roll(300)
    check(rolls_ok(pairs, expected) and {x for pr in pairs for x in pr} == expected, f"[{label}] ARAM rolls use exactly the active set")

    p.click("label[for=success-outlined]")
    check("grayscale" in s.state()["filters"]["Mark"], f"[{label}] back to SR keeps Mark disabled")
    p.click("text=Toggle All")
    check(s.active() == {"Heal"}, f"[{label}] Toggle All on SR skips Mark again")
    p.click("label[for=danger-outlined]")
    check(s.active() == {"Heal", "Mark"}, f"[{label}] switching to ARAM enables Mark again")
    p.click("label[for=success-outlined]")
    check(s.active() == {"Heal"}, f"[{label}] switching to SR disables Mark again")

    check(not s.errors, f"[{label}] no page errors {s.errors}")
    check(not [m for m in s.console if m[0] in ("error", "warning")], f"[{label}] no console errors/warnings")
    check(not s.failed, f"[{label}] no failed requests {s.failed}")
    return {"logs": [m for m in s.console if m[0] == "log"], "dialogs": s.dialogs, "final": s.state()["filters"]}


def dom_signature(page):
    return page.evaluate("""() => [...document.body.querySelectorAll('*')]
      .filter(el => el.tagName !== 'SCRIPT')
      .map(el => [el.tagName, el.id, el.className, el.getAttribute('onclick'), el.getAttribute('for'), el.type || '',
                  el.children.length ? '' : el.textContent.trim()])""")


def screenshot_pair(page):
    page.evaluate("""() => { document.getElementById('spell-1').src = 'Images/Flash.png';
                             document.getElementById('spell-2').src = 'Images/Ignite.png'; }""")
    page.wait_for_function("[...document.images].every(i => i.complete && i.naturalWidth)")
    return Image.open(io.BytesIO(page.screenshot())).convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:4420")
    ap.add_argument("--preview-only", action="store_true")
    args = ap.parse_args()
    preview_url = args.base + "/previews/summoner/"
    original_url = args.base + "/"

    with sync_playwright() as pw:
        # launch() always runs Chrome headless with a fresh temporary profile (never a user profile).
        browser = pw.chromium.launch(channel="chrome", headless=True)

        preview = Session(browser, preview_url, args.base)
        t_preview = scenario(preview, "preview")
        outside = [u for u in preview.requests if not u.startswith(args.base)]
        check(not outside, f"[preview] zero third-party requests {outside}")

        if not args.preview_only:
            original = Session(browser, original_url, args.base)
            t_original = scenario(original, "original")
            check(t_preview["logs"] == t_original["logs"], f"[parity] identical console output ({len(t_original['logs'])} lines)")
            check(t_preview["dialogs"] == t_original["dialogs"], "[parity] identical alerts")
            check(t_preview["final"] == t_original["final"], "[parity] identical final spell state")
            original.load(); preview.load()
            check(dom_signature(preview.page) == dom_signature(original.page), "[parity] identical DOM (elements, ids, classes, handlers, text)")
            a, b = screenshot_pair(original.page), screenshot_pair(preview.page)
            diff = ImageChops.difference(a, b).getbbox()
            check(diff is None, f"[parity] pixel-identical at 1280x800 (diff bbox {diff})")
            a.save(SHOTS / "summoner-original-1280x800.png")
            original.context.close()

        # Keyboard enhancement (preview only).
        k = Session(browser, preview_url, args.base)
        k.load()
        for _ in range(8):
            k.page.keyboard.press("Tab")
            if k.page.evaluate("document.activeElement.id") == "Flash":
                break
        check(k.page.evaluate("document.activeElement.id") == "Flash", "[keyboard] Tab reaches the spell grid")
        check(k.page.evaluate("getComputedStyle(document.activeElement).boxShadow") != "none", "[keyboard] focused spell shows a focus ring")
        k.page.keyboard.press("Enter")
        check("grayscale" in k.state()["filters"]["Flash"] and k.page.get_attribute("#Flash", "aria-pressed") == "false", "[keyboard] Enter toggles the spell (aria-pressed=false)")
        k.page.keyboard.press(" ")
        check("grayscale" not in k.state()["filters"]["Flash"] and k.page.get_attribute("#Flash", "aria-pressed") == "true", "[keyboard] Space toggles it back")
        check(k.page.get_attribute("#Mark", "aria-pressed") == "false", "[keyboard] aria-pressed reflects Mark's initial disabled state")
        k.page.click("text=Toggle All")
        check(k.page.get_attribute("#Heal", "aria-pressed") == "false", "[keyboard] aria-pressed follows Toggle All")
        check(not k.errors, "[keyboard] no page errors")
        k.context.close()

        # Layout from 360 to 1400 px, plus screenshots.
        for w, h in [(360, 560), (390, 720), (768, 800), (1024, 800), (1280, 800), (1400, 900)]:
            s = Session(browser, preview_url, args.base, (w, h))
            s.load()
            m = s.page.evaluate("({sw: document.documentElement.scrollWidth, iw: innerWidth})")
            check(m["sw"] <= m["iw"], f"[layout] no horizontal scroll at {w}x{h} ({m})")
            if (w, h) in [(1280, 800), (390, 720), (360, 560)]:
                s.page.screenshot(path=str(SHOTS / f"summoner-{w}x{h}.png"))
            if (w, h) == (1280, 800):
                s.page.reload(); s.page.wait_for_load_state("load")
                s.page.wait_for_function("performance.getEntriesByName('first-contentful-paint').length > 0")
                fcp = s.page.evaluate("performance.getEntriesByName('first-contentful-paint')[0].startTime")
                check(fcp < 1500, f"[perf] first contentful paint {fcp:.0f} ms on a warm load")
            s.context.close()
        browser.close()

    print(f"\n{'ALL PASSED' if not failures else str(len(failures)) + ' FAILED'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
