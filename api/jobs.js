// api/jobs.js — holt LIVE-Stellen aus öffentlichen ATS-Feeds, serverseitig (echter Status, kein CORS).
// Quellen ohne Auth: greenhouse, lever, ashby.

async function safeJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "CareerSonar/1.0" } });
  if (!r.ok) return null;
  return r.json();
}

async function fetchGreenhouse(token, name) {
  const d = await safeJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  if (!d || !Array.isArray(d.jobs)) return [];
  return d.jobs.map((j) => ({
    company: name || token,
    title: j.title || "",
    location: (j.location && j.location.name) || "",
    link: j.absolute_url || "",
    source: "Greenhouse",
    posted: j.updated_at ? String(j.updated_at).slice(0, 10) : "",
  }));
}

async function fetchLever(slug, name) {
  const d = await safeJson(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!Array.isArray(d)) return [];
  return d.map((j) => ({
    company: name || slug,
    title: j.text || "",
    location: (j.categories && j.categories.location) || "",
    link: j.hostedUrl || j.applyUrl || "",
    source: "Lever",
    posted: j.createdAt ? new Date(j.createdAt).toISOString().slice(0, 10) : "",
  }));
}

async function fetchAshby(slug, name) {
  const d = await safeJson(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!d || !Array.isArray(d.jobs)) return [];
  return d.jobs.map((j) => ({
    company: name || slug,
    title: j.title || "",
    location: j.locationName || j.location || "",
    link: j.jobUrl || j.applyUrl || "",
    source: "Ashby",
    posted: j.publishedAt ? String(j.publishedAt).slice(0, 10) : "",
  }));
}

async function gather(companies) {
  const tasks = [];
  for (const c of companies || []) {
    if (!c || !c.id) continue;
    const name = c.name || c.id;
    if (c.source === "greenhouse") tasks.push(fetchGreenhouse(c.id, name));
    else if (c.source === "lever") tasks.push(fetchLever(c.id, name));
    else if (c.source === "ashby") tasks.push(fetchAshby(c.id, name));
  }
  const results = await Promise.all(tasks.map((p) => p.catch(() => [])));
  return results.flat();
}

export default async function handler(req, res) {
  try {
    let companies = [];
    if (req.method === "POST") {
      companies = (req.body && req.body.companies) || [];
    } else {
      const q = req.query || {};
      if (q.greenhouse) companies.push({ source: "greenhouse", id: q.greenhouse });
      if (q.lever) companies.push({ source: "lever", id: q.lever });
      if (q.ashby) companies.push({ source: "ashby", id: q.ashby });
    }
    const jobs = await gather(companies);
    return res.status(200).json({ count: jobs.length, jobs });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
