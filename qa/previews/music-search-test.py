"""End-to-end QA for the Music Search App preview (public/previews/music-search/).

What it does
  1. Runs the ORIGINAL program natively (`java controller.MetadataExtractor`, same jars) on the
     bundled sample library and on a missing folder; saves the output.
  2. Opens the preview in headless Chrome with a brand-new temporary profile (cold cache), waits
     for the first usable state (the program's prompt is shown and stdin is accepted), runs the
     sample library through the real Java code (CheerpJ), and compares the output with step 1.
  3. Exercises Run again, a missing folder, picked files (read locally), the theme message, the
     360 px layout, decodability of every sample MP3 in Chrome, and keyboard-only operation.
  4. Reloads the page several times in the same profile to measure warm starts.
  5. Saves screenshots and a JSON report to qa/previews/.

Usage (server must already be running on port 4440):
  node scripts/dev-server.mjs --root public --port 4440      (or: npx serve public -l 4440)
  python qa/previews/music-search-test.py [--profile-preload]

--profile-preload also writes public/previews/music-search/cheerpj-preload.json from
cjGetRuntimeResources() after the full scenario (CheerpJ's documented preloading workflow).
"""

import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PREVIEW = ROOT / "public" / "previews" / "music-search"
QA = ROOT / "qa" / "previews"
URL = "http://127.0.0.1:4440/previews/music-search/"
CLASSPATH = os.pathsep.join(["java/music-app-1.0-SNAPSHOT.jar", "java/mp3agic-0.9.1.jar"])
PROFILE_PRELOAD = "--profile-preload" in sys.argv

report = {"url": URL, "checks": {}, "timings": {}, "payload": {}}
failures = []


def check(name, ok, detail=""):
    report["checks"][name] = {"ok": bool(ok), "detail": detail}
    print(("PASS " if ok else "FAIL ") + name + (f"  ({detail})" if detail else ""))
    if not ok:
        failures.append(name)


def native(path_arg):
    """Run the original program with the JDK on PATH, feeding one line on stdin."""
    r = subprocess.run(
        ["java", "-Dstdout.encoding=UTF-8", "-Dstderr.encoding=UTF-8", "-cp", CLASSPATH,
         "controller.MetadataExtractor"],
        input=(path_arg + "\n").encode("utf-8"), cwd=PREVIEW, capture_output=True, timeout=120,
    )
    return r.stdout.decode("utf-8"), r.stderr.decode("utf-8"), r.returncode


def norm_native(text):
    return text.replace("\r\n", "\n").replace("\\", "/")


def norm_browser(text, browser_dir, native_dir):
    return text.replace(browser_dir, native_dir)


# ------------------------------------------------------------------------------------------------
# 1. Native reference runs

java_version = subprocess.run(["java", "-version"], capture_output=True, text=True).stderr.splitlines()[0]
report["native_java"] = java_version
n_out, n_err, n_code = native("sample-music")
(QA / "music-search-native-output.txt").write_text(n_out + ("\n[stderr]\n" + n_err if n_err else ""), encoding="utf-8")
m_out, m_err, m_code = native("does-not-exist")
check("native: sample run exits 0 with no stderr", n_code == 0 and n_err == "", f"exit {n_code}")
native_files = n_out.count("\nFile: ")
check("native: 12 files reported", native_files == 12, str(native_files))

# ------------------------------------------------------------------------------------------------


def ready_ms(page, timeout=120000):
    page.wait_for_function("() => window.__musicSearch && window.__musicSearch.metrics.readyMs !== null", timeout=timeout)
    return page.evaluate("() => window.__musicSearch.metrics.readyMs")


def wait_state(page, state, timeout=60000):
    page.wait_for_function(f"() => window.__musicSearch.state() === {json.dumps(state)}", timeout=timeout)


def stdout(page):
    return page.evaluate("() => window.__musicSearch.stdout()")


def stderr(page):
    return page.evaluate("() => window.__musicSearch.stderr()")


