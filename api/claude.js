// api/claude.js — secure backend helper. Holds the API key, talks to Claude.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY" });
  }

  try {
    const { content, useSearch } = req.body || {};

    const body = {
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content }],
    };
    if (useSearch) {
      body.tools = [{ type: "web_search_20250305", name: "web_search" }];
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const text = await r.text();
      return res.status(r.status).json({ error: "Anthropic error " + r.status, detail: text });
    }

    const data = await r.json();
    const out = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return res.status(200).json({ text: out });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
