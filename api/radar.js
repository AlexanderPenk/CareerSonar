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

const NAME2CODE = { "united states": "US", "usa": "US", "u.s.": "US", "united kingdom": "GB", "u.k.": "GB", "uk": "GB", "england": "GB", "germany": "DE", "deutschland": "DE", "spain": "ES", "españa": "ES", "france": "FR", "netherlands": "NL", "ireland": "IE", "portugal": "PT", "italy": "IT", "sweden": "SE", "denmark": "DK", "norway": "NO", "finland": "FI", "poland": "PL", "switzerland": "CH", "austria": "AT", "belgium": "BE", "luxembourg": "LU", "canada": "CA", "india": "IN", "australia": "AU", "singapore": "SG", "mexico": "MX", "brazil": "BR", "argentina": "AR", "colombia": "CO", "chile": "CL", "united arab emirates": "AE", "uae": "AE", "dubai": "AE", "saudi arabia": "SA", "qatar": "QA", "kuwait": "KW", "bahrain": "BH", "oman": "OM" };

// Major cities -> country, so a role anchored to a single foreign city ("London Area",
// "Greater Paris", "Hamburg") is recognized as country-locked even without the country name.
const CITY2CODE = { "madrid": "ES", "barcelona": "ES", "valencia": "ES", "sevilla": "ES", "seville": "ES", "malaga": "ES", "bilbao": "ES", "london": "GB", "manchester": "GB", "birmingham": "GB", "edinburgh": "GB", "dublin": "IE", "paris": "FR", "lyon": "FR", "toulouse": "FR", "berlin": "DE", "munich": "DE", "münchen": "DE", "munchen": "DE", "hamburg": "DE", "frankfurt": "DE", "cologne": "DE", "köln": "DE", "koln": "DE", "stuttgart": "DE", "düsseldorf": "DE", "dusseldorf": "DE", "amsterdam": "NL", "rotterdam": "NL", "utrecht": "NL", "vienna": "AT", "wien": "AT", "zurich": "CH", "zürich": "CH", "geneva": "CH", "milan": "IT", "milano": "IT", "rome": "IT", "roma": "IT", "lisbon": "PT", "lisboa": "PT", "porto": "PT", "stockholm": "SE", "copenhagen": "DK", "oslo": "NO", "helsinki": "FI", "brussels": "BE", "warsaw": "PL", "abu dhabi": "AE", "riyadh": "SA", "new york": "US", "san francisco": "US", "austin": "US", "boston": "US", "chicago": "US", "seattle": "US", "los angeles": "US", "atlanta": "US", "denver": "US", "mexico city": "MX", "toronto": "CA", "bangalore": "IN", "bengaluru": "IN", "mumbai": "IN" };

// ISO2 codes inferred from the job's DISPLAYED location text (what the user sees).
function jobCodes(j) {
  const s = new Set();
  const locStr = String(j.location || j.long_location || j.short_location || j.country || "").toLowerCase();
  for (const name in NAME2CODE) { if (locStr.indexOf(name) !== -1) s.add(NAME2CODE[name]); }
  for (const city in CITY2CODE) { if (locStr.indexOf(city) !== -1) s.add(CITY2CODE[city]); }
  return s;
}

// A role open across a region / borderless, i.e. plausibly workable from the user's base.
function isBroadRemote(locStr) {
  return /\b(emea|europe|european|eu wide|eu-wide|eea|pan[- ]?europe|global|worldwide|world wide|anywhere|international|remote first|remote-first)\b/i.test(locStr);
}

