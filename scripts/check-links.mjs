// Check every link and preview URL on the page.
// Usage: node scripts/check-links.mjs [base]   (default: https://colbybaker.dev)
const base = (process.argv[2] || "https://colbybaker.dev").replace(/\/$/, "");
const html = await (await fetch(base + "/")).text();

const hrefs = [...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]);
const stage = JSON.parse(html.match(/<script type="application\/json" id="stage-data">([\s\S]*?)<\/script>/)?.[1] ?? "[]");
const previewUrls = stage.flatMap((e) => [e.url, ...(e.routes ?? []).map((r) => r.url)]).filter(Boolean);
const urls = [...new Set([...hrefs, ...previewUrls].map((u) => new URL(u.replaceAll("&amp;", "&"), base + "/").href))];

const results = await Promise.all(
  urls.map(async (url) => {
    const opts = { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (link check)" }, signal: AbortSignal.timeout(20000) };
    try {
      let r = await fetch(url, { ...opts, method: "HEAD" });
      if (r.status === 405 || r.status === 403 || r.status === 404 && url.includes("linkedin")) r = await fetch(url, { ...opts, method: "GET" });
      return { url, status: r.status };
    } catch (e) {
      return { url, status: `ERR ${e.name}` };
    }
  }),
);
let bad = 0;
for (const { url, status } of results.sort((a, b) => String(a.status).localeCompare(String(b.status)))) {
  // LinkedIn answers bots with 999; that is expected, not a broken link.
  const ok = (typeof status === "number" && status < 400) || (url.includes("linkedin.com") && status === 999);
  if (!ok) bad++;
  console.log(`${ok ? "ok " : "BAD"} ${status}  ${url}`);
}
console.log(`\n${results.length} links checked, ${bad} broken`);
process.exit(bad ? 1 : 0);
