// api/claude.js — secure proxy to the Anthropic API.
// The API key stays server-side (ANTHROPIC_API_KEY env var) and never reaches the browser.
// Body: { content, useSearch, model }  ->  { text }
//   - model: optional; falls back to Sonnet. Pass the cheap Haiku model for high-frequency
//     structured tasks (scoring, title expansion) to cut cost ~4-5x.
//   - useSearch: when true, the web_search tool is enabled (used for company research / verify).

const DEFAULT_MODEL = "claude-sonnet-4-6";
const ALLOWED = new Set([
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
]);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) { res.status(500).json({ error: "ANTHROPIC_API_KEY is not set in Vercel environment variables." }); return; }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const content = String(body.content || "");
    const useSearch = !!body.useSearch;
    const model = ALLOWED.has(body.model) ? body.model : DEFAULT_MODEL;

    const payload = {
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content }],
    };
    if (useSearch) payload.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(r.status).json({ error: (data && data.error) || ("Anthropic error " + r.status) });
      return;
    }

    const text = Array.isArray(data.content)
      ? data.content.filter((b) => b && b.type === "text").map((b) => b.text).join("")
      : "";
    res.status(200).json({ text });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