async function runSearch({ key, titles, countries, homeCountries, broadRemote, patterns, maxAge, limit }) {
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
    let msg = (data && (data.message || data.detail || (Array.isArray(data) && data[0] && data[0].msg))) || ("TheirStack error " + r.status);
    if (r.status === 402) msg = "TheirStack: out of API credits. The free tier gives 200 results/month (1 credit per returned job). Wait for your monthly reset, upgrade your TheirStack plan, or use the watchlist (ATS) pulls which are free. " + (typeof msg === "string" && msg.indexOf("TheirStack error") === -1 ? "(" + msg + ")" : "");
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = r.status;
    throw err;
  }

  const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.results) ? data.results : Array.isArray(data.jobs) ? data.jobs : [];
  // Keep a role only if it's workable from the user's base:
  //  - located in one of their home/place countries (e.g. Spain), OR
  //  - a genuinely borderless / region-wide remote role (when a remote market is selected), OR
  //  - location is ambiguous (city we don't map / pure "Remote").
  // Drop roles anchored to a single OTHER country (e.g. "Germany · Remote", "London Area").
  const homeSet = new Set((homeCountries || countries || []).map((c) => String(c).toUpperCase()));
  const inMarket = rows.filter((j) => {
    if (!homeSet.size && !broadRemote) return true;
    const locStr = String(j.location || j.long_location || j.short_location || "").toLowerCase();
    const codes = jobCodes(j);
    if (!codes.size) return true;                                   // ambiguous -> keep
    for (const c of codes) if (homeSet.has(c)) return true;         // in a home country
    if (broadRemote && (isBroadRemote(locStr) || codes.size >= 2)) return true; // region-wide remote
    return false;                                                   // locked to another single country
  });
  const tidy = (s) => clean(String(s).replace(/\{+\s*remote\s*\}+/gi, "Remote").replace(/,?\s*United States of America/gi, ", USA")).replace(/(,\s*)+/g, ", ").replace(/^,\s*|,\s*$/g, "");
  const jobs = inMarket.map((j) => {
    const co = j.company_object || j.company_obj || {};
    const company = clean(j.company || co.name || j.company_name);
    const title = clean(j.job_title || j.title);
    const isRemote = j.remote || j.is_remote || /remote/i.test(String(j.location || ""));
    let loc = tidy(j.location || j.long_location || j.short_location || [j.city, j.country].filter(Boolean).join(", "));
    if (isRemote && !/remote/i.test(loc)) loc = loc ? loc + " · Remote" : "Remote";
    const link = j.url || j.final_url || j.source_url || j.apply_url || co.url || "";
    const posted = j.date_posted || j.posted_date || j.discovered_at || "";
    let domain = clean(co.domain || co.website || co.company_domain || "");
    if (!domain) { const m = String(co.url || link || "").match(/^https?:\/\/(?:www\.)?([^\/]+)/i); if (m) domain = m[1]; }
    domain = domain.replace(/^www\./, "");
    const num = co.employee_count || co.num_employees || co.headcount;
    const cobj = {
      domain,
      industry: clean(co.industry || co.industry_name || (Array.isArray(co.industries) ? co.industries[0] : "") || ""),
      size: clean(co.employee_count_range || co.company_size || co.num_employees_range || (num ? String(num) : "")),
      hq: tidy([co.hq_city || co.city, co.hq_country || co.country || co.country_code].filter(Boolean).join(", ")),
      founded: clean(co.founded_year || co.year_founded || co.founded || ""),
      revenue: clean(co.annual_revenue_usd || co.annual_revenue || co.revenue || ""),
    };
    const hasCo = Object.values(cobj).some(Boolean);
    return { company, title, location: loc, link, source: "Radar (TheirStack)", posted, co: hasCo ? cobj : undefined };
  }).filter((j) => j.title && j.company);

  const total = (data.metadata && (data.metadata.total_results || data.metadata.total_count)) || undefined;
  return { jobs, total, returned: rows.length, _debug: Object.keys(data || {}) };
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
      if (!titles.length && !countries.length) { res.status(200).json({ ok: true, v: 6, hint: "test with ?title=Head of Sales&country=ES&days=30&limit=5" }); return; }
      const out = await runSearch({ key, titles, countries, patterns, maxAge, limit });
      res.status(200).json({ v: 7, count: out.jobs.length, total: out.total, returned: out.returned, jobs: out.jobs, _debug: out._debug });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
      const titles = Array.isArray(body.titles) ? body.titles.filter(Boolean) : [];
      const countries = Array.isArray(body.countries) ? body.countries.filter(Boolean) : [];
      const patterns = Array.isArray(body.descriptionPatterns) ? body.descriptionPatterns.filter(Boolean) : [];
      const homeCountries = Array.isArray(body.homeCountries) ? body.homeCountries.filter(Boolean) : [];
      const broadRemote = !!body.broadRemote;
      const out = await runSearch({ key, titles, countries, homeCountries, broadRemote, patterns, maxAge: Number(body.maxAgeDays) || 30, limit: Number(body.limit) || 25 });
      res.status(200).json({ v: 7, count: out.jobs.length, total: out.total, returned: out.returned, jobs: out.jobs });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    res.status(e && e.status ? e.status : 500).json({ error: String((e && e.message) || e) });
  }
}
