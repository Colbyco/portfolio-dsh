// Server-side proxy for the 2022 OpenAI Chatbot preview.
//
// The original app sent one request shape: a completion with the prompt
//   "You are a chat bot\n--------\nuser:<message>\nyou:"
// plus temperature (0.1-1.0) and max_tokens (200-1500) from its sliders, to text-davinci-002.
// OpenAI shut that model down on 2024-01-04 and its replacement (gpt-3.5-turbo-instruct) on
// 2026-09-28. This proxy sends the identical request to the closest surviving relative,
// gpt-3.5-turbo-0613 (GPT-3.5 family, June 2023 snapshot), through OpenRouter's legacy
// completions endpoint, and answers in the original { choices: [{ text }] } shape.
//
// Cost control (the key itself is the hard backstop: a dedicated OpenRouter key capped at
// $5 per month):
//   * only the original prompt template is accepted, message <= 1000 characters
//   * temperature and max_tokens clamped to the original slider ranges
//   * requests must come from this site (Origin/Referer check)
//   * per-visitor rate limits (per instance): 6 per minute, 60 per day
//   * message text is never logged
const ENDPOINT = "https://openrouter.ai/api/v1/completions";
const MODELS = ["openai/gpt-3.5-turbo-0613", "openai/gpt-3.5-turbo-16k"];
const PREFIX = "You are a chat bot\n--------\nuser:";
const SUFFIX = "\nyou:";
const MAX_MESSAGE = 1000;
const MAX_BODY = 8 * 1024;
const PER_MINUTE = 6;
const PER_DAY = 60;
const SITE = "https://colby-portfolio-dsh.vercel.app";
const ALLOWED = [/^https:\/\/colby-portfolio-dsh(-[a-z0-9-]+)?\.vercel\.app$/, /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/];

const hits = new Map(); // ip -> { minute: number[], day: number[] }

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
const fail = (res, status, message) => send(res, status, { error: { message } });

function originAllowed(req) {
  const raw = req.headers.origin || req.headers.referer || "";
  try {
    const { origin } = new URL(raw);
    return ALLOWED.some((re) => re.test(origin));
  } catch {
    return false;
  }
}

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return fwd || String(req.headers["x-real-ip"] || req.socket?.remoteAddress || "unknown");
}

function rateLimited(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { minute: [], day: [] };
  rec.minute = rec.minute.filter((t) => now - t < 60_000);
  rec.day = rec.day.filter((t) => now - t < 86_400_000);
  if (rec.minute.length >= PER_MINUTE) return "minute";
  if (rec.day.length >= PER_DAY) return "day";
  rec.minute.push(now);
  rec.day.push(now);
  hits.set(ip, rec);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  return null;
}

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body; // Vercel may pre-parse
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("too large"), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const clamp = (n, lo, hi, fallback) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : fallback);

export default async function handler(req, res) {
  const path = (req.url || "").split("?")[0];
  if (path !== "/api/chatbot/completions") return fail(res, 404, "Not found");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(res, 405, "Use POST");
  }
  if (!originAllowed(req)) return fail(res, 403, "This endpoint only serves the portfolio's chatbot preview.");

  const key = process.env.OPENROUTER_CHATBOT_KEY;
  if (!key) return fail(res, 503, "Live replies are not configured on this deployment.");

  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return fail(res, err.status || 400, err.status === 413 ? "Request too large." : "Invalid JSON.");
  }

  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.startsWith(PREFIX) || !prompt.endsWith(SUFFIX)) return fail(res, 400, "Unexpected prompt format.");
  const message = prompt.slice(PREFIX.length, prompt.length - SUFFIX.length);
  if (!message.trim()) return fail(res, 400, "Empty message.");
  if (message.length > MAX_MESSAGE) return fail(res, 413, `Messages are limited to ${MAX_MESSAGE} characters in this preview.`);

  const limited = rateLimited(clientIp(req));
  if (limited) {
    return fail(res, 429, limited === "minute" ? "Too many messages at once. Wait a minute and try again." : "Daily message limit for this preview reached. Try again tomorrow.");
  }

  const upstreamBody = {
    model: MODELS[0],
    models: MODELS,
    prompt,
    max_tokens: Math.round(clamp(body.max_tokens, 1, 1500, 200)),
    temperature: clamp(body.temperature, 0, 1, 0.7),
  };

  let upstream;
  try {
    upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": SITE,
        "X-Title": "Colby Baker portfolio: 2022 OpenAI Chatbot preview",
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (err) {
    return fail(res, 504, err?.name === "TimeoutError" ? "The model took too long to answer." : "Could not reach the model service.");
  }

  let data = null;
  try {
    data = await upstream.json();
  } catch {}

  if (!upstream.ok) {
    if (upstream.status === 402) return fail(res, 503, "This month's demo budget is used up. It resets on the 1st.");
    if (upstream.status === 429) return fail(res, 503, "The model service is busy. Try again in a moment.");
    return fail(res, 502, `The model service returned an error (${upstream.status}).`);
  }

  const text = data?.choices?.[0]?.text ?? data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) return fail(res, 502, "The model returned no text.");
  console.log(JSON.stringify({ chatbot: "ok", model: data.model, prompt_tokens: data.usage?.prompt_tokens, completion_tokens: data.usage?.completion_tokens }));
  return send(res, 200, { model: data.model || MODELS[0], choices: [{ text }] });
}
