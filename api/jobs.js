// api/jobs.js — Career Sonar live ATS job feeds (Vercel serverless, Node 18+)
// Pulls REAL, currently-open jobs straight from a company's public ATS feed.
// Supported: greenhouse, lever, ashby, smartrecruiters, workable, recruitee, personio, workday
// GET  test mode:  /api/jobs?greenhouse=datsolutions   (or ?workday=<encoded full myworkdayjobs URL>)
// POST radar/watchlist: { companies: [ { source, id, name } ] }  ->  { count, jobs:[...], errors:[...] }

const UA = "Mozilla/5.0 (compatible; CareerSonar/1.0)";

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json", ...(opts.headers || {}) } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function getText(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { ...opts, signal: ctrl.signal, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

const clean = (s) => (s == null ? "" : String(s)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ---------- adapters: each returns [{ company, title, location, link, source, posted }] ----------

async function greenhouse(token, name) {
  const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=false`);
  return (d.jobs || []).map((j) => ({ company: name || token, title: clean(j.title), location: clean(j.location && j.location.name), link: j.absolute_url, source: "Greenhouse", posted: j.updated_at || "" }));
}

async function lever(slug, name) {
  const d = await getJSON(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`);
  return (Array.isArray(d) ? d : []).map((j) => ({ company: name || slug, title: clean(j.text), location: clean(j.categories && j.categories.location), link: j.hostedUrl, source: "Lever", posted: j.createdAt ? new Date(j.createdAt).toISOString() : "" }));
}

async function ashby(slug, name) {
  const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=false`);
  return (d.jobs || []).map((j) => ({ company: name || slug, title: clean(j.title), location: clean(j.location), link: j.jobUrl || j.applyUrl, source: "Ashby", posted: j.publishedDate || j.updatedAt || "" }));
}

async function smartrecruiters(id, name) {
  const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(id)}/postings?limit=100`);
  return (d.content || []).map((j) => {
    const loc = j.location || {};
    const parts = [loc.city, loc.region, loc.country].filter(Boolean);
    return { company: name || (j.company && j.company.name) || id, title: clean(j.name), location: clean(parts.join(", ") + (loc.remote ? " · Remote" : "")), link: `https://jobs.smartrecruiters.com/${id}/${j.id}`, source: "SmartRecruiters", posted: j.releasedDate || "" };
  });
}

async function workable(client, name) {
  const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(client)}?details=true`);
  return (d.jobs || []).map((j) => {
    const loc = j.location || {};
    const parts = [loc.city || j.city, loc.region || j.state, loc.country || j.country].filter(Boolean);
    const remote = loc.telecommuting || j.telecommuting ? " · Remote" : "";
    return { company: name || d.name || client, title: clean(j.title), location: clean(parts.join(", ") + remote), link: j.application_url || j.url || `https://apply.workable.com/${client}/j/${j.shortcode}/`, source: "Workable", posted: j.published_on || j.created_at || "" };
  });
}

async function recruitee(sub, name) {
  const d = await getJSON(`https://${encodeURIComponent(sub)}.recruitee.com/api/offers/`);
  return (d.offers || []).filter((o) => !o.status || o.status === "published").map((o) => {
    const parts = [o.city, o.country].filter(Boolean);
    return { company: name || o.company_name || sub, title: clean(o.title), location: clean(o.location || parts.join(", ")), link: o.careers_url || o.careers_apply_url, source: "Recruitee", posted: o.published_at || "" };
  });
}

async function personio(sub, name) {
  let xml = "", host = "";
  for (const h of [`${sub}.jobs.personio.com`, `${sub}.jobs.personio.de`]) {
    try { const txt = await getText(`https://${h}/xml?language=en`); if (txt && txt.indexOf("<position") !== -1) { xml = txt; host = h; break; } } catch (e) { /* try next host */ }
  }
  if (!xml) throw new Error("no Personio feed");
  const pick = (b, tag) => { const m = b.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">")); return m ? clean(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")) : ""; };
  const blocks = xml.match(/<position>[\s\S]*?<\/position>/g) || [];
  return blocks.map((b) => {
    const id = pick(b, "id");
    return { company: name || sub, title: pick(b, "name"), location: clean([pick(b, "office"), pick(b, "department")].filter(Boolean).join(" · ")), link: `https://${host}/job/${id}?language=en`, source: "Personio", posted: pick(b, "createdAt") };
  });
}

async function workday(url, name) {
  // url = full careers URL, e.g. https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers
  const m = String(url).match(/https?:\/\/([^.]+)\.(wd\d+)\.myworkdayjobs\.com\/([^?#]*)/i);
  if (!m) throw new Error("invalid Workday URL");
  const tenant = m[1], dc = m[2];
  const segs = m[3].split("/").filter(Boolean).filter((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s));
  const site = segs[0];
  if (!site) throw new Error("could not parse Workday career-site from URL");
  const host = `${tenant}.${dc}.myworkdayjobs.com`;
  const cxs = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
  const out = [];
  for (let offset = 0; offset < 60; offset += 20) {
    let d;
    try {
      d = await getJSON(cxs, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appliedFacets: {}, limit: 20, offset, searchText: "" }) });
    } catch (e) { if (offset === 0) throw e; break; }
    const posts = d.jobPostings || [];
    for (const p of posts) {
      const ext = p.externalPath || "";
      out.push({ company: name || tenant, title: clean(p.title), location: clean(p.locationsText), link: `https://${host}/${site}${ext}`, source: "Workday", posted: p.startDate || p.postedOn || "" });
    }
    if (posts.length < 20) break;
  }
  return out;
}

const ADAPTERS = { greenhouse, lever, ashby, smartrecruiters, workable, recruitee, personio, workday };

async function fetchCompany(source, id, name) {
  const fn = ADAPTERS[String(source || "").toLowerCase()];
  if (!fn) throw new Error("unknown source: " + source);
  return await fn(id, name);
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const q = req.query || {};
      const src = Object.keys(ADAPTERS).find((s) => q[s]);
      if (!src) { res.status(200).json({ ok: true, sources: Object.keys(ADAPTERS), hint: "test with ?greenhouse=datsolutions  or  ?smartrecruiters=smartrecruiters  or  ?workday=<url-encoded full myworkdayjobs URL>" }); return; }
      const jobs = await fetchCompany(src, q[src], q.name || "");
      res.status(200).json({ count: jobs.length, jobs });
      return;
    }
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const companies = Array.isArray(body.companies) ? body.companies : [];
      const settled = await Promise.allSettled(companies.map((c) => fetchCompany(c.source, c.id, c.name)));
      let jobs = [];
      const errors = [];
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") jobs = jobs.concat(s.value);
        else errors.push({ company: companies[i] && (companies[i].name || companies[i].id), error: String((s.reason && s.reason.message) || s.reason) });
      });
      const seen = new Set();
      const dedup = [];
      for (const j of jobs) { if (!j.title) continue; const k = j.link || j.company + "|" + j.title; if (seen.has(k)) continue; seen.add(k); dedup.push(j); }
      res.status(200).json({ count: dedup.length, jobs: dedup, errors });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
