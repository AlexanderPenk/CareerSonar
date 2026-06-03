// api/radar.js — Career Sonar market radar (TheirStack)
// Broad market discovery: searches thousands of company career sites by criteria.
// Key is read securely from the THEIRSTACK_API_KEY environment variable (never in code).
//
// GET test mode (browser):  /api/radar?title=Head of Sales&country=ES&days=30&limit=5
// POST (app):  { titles:[...], countries:[...], descriptionPatterns:[...], maxAgeDays, limit }
//   -> { count, jobs:[{company,title,location,link,source,posted}], total }
//
// NOTE: TheirStack consumes 1 API credit per job returned, so limit is capped.

const clean = (s) => (s == null ? "" : String(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function runSearch({ key, titles, countries, patterns, maxAge, limit }) {
  const payload = {
    posted_at_max_age_days: maxAge > 0 ? maxAge : 30,
    order_by: [{ field: "date_posted", desc: true }],
    limit: Math.min(Math.max(limit || 25, 1), 50),
    page: 0,
  };
  if (titles && titles.length) payload.job_title_or = titles;
  if (countries && countries.length) payload.job_country_code_or = countries.map((c) => String(c).toUpperCase());
  if (patterns && patterns.length) payload.company_description_pattern_or = patterns;

  const r = await fetch("https://api.theirstack.com/v1/jobs/search", {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && (data.message || data.detail || (Array.isArray(data) && data[0] && data[0].msg))) || ("TheirStack error " + r.status);
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = r.status;
    throw err;
  }

  const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.results) ? data.results : Array.isArray(data.jobs) ? data.jobs : [];
  const jobs = rows.map((j) => {
    const co = j.company_object || j.company_obj || {};
    const company = clean(j.company || co.name || j.company_name);
    const title = clean(j.job_title || j.title);
    const loc = clean(j.location || j.long_location || j.short_location || [j.city, j.country].filter(Boolean).join(", "));
    const remote = j.remote || j.is_remote ? " · Remote" : "";
    const link = j.url || j.final_url || j.source_url || j.apply_url || co.url || "";
    const posted = j.date_posted || j.posted_date || j.discovered_at || "";
    return { company, title, location: loc + (remote && !/remote/i.test(loc) ? remote : ""), link, source: "Radar (TheirStack)", posted };
  }).filter((j) => j.title && j.company);

  const total = (data.metadata && (data.metadata.total_results || data.metadata.total_count)) || undefined;
  return { jobs, total, _debug: Object.keys(data || {}) };
}

export default async function handler(req, res) {
  try {
    const key = process.env.THEIRSTACK_API_KEY;
    if (!key) { res.status(500).json({ error: "THEIRSTACK_API_KEY is not set in Vercel environment variables." }); return; }

    if (req.method === "GET") {
      const q = req.query || {};
      const titles = q.title ? [].concat(q.title) : [];
      const countries = q.country ? [].concat(q.country) : [];
      const patterns = q.pattern ? [].concat(q.pattern) : [];
      const maxAge = Number(q.days) || 30;
      const limit = Math.min(Number(q.limit) || 5, 25);
      if (!titles.length && !countries.length) { res.status(200).json({ ok: true, hint: "test with ?title=Head of Sales&country=ES&days=30&limit=5" }); return; }
      const out = await runSearch({ key, titles, countries, patterns, maxAge, limit });
      res.status(200).json({ count: out.jobs.length, total: out.total, jobs: out.jobs, _debug: out._debug });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const titles = Array.isArray(body.titles) ? body.titles.filter(Boolean) : [];
      const countries = Array.isArray(body.countries) ? body.countries.filter(Boolean) : [];
      const patterns = Array.isArray(body.descriptionPatterns) ? body.descriptionPatterns.filter(Boolean) : [];
      const out = await runSearch({ key, titles, countries, patterns, maxAge: Number(body.maxAgeDays) || 30, limit: Number(body.limit) || 25 });
      res.status(200).json({ count: out.jobs.length, total: out.total, jobs: out.jobs });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(e && e.status ? e.status : 500).json({ error: String((e && e.message) || e) });
  }
}
