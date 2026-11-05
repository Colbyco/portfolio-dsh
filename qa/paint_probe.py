"""Measure first paint (unthrottled) with/without JS and with mobile emulation."""
import sys, statistics
from playwright.sync_api import sync_playwright

url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for label, kw in [("desktop js", {}), ("desktop nojs", {"java_script_enabled": False}),
                      ("mobile js", {"viewport": {"width": 412, "height": 823}, "is_mobile": True, "device_scale_factor": 2.6}),
                      ("mobile nojs", {"viewport": {"width": 412, "height": 823}, "is_mobile": True, "device_scale_factor": 2.6, "java_script_enabled": False})]:
        fcps, lcps = [], []
        for _ in range(3):
            ctx = b.new_context(**kw)
            pg = ctx.new_page()
            pg.add_init_script("""
              window.__lcp = 0;
              new PerformanceObserver(l => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({type: 'largest-contentful-paint', buffered: true});
            """) if kw.get("java_script_enabled", True) else None
            pg.goto(url, wait_until="load")
            pg.wait_for_timeout(1500)
            if kw.get("java_script_enabled", True):
                fcp = pg.evaluate("(performance.getEntriesByName('first-contentful-paint')[0]||{}).startTime || -1")
                lcp = pg.evaluate("window.__lcp")
            else:
                # measure via CDP Performance metrics when JS is disabled
                cdp = ctx.new_cdp_session(pg)
                cdp.send("Performance.enable")
                m = {x["name"]: x["value"] for x in cdp.send("Performance.getMetrics")["metrics"]}
                fcp = (m.get("FirstMeaningfulPaint", 0) - m.get("NavigationStart", 0)) * 1000
                lcp = -1
            fcps.append(round(fcp)); lcps.append(round(lcp))
            ctx.close()
        print(f"{label:13} FCP {fcps}  LCP {lcps}")
    b.close()
