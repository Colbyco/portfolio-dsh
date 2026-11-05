"""Headless checks for the Spotify lyrics fix preview (public/previews/spotify-classic-lyrics/).

    node scripts/dev-server.mjs --root public --port 4420      # from the repo root
    python previews-src/spotify-classic-lyrics/qa/test_preview.py

Clicks every control of the original interface (fix, undo, check again, startup checkbox, theme,
update check, report: issue, details, consent, send, save, back), checks the bridge contract and
the simulated main-process behaviour, the portfolio theme message, layout from 360 to 1400 px,
console/network hygiene, and writes screenshots to qa/previews/spotify-*.png.
"""
import argparse
import re
import sys
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

REPO = Path(__file__).resolve().parents[3]
SHOTS = REPO / "qa" / "previews"
NEEDS_FIX = "Put lyrics back beside your library and playback controls."
SAVED = "The lyrics setting is saved. Open Lyrics in Spotify to check it."
RESTORED = "Your previous lyrics preference was restored. Automatic repair is off."
AUTO_ON = "Automatic repair will run when this tool starts, if Spotify is closed."
LIGHT_BG, DARK_BG = "rgb(250, 248, 252)", "rgb(28, 26, 33)"
EXPECTED_FILES = {"", "preview.css", "preview.js", "icon.png", "app/index.html", "app/style.css",
                  "app/mock-bridge.js", "app/renderer.js", "app/report-schema.mjs"}

failures = []


def check(ok, message):
    print(("PASS  " if ok else "FAIL  ") + message)
    if not ok:
        failures.append(message)


def soft(fn, message):
    try:
        fn()
        check(True, message)
    except AssertionError as error:
        check(False, f"{message} ({str(error).splitlines()[0]})")


