// api/resolve.js — Career Sonar ATS resolver.
// Given companies (name + domain), guesses likely ATS board tokens from the name/domain and
// probes the 7 token-based connectors to see which (if any) can screen the company for FREE.
// Workday is intentionally excluded (its endpoint needs the full careers URL, not a guessable token).
//
// POST { companies: [{ name, domain }] }
//   -> { results: [{ name, domain, ats, token, screenable, jobCount }] }

const TIMEOUT = 5000;
const e = encodeURIComponent;

async function getJSON(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json().catch(() => null);
  } catch (_) { return null; } finally { clearTimeout(t); }
}
async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.text().catch(() => null);
  } catch (_) { return null; } finally { clearTimeout(t); }
}

// Returns a job count (>=0) if the board exists for this source+token, else null.
async function probe(source, token) {
  try {
    if (source === "greenhouse") { const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${e(token)}/jobs?content=false`); return d && Array.isArray(d.jobs) ? d.jobs.length : null; }
    if (source === "lever") { const d = await getJSON(`https://api.lever.co/v0/postings/${e(token)}?mode=json`); return Array.isArray(d) ? d.length : null; }
    if (source === "ashby") { const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${e(token)}?includeCompensation=false`); return d && Array.isArray(d.jobs) ? d.jobs.length : null; }
    if (source === "smartrecruiters") { const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${e(token)}/postings?limit=10`); return d && Array.isArray(d.content) ? (d.totalFound != null ? d.totalFound : d.content.length) : null; }
    if (source === "workable") { const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${e(token)}?details=true`); return d && Array.isArray(d.jobs) ? d.jobs.length : null; }
    if (source === "recruitee") { const d = await getJSON(`https://${e(token)}.recruitee.com/api/offers/`); return d && Array.isArray(d.offers) ? d.offers.length : null; }
    if (source === "personio") {
      for (const h of [`${token}.jobs.personio.com`, `${token}.jobs.personio.de`]) {
        const txt = await getText(`https://${h}/xml`);
        if (txt && /<position>/i.test(txt)) return (txt.match(/<position>/gi) || []).length;
      }
      return null;
    }
  } catch (_) { return null; }
  return null;
}

const SOURCES = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "personio"];

function candidates(name, domain) {
  const set = new Set();
  const dom = String(domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  const root = dom.split(".")[0];
  if (root) set.add(root);
  const ns = String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  if (ns) set.add(ns);
  const hy = String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (hy && hy !== ns) set.add(hy);
  return [...set].slice(0, 3);
}

async function resolveOne(name, domain) {
  const toks = candidates(name, domain);
  const tasks = [];
  for (const s of SOURCES) for (const tk of toks) tasks.push((async () => ({ s, tk, n: await probe(s, tk) }))());
  const settled = await Promise.allSettled(tasks);
  let best = null;
  for (const r of settled) {
    if (r.status !== "fulfilled" || r.value.n == null) continue;
    const v = r.value;
    if (!best || v.n > best.n) best = v;
  }
  if (!best) return { name, domain: domain || "", ats: null, token: null, screenable: false, jobCount: 0 };
  return { name, domain: domain || "", ats: best.s, token: best.tk, screenable: true, jobCount: best.n };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = req.query || {};
      if (q.name || q.domain) { const one = await resolveOne(q.name || "", q.domain || ""); res.status(200).json({ v: 1, results: [one] }); return; }
      res.status(200).json({ ok: true, v: 1, sources: SOURCES, hint: "test with ?name=Pigment&domain=pigment.com" });
      return;
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const companies = Array.isArray(body.companies) ? body.companies.slice(0, 12) : [];
      const results = await Promise.all(companies.map((c) => resolveOne(c.name || "", c.domain || "")));
      res.status(200).json({ v: 1, results });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
}