profile = Path(tempfile.mkdtemp(prefix="music-search-qa-"))
try:
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(profile), channel="chrome", headless=True, viewport={"width": 1280, "height": 800},
            color_scheme="dark",
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)))

        # Network accounting for the cold load: every request of the context, including CheerpJ's
        # own runtime frame (encoded body bytes, by origin).
        requests = []
        counting = {"on": True}

        def finished(req):
            if not counting["on"]:
                return
            try:
                resp = req.response()
                requests.append({"url": req.url, "bytes": max(req.sizes()["responseBodySize"], 0),
                                 "status": resp.status if resp else None})
            except Exception:
                requests.append({"url": req.url, "bytes": 0, "status": None})

        ctx.on("requestfinished", finished)

        # ---- 2. cold start -------------------------------------------------------------------
        t0 = time.time()
        page.goto(URL)
        page.wait_for_selector("#loading:not([hidden])")
        time.sleep(0.6)
        page.screenshot(path=str(QA / "music-search-loading.png"))
        cold = ready_ms(page)
        report["timings"]["cold_first_usable_ms"] = cold
        report["timings"]["cold_steps_ms"] = page.evaluate("() => window.__musicSearch.metrics.steps")
        fcp = page.evaluate("() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime")
        report["timings"]["cold_first_contentful_paint_ms"] = round(fcp or 0)
        print(f"cold: first usable {cold} ms (FCP {round(fcp or 0)} ms)")
        check("prompt shown", stdout(page) == "Enter path to directory: ")
        check("stdin enabled", page.is_enabled("#line") and not page.evaluate("() => document.getElementById('line').readOnly"))

        # ---- sample library through the real Java code ----------------------------------------
        t_run = time.time()
        page.click("#use-sample")
        wait_state(page, "exited")
        report["timings"]["sample_scan_ms"] = round((time.time() - t_run) * 1000)
        b_out, b_err = stdout(page), stderr(page)
        (QA / "music-search-browser-output.txt").write_text(b_out + ("\n[stderr]\n" + b_err if b_err else ""), encoding="utf-8")
        same = norm_browser(b_out, "/files/sample-music", "sample-music") == norm_native(n_out)
        check("browser output == native output (sample library)", same,
              "after mapping /files/sample-music -> sample-music, \\ -> /, CRLF -> LF")
        check("browser stderr empty", b_err == "", repr(b_err[:200]))
        check("echo of typed path shown", "/files/sample-music\n" in page.inner_text("#out"))
        if not same:
            import difflib
            diff = "\n".join(difflib.unified_diff(norm_native(n_out).splitlines(), norm_browser(b_out, "/files/sample-music", "sample-music").splitlines(), "native", "browser", lineterm=""))
            (QA / "music-search-output.diff").write_text(diff, encoding="utf-8")

        page.evaluate("() => { document.getElementById('out').scrollTop = 0; }")
        page.screenshot(path=str(QA / "music-search-1280x800.png"))
        page.evaluate("() => { const o = document.getElementById('out'); o.scrollTop = o.scrollHeight; }")
        page.screenshot(path=str(QA / "music-search-1280x800-end.png"))

        # ---- Run again + missing folder (keyboard only) -----------------------------------------
        page.focus("#line")
        page.keyboard.press("Enter")  # exited: Enter = Run again
        wait_state(page, "input")
        check("Run again via keyboard re-prompts", stdout(page).endswith("Enter path to directory: "))
        before_out, before_err = len(stdout(page)), len(stderr(page))
        page.keyboard.type("/files/does-not-exist")
        page.keyboard.press("Enter")
        wait_state(page, "exited")
        err2 = stderr(page)[before_err:]
        check("missing folder: same error text as native", norm_browser(err2, "/files/does-not-exist", "does-not-exist").replace("\r\n", "\n") == norm_native(m_err),
              f"browser {err2.strip()!r} vs native {m_err.strip()!r}")

        # ---- visitor-picked files (read locally) --------------------------------------------------
        picks = [
            str(PREVIEW / "sample-music" / "Romantic" / "Frederic Chopin" / "Nocturne Op. 9 No. 2.mp3"),
            str(PREVIEW / "sample-music" / "Untitled voice memo.mp3"),
            str(PREVIEW / "sample-music.json"),  # not an MP3: must be left out
        ]
        before = len(stdout(page))
        page.set_input_files("#pick-files", picks)
        page.wait_for_function("() => window.__musicSearch.state() === 'exited' && window.__musicSearch.metrics.runs >= 3", timeout=60000)
        picked_out = stdout(page)[before:]
        check("picked files scanned from /files/your-mp3s",
              picked_out.count("File: /files/your-mp3s/") == 2 and "Title: Nocturne in E-flat major, Op. 9 No. 2" in picked_out,
              f"{picked_out.count('File: ')} files")
        transcript = page.inner_text("#out")
        check("non-MP3 pick left out with a note", "non-MP3 file left out" in transcript)
        check("transcript reads 'Enter path to directory: /files/your-mp3s'",
              "Enter path to directory: /files/your-mp3s\n" in transcript)
        # picking while the program is waiting at its prompt: the note goes above the prompt
        page.focus("#line")
        page.keyboard.press("Enter")
        wait_state(page, "input")
        page.set_input_files("#pick-files", picks[:1])
        page.wait_for_function("() => window.__musicSearch.state() === 'exited' && window.__musicSearch.metrics.runs >= 4", timeout=60000)
        tail = page.inner_text("#out").rsplit("$ java controller.MetadataExtractor", 1)[-1]
        check("pick at the prompt: note above, prompt + path intact",
              "# Copied 1 MP3 file into /files/your-mp3s" in tail and "Enter path to directory: /files/your-mp3s\nDirectory: /files/your-mp3s" in tail
              and tail.index("# Copied") < tail.index("Enter path to directory:"), tail[:300].replace("\n", " | "))

        # ---- MP3 validity: Chrome decodes every sample file ---------------------------------------
        durations = page.evaluate("""async () => {
            const m = await (await fetch('sample-music.json')).json();
            const ctx = new OfflineAudioContext(1, 1, 44100);
            const out = [];
            for (const f of m.files) {
                const buf = await (await fetch('sample-music/' + f.path.split('/').map(encodeURIComponent).join('/'))).arrayBuffer();
                try { const a = await ctx.decodeAudioData(buf); out.push([f.path, a.duration]); }
                catch (e) { out.push([f.path, -1]); }
            }
            return out;
        }""")
        report["sample_durations_s"] = {k: round(v, 3) for k, v in durations}
        check("every sample MP3 decodes in Chrome (0.3-1.0 s)", all(0.3 <= d <= 1.05 for _, d in durations),
              ", ".join(f"{d:.2f}" for _, d in durations))

        # ---- theme message --------------------------------------------------------------------
        page.evaluate("() => window.postMessage({type: 'portfolio:theme', theme: 'light'}, '*')")
        page.wait_for_function("() => document.documentElement.dataset.theme === 'light'")
        bg = page.evaluate("() => getComputedStyle(document.body).backgroundColor")
        check("theme message switches to light", bg == "rgb(246, 247, 249)", bg)
        page.evaluate("() => { document.getElementById('out').scrollTop = 0; }")
        page.screenshot(path=str(QA / "music-search-light-1280x800.png"))
        page.evaluate("() => window.postMessage({type: 'portfolio:theme', theme: 'dark'}, '*')")
        page.wait_for_function("() => document.documentElement.dataset.theme === 'dark'")

        # ---- runtime resource profile (for preloadResources) ------------------------------------
        if PROFILE_PRELOAD:
            res = page.evaluate("() => cjGetRuntimeResources()")
            data = json.loads(res) if isinstance(res, str) else res
            (PREVIEW / "cheerpj-preload.json").write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
            print(f"wrote cheerpj-preload.json ({len(data)} runtime files)")

        # ---- payload of the cold load -----------------------------------------------------------
        counting["on"] = False
        by_origin = {}
        for r in requests:
            host = urlparse(r["url"]).netloc or r["url"][:20]
            o = by_origin.setdefault(host, {"requests": 0, "bytes": 0})
            o["requests"] += 1
            o["bytes"] += r["bytes"] or 0
        report["payload"]["cold_session_bytes_by_origin"] = by_origin
        report["payload"]["failed_requests"] = [f'{r["status"]} {r["url"]}' for r in requests if (r["status"] or 0) >= 400]
        report["console_errors_cold"] = console_errors[:]

        # ---- 4. warm starts ---------------------------------------------------------------------
        warm = []
        for _ in range(3):
            page.reload()
            warm.append(ready_ms(page))
        report["timings"]["warm_first_usable_ms"] = warm
        report["timings"]["warm_first_usable_median_ms"] = statistics.median(warm)
        fcp = page.evaluate("() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime")
        report["timings"]["warm_first_contentful_paint_ms"] = round(fcp or 0)
        print(f"warm: first usable {warm} ms (FCP {round(fcp or 0)} ms)")

        # ---- 5. mobile + narrow layout ---------------------------------------------------------
        page.set_viewport_size({"width": 390, "height": 720})
        page.click("#use-sample")
        wait_state(page, "exited")
        page.evaluate("() => { document.getElementById('out').scrollTop = 0; }")
        page.screenshot(path=str(QA / "music-search-390x720.png"))
        for w, h in [(360, 560), (390, 720), (1400, 900)]:
            page.set_viewport_size({"width": w, "height": h})
            sw = page.evaluate("() => document.documentElement.scrollWidth")
            check(f"no horizontal scroll at {w}x{h}", sw <= w, f"scrollWidth {sw}")
        page.set_viewport_size({"width": 360, "height": 560})
        page.screenshot(path=str(QA / "music-search-360x560.png"))

        # ---- keyboard: tab order reaches every control ------------------------------------------
        page.set_viewport_size({"width": 1280, "height": 800})
        page.evaluate("() => document.activeElement && document.activeElement.blur()")
        seen = []
        for _ in range(14):
            page.keyboard.press("Tab")
            seen.append(page.evaluate("() => { const a = document.activeElement; return a.id || a.tagName.toLowerCase() + ':' + (a.textContent || '').trim().slice(0, 24); }"))
        report["tab_order"] = seen
        need = ["out", "line", "send", "use-sample", "add-files", "add-folder", "clear"]
        check("keyboard reaches all controls", all(n in seen for n in need), " > ".join(seen))

        # ---- panels: sample library tree + original source viewer ------------------------------
        page.click("#library-panel summary")
        page.click("#source-panel summary")
        page.wait_for_selector("#source-tabs [role=tab]")
        src = page.inner_text("#source-code")
        check("source viewer shows the original MetadataExtractor.java",
              "HashMap<SongDetails, Mp3File> mp3Files = getMp3Files(List.of(scanner.nextLine()));" in src)
        page.focus("#source-tabs [role=tab][aria-selected=true]")
        page.keyboard.press("ArrowRight")
        check("source tabs switch with arrow keys", "public class FileUtils" in page.inner_text("#source-code"))
        check("library tree lists 12 files", page.locator("#library-tree .tag").count() == 12)
        page.locator("#library-panel").scroll_into_view_if_needed()
        page.screenshot(path=str(QA / "music-search-panels-1280x800.png"), full_page=True)

        report["console_errors_all"] = console_errors
        ctx.close()

        # ---- CDN unreachable: clear error state instead of an endless spinner --------------------
        browser = p.chromium.launch(channel="chrome", headless=True)
        bpage = browser.new_page(viewport={"width": 1280, "height": 800}, color_scheme="dark")
        bpage.route("https://cjrtnc.leaningtech.com/**", lambda route: route.abort())
        bpage.goto(URL)
        bpage.wait_for_selector("#loading.failed", timeout=20000)
        check("CDN blocked: error message + retry shown",
              "could not start" in bpage.inner_text("#loading-title") and bpage.is_visible("#retry"))
        bpage.screenshot(path=str(QA / "music-search-cdn-blocked.png"))
        bpage.close()

        # ---- embedded like the portfolio stage: same-origin iframe + theme message from parent ----
        hpage = browser.new_page(viewport={"width": 1000, "height": 700})
        harness = "http://127.0.0.1:4440/__music-search-harness.html"
        hpage.route(harness, lambda route: route.fulfill(content_type="text/html", body=(
            '<!doctype html><body style="margin:0;background:#333">'
            '<iframe id="stage" src="/previews/music-search/" title="preview" '
            'style="width:900px;height:600px;border:0"></iframe></body>')))
        hpage.goto(harness)
        frame = hpage.frame_locator("#stage")
        inner = hpage.frames[1]
        inner.wait_for_function("() => window.__musicSearch && window.__musicSearch.metrics.readyMs !== null", timeout=120000)
        hpage.evaluate("() => document.getElementById('stage').contentWindow.postMessage({type: 'portfolio:theme', theme: 'light'}, '*')")
        inner.wait_for_function("() => document.documentElement.dataset.theme === 'light'", timeout=5000)
        frame.locator("#use-sample").click()
        inner.wait_for_function("() => window.__musicSearch.state() === 'exited'", timeout=60000)
        files_in_frame = inner.evaluate("() => (window.__musicSearch.stdout().match(/^File: /gm) || []).length")
        check("works inside a same-origin iframe (stage) + theme from parent", files_in_frame == 12, f"{files_in_frame} files")
        hpage.screenshot(path=str(QA / "music-search-in-iframe.png"))
        browser.close()
finally:
    shutil.rmtree(profile, ignore_errors=True)

report["failures"] = failures
(QA / "music-search-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"timings": report["timings"], "payload": report["payload"]}, indent=2))
print("FAILURES:", failures or "none")
sys.exit(1 if failures else 0)