class Preview:
    def __init__(self, browser, url, viewport, color_scheme="light"):
        self.context = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]}, color_scheme=color_scheme)
        self.page = self.context.new_page()
        self.console, self.errors, self.requests, self.failed = [], [], [], []
        self.page.on("console", lambda m: self.console.append((m.type, m.text)))
        self.page.on("pageerror", lambda e: self.errors.append(str(e)))
        self.page.on("request", lambda r: self.requests.append((r.url, r.resource_type)))
        self.page.on("requestfailed", lambda r: self.failed.append(r.url))
        self.page.goto(url)
        self.app = self.page.frame_locator("#app")
        expect(self.app.locator("#fix")).to_be_enabled(timeout=5000)

    @property
    def frame(self):
        return next(f for f in self.page.frames if "/app/index.html" in f.url)

    def wait_frame(self, expression, timeout=5000):
        # The app page keeps its CSP (script-src 'self', no eval), which blocks Playwright's polling
        # wait_for_function; poll with evaluate() instead (it runs through DevTools, not eval).
        for _ in range(timeout // 50):
            if self.frame.evaluate(expression):
                return
            self.page.wait_for_timeout(50)
        raise AssertionError(f"timed out waiting for: {expression}")

    def frame_size(self):
        return self.page.evaluate("(() => { const r = document.getElementById('app').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.left)]; })()")

    def body_bg(self):
        return self.frame.evaluate("getComputedStyle(document.body).backgroundColor")

    def theme(self, value):
        self.page.evaluate("t => window.postMessage({ type: 'portfolio:theme', theme: t }, '*')", value)

    def hygiene(self, label, base):
        check(not self.errors, f"[{label}] no page errors {self.errors}")
        bad = [m for m in self.console if m[0] in ("error", "warning")]
        check(not bad, f"[{label}] no console errors/warnings {bad}")
        check(not self.failed, f"[{label}] no failed requests {self.failed}")
        prefix = base + "/previews/spotify-classic-lyrics/"
        outside = [u for u, _ in self.requests if not u.startswith(prefix)]
        check(not outside, f"[{label}] every request stays inside /previews/spotify-classic-lyrics/ {outside}")
        files = {u[len(prefix):].split("#")[0] for u, _ in self.requests if u.startswith(prefix)}
        check(files <= EXPECTED_FILES, f"[{label}] only the preview's own static files are requested {sorted(files - EXPECTED_FILES)}")
        dynamic = [u for u, t in self.requests if t in ("fetch", "xhr", "websocket", "eventsource")]
        check(not dynamic, f"[{label}] no fetch/XHR/WebSocket requests {dynamic}")


def luminance(rgb):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(float(x)) for x in re.findall(r"[\d.]+", rgb)[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://127.0.0.1:4420")
    args = ap.parse_args()
    url = args.base + "/previews/spotify-classic-lyrics/"

    with sync_playwright() as pw:
        # launch() runs Chrome headless with a fresh temporary profile (never a user profile).
        browser = pw.chromium.launch(channel="chrome", headless=True)

        # ---- Startup, bridge contract --------------------------------------------------------
        p = Preview(browser, url, (1280, 800))
        a, page = p.app, p.page
        soft(lambda: expect(a.locator("#message")).to_have_text(NEEDS_FIX), "[startup] Spotify detected, lyrics setting not saved yet")
        soft(lambda: expect(a.locator("#update-status")).to_have_text("Up to date", timeout=5000), "[startup] automatic update check: 'Up to date' for v1.0.4")
        check(a.locator("#report").is_hidden(), "[startup] 'Report a problem' hidden before any attempt (canReport false)")
        check(a.locator("#undo").is_disabled(), "[startup] Undo disabled (no backup yet)")
        api = p.frame.evaluate("""async () => {
          const api = window.classicLyrics;
          const status = await api.command('status');
          const unsubscribe = api.onStatus(() => {});
          let unknown = null, install = null;
          try { await api.command('nope'); } catch (e) { unknown = e.message; }
          try { await api.command('update-install'); } catch (e) { install = e.message; }
          return { keys: Object.keys(api), frozen: Object.isFrozen(api), types: [typeof api.command, typeof api.onStatus],
                   unsubscribe: typeof unsubscribe, thenable: typeof api.command('status').then, status, unknown, install };
        }""")
        check(api["keys"] == ["command", "onStatus"] and api["frozen"] and api["types"] == ["function", "function"],
              "[bridge] window.classicLyrics = frozen { command, onStatus } (preload.cjs contract)")
        check(api["unsubscribe"] == "function" and api["thenable"] == "function", "[bridge] command() returns a promise; onStatus() returns an unsubscribe function")
        st = api["status"]
        check(st["kind"] == "needs-fix" and st["version"] == "1.0.4" and st["appearance"] == "system" and st["update"]["kind"] == "current"
              and st["profiles"] == 1 and st["running"] is False and st["canUndo"] is False,
              f"[bridge] status shape from main.cjs emit() (kind, version, appearance, update, profiles, running, canUndo)")
        check(api["unknown"] == "Error invoking remote method 'command': Error: Unknown action.", "[bridge] errors use Electron's invoke prefix (renderer strips it)")
        check(api["install"] == "Error invoking remote method 'command': Error: The update has not finished downloading.", "[bridge] update-install refused unless an update is ready (updates.cjs)")
        check(p.frame_size()[:2] == [440, 365], f"[window] native 440x365 content size, centered ({p.frame_size()})")

        page.screenshot(path=str(SHOTS / "spotify-1280x800.png"))

        # ---- Fix ------------------------------------------------------------------------------
        a.locator("#fix").click()
        soft(lambda: expect(a.locator("#fix")).to_have_text("Working…"), "[fix] shows 'Working…' while saving")
        soft(lambda: expect(a.locator("#message")).to_have_text("Saving the classic lyrics preference…"), "[fix] working message")
        soft(lambda: expect(a.locator("#fix")).to_have_text("Fixed", timeout=5000), "[fix] button becomes 'Fixed'")
        soft(lambda: expect(a.locator("#message")).to_have_text(SAVED), "[fix] saved message")
        check(a.locator("#fix").is_disabled() and a.locator("#undo").is_enabled() and a.locator("#report").is_visible(), "[fix] Fix disabled, Undo enabled, Report visible")

        a.locator("#check").click()
        soft(lambda: expect(a.locator("#check")).to_be_enabled(), "[check] Check again completes")
        soft(lambda: expect(a.locator("#message")).to_have_text(SAVED), "[check] still reports the saved setting")

        # ---- Theme ----------------------------------------------------------------------------
        check(p.body_bg() == LIGHT_BG, f"[theme] System follows the (light) portfolio/OS theme: {p.body_bg()}")
        p.theme("dark")
        page.wait_for_function("document.documentElement.dataset.theme === 'dark'")
        p.wait_frame(f"getComputedStyle(document.body).backgroundColor === '{DARK_BG}'")
        check(True, "[theme] portfolio:theme dark -> backdrop and app (System) turn dark")
        check("dark" in (page.get_attribute("#window", "class") or ""), "[theme] title bar follows the app's dark appearance")
        page.screenshot(path=str(SHOTS / "spotify-1280x800-dark.png"))
        a.locator("#appearance").select_option("light")
        p.wait_frame(f"getComputedStyle(document.body).backgroundColor === '{LIGHT_BG}' && !document.getElementById('appearance').disabled")
        check(p.frame.evaluate("document.getElementById('appearance').value") == "light", "[theme] Theme: Light overrides the dark system theme")
        p.theme("light"); p.theme("dark")
        page.wait_for_timeout(150)
        check(p.body_bg() == LIGHT_BG, "[theme] ...and stays light when the portfolio theme changes")
        a.locator("#appearance").select_option("dark")
        p.wait_frame(f"getComputedStyle(document.body).backgroundColor === '{DARK_BG}' && !document.getElementById('appearance').disabled")
        check(True, "[theme] Theme: Dark")
        colors = p.frame.evaluate("""(() => { const b = getComputedStyle(document.body), m = getComputedStyle(document.getElementById('message')), f = getComputedStyle(document.getElementById('fix'));
            return { text: b.color, surface: b.backgroundColor, muted: m.color, action: f.backgroundColor, actionText: f.color }; })()""")
        check(contrast(colors["text"], colors["surface"]) >= 4.5 and contrast(colors["muted"], colors["surface"]) >= 4.5,
              "[theme] dark text contrast >= 4.5 (same check as the app's ui-self-test)")
        a.locator("#appearance").select_option("system")
        p.wait_frame(f"getComputedStyle(document.body).backgroundColor === '{DARK_BG}' && !document.getElementById('appearance').disabled")
        p.theme("light")
        p.wait_frame(f"getComputedStyle(document.body).backgroundColor === '{LIGHT_BG}'")
        check(True, "[theme] back to System follows the portfolio theme again (light)")
        note = page.evaluate("(() => { const n = getComputedStyle(document.querySelector('.note')); return [n.color, getComputedStyle(document.body).backgroundColor]; })()")
        check(contrast(*note) >= 4.5, f"[a11y] footnote contrast {contrast(*note):.1f}:1 (light)")

        # ---- Updates --------------------------------------------------------------------------
        a.locator("#update-check").click()
        soft(lambda: expect(a.locator("#update-status")).to_have_text("Checking for updates…"), "[updates] Check updates -> 'Checking for updates…'")
        check(a.locator("#update-check").is_disabled(), "[updates] button disabled while checking")
        soft(lambda: expect(a.locator("#update-status")).to_have_text("Up to date", timeout=5000), "[updates] -> 'Up to date'")
        soft(lambda: expect(a.locator("#update-check")).to_be_enabled(), "[updates] button enabled again")

        # ---- Report a problem -----------------------------------------------------------------
        a.locator("#report").click()
        soft(lambda: expect(a.locator("#report-view")).to_be_visible(timeout=5000), "[report] opens the report screen")
        page.wait_for_function("document.getElementById('app').getBoundingClientRect().height === 690")
        check(p.frame_size()[:2] == [460, 690], f"[report] window resized to 460x690 like main.cjs ({p.frame_size()})")
        check(a.locator("#home").is_hidden() and a.locator("#issue").input_value() == "lyrics-still-fullscreen", "[report] default issue selected")
        soft(lambda: expect(a.locator("#findings li")).to_have_text(["The setting is saved. If lyrics still cover the window after restarting Spotify, this Spotify version may no longer use it."]),
             "[report] local finding from the original analyze()")
        a.locator("summary").click()
        data = p.frame.evaluate("JSON.parse(document.getElementById('report-data').textContent)")
        check(data == {"schema": 1, "appVersion": "1.0.4", "platform": "win32", "osVersion": "10.0.26100", "architecture": "x64", "spotifyVersion": "1.3.6.1921",
                       "installation": "desktop", "spotifyRunning": False, "storageState": "fixed", "flagValues": ["CONTROL"], "readErrors": [],
                       "lastFix": "saved", "lastError": "none", "automaticRepair": False, "issue": "lyrics-still-fullscreen"},
              "[report] View report details shows the validated diagnostic report")
        page.screenshot(path=str(SHOTS / "spotify-report-1280x800.png"))
        check(a.locator("#send").is_disabled(), "[report] Send disabled without consent")
        a.locator("#consent").check()
        check(a.locator("#send").is_enabled(), "[report] consent enables Send")
        a.locator("#issue").select_option("automatic-repair-failed")
        soft(lambda: expect(a.locator("#issue")).to_be_enabled(), "[report] issue change applied")
        check(not a.locator("#consent").is_checked() and a.locator("#send").is_disabled(), "[report] changing the reviewed report clears consent")
        soft(lambda: expect(a.locator("#findings li")).to_have_text([re.compile("The setting is saved"), "Automatic repair is turned off."]), "[report] findings re-analyzed for the new issue")
        a.locator("#consent").check()
        a.locator("#send").click()
        soft(lambda: expect(a.locator("#report-status")).to_have_text("Sending…"), "[report] 'Sending…'")
        soft(lambda: expect(a.locator("#send")).to_have_text("Sent", timeout=5000), "[report] Send -> 'Sent'")
        status = a.locator("#report-status").text_content()
        check(re.fullmatch(r"Report sent\. Reference: [0-9a-f-]{36}", status) is not None, f"[report] receipt reference shown ({status})")
        soft(lambda: expect(page.locator("#notice")).to_have_text("Nothing was sent: the report upload is simulated."), "[report] preview notes that nothing was sent")
        check(a.locator("#send").is_disabled() and a.locator("#consent").is_disabled() and a.locator("#issue").is_disabled(), "[report] sent report is locked")
        a.locator("#save").click()
        soft(lambda: expect(a.locator("#report-status")).to_have_text("Report saved on this computer.", timeout=5000), "[report] Save instead (simulated dialog)")
        soft(lambda: expect(page.locator("#notice")).to_have_text("No file was saved: the save dialog is simulated."), "[report] preview notes that no file was saved")
        a.locator("#back").click()
        soft(lambda: expect(a.locator("#home")).to_be_visible(), "[report] Back returns to the main screen")
        page.wait_for_function("document.getElementById('app').getBoundingClientRect().height === 365")
        check(p.frame_size()[:2] == [440, 365] and page.locator("#notice").text_content() == "", "[report] window back to 440x365, notice cleared")

        # ---- Startup checkbox + Undo ----------------------------------------------------------
        a.locator("#auto").check()
        soft(lambda: expect(a.locator("#message")).to_have_text(AUTO_ON), "[auto] 'Check and fix at startup' on -> confirmation message")
        soft(lambda: expect(a.locator("#message")).to_have_text(SAVED, timeout=5000), "[auto] ...followed by the re-check (as main.cjs setAuto does)")
        check(a.locator("#auto").is_checked(), "[auto] checkbox stays on")
        login = p.frame.evaluate("window.classicLyrics.command('status').then(s => s.autoRepair)")
        check(login is True, "[auto] status.autoRepair true")
        a.locator("#undo").click()
        soft(lambda: expect(a.locator("#message")).to_have_text("Restoring your previous lyrics preference…"), "[undo] working message")
        soft(lambda: expect(a.locator("#message")).to_have_text(RESTORED, timeout=5000), "[undo] previous preference restored")
        check(not a.locator("#auto").is_checked(), "[undo] Undo turns automatic repair off")
        check(a.locator("#fix").is_enabled() and a.locator("#fix").text_content() == "Fix lyrics layout" and a.locator("#undo").is_disabled(), "[undo] Fix available again, Undo disabled")
        a.locator("#auto").check()
        soft(lambda: expect(a.locator("#message")).to_have_text(NEEDS_FIX, timeout=5000), "[auto] on while not fixed -> needs-fix message")
        a.locator("#auto").uncheck()
        soft(lambda: expect(a.locator("#message")).to_have_text(NEEDS_FIX, timeout=5000), "[auto] off again")
        check(not a.locator("#auto").is_checked(), "[auto] checkbox off")

        # ---- Report after undo: needs-fix finding ---------------------------------------------
        a.locator("#report").click()
        soft(lambda: expect(a.locator("#findings li")).to_have_text(["The classic layout setting is not saved yet."], timeout=5000), "[report] after Undo: 'not saved yet' finding")
        flags = p.frame.evaluate("JSON.parse(document.getElementById('report-data').textContent)")
        check(flags["storageState"] == "needs-fix" and flags["flagValues"] == ["MISSING"] and flags["lastFix"] == "not-attempted", "[report] flag restored to MISSING, lastFix reset by Undo")
        a.locator("#back").click()
        soft(lambda: expect(a.locator("#home")).to_be_visible(), "[report] back")

        # ---- Keyboard -------------------------------------------------------------------------
        page.keyboard.press("Tab")
        for _ in range(4):
            if p.frame.evaluate("document.activeElement && document.activeElement.id") == "fix":
                break
            page.keyboard.press("Tab")
        check(p.frame.evaluate("document.activeElement.id") == "fix", "[keyboard] Tab reaches 'Fix lyrics layout'")
        check(p.frame.evaluate("getComputedStyle(document.activeElement).outlineStyle") == "solid", "[keyboard] visible focus outline (app CSS)")
        page.keyboard.press("Enter")
        soft(lambda: expect(a.locator("#fix")).to_have_text("Fixed", timeout=5000), "[keyboard] Enter runs the fix")
        p.hygiene("1280", args.base)
        p.context.close()

        # ---- Narrow / other sizes -------------------------------------------------------------
        for (w, h), scheme in [((390, 720), "light"), ((360, 560), "light"), ((1400, 900), "dark"), ((768, 800), "light")]:
            q = Preview(browser, url, (w, h), scheme)
            q.page.wait_for_timeout(200)
            m = q.page.evaluate("({ sw: document.documentElement.scrollWidth, iw: innerWidth })")
            check(m["sw"] <= m["iw"], f"[layout {w}x{h}] no horizontal scroll ({m})")
            fw, fh, left = q.frame_size()
            inner = q.frame.evaluate("({ sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight })")
            check(inner["sw"] <= inner["iw"], f"[layout {w}x{h}] app content fits the window width ({inner})")
            if w < 488:
                check(fw == w and left == 0, f"[layout {w}x{h}] window fills the width on a narrow screen ({fw}px)")
                check(inner["sh"] <= inner["ih"], f"[layout {w}x{h}] window grows with its content (no inner scroll)")
            else:
                check(fw == 440 and abs(left - (w - 440) / 2) <= 1, f"[layout {w}x{h}] native 440px window centered (left {left})")
            if (w, h) == (390, 720):
                expect(q.app.locator("#update-status")).to_have_text("Up to date", timeout=5000)
                q.page.screenshot(path=str(SHOTS / "spotify-390x720.png"))
                q.app.locator("#fix").click()
                expect(q.app.locator("#report")).to_be_visible(timeout=5000)
                q.app.locator("#report").click()
                expect(q.app.locator("#report-view")).to_be_visible(timeout=5000)
                q.page.wait_for_timeout(150)
                inner = q.frame.evaluate("({ sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth })")
                check(inner["sh"] <= inner["ih"] and inner["sw"] <= inner["iw"], f"[layout 390x720] report screen fits without inner scroll ({inner})")
                q.page.screenshot(path=str(SHOTS / "spotify-report-390x720.png"), full_page=True)
            if (w, h) == (360, 560):
                expect(q.app.locator("#update-status")).to_have_text("Up to date", timeout=5000)
                q.page.screenshot(path=str(SHOTS / "spotify-360x560.png"))
            if (w, h) == (1400, 900):
                check(q.body_bg() == DARK_BG, "[layout 1400x900] dark OS preference (no portfolio message) -> dark app")
                note = q.page.evaluate("(() => { const n = getComputedStyle(document.querySelector('.note')); return [n.color, getComputedStyle(document.body).backgroundColor]; })()")
                check(contrast(*note) >= 4.5, f"[a11y] footnote contrast {contrast(*note):.1f}:1 (dark)")
            q.hygiene(f"{w}x{h}", args.base)
            q.context.close()

        # ---- Performance ----------------------------------------------------------------------
        q = Preview(browser, url, (1280, 800))
        q.page.reload()
        q.page.wait_for_function("performance.getEntriesByName('first-contentful-paint').length > 0")
        fcp = q.page.evaluate("performance.getEntriesByName('first-contentful-paint')[0].startTime")
        check(fcp < 1500, f"[perf] first contentful paint {fcp:.0f} ms on a warm load")
        q.context.close()
        browser.close()

    print(f"\n{'ALL PASSED' if not failures else str(len(failures)) + ' FAILED'}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
