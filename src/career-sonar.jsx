import React, { useState, useEffect } from "react";
import {
  Radar, Search, Building2, Mail, Linkedin, Copy, Check, Plus, X, Loader2, Target,
  ChevronRight, ChevronDown, Trash2, RefreshCw, User, AlertCircle, ExternalLink,
  Upload, FileText, Sparkles, SlidersHorizontal, Send, ClipboardList, Undo2, Clock, Settings as Cog,
  Lock, ArrowRight, Zap, Gauge, Users, LogOut
} from "lucide-react";
import mammoth from "mammoth";

/* ------------------------------------------------------------------ */
/*  CAREER SONAR — account-based job search (v4)                       */
/*  Profile · Criteria · Role Sonar(+history/score/filter) · Cockpit · Tracker · Settings */
/* ------------------------------------------------------------------ */

const C = {
  bg: "#F5F6FB", panel: "#FFFFFF", panel2: "#EEF0FB", line: "#E0E3F0",
  text: "#0E1020", dim: "#585E73", faint: "#9197AC",
  teal: "#6D4AFF", amber: "#F39A0E", violet: "#A03BF0", red: "#EF4444", green: "#10B981",
};
const GRAD = "linear-gradient(135deg, #6D4AFF 0%, #3B82F6 100%)";
const SERIF = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"; // display = bold sans (futuristic)
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = SANS; // labels render as clean letter-spaced sans

const PERSONA = {
  hiring_manager: { label: "Hiring Manager", sub: "economic buyer", color: C.amber },
  bridge:         { label: "Future Teammate", sub: "your bridge / champion", color: "#06B6D4" },
  recruiter:      { label: "Recruiter · TA", sub: "process / gatekeeper", color: C.violet },
};
const STAGES = ["Applied", "Screening", "Interviewing", "Final round", "Offer", "Rejected", "Withdrawn"];
const OPEN_STAGES = ["Applied", "Screening", "Interviewing", "Final round", "Offer"];
const STAGE_COLOR = { Applied: C.teal, Screening: C.violet, Interviewing: C.amber, "Final round": C.amber, Offer: C.green, Rejected: C.red, Withdrawn: C.faint };

/* ---------- Anthropic API (with retry/backoff on 429 / overload) ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HAIKU = "claude-haiku-4-5-20251001"; // cheap/fast model for high-frequency structured tasks (scoring, title expansion)
async function callClaude(content, useSearch, model, attempt = 0) {
  /* ------------------------------------------------------------------ *
   *  ⚠️  AI BACKEND PLACEHOLDER  —  see README.md                        *
   *                                                                     *
   *  In the Claude.ai artifact this function called the Anthropic API   *
   *  directly from the browser. A public web app must NEVER hold an API *
   *  key in browser code, so the AI features (Find Roles / Company      *
   *  research / Outreach drafts / Verify / Score) are wired to a small  *
   *  backend you add in the NEXT setup step. Until that backend exists, *
   *  these actions show the friendly message below.                     *
   *                                                                     *
   *  Everything that does NOT need AI works fully right now: Profile,   *
   *  Search Criteria, the Cockpit/Tracker lifecycle, all filters, and   *
   *  manually added roles.                                              *
   *                                                                     *
   *  TO CONNECT THE BACKEND LATER: replace the body below with a single *
   *  fetch to YOUR backend endpoint, e.g.                               *
   *                                                                     *
   *    const res = await fetch("/api/claude", {                         *
   *      method: "POST",                                                *
   *      headers: { "Content-Type": "application/json" },               *
   *      body: JSON.stringify({ content, useSearch }),                  *
   *    });                                                              *
   *    const data = await res.json();                                   *
   *    return data.text;                                                *
   *                                                                     *
   *  (The backend holds the key and talks to Anthropic safely.)         *
   * ------------------------------------------------------------------ */
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, useSearch, model }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if ((res.status === 429 || res.status === 529) && attempt < 4) {
      await sleep(1200 * Math.pow(2, attempt) + Math.random() * 400);
      return callClaude(content, useSearch, model, attempt + 1);
    }
    const em = data && data.error;
    let msg = typeof em === "string" ? em : (em && (em.message || (em.error && em.error.message))) || ("API error " + res.status);
    if (res.status === 429) msg = "Anthropic rate limit (429) — too many AI calls in a short time. Wait a minute and retry, or add credit to your Anthropic account to raise the limit.";
    throw new Error(msg);
  }
  return data.text || "";
}

/* ---------- robust JSON salvage ---------- */
function scanObjects(str) {
  const out = []; let depth = 0, inStr = false, esc = false, start = -1;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth === 0) start = i; depth++; }
    else if (ch === "}") { if (depth > 0 && --depth === 0 && start >= 0) { out.push(str.slice(start, i + 1)); start = -1; } }
  }
  return out;
}
function repairJSON(str) {
  let inStr = false, esc = false; const stack = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === "{") stack.push("}"); else if (ch === "[") stack.push("]"); else if (ch === "}" || ch === "]") stack.pop();
  }
  let s = str; if (inStr) s += '"'; s = s.replace(/,\s*$/, ""); while (stack.length) s += stack.pop(); return s;
}
function extractJSON(text) {
  if (!text) throw new Error("Empty response");
  const t = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const fb = t.indexOf("{"), fa = t.indexOf("[");
  if (fb < 0 && fa < 0) throw new Error("No JSON found");
  const isArray = fa >= 0 && (fb < 0 || fa < fb);
  const body = t.slice(isArray ? fa : fb);
  const lastClose = isArray ? body.lastIndexOf("]") : body.lastIndexOf("}");
  if (lastClose > 0) { try { return JSON.parse(body.slice(0, lastClose + 1)); } catch (_) {} }
  if (isArray) { const p = scanObjects(body).map((o) => { try { return JSON.parse(o); } catch (_) { return null; } }).filter(Boolean); if (p.length) return p; }
  else { const objs = scanObjects(body); if (objs.length) { try { return JSON.parse(objs[0]); } catch (_) {} } }
  try { return JSON.parse(repairJSON(body)); } catch (_) {}
  throw new Error("Could not parse model output");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(",")[1]); r.onerror = () => reject(new Error("Could not read file")); r.readAsDataURL(file); });
}
const toArr = (s) => Array.isArray(s) ? s : (typeof s === "string" ? s.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : []);

// Client-side "workable from your base" location filter, mirroring api/radar.js, used for ATS pulls.
const _N2C = { "united states": "US", "usa": "US", "u.s.": "US", "united kingdom": "GB", "u.k.": "GB", "uk": "GB", "england": "GB", "germany": "DE", "deutschland": "DE", "spain": "ES", "españa": "ES", "france": "FR", "netherlands": "NL", "ireland": "IE", "portugal": "PT", "italy": "IT", "sweden": "SE", "denmark": "DK", "norway": "NO", "finland": "FI", "poland": "PL", "switzerland": "CH", "austria": "AT", "belgium": "BE", "canada": "CA", "india": "IN", "australia": "AU", "singapore": "SG", "mexico": "MX", "brazil": "BR", "united arab emirates": "AE", "uae": "AE", "dubai": "AE", "saudi arabia": "SA", "qatar": "QA" };
const _C2C = { "madrid": "ES", "barcelona": "ES", "valencia": "ES", "sevilla": "ES", "malaga": "ES", "bilbao": "ES", "london": "GB", "manchester": "GB", "dublin": "IE", "paris": "FR", "lyon": "FR", "berlin": "DE", "munich": "DE", "münchen": "DE", "hamburg": "DE", "frankfurt": "DE", "cologne": "DE", "köln": "DE", "stuttgart": "DE", "amsterdam": "NL", "rotterdam": "NL", "vienna": "AT", "wien": "AT", "zurich": "CH", "zürich": "CH", "milan": "IT", "milano": "IT", "rome": "IT", "lisbon": "PT", "porto": "PT", "stockholm": "SE", "copenhagen": "DK", "oslo": "NO", "helsinki": "FI", "brussels": "BE", "warsaw": "PL", "abu dhabi": "AE", "new york": "US", "san francisco": "US", "austin": "US", "boston": "US", "chicago": "US", "seattle": "US", "los angeles": "US", "mexico city": "MX", "toronto": "CA", "bangalore": "IN", "mumbai": "IN" };
function _jobCodes(loc) { const s = new Set(); const t = String(loc || "").toLowerCase(); for (const n in _N2C) if (t.indexOf(n) !== -1) s.add(_N2C[n]); for (const c in _C2C) if (t.indexOf(c) !== -1) s.add(_C2C[c]); return s; }
function _isBroad(t) { return /\b(emea|europe|european|eea|pan[- ]?europe|global|worldwide|anywhere|international|remote first|remote-first)\b/i.test(String(t || "")); }
function inRadius(loc, homeCountries, broadRemote) {
  const home = new Set((homeCountries || []).map((c) => String(c).toUpperCase()));
  if (!home.size && !broadRemote) return true;
  const codes = _jobCodes(loc);
  if (!codes.size) return true;
  for (const c of codes) if (home.has(c)) return true;
  if (broadRemote && (_isBroad(loc) || codes.size >= 2)) return true;
  return false;
}
// Strict version for unfiltered global ATS feeds: must POSITIVELY match the radius.
function inRadiusStrict(loc, homeCountries, broadRemote) {
  const home = new Set((homeCountries || []).map((c) => String(c).toUpperCase()));
  const codes = _jobCodes(loc);
  for (const c of codes) if (home.has(c)) return true;          // in a home country (e.g. Spain)
  if (broadRemote && _isBroad(loc)) return true;                // EMEA/Europe/global remote
  return false;                                                 // drop ambiguous / unrecognized / foreign
}
// Keep only roles whose title matches the search intent (the AI-expanded titles, else a leadership-sales fallback).
function titleRelevant(title, useTitles) {
  const t = String(title || "").toLowerCase();
  for (const ut of (useTitles || [])) { const u = String(ut).toLowerCase().trim(); if (u && t.indexOf(u) !== -1) return true; }
  const fn = /(sales|revenue|gtm|go.?to.?market|commercial|business development|partnership|account management)/;
  const sr = /(head of|director|\bvp\b|vice president|chief|\bcro\b|\bcso\b|country manager|general manager|\bgm\b|managing director|sales lead|regional lead)/;
  return fn.test(t) && sr.test(t);
}
// Map ISO codes -> display country names, and derive the country/countries of a role's location.
const CODE2NAME = { ES: "Spain", GB: "UK", IE: "Ireland", DE: "Germany", FR: "France", NL: "Netherlands", PT: "Portugal", IT: "Italy", SE: "Sweden", DK: "Denmark", NO: "Norway", FI: "Finland", PL: "Poland", CH: "Switzerland", AT: "Austria", BE: "Belgium", US: "United States", CA: "Canada", IN: "India", AU: "Australia", SG: "Singapore", MX: "Mexico", BR: "Brazil", AE: "UAE", SA: "Saudi Arabia", QA: "Qatar" };
const REMOTE_BUCKET = "Remote / multi-region";
function roleCountries(loc) { const out = []; for (const c of _jobCodes(loc)) out.push(CODE2NAME[c] || c); return Array.from(new Set(out)); }
function stageColor(t) { const s = String(t || "").toLowerCase(); if (s.includes("startup")) return C.amber; if (s.includes("scale")) return C.green; if (s.includes("growth")) return C.teal; if (s.includes("public") || s.includes("enterprise")) return C.violet; return C.dim; }
function Logo({ domain, name, size = 40 }) {
  const d = String(domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim();
  const srcs = d ? [`https://logo.clearbit.com/${d}`, `https://www.google.com/s2/favicons?domain=${d}&sz=128`] : [];
  const [i, setI] = useState(0);
  const initial = ((String(name || "?").trim()[0]) || "?").toUpperCase();
  if (!srcs.length || i >= srcs.length) return <div style={{ width: size, height: size, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: GRAD, color: "#fff", fontFamily: SERIF, fontWeight: 800, fontSize: Math.round(size * 0.42) }}>{initial}</div>;
  return <div style={{ width: size, height: size, borderRadius: 9, flexShrink: 0, overflow: "hidden", background: "#fff", border: `1px solid ${C.line}`, display: "grid", placeItems: "center" }}><img src={srcs[i]} alt={name} onError={() => setI(i + 1)} style={{ width: "100%", height: "100%", objectFit: "contain" }} /></div>;
}
const daysOpen = (ts) => ts ? Math.max(0, Math.floor((Date.now() - ts) / 86400000)) : 0;
const agoLabel = (ts) => { const d = daysOpen(ts); return d === 0 ? "today" : d + "d ago"; };
const fmtDate = (ts) => ts ? new Date(ts).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "";
const fmtWhen = (ts) => ts ? new Date(ts).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "never";

async function loadKey(key, fallback) { try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : fallback; } catch { return fallback; } }
async function saveKey(key, value) { try { await window.storage.set(key, JSON.stringify(value)); } catch {} }

/* ---------- prompts ---------- */
const buildRolesPrompt = (profile, criteria, breadth, exclude) => `You are Role Sonar, a job-opening scout. Using web search, find CURRENT open roles that fit this person.

SEARCH CRITERIA (what they want):
- Target titles: ${criteria.titles}
- Role characteristics wanted: ${toArr(criteria.roleCharacteristics).join(", ") || "n/a"}
- Seniority: ${criteria.seniority}
- Candidate base & acceptable locations: ${criteria.locations || "n/a"}
- Work mode (HARD constraint — see rules): ${criteria.workMode || "Remote only"}
- Industries: ${criteria.industries}
- Must-haves: ${criteria.mustHaves}
- Comp: ${criteria.comp}
- Extra bias: ${criteria.bias || "none"}
- Reference companies (capture the desired industry / product / size / stage — find roles at companies that FEEL similar; do NOT restrict results to these): ${toArr(criteria.exampleCompanies).join(", ") || "n/a"}

CANDIDATE PROFILE (for relevance + scoring):
- Key skills: ${toArr(profile.skills).join(", ") || "n/a"}
- Positioning: ${profile.positioning}
- Evidence: ${profile.evidence}
${exclude.length ? `\nALREADY FOUND — find DIFFERENT companies, do not repeat: ${exclude.join(", ")}` : ""}

Find up to ${breadth} positions that are ACTUALLY LIVE right now, prioritising the wanted role characteristics.
CRITICAL accuracy rules — precision matters far more than quantity:
- Only include a role if you can locate its CURRENT live posting and give the DIRECT application URL on the company's own careers page or a major ATS (Greenhouse, Lever, Ashby, Workday, SmartRecruiters) or LinkedIn Jobs.
- WORK LOCATION IS A HARD FILTER. Judge each role by where the person must physically BE, not by the role's sales territory. A role titled "…EMEA" but based in a specific city with on-site/hybrid presence does NOT match a remote candidate just because its territory is EMEA. Apply the work mode strictly:
  · "Remote only" → ONLY fully-remote roles whose remote scope covers the candidate's country/region; EXCLUDE every hybrid or on-site role regardless of territory (e.g. "London (Hybrid)" is excluded for a Madrid-based remote candidate).
  · "Hybrid in my city OK" → remote roles, plus hybrid/on-site roles located in the candidate's own city/metro only.
  · "Open to relocation" → any location.
  · "In office" → on-site or hybrid roles located in the candidate's own city/metro; exclude fully-remote roles and roles in other cities.
  · "Open to any setup" → the candidate accepts any arrangement; do NOT exclude or down-rank any role based on work location or remote/hybrid/on-site status.
- Do NOT infer, guess, or pad. Never include a role just because the company "probably" hires for it. No fabricated, homepage-only, or aggregator links.
- Returning fewer real, verifiable roles (even 1-2) is far better than more uncertain ones. If you can confirm none, return [].
- "link" must be the exact posting URL; "source" = where you found it (e.g. "Greenhouse", "LinkedIn Jobs", "company careers").
For each role add "score": integer 0-100 for fit to THIS candidate (skills, seniority, industry, WORK-LOCATION compatibility, role characteristics, evidence, and how closely the company resembles the reference companies). Calibrate honestly: 85-100 excellent all-round match; 65-84 good; 40-64 partial; below 40 weak. Do not inflate.
Add "posted": short freshness note if known (e.g. "2d","this week"), else "". Keep "fit" under 10 words, "signal" under 6 words.

Respond with ONLY a compact minified JSON array — no markdown, no prose, no notes:
[{"company":"","title":"","location":"","link":"","source":"","score":0,"posted":"","fit":"","signal":""}]`;

const buildCompanyNormalizePrompt = (names) => `You clean up company names a user typed. Fix spelling and capitalization to the official company name and provide the company's primary website domain. Return ONLY a compact minified JSON array.

Raw input (one company per item): ${names}

For each input return {"input","name","domain"}: input = the original text, name = the corrected official company name, domain = primary website domain (e.g. "paloaltonetworks.com"). If unsure a company exists, keep your best-guess name and set domain to "". Keep the same order; one object per input; do not merge or drop items.

Respond with ONLY: [{"input":"Crowdstrike","name":"CrowdStrike","domain":"crowdstrike.com"},{"input":"Parlo Alto Network","name":"Palo Alto Networks","domain":"paloaltonetworks.com"}]`;

const buildCompanySuggestPrompt = (seeds, criteria) => `You suggest companies similar to a set of seed companies, to help a job seeker target the right employers. Return ONLY a compact minified JSON array, no prose.

Seed companies: ${seeds || "n/a"}
Target industries / company type: ${criteria.industries || "n/a"}
Role focus: ${criteria.titles || "n/a"} (${criteria.roleType || "any"})
Preferences / bias: ${criteria.bias || "n/a"}
Target markets: ${(criteria.targetMarkets || []).join(", ") || "n/a"}

Return 30-40 REAL companies similar to the seeds (same kind of product, business model and stage) that plausibly hire for the role focus. Prefer companies that operate or hire in the target markets. Do NOT repeat the seed companies. Only include companies you are confident actually exist.
For each company: {"name","domain","why","category"} — domain is the primary website domain (e.g. "personio.com"), why is a plain-language description of WHAT THE COMPANY DOES and who for (10-16 words, so the user instantly recognizes unfamiliar names), category is a 1-3 word type tag.

Respond with ONLY: [{"name":"Celonis","domain":"celonis.com","why":"Process-mining platform that helps large enterprises find and fix inefficiencies in their operations","category":"Process Intelligence"}]`;

const buildRadarQueryPrompt = (criteria) => `You build search parameters to find relevant LIVE job postings for a job seeker. Return ONLY a compact minified JSON object, no prose.

Target titles: ${criteria.titles || "n/a"}
Seniority levels wanted: ${(criteria.seniorityLevels || []).join(", ") || criteria.seniority || "any"}
Role type: ${criteria.roleType || "any"}
Target industries / company types: ${criteria.industries || "n/a"}
Reference companies (the kind of employer that fits): ${toArr(criteria.exampleCompanies).join(", ") || "n/a"}
Preferences / bias: ${criteria.bias || "n/a"}

Return a JSON object with two arrays:
1. "titles": 8-14 short job-title search patterns (the given titles + close synonyms/variants at the wanted seniority; respect role type — no individual-contributor titles for leadership, and vice versa).
2. "companyPatterns": 6-10 case-insensitive regex patterns matching the DESCRIPTION of a relevant employer, so only the right kind of company surfaces. Base them on the target industries, reference companies and preferences. Use the form "(?i)\\bKEYWORD\\b" or "(?i)some phrase". Favor distinguishing terms for the target company type (e.g. SaaS, B2B software, artificial intelligence, machine learning, cloud platform, developer tools, API, data platform). These are inclusive OR-matches, so pick terms that real target companies put in their description.

Respond with ONLY: {"titles":["VP Sales","Head of Sales"],"companyPatterns":["(?i)\\bSaaS\\b","(?i)artificial intelligence","(?i)\\bB2B\\b software"]}`;

const buildTitleExpansionPrompt = (criteria) => `You expand a job seeker's target titles into a focused set of search patterns for matching live job postings. Return ONLY a compact minified JSON array of strings.
Target titles: ${criteria.titles || "n/a"}
Seniority levels wanted: ${(criteria.seniorityLevels || []).join(", ") || criteria.seniority || "any"}
Role type: ${criteria.roleType || "any"}

Return 8-14 short job-title search patterns (2-4 words each): the given titles plus common synonyms and close variants at the wanted seniority. No duplicates. If role type is "Leadership / Manager" do NOT include junior or individual-contributor titles; if "Individual contributor" do NOT include manager/head/VP/C-level titles.

Respond with ONLY a JSON array, e.g.: ["VP Sales","Vice President of Sales","Chief Revenue Officer","Head of Sales"]`;

const buildEnrichPrompt = (items) => `For each company below, give a COMPACT factual snapshot from your OWN knowledge to help a candidate quickly evaluate it. Do NOT search. Use only what you reasonably know; if unsure about a field, return "" (empty) — never guess revenue or fabricate numbers.
Fields per company: "type" (exactly one of: Startup, Scale-up, Growth, Enterprise, Public), "industry" (1-3 words, e.g. "Cybersecurity", "Dev tools", "Fintech"), "hq" ("City, Country"), "size" (employee band: "11-50","50-200","200-500","500-1k","1k-5k","5k-10k","10k+"), "founded" (year), "funding" (very short ownership note: "Series C", "Public NASDAQ:DDOG", "PE-owned", "Bootstrapped"), "domain" (primary website, e.g. "datadog.com").
COMPANIES:
${items.map((c) => `${c.n}. ${c.company}${c.hint ? ` — ${c.hint}` : ""}`).join("\n")}
Respond with ONLY a compact minified JSON array, one object per company, echoing its "n":
[{"n":1,"type":"","industry":"","hq":"","size":"","founded":"","funding":"","domain":""}]`;

const buildScorePrompt = (profile, criteria, roles) => `You are scoring how well each job fits THIS candidate. Use only the information given; do NOT search. Return ONLY compact minified JSON.

CANDIDATE
- Headline: ${profile.headline || "n/a"}
- Key skills: ${toArr(profile.skills).join(", ") || "n/a"}
- Evidence: ${profile.evidence || "n/a"}
- Positioning: ${profile.positioning || "n/a"}

CRITERIA
- Target titles: ${criteria.titles || "n/a"}
- Seniority levels wanted: ${(criteria.seniorityLevels || []).join(", ") || criteria.seniority || "n/a"}
- Role type wanted: ${criteria.roleType || "n/a"}
- Target markets: ${(criteria.targetMarkets || []).join(", ") || "n/a"}
- Base & acceptable locations: ${criteria.locations || "n/a"}
- Work mode: ${criteria.workMode || "Remote only"}
- Industries: ${criteria.industries || "n/a"}
- Must-haves: ${criteria.mustHaves || "n/a"}
- Role characteristics wanted: ${toArr(criteria.roleCharacteristics).join(", ") || "n/a"}
- Focus companies (OPTIONAL bonus list — a role at one of these, or a very similar company, gets a moderate boost; but NOT being on this list is NOT a penalty, since a key purpose is to surface great roles at companies the candidate doesn't yet know): ${toArr(criteria.exampleCompanies).join(", ") || "n/a"}
- Extra: ${criteria.bias || "n/a"}

ROLES TO SCORE:
${roles.map((r) => `${r.n}. ${r.title} — ${r.company} (${r.location || "location n/a"})`).join("\n")}

For each role return "n" (its number), "score" (integer 0-100 fit). Judge fit PRIMARILY on: title & seniority match, role type (leadership vs IC), target-market/work-location compatibility, industry/company-type fit, and the wanted role characteristics. A role at a company in the right industry should score on its own merits even if the company is unknown to the candidate — finding strong roles at new companies is a core goal. Being on the focus-companies list is only a moderate bonus on top; being absent from it is NOT a penalty. Calibrate honestly: 85-100 excellent, 65-84 good, 40-64 partial, below 40 weak; do not inflate. Also return "fit" (under 10 words on why), "signal" (under 6 words).
Also return "co" — a compact company snapshot from your own knowledge to help fast evaluation. Fields: "type" (one of: Startup, Scale-up, Growth, Enterprise, Public), "industry" (1-3 words), "hq" ("City, Country"), "size" (employee band, e.g. "50-200", "1k-5k", "10k+"), "founded" (year), "funding" (very short ownership/funding note, e.g. "Series C", "Public NASDAQ:DDOG", "Bootstrapped"), "domain" (primary website domain like "datadog.com"). CRITICAL: only fill a field if you are reasonably confident; if unsure leave it as "" (empty). Do NOT guess revenue or fabricate numbers.
Score ONLY the roles listed; never invent roles.

Respond with ONLY a compact minified JSON array: [{"n":1,"score":0,"fit":"","signal":"","co":{"type":"","industry":"","hq":"","size":"","founded":"","funding":"","domain":""}}]`;

const buildResearchPrompt = (profile, company, title, location) => `You are Company Sonar. Research this company and map the candidate's three-persona ICP for one role.

COMPANY: ${company}
ROLE: ${title} (${location})
CANDIDATE SKILLS: ${toArr(profile.skills).join(", ")}
CANDIDATE STRENGTHS: ${profile.evidence}
POSITIONING: ${profile.positioning}

Use web search. Identify (a) one line on what the company does, (b) the most relevant recent signal/news, (c) why this role likely exists (the underlying pain), and (d) three target people:
- hiring_manager (leader the role reports to — economic buyer)
- bridge (likely peer / future teammate for a warm path)
- recruiter (TA / HR owning the process)
For each: best-guess title, a real public name if findable (else ""), a sharp personalization hook, LinkedIn people-search keywords.

Respond with ONLY this JSON, no prose:
{"snapshot":"","signal":"","why_open":"","personas":[{"type":"hiring_manager","title":"","name":"","hook":"","linkedin_query":""},{"type":"bridge","title":"","name":"","hook":"","linkedin_query":""},{"type":"recruiter","title":"","name":"","hook":"","linkedin_query":""}]}`;

const buildDraftPrompt = (profile, t, s = {}) => {
  const r = t.research || {};
  const lenMap = { Concise: "70-95 words", Standard: "90-130 words", Detailed: "130-175 words" };
  const emailLen = lenMap[s.msgLength] || lenMap.Standard;
  const metrics = s.msgMetrics
    ? "You MAY cite one concrete metric where it strengthens the case."
    : "In these first-touch messages do NOT lead with hard KPIs/numbers — keep it human and narrative; convey impact qualitatively, not as figures.";
  const lang = s.msgLang === "English" ? "Write in English."
    : s.msgLang === "German" ? "Write in German."
    : "Write in the language of the role/company (German for DACH-based roles, otherwise English).";
  return `You are Role-ICP Outreach. Write multi-threaded outreach for a candidate pursuing a role. Lead with the COMPANY's problem and the candidate as the solution (a mini business case) — never "please consider my application".

ROLE: ${t.title} at ${t.company}
COMPANY CONTEXT: ${r.snapshot || ""} | signal: ${r.signal || ""} | why role open: ${r.why_open || ""}
CANDIDATE SKILLS: ${toArr(profile.skills).join(", ")}
CANDIDATE EVIDENCE: ${profile.evidence}
POSITIONING: ${profile.positioning}
PERSONAS: ${JSON.stringify((r.personas || []).map((p) => ({ type: p.type, title: p.title, name: p.name, hook: p.hook })))}

STYLE:
- Tone: ${s.msgTone || "Warm & direct"}. Human, specific, no buzzwords, no padding, no emojis.
- ${metrics}
- ${lang}
${s.msgSign ? `- Sign off as: ${s.msgSign}.` : ""}
${s.msgGuidance ? `- Extra guidance: ${s.msgGuidance}` : ""}
${s.msgExample ? `\nSTYLE REFERENCE — the candidate wrote the message below. Mirror its VOICE: sentence length and rhythm, level of formality, greeting and sign-off habits, and any personal phrasing or quirks. Match HOW they write, not WHAT they wrote — never reuse its specific facts, names or content:\n"""\n${s.msgExample}\n"""` : ""}

Distinct messages per stakeholder:
- hiring_manager: a LinkedIn note only (MAX 280 chars), business-case framing — no email.
- bridge: LinkedIn note (MAX 280 chars) asking for a brief insider perspective.
- recruiter: LinkedIn note (MAX 280 chars) expressing fit + interest.

Respond with ONLY this JSON, no prose:
{"hiring_manager":{"linkedin":""},"bridge":{"linkedin":""},"recruiter":{"linkedin":""}}`;
};

const buildVerifyPrompt = (company, title, location) => `You are checking whether a specific job posting is still LIVE right now. Use web search.

ROLE: ${title}
COMPANY: ${company}
LOCATION: ${location}

Search the company's careers page / ATS (Greenhouse, Lever, Ashby) and LinkedIn Jobs for this exact or near-exact role. Decide:
- "open": ONLY if you actually find the live posting now and it is accepting applications. Be strict.
- "closed": clear evidence it is filled/removed/expired, OR it is plainly absent from the company's own careers page / ATS. If you simply cannot determine either way, use "uncertain" — do NOT guess "closed".
- "uncertain": you genuinely cannot tell.
Give the best CURRENT application URL if one exists.

Respond with ONLY this JSON, no prose:
{"status":"open","confidence":"high|medium|low","note":"one short sentence","url":"best current url or empty"}`;

const EMPTY_PROFILE = { headline: "", skills: [], evidence: "", positioning: "" };
const EMPTY_CRITERIA = { titles: "", roleCharacteristics: [], exampleCompanies: [], workMode: "Remote only", seniority: "", seniorityLevels: [], roleType: "", targetMarkets: ["Spain", "Remote EMEA"], locations: "", industries: "", mustHaves: "", comp: "", bias: "" };
const WORKMODES = ["Remote only", "Hybrid in my city OK", "In office", "Open to relocation", "Open to any setup"];
const SENIORITY = ["C-Level", "VP", "Director", "Head of", "Senior Manager", "Manager", "Senior IC", "IC"];
const ROLETYPES = ["Leadership / Manager", "Individual contributor", "Either"];
// market label -> ISO country codes the radar searches
const MARKETS = {
  "Spain": ["ES"],
  "Remote EMEA": ["GB", "IE", "DE", "NL", "FR", "ES", "PT", "IT", "SE", "DK", "PL", "CH", "AT", "BE", "FI", "NO"],
  "Germany / DACH": ["DE", "AT", "CH"],
  "UK & Ireland": ["GB", "IE"],
  "Benelux": ["NL", "BE", "LU"],
  "France": ["FR"],
  "Nordics": ["SE", "DK", "NO", "FI"],
  "Italy": ["IT"],
  "Portugal": ["PT"],
  "UAE / Dubai": ["AE"],
  "Saudi / Gulf": ["SA", "QA", "KW", "BH", "OM"],
  "Mexico": ["MX"],
  "Remote LATAM": ["MX", "BR", "AR", "CO", "CL"],
  "US Remote": ["US"],
};
const EMPTY_SETTINGS = { breadth: 8, radarLimit: 50, radarDays: 45, autoScan: false, verifyOnScan: true, lastScan: 0, msgTone: "Warm & direct", msgLength: "Standard", msgMetrics: false, msgLang: "Auto", msgSign: "", msgGuidance: "", msgExample: "" };
const TONES = ["Warm & direct", "Formal & precise", "Casual & punchy", "Consultative"];
const LENGTHS = ["Concise", "Standard", "Detailed"];
const LANGS = ["Auto", "English", "German"];

/* ================================================================== */
function Tool({ signedInEmail, onSignOut }) {
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [criteria, setCriteria] = useState(EMPTY_CRITERIA);
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [watchlist, setWatchlist] = useState([]);
  const [library, setLibrary] = useState([]);
  const [pulling, setPulling] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [radaring, setRadaring] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [criteriaSaved, setCriteriaSaved] = useState(false);

  const [found, setFound] = useState([]);
  const [loadingRoles, setLoadingRoles] = useState(false);
  const [roleBusy, setRoleBusy] = useState({});
  const [lastFresh, setLastFresh] = useState(null);
  const [scanStatus, setScanStatus] = useState("");

  const [pipeline, setPipeline] = useState([]);
  const [selId, setSelId] = useState(null);
  const [busy, setBusy] = useState({});
  const [verifyBusy, setVerifyBusy] = useState({});
  const [err, setErr] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      setProfile({ ...EMPTY_PROFILE, ...(await loadKey("cs_profile", {})) });
      setCriteria({ ...EMPTY_CRITERIA, ...(await loadKey("cs_criteria", {})) });
      setSettings({ ...EMPTY_SETTINGS, ...(await loadKey("cs_settings", {})) });
      setFound(await loadKey("cs_found", []));
      setWatchlist(await loadKey("cs_watchlist", []));
      setLibrary(await loadKey("cs_library", []));
      const pipe = await loadKey("cs_pipeline", []);
      setPipeline(pipe);
      const firstOpen = pipe.find((t) => !t.applied); if (firstOpen) setSelId(firstOpen.id);
      setHydrated(true);
    })();
  }, []);

  // auto-scan on open (best-effort daily): runs once after hydrate if stale
  useEffect(() => {
    if (!hydrated) return;
    if (settings.autoScan && criteria.titles && Date.now() - (settings.lastScan || 0) > 86400000) { findRoles(); }
  }, [hydrated]); // eslint-disable-line

  const persistPipeline = (next) => { setPipeline(next); saveKey("cs_pipeline", next); };
  const updateSettings = (patch) => { const ns = { ...settings, ...patch }; setSettings(ns); saveKey("cs_settings", ns); };
  const criteriaReady = criteria.titles.trim();
  const openTargets = pipeline.filter((t) => !t.applied);
  const appliedTargets = pipeline.filter((t) => t.applied);

  function saveProfile() { saveKey("cs_profile", profile); setProfileSaved(true); setTimeout(() => setProfileSaved(false), 1600); }
  function saveCriteria() { saveKey("cs_criteria", criteria); setCriteriaSaved(true); setTimeout(() => setCriteriaSaved(false), 1600); }

  async function applyExtract(content) {
    const ex = extractJSON(await callClaude(content, false));
    const np = { ...profile, evidence: ex.evidence || profile.evidence, positioning: ex.positioning || profile.positioning, skills: ex.skills ? toArr(ex.skills).slice(0, 5) : profile.skills };
    const nc = { ...criteria, titles: ex.titles || criteria.titles, seniority: ex.seniority || criteria.seniority, locations: ex.locations || criteria.locations, industries: ex.industries || criteria.industries, roleCharacteristics: ex.roleCharacteristics ? toArr(ex.roleCharacteristics) : criteria.roleCharacteristics };
    setProfile(np); setCriteria(nc); saveKey("cs_profile", np); saveKey("cs_criteria", nc);
  }

  const roleKey = (r) => (String(r.company) + "|" + String(r.title)).toLowerCase().trim();

  async function findRoles() {
    if (!criteria.titles) return;
    setErr(""); setLoadingRoles(true); setLastFresh(null); setScanStatus("scanning the market…");
    try {
      const exclude = Array.from(new Set(found.map((f) => f.company).filter(Boolean))).slice(0, 20);
      const breadth = Math.max(3, Math.min(10, settings.breadth || 8));
      const arr = extractJSON(await callClaude(buildRolesPrompt(profile, criteria, breadth, exclude), true));
      const list = Array.isArray(arr) ? arr : [];
      const seen = new Set(found.map(roleKey));
      const fresh = [];
      for (const r of list) {
        if (!r.company || !r.title) continue;
        const k = roleKey(r); if (seen.has(k)) continue; seen.add(k);
        const sc = Number.isFinite(+r.score) ? Math.max(0, Math.min(100, Math.round(+r.score))) : null;
        fresh.push({ id: Date.now() + "" + Math.random().toString(36).slice(2, 6), company: r.company, title: r.title, location: r.location || "", link: r.link || "", source: r.source || "", fit: r.fit || "", signal: r.signal || "", posted: r.posted || "", score: sc, foundAt: Date.now() });
      }
      let merged = [...fresh, ...found];
      setFound(merged); saveKey("cs_found", merged);
      updateSettings({ lastScan: Date.now() });
      setLastFresh(fresh.length);
      // cross-check each fresh role is actually live (sequential, respects rate-limit backoff)
      if (settings.verifyOnScan && fresh.length) {
        for (let i = 0; i < fresh.length; i++) {
          setScanStatus(`verifying ${i + 1}/${fresh.length} live…`);
          try {
            const v = await runVerify(fresh[i].company, fresh[i].title, fresh[i].location);
            merged = merged.map((x) => x.id === fresh[i].id ? { ...x, verify: v, outdated: v.status === "closed" ? true : x.outdated } : x);
            setFound(merged); saveKey("cs_found", merged);
          } catch (_) { /* leave unverified if a check fails */ }
        }
      }
    } catch (e) { setErr("Role Sonar failed: " + e.message); }
    setScanStatus(""); setLoadingRoles(false);
  }

  function saveWatchlist(next) { setWatchlist(next); saveKey("cs_watchlist", next); }

  // ---- Company library (verified ATS companies; feeds the watchlist for free pulls) ----
  const libKey = (c) => (c.name || c.company || "").toLowerCase().trim() + "|" + (c.domain || "").toLowerCase().trim();
  function saveLibrary(next) { setLibrary(next); saveKey("cs_library", next); }
  function syncWatchlistFromLibrary(lib) {
    const wl = lib.filter((c) => c.screenable && c.ats && c.token).map((c) => ({ source: c.ats, token: c.token, name: c.company }));
    saveWatchlist(wl);
  }
  function addToLibrary(items) {
    const map = new Map(library.map((c) => [libKey(c), c]));
    for (const it of items) {
      map.set(libKey(it), { id: libKey(it), company: it.name || it.company, domain: it.domain || "", ats: it.ats || null, token: it.token || null, screenable: !!it.screenable, jobCount: it.jobCount || 0, addedAt: Date.now() });
    }
    const next = [...map.values()];
    saveLibrary(next); syncWatchlistFromLibrary(next);
  }
  function removeFromLibrary(id) { const next = library.filter((c) => c.id !== id); saveLibrary(next); syncWatchlistFromLibrary(next); }
  async function suggestCompanies(seeds) {
    const arr = extractJSON(await callClaude(buildCompanySuggestPrompt(seeds, criteria), false));
    return Array.isArray(arr) ? arr.filter((c) => c && c.name) : [];
  }
  async function normalizeCompanies(names) {
    const arr = extractJSON(await callClaude(buildCompanyNormalizePrompt(names), false));
    return Array.isArray(arr) ? arr.filter((o) => o && (o.name || o.input)) : [];
  }
  async function resolveCompanies(list, onProgress) {
    const out = [];
    for (let i = 0; i < list.length; i += 10) {
      const chunk = list.slice(i, i + 10);
      if (onProgress) onProgress(Math.min(i + chunk.length, list.length), list.length);
      try {
        const res = await fetch("/api/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companies: chunk.map((c) => ({ name: c.name, domain: c.domain })) }) });
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data.results)) out.push(...data.results);
      } catch (_) { /* keep going */ }
    }
    return out;
  }

  function clearFound() {
    if (typeof window !== "undefined" && !window.confirm("Clear all found roles? This empties the list so you can re-run cleanly. This cannot be undone.")) return;
    setFound([]); saveKey("cs_found", []); setLastFresh(null);
  }

  async function pullWatchlistJobs() {
    if (!watchlist.length) return [];
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companies: watchlist.map((c) => ({ source: c.source, id: c.token, name: c.name || c.token })) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ("Jobs API error " + res.status));
    return Array.isArray(data.jobs) ? data.jobs : [];
  }

  async function scoreWorking(startWorking) {
    let working = startWorking;
    const targets = working.filter((r) => !r.outdated && !r.dismissed && r.score == null);
    if (!targets.length) return working;
    const size = 12;
    const scoreCriteria = { ...criteria, exampleCompanies: library.length ? library.map((c) => c.company) : criteria.exampleCompanies };
    for (let i = 0; i < targets.length; i += size) {
      const chunk = targets.slice(i, i + size).map((r, idx) => ({ n: idx + 1, _id: r.id, company: r.company, title: r.title, location: r.location }));
      setScanStatus(`scoring matches ${Math.min(i + size, targets.length)}/${targets.length}…`);
      const arr = extractJSON(await callClaude(buildScorePrompt(profile, scoreCriteria, chunk), false, HAIKU));
      const byN = {};
      (Array.isArray(arr) ? arr : []).forEach((o) => { if (o && o.n != null) byN[o.n] = o; });
      working = working.map((r) => {
        const c = chunk.find((x) => x._id === r.id);
        if (!c) return r;
        const o = byN[c.n];
        if (!o) return r;
        const sc = Number.isFinite(+o.score) ? Math.max(0, Math.min(100, Math.round(+o.score))) : r.score;
        const aiCo = (o.co && typeof o.co === "object") ? o.co : {};
        const realCo = r.co || {};
        const mergedCo = { ...aiCo };
        Object.keys(realCo).forEach((k) => { if (realCo[k]) mergedCo[k] = realCo[k]; }); // real (TheirStack) wins
        const co = Object.values(mergedCo).some(Boolean) ? mergedCo : r.co;
        return { ...r, score: sc, fit: o.fit || r.fit, signal: o.signal || r.signal, co };
      });
      setFound(working); saveKey("cs_found", working);
    }
    return working;
  }

  async function enrichWorking(startWorking) {
    let working = startWorking;
    const lacks = (r) => !r.outdated && !r.dismissed && (!r.co || !(r.co.type || r.co.industry || r.co.hq || r.co.size));
    const companies = []; const seenC = new Set();
    working.forEach((r) => { const key = String(r.company || "").toLowerCase(); if (lacks(r) && key && !seenC.has(key)) { seenC.add(key); companies.push({ company: r.company, hint: (r.co && r.co.industry) || "" }); } });
    if (!companies.length) return working;
    const size = 14;
    for (let i = 0; i < companies.length; i += size) {
      const chunk = companies.slice(i, i + size).map((c, idx) => ({ n: idx + 1, company: c.company, hint: c.hint }));
      setScanStatus(`enriching companies ${Math.min(i + size, companies.length)}/${companies.length}…`);
      let arr = [];
      try { arr = extractJSON(await callClaude(buildEnrichPrompt(chunk), false, HAIKU)); } catch (e) { arr = []; }
      const byName = {};
      (Array.isArray(arr) ? arr : []).forEach((o) => { const c = chunk.find((x) => x.n === o.n); if (c) byName[c.company.toLowerCase()] = o; });
      working = working.map((r) => {
        const o = byName[String(r.company || "").toLowerCase()];
        if (!o) return r;
        const aiCo = { type: o.type || "", industry: o.industry || "", hq: o.hq || "", size: o.size || "", founded: o.founded || "", funding: o.funding || "", domain: o.domain || "" };
        const realCo = r.co || {};
        const merged = { ...aiCo };
        Object.keys(realCo).forEach((k) => { if (realCo[k]) merged[k] = realCo[k]; }); // real (TheirStack) data wins
        return Object.values(merged).some(Boolean) ? { ...r, co: merged } : r;
      });
      setFound(working); saveKey("cs_found", working);
    }
    return working;
  }

  async function runRadar() {
    setErr(""); setRadaring(true); setScanStatus("building your query…");
    try {
      const rawTitles = (criteria.titles || "").split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
      let useTitles = rawTitles.length ? rawTitles : ["VP Sales", "Head of Sales", "Chief Revenue Officer", "Sales Director", "Country Manager"];
      let patterns = [];
      try {
        const focusCriteria = { ...criteria, exampleCompanies: library.length ? library.map((c) => c.company) : criteria.exampleCompanies };
        const obj = extractJSON(await callClaude(buildRadarQueryPrompt(focusCriteria), false, HAIKU));
        if (obj && Array.isArray(obj.titles) && obj.titles.length) useTitles = Array.from(new Set(obj.titles.map((s) => String(s).trim()).filter(Boolean))).slice(0, 14);
        if (obj && Array.isArray(obj.companyPatterns)) patterns = obj.companyPatterns.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
      } catch (e) { /* keep raw titles */ }

      const REMOTE_MARKETS = new Set(["Remote EMEA", "Remote LATAM", "US Remote"]);
      const markets = (criteria.targetMarkets && criteria.targetMarkets.length) ? criteria.targetMarkets : ["Spain", "Remote EMEA"];
      const codes = Array.from(new Set(markets.flatMap((m) => MARKETS[m] || [])));
      const countries = codes.length ? codes : ["ES", "AE", "GB", "DE", "NL", "IE", "FR", "PT"];
      const homeCountries = Array.from(new Set(markets.filter((m) => !REMOTE_MARKETS.has(m)).flatMap((m) => MARKETS[m] || [])));
      const broadRemote = markets.some((m) => REMOTE_MARKETS.has(m));

      const seen = new Set(found.map(roleKey));
      const fresh = [];

      // 1) market radar (already radius-filtered server-side)
      setScanStatus("scanning the market…");
      const res = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titles: useTitles, countries, homeCountries, broadRemote, descriptionPatterns: patterns, maxAgeDays: Math.max(7, Math.min(120, settings.radarDays || 45)), limit: Math.max(10, Math.min(50, settings.radarLimit || 50)) }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || ("Radar error " + res.status));
      for (const j of (Array.isArray(data.jobs) ? data.jobs : [])) {
        if (!j.company || !j.title) continue;
        const k = roleKey(j); if (seen.has(k)) continue; seen.add(k);
        fresh.push({ id: Date.now() + "" + Math.random().toString(36).slice(2, 6), company: j.company, title: j.title, location: j.location || "", link: j.link || "", source: j.source || "Radar", fit: "", signal: "", posted: j.posted || "", score: null, foundAt: Date.now(), radar: true, co: j.co || undefined });
      }

      // 2) focus companies (free ATS pull) — strict radius + title relevance, capped
      if (watchlist.length) {
        setScanStatus("pulling roles from your focus companies…");
        try {
          const atsJobs = await pullWatchlistJobs();
          let added = 0;
          for (const j of atsJobs) {
            if (added >= 80) break;
            if (!j.company || !j.title) continue;
            if (!inRadiusStrict(j.location, homeCountries, broadRemote)) continue;
            if (!titleRelevant(j.title, useTitles)) continue;
            const k = roleKey(j); if (seen.has(k)) continue; seen.add(k);
            fresh.push({ id: Date.now() + "" + Math.random().toString(36).slice(2, 6), company: j.company, title: j.title, location: j.location || "", link: j.link || "", source: j.source || "", fit: "", signal: "", posted: j.posted || "", score: null, foundAt: Date.now(), live: true, verify: { status: "open", note: "From your focus company's live feed" } });
            added++;
          }
        } catch (e) { /* radar already succeeded — ignore ATS errors */ }
      }

      // 2b) focus companies via TheirStack by domain/name — covers ALL library companies (no ATS token needed)
      if (library.length) {
        setScanStatus("scanning your focus companies…");
        try {
          const domains = Array.from(new Set(library.map((c) => String(c.domain || "").replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim()).filter(Boolean)));
          const names = Array.from(new Set(library.filter((c) => !c.domain).map((c) => String(c.company || "").trim()).filter(Boolean)));
          if (domains.length || names.length) {
            const fres = await fetch("/api/radar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titles: useTitles, countries, homeCountries, broadRemote, companyDomains: domains, companyNames: names, maxAgeDays: Math.max(7, Math.min(120, settings.radarDays || 45)), limit: Math.max(10, Math.min(50, settings.radarLimit || 50)) }) });
            const fdata = await fres.json().catch(() => ({}));
            if (fres.ok) {
              for (const j of (Array.isArray(fdata.jobs) ? fdata.jobs : [])) {
                if (!j.company || !j.title) continue;
                const k = roleKey(j); if (seen.has(k)) continue; seen.add(k);
                fresh.push({ id: Date.now() + "" + Math.random().toString(36).slice(2, 6), company: j.company, title: j.title, location: j.location || "", link: j.link || "", source: j.source || "Radar", fit: "", signal: "", posted: j.posted || "", score: null, foundAt: Date.now(), radar: true, focus: true, co: j.co || undefined });
              }
            }
          }
        } catch (e) { /* ignore focus-query errors */ }
      }

      let merged = [...fresh, ...found];
      setFound(merged); saveKey("cs_found", merged);
      setLastFresh(fresh.length);

      // 3) always score the new roles, then enrich any company missing a snapshot
      if (fresh.length) { merged = await scoreWorking(merged); }
      merged = await enrichWorking(merged);
    } catch (e) { setErr("Radar failed: " + e.message); }
    setScanStatus(""); setRadaring(false);
  }

  async function scoreRoles() {
    const needScore = found.some((r) => !r.outdated && !r.dismissed && r.score == null);
    const needCo = found.some((r) => !r.outdated && !r.dismissed && (!r.co || !(r.co.type || r.co.industry || r.co.hq || r.co.size)));
    if (!needScore && !needCo) { setErr("Everything's already scored & enriched."); return; }
    setErr(""); setScoring(true);
    try { let w = await scoreWorking([...found]); w = await enrichWorking(w); } catch (e) { setErr("Scoring failed: " + e.message); }
    setScanStatus(""); setScoring(false);
  }

  async function mapRoleICP(id) {
    setErr(""); setRoleBusy((b) => ({ ...b, [id]: true }));
    try { const r = found.find((x) => x.id === id); const research = extractJSON(await callClaude(buildResearchPrompt(profile, r.company, r.title, r.location), true)); const merged = found.map((x) => x.id === id ? { ...x, research } : x); setFound(merged); saveKey("cs_found", merged); }
    catch (e) { setErr("ICP mapping failed: " + e.message); }
    setRoleBusy((b) => ({ ...b, [id]: false }));
  }
  function removeFound(id) { const next = found.map((x) => x.id === id ? { ...x, dismissed: true } : x); setFound(next); saveKey("cs_found", next); }
  function clearHistory() { setFound([]); saveKey("cs_found", []); }

  function addToPipeline(role) {
    if (pipeline.some((t) => t.company === role.company && t.title === role.title)) { setTab("pipeline"); return; }
    const t = { id: Date.now() + "" + Math.random().toString(36).slice(2, 6), company: role.company, title: role.title, location: role.location, link: role.link, fit: role.fit, signal: role.signal, score: role.score, research: role.research || null, drafts: null, applied: false };
    const next = [t, ...pipeline]; persistPipeline(next); setSelId(t.id); setTab("pipeline");
  }
  function removeTarget(id) { const next = pipeline.filter((t) => t.id !== id); persistPipeline(next); if (selId === id) setSelId(next.find((t) => !t.applied)?.id || null); }
  function patchTarget(id, patch) { persistPipeline(pipeline.map((t) => (t.id === id ? { ...t, ...patch } : t))); }
  function markApplied(id) { const next = pipeline.map((t) => (t.id === id ? { ...t, applied: true, appliedAt: Date.now(), stage: "Applied" } : t)); persistPipeline(next); if (selId === id) setSelId(next.find((t) => !t.applied)?.id || null); }
  function unApply(id) { patchTarget(id, { applied: false, stage: undefined, appliedAt: undefined }); }

  async function researchTarget(t) { setErr(""); setBusy((b) => ({ ...b, [t.id]: "research" })); try { patchTarget(t.id, { research: extractJSON(await callClaude(buildResearchPrompt(profile, t.company, t.title, t.location), true)) }); } catch (e) { setErr("Company Sonar failed: " + e.message); } setBusy((b) => ({ ...b, [t.id]: null })); }
  async function draftOutreach(t) { setErr(""); setBusy((b) => ({ ...b, [t.id]: "draft" })); try { patchTarget(t.id, { drafts: extractJSON(await callClaude(buildDraftPrompt(profile, t, settings), false)) }); } catch (e) { setErr("Outreach drafting failed: " + e.message); } setBusy((b) => ({ ...b, [t.id]: null })); }

  async function runVerify(company, title, location) {
    const v = extractJSON(await callClaude(buildVerifyPrompt(company, title, location), true));
    return { status: ["open", "closed", "uncertain"].includes(v.status) ? v.status : "uncertain", confidence: v.confidence || "", note: v.note || "", url: v.url || "", checkedAt: Date.now() };
  }
  async function verifyTarget(t) {
    setErr(""); setVerifyBusy((b) => ({ ...b, [t.id]: true }));
    try { patchTarget(t.id, { verify: await runVerify(t.company, t.title, t.location) }); }
    catch (e) { setErr("Verify failed: " + e.message); }
    setVerifyBusy((b) => ({ ...b, [t.id]: false }));
  }
  async function verifyFound(id) {
    setErr(""); setVerifyBusy((b) => ({ ...b, [id]: true }));
    try { const r = found.find((x) => x.id === id); const verify = await runVerify(r.company, r.title, r.location); const merged = found.map((x) => x.id === id ? { ...x, verify } : x); setFound(merged); saveKey("cs_found", merged); }
    catch (e) { setErr("Verify failed: " + e.message); }
    setVerifyBusy((b) => ({ ...b, [id]: false }));
  }
  function markOutdated(t) {
    const k = roleKey(t);
    let nf = found.map((f) => roleKey(f) === k ? { ...f, outdated: true } : f);
    if (!found.some((f) => roleKey(f) === k)) nf = [{ id: Date.now() + "" + Math.random().toString(36).slice(2, 6), company: t.company, title: t.title, location: t.location, link: t.link, score: t.score, foundAt: Date.now(), outdated: true }, ...nf];
    setFound(nf); saveKey("cs_found", nf);
    const np = pipeline.filter((x) => x.id !== t.id); persistPipeline(np);
    if (selId === t.id) setSelId(np.find((x) => !x.applied)?.id || null);
  }
  function restoreFound(id) { const merged = found.map((x) => x.id === id ? { ...x, outdated: false, dismissed: false } : x); setFound(merged); saveKey("cs_found", merged); }

  const sel = openTargets.find((t) => t.id === selId) || null;
  const TABS = [
    ["profile", "01 · My Profile", User],
    ["criteria", "02 · Search Criteria", SlidersHorizontal],
    ["companies", `03 · Companies${library.length ? " (" + library.length + ")" : ""}`, Building2],
    ["sonar", `04 · Role Sonar${found.filter((f) => !f.outdated && !f.dismissed).length ? " (" + found.filter((f) => !f.outdated && !f.dismissed).length + ")" : ""}`, Search],
    ["pipeline", `05 · Cockpit${openTargets.length ? " (" + openTargets.length + ")" : ""}`, Target],
    ["tracker", `06 · Tracker${appliedTargets.length ? " (" + appliedTargets.length + ")" : ""}`, ClipboardList],
    ["settings", "07 · Settings", Cog],
  ];

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: SANS, minHeight: 640 }}>
      <style>{`
        @keyframes ping{0%{transform:scale(.6);opacity:.4}80%,100%{transform:scale(2.2);opacity:0}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes cs-spin{to{transform:rotate(360deg)}}
        @keyframes cs-slide{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
        .cs-in::placeholder{color:${C.faint}}
        .cs-scroll::-webkit-scrollbar{width:8px;height:8px}
        .cs-scroll::-webkit-scrollbar-thumb{background:${C.line};border-radius:8px}
        select.cs-sel{appearance:none;-webkit-appearance:none}
        .cs-cta{background:${GRAD};color:#fff;border:none;font-weight:700;letter-spacing:.4px;cursor:pointer;box-shadow:0 6px 18px rgba(109,74,255,.34);transition:box-shadow .15s, transform .08s}
        .cs-cta:hover{box-shadow:0 10px 26px rgba(109,74,255,.46)}
        .cs-cta:active{transform:translateY(1px)}
        .cs-cta:disabled{opacity:.5;box-shadow:none;cursor:default}
        .cs-grad{background:${GRAD};-webkit-background-clip:text;background-clip:text;color:transparent}
      `}</style>

      <div style={{ borderBottom: `1px solid ${C.line}`, padding: "16px 22px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", background: `linear-gradient(180deg, ${C.panel}, ${C.bg})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 15 }}>
          <div style={{ position: "relative", width: 42, height: 42, display: "grid", placeItems: "center" }}>
            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `1.5px solid ${C.teal}`, animation: "ping 2.6s cubic-bezier(0,0,.2,1) infinite" }} />
            <Radar size={31} color={C.teal} />
          </div>
          <div><div className="cs-grad" style={{ fontFamily: SERIF, letterSpacing: -.6, fontSize: 27, fontWeight: 800, lineHeight: 1.05 }}>Career Sonar</div><div style={{ fontFamily: MONO, fontSize: 10.5, color: C.dim, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600, marginTop: 1 }}>find roles · reach the right people</div></div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setTab(id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: .5, fontWeight: tab === id ? 700 : 500, border: `1px solid ${tab === id ? C.teal : C.line}`, background: tab === id ? C.panel2 : "transparent", color: tab === id ? C.teal : C.dim }}>
              <Icon size={13} color={tab === id ? C.teal : C.dim} /> {label}
            </button>
          ))}
          {onSignOut && <button onClick={onSignOut} title={signedInEmail ? ("Signed in as " + signedInEmail + " — sign out") : "Sign out"} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 13px", borderRadius: 8, cursor: "pointer", fontFamily: MONO, fontSize: 11, letterSpacing: .5, fontWeight: 500, border: `1px solid ${C.line}`, background: "transparent", color: C.faint }}><LogOut size={13} color={C.faint} /> Sign out</button>}
        </div>
      </div>

      {err && <div style={{ margin: "14px 22px 0", padding: "10px 14px", borderRadius: 8, border: `1px solid ${C.red}`, background: "rgba(255,122,122,.08)", color: C.red, fontSize: 13, display: "flex", gap: 8, alignItems: "center", fontFamily: MONO }}><AlertCircle size={15} /> {err}</div>}

      <div style={{ padding: 22 }}>
        {tab === "profile" && <Profile profile={profile} setProfile={setProfile} save={saveProfile} saved={profileSaved} applyExtract={applyExtract} goCriteria={() => setTab("criteria")} />}
        {tab === "criteria" && <Criteria criteria={criteria} setCriteria={setCriteria} save={saveCriteria} saved={criteriaSaved} ready={criteriaReady} watchlist={watchlist} saveWatchlist={saveWatchlist} goCompanies={() => setTab("companies")} />}
        {tab === "companies" && <CompanyEngine criteria={criteria} library={library} suggestCompanies={suggestCompanies} normalizeCompanies={normalizeCompanies} resolveCompanies={resolveCompanies} addToLibrary={addToLibrary} removeFromLibrary={removeFromLibrary} goSonar={() => setTab("sonar")} />}
        {tab === "sonar" && <Sonar found={found} ready={criteriaReady} runRadar={runRadar} radaring={radaring} scoreRoles={scoreRoles} scoring={scoring} clearFound={clearFound} scanStatus={scanStatus} lastScan={settings.lastScan} lastFresh={lastFresh} add={addToPipeline} removeFound={removeFound} verifyFound={verifyFound} verifyBusy={verifyBusy} restoreFound={restoreFound} workMode={criteria.workMode} pipeline={pipeline} library={library} goCriteria={() => setTab("criteria")} goSettings={() => setTab("settings")} />}
        {tab === "pipeline" && <Cockpit targets={openTargets} sel={sel} setSelId={setSelId} remove={removeTarget} research={researchTarget} draft={draftOutreach} busy={busy} patch={patchTarget} markApplied={markApplied} verifyTarget={verifyTarget} verifyBusy={verifyBusy} markOutdated={markOutdated} settings={settings} goSettings={() => setTab("settings")} appliedCount={appliedTargets.length} goSonar={() => setTab("sonar")} goTracker={() => setTab("tracker")} />}
        {tab === "tracker" && <Tracker targets={appliedTargets} patch={patchTarget} unApply={unApply} remove={removeTarget} goCockpit={() => setTab("pipeline")} />}
        {tab === "settings" && <SettingsTab settings={settings} update={updateSettings} foundCount={found.length} clearHistory={clearHistory} />}
      </div>

      <div style={{ borderTop: `1px solid ${C.line}`, padding: "11px 22px", fontFamily: MONO, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>
        Drafts are starting points — verify every contact before reaching out, send manually, keep volume low. This tool researches & drafts; it never sends.
      </div>
    </div>
  );
}

/* ---------------- shared inputs ---------------- */
function Field({ label, hint, value, onChange, area, ph }) {
  const common = { width: "100%", background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 13.5, fontFamily: SANS, outline: "none", boxSizing: "border-box" };
  return (<div style={{ marginBottom: 16 }}><label style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim, display: "block", marginBottom: 6 }}>{label}{hint && <span style={{ color: C.faint }}> — {hint}</span>}</label>{area ? <textarea className="cs-in" value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={ph} style={{ ...common, resize: "vertical", lineHeight: 1.5 }} /> : <input className="cs-in" value={value} onChange={(e) => onChange(e.target.value)} placeholder={ph} style={common} />}</div>);
}
function ChipInput({ label, hint, items, setItems, ph, color = C.teal, max }) {
  const [v, setV] = useState("");
  const add = () => { const x = v.trim().replace(/,$/, ""); if (x && !items.includes(x) && (!max || items.length < max)) setItems([...items, x]); setV(""); };
  const atMax = max && items.length >= max;
  return (<div style={{ marginBottom: 16 }}><label style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim, display: "block", marginBottom: 6 }}>{label}{hint && <span style={{ color: C.faint }}> — {hint}</span>}</label>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", background: C.bg, border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 10px", minHeight: 22 }}>
      {items.map((it, i) => (<span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.text, background: C.panel2, border: `1px solid ${color}`, borderRadius: 6, padding: "4px 8px" }}>{it}<button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ display: "flex", background: "transparent", border: "none", cursor: "pointer", color: C.dim, padding: 0 }}><X size={12} /></button></span>))}
      {!atMax && <input className="cs-in" value={v} onChange={(e) => setV(e.target.value)} onBlur={add} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !v && items.length) setItems(items.slice(0, -1)); }} placeholder={items.length ? "" : ph} style={{ flex: 1, minWidth: 120, background: "transparent", color: C.text, border: "none", outline: "none", fontSize: 13, fontFamily: SANS, padding: "3px 0" }} />}
    </div></div>);
}
function SaveBtn({ onClick, saved, label }) { return (<button onClick={onClick} className="cs-cta" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 22px", borderRadius: 10, fontFamily: MONO, fontSize: 12.5 }}><Check size={15} color="#fff" /> {saved ? "SAVED" : label}</button>); }

function VerifyBadge({ verify, checking }) {
  if (checking) return <span style={{ fontFamily: MONO, fontSize: 10, color: C.dim, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 8px", display: "inline-flex", gap: 5, alignItems: "center" }}><Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} /> CHECKING…</span>;
  if (!verify) return null;
  const map = { open: [C.green, "LIVE"], closed: [C.red, "NOT FOUND LIVE"], uncertain: [C.amber, "UNCERTAIN"] };
  const [col, label] = map[verify.status] || [C.dim, String(verify.status).toUpperCase()];
  return <span title={verify.note || ""} style={{ fontFamily: MONO, fontSize: 10, letterSpacing: .5, color: col, border: `1px solid ${col}`, borderRadius: 6, padding: "3px 8px" }}>{label} · {agoLabel(verify.checkedAt)}</span>;
}
function ScoreBadge({ score, big }) {
  if (score == null) return <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 7px" }}>—</span>;
  const col = score >= 80 ? C.green : score >= 65 ? C.amber : score >= 45 ? C.violet : C.faint;
  return <span title="fit score 0-100" style={{ display: "inline-flex", alignItems: "baseline", gap: 2, fontFamily: MONO, color: col, border: `1px solid ${col}`, borderRadius: 6, padding: big ? "4px 9px" : "3px 7px" }}><b style={{ fontSize: big ? 15 : 12.5 }}>{score}</b><span style={{ fontSize: 9, opacity: .75 }}>/100</span></span>;
}

/* ---------------- 01 · My Profile ---------------- */
function Profile({ profile, setProfile, save, saved, applyExtract, goCriteria }) {
  const up = (k) => (v) => setProfile({ ...profile, [k]: v });
  const [imp, setImp] = useState({ file: null, fileName: "", text: "", busy: false, err: "", done: false });
  async function extract() {
    setImp((s) => ({ ...s, busy: true, err: "", done: false }));
    try {
      const PROMPT = `You are a CV / LinkedIn profile parser. From the material below, infer a structured candidate profile for a job search. Infer likely TARGET titles from their trajectory (latest role + the natural next step up).

Return ONLY JSON, no prose:
{"titles":"comma-separated target titles","seniority":"","locations":"","industries":"","skills":"3-5 comma-separated key skills","roleCharacteristics":"comma-separated role traits they'd likely want, e.g. building a team, owning revenue","evidence":"the 3-5 strongest concrete achievements with metrics, concise","positioning":"one punchy line on the value they bring"}
Use "" for anything unknown. Keep "evidence" under ~80 words.`;
      let content; const f = imp.file;
      if (f && (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))) { const b64 = await fileToBase64(f); content = [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }, { type: "text", text: PROMPT }]; }
      else if (f && f.name.toLowerCase().endsWith(".docx")) { const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() }); content = PROMPT + "\n\nMATERIAL:\n" + value; }
      else if (imp.text.trim()) { content = PROMPT + "\n\nMATERIAL:\n" + imp.text; }
      else { throw new Error("Upload a CV or paste your LinkedIn text first"); }
      await applyExtract(content);
      setImp((s) => ({ ...s, busy: false, done: true })); setTimeout(() => setImp((s) => ({ ...s, done: false })), 2800);
    } catch (e) { setImp((s) => ({ ...s, busy: false, err: e.message })); }
  }
  return (
    <div style={{ maxWidth: 860 }}>
      <SectionTitle n="01" title="My Profile" desc="Who you are — the supply side. This personalizes your outreach and seeds your search criteria." />
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 22, background: C.panel }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><Sparkles size={15} color={C.teal} /><span style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5 }}>AUTOFILL FROM CV OR LINKEDIN</span></div>
        <p style={{ margin: "0 0 13px", color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>Upload a CV (PDF or DOCX) or paste your LinkedIn text. Fills your profile below <i>and</i> seeds your Search Criteria — review both, then save.</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 11 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.line}`, background: C.panel2, fontFamily: MONO, fontSize: 11, color: C.text }}><Upload size={13} color={C.teal} /> {imp.fileName ? "CHANGE FILE" : "UPLOAD CV"}<input type="file" accept=".pdf,.docx" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) setImp((s) => ({ ...s, file: f, fileName: f.name, err: "" })); }} /></label>
          {imp.fileName && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, color: C.dim }}><FileText size={13} /> {imp.fileName}</span>}
        </div>
        <textarea className="cs-in" value={imp.text} onChange={(e) => setImp((s) => ({ ...s, text: e.target.value }))} rows={3} placeholder="…or paste your LinkedIn 'About' + experience (a URL won't work — LinkedIn blocks fetching, so copy the text across)" style={{ width: "100%", background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 13, fontFamily: SANS, resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 11, flexWrap: "wrap" }}>
          <button onClick={extract} disabled={imp.busy} className="cs-cta" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10, fontFamily: MONO, fontSize: 12 }}>{imp.busy ? <Spin /> : <Sparkles size={14} />} {imp.busy ? "READING…" : "EXTRACT PROFILE"}</button>
          {imp.done && <span style={{ fontFamily: MONO, fontSize: 11, color: C.teal, display: "inline-flex", gap: 6, alignItems: "center" }}><Check size={13} /> filled profile + criteria — review & save both</span>}
          {imp.err && <span style={{ fontFamily: MONO, fontSize: 11, color: C.red, display: "inline-flex", gap: 6, alignItems: "center" }}><AlertCircle size={13} /> {imp.err}</span>}
        </div>
      </div>
      <Field label="Headline" hint="optional — your one-liner" value={profile.headline} onChange={up("headline")} ph="Revenue leader · B2B AI · DACH" />
      <ChipInput label="Key skills" hint="3-5 — type and press Enter" items={profile.skills} setItems={up("skills")} ph="e.g. Outbound GTM, Team building, Enterprise SaaS" max={5} />
      <Field label="Your evidence" hint="concrete wins, metrics, scope — the proof you close gaps" area value={profile.evidence} onChange={up("evidence")} ph="Built DACH GTM 0→€4M ARR in 18mo. Hired+led 12 reps…" />
      <Field label="Positioning statement" hint="one line on the value you bring" area value={profile.positioning} onChange={up("positioning")} ph="Revenue leader who builds repeatable outbound engines in early-stage B2B AI companies." />
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}><SaveBtn onClick={save} saved={saved} label="SAVE PROFILE" /><button onClick={goCriteria} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "11px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.line}`, background: "transparent", color: C.dim, fontFamily: MONO, fontSize: 11.5 }}>NEXT · SEARCH CRITERIA <ChevronRight size={14} /></button></div>
    </div>
  );
}

/* ---------------- 02 · Search Criteria ---------------- */
function Criteria({ criteria, setCriteria, save, saved, ready, watchlist, saveWatchlist, goCompanies }) {
  const up = (k) => (v) => setCriteria({ ...criteria, [k]: v });
  const toggleArr = (k, v) => { const cur = criteria[k] || []; setCriteria({ ...criteria, [k]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] }); };
  return (
    <div style={{ maxWidth: 860 }}>
      <SectionTitle n="02" title="Role Search Criteria" desc="What you want — the demand side. This is the filter Role Sonar uses to find and rank openings." />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 22px" }}>
        <Field label="Target titles" hint="comma separated · the radar also searches similar titles" value={criteria.titles} onChange={up("titles")} ph="VP Sales, CSO, Head of Revenue" />
        <Field label="Where you're based" hint="your home base + regions you'll work from" value={criteria.locations} onChange={up("locations")} ph="Madrid, Spain · open to remote-EU / DACH" />
        <Field label="Industries" value={criteria.industries} onChange={up("industries")} ph="B2B SaaS, AI, fintech" />
        <Field label="Must-haves" value={criteria.mustHaves} onChange={up("mustHaves")} ph="Series B+, equity, English-first" />
        <Field label="Comp expectation" hint="optional" value={criteria.comp} onChange={up("comp")} ph="€180k+ OTE" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim, display: "block", marginBottom: 7 }}>Target markets <span style={{ color: C.faint }}>— where the radar searches</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {(criteria.targetMarkets || []).length === 0 && <span style={{ fontSize: 12.5, color: C.faint }}>none yet — add a market →</span>}
          {(criteria.targetMarkets || []).map((m) => (
            <span key={m} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "#fff", background: C.teal, borderRadius: 999, padding: "5px 10px" }}>{m}<X size={12} onClick={() => toggleArr("targetMarkets", m)} style={{ cursor: "pointer", opacity: .85 }} /></span>
          ))}
          <select value="" onChange={(e) => { if (e.target.value) toggleArr("targetMarkets", e.target.value); }} style={{ padding: "7px 11px", borderRadius: 999, border: `1px dashed ${C.line}`, background: C.panel, color: C.dim, fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
            <option value="">+ add market</option>
            {Object.keys(MARKETS).filter((m) => !(criteria.targetMarkets || []).includes(m)).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim, display: "block", marginBottom: 7 }}>Seniority levels <span style={{ color: C.faint }}>— pick all that fit</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{SENIORITY.map((m) => <Pill key={m} active={(criteria.seniorityLevels || []).includes(m)} onClick={() => toggleArr("seniorityLevels", m)} color={C.violet}>{m}</Pill>)}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim, display: "block", marginBottom: 7 }}>Role type <span style={{ color: C.faint }}>— what you're going for</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{ROLETYPES.map((m) => <Pill key={m} active={criteria.roleType === m} onClick={() => up("roleType")(m)} color={C.amber}>{m}</Pill>)}</div>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim, display: "block", marginBottom: 7 }}>Work mode <span style={{ color: C.faint }}>— a hard filter on where you must physically be</span></label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{WORKMODES.map((m) => <Pill key={m} active={criteria.workMode === m} onClick={() => up("workMode")(m)} color={C.green}>{m}</Pill>)}</div>
      </div>
      <ChipInput label="Role characteristics" hint="what the role should involve — type and press Enter" items={criteria.roleCharacteristics} setItems={up("roleCharacteristics")} ph="e.g. Building a team, Managing a team, Owning revenue, Hands-on sales" color={C.amber} />
      <Field label="Extra search bias" hint="free text to steer the scan" area value={criteria.bias} onChange={up("bias")} ph="AI-native companies, founder-led, avoid agencies / consultancies" />

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <SaveBtn onClick={save} saved={saved} label="SAVE CRITERIA" />
        <button onClick={goCompanies} disabled={!ready} className="cs-cta" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10, fontFamily: MONO, fontSize: 12 }}><Building2 size={14} /> NEXT: FOCUS COMPANIES</button>
        {!ready && <span style={{ fontFamily: MONO, fontSize: 11, color: C.faint }}>add at least a target title</span>}
      </div>
    </div>
  );
}

/* ---------------- 03 · Companies (Top Company Engine + Library) ---------------- */
function CompanyEngine({ criteria, library, suggestCompanies, normalizeCompanies, resolveCompanies, addToLibrary, removeFromLibrary, goSonar }) {
  const [seeds, setSeeds] = useState(toArr(criteria.exampleCompanies));
  const [suggestions, setSuggestions] = useState([]);
  const [checked, setChecked] = useState({});
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addingSeeds, setAddingSeeds] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [status, setStatus] = useState("");
  const [err, setErr] = useState("");

  const inLib = new Set(library.map((c) => (c.company || "").toLowerCase().trim()));
  const checkedList = suggestions.filter((s) => checked[s.name]);
  const screenable = library.filter((c) => c.screenable);

  // normalize names -> [{name, domain}], then ATS-resolve, then return library items
  async function cleanAndResolve(rawNames) {
    let pairs = rawNames.map((name) => ({ name, domain: "" }));
    try {
      const norm = await normalizeCompanies(rawNames.join(", "));
      if (Array.isArray(norm) && norm.length) {
        const byIn = new Map(norm.map((o) => [(o.input || o.name || "").toLowerCase().trim(), o]));
        pairs = rawNames.map((n) => { const o = byIn.get(n.toLowerCase().trim()) || {}; return { name: o.name || n, domain: o.domain || "" }; });
      }
    } catch (_) { /* fall back to raw names */ }
    const results = await resolveCompanies(pairs, (d, t) => setStatus(`checking ATS… ${d}/${t}`));
    const byName = new Map(results.map((r) => [(r.name || "").toLowerCase().trim(), r]));
    return pairs.map((p) => { const r = byName.get(p.name.toLowerCase().trim()) || {}; return { name: p.name, domain: p.domain || r.domain || "", ats: r.ats || null, token: r.token || null, screenable: !!r.screenable, jobCount: r.jobCount || 0 }; });
  }

  async function doAddSeeds() {
    const raw = seeds.filter(Boolean);
    if (!raw.length) return;
    setErr(""); setAddingSeeds(true);
    try {
      setStatus("checking spelling & websites…");
      const items = await cleanAndResolve(raw);
      addToLibrary(items);
      setSeeds([]);
    } catch (e) { setErr("Add failed: " + e.message); }
    setStatus(""); setAddingSeeds(false);
  }

  async function doRecheckAll() {
    if (!library.length) return;
    setErr(""); setRechecking(true);
    try {
      setStatus("cleaning up your list…");
      const items = await cleanAndResolve(library.map((c) => c.company).filter(Boolean));
      addToLibrary(items);
    } catch (e) { setErr("Re-check failed: " + e.message); }
    setStatus(""); setRechecking(false);
  }

  async function doSuggest() {
    setErr(""); setSuggesting(true); setStatus("finding similar companies…");
    try {
      const basis = (seeds.length ? seeds : library.map((c) => c.company)).filter(Boolean);
      if (!basis.length) { setErr("Add a few focus companies first, then suggest similar ones."); setSuggesting(false); setStatus(""); return; }
      const arr = await suggestCompanies(basis.join(", "));
      setSuggestions(arr.filter((s) => !inLib.has((s.name || "").toLowerCase().trim())));
      setChecked({});
    } catch (e) { setErr("Suggestion failed: " + e.message); }
    setStatus(""); setSuggesting(false);
  }
  async function doAdd() {
    if (!checkedList.length) return;
    setErr(""); setAdding(true);
    try {
      setStatus(`checking ATS for ${checkedList.length} companies…`);
      const results = await resolveCompanies(checkedList, (done, total) => setStatus(`checking ATS… ${done}/${total}`));
      // merge resolve results back onto the chosen suggestions (keep domain/why)
      const byName = new Map(results.map((r) => [(r.name || "").toLowerCase().trim(), r]));
      const items = checkedList.map((c) => { const r = byName.get((c.name || "").toLowerCase().trim()) || {}; return { name: c.name, domain: c.domain || r.domain || "", ats: r.ats || null, token: r.token || null, screenable: !!r.screenable, jobCount: r.jobCount || 0 }; });
      addToLibrary(items);
      setSuggestions((prev) => prev.filter((s) => !checked[s.name]));
      setChecked({});
    } catch (e) { setErr("ATS check failed: " + e.message); }
    setStatus(""); setAdding(false);
  }

  return (
    <div style={{ maxWidth: 980 }}>
      <SectionTitle n="03" title="Focus Companies" desc="Companies you most want to work for. Add them here — Career Sonar weights them higher when scoring roles and pulls their open positions for free where their ATS is reachable. This doesn't limit the search: the radar still scans the whole market; these just get priority." />

      <div style={{ marginBottom: 18 }}>
        <ChipInput label="Add focus companies" hint="type a company and press Enter — then add them to your list, or suggest similar ones" items={seeds} setItems={setSeeds} ph="e.g. Personio, Celonis, DeepL, Pigment, Cohere" color={C.violet} />
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={doAddSeeds} disabled={addingSeeds || adding || suggesting || !seeds.length} className="cs-cta" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10, fontFamily: MONO, fontSize: 12 }}>{addingSeeds ? <Spin /> : <Plus size={14} />} {addingSeeds ? "ADDING…" : `ADD TO LIST${seeds.length ? " (" + seeds.length + ")" : ""}`}</button>
          <button onClick={doSuggest} disabled={suggesting || adding || addingSeeds} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 10, cursor: "pointer", border: `1px solid ${C.line}`, background: C.panel, color: C.dim, fontFamily: MONO, fontSize: 12 }}>{suggesting ? <Spin /> : <Sparkles size={14} />} {suggesting ? "SUGGESTING…" : "SUGGEST SIMILAR"}</button>
          {status && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.teal }}>{status}</span>}
        </div>
      </div>

      {err && <div style={{ padding: "10px 13px", borderRadius: 8, border: `1px solid ${C.red}`, background: "rgba(220,80,80,.08)", color: C.red, fontSize: 12.5, marginBottom: 14 }}>{err}</div>}

      {suggestions.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: C.dim }}>{suggestions.length} suggestions · {checkedList.length} selected</span>
            <button onClick={() => setChecked(Object.fromEntries(suggestions.map((s) => [s.name, true])))} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.faint, fontFamily: MONO, fontSize: 10.5 }}>select all</button>
            <button onClick={() => setChecked({})} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.faint, fontFamily: MONO, fontSize: 10.5 }}>clear</button>
            <button onClick={doAdd} disabled={adding || !checkedList.length} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, padding: "10px 16px", borderRadius: 9, cursor: checkedList.length ? "pointer" : "default", border: `1px solid ${checkedList.length ? C.teal : C.line}`, background: C.panel, color: checkedList.length ? C.teal : C.faint, fontFamily: MONO, fontSize: 11 }}>{adding ? <Spin /> : <Plus size={13} />} CHECK ATS & ADD{checkedList.length ? " (" + checkedList.length + ")" : ""}</button>
          </div>
          <div style={{ display: "grid", gap: 7 }}>
            {suggestions.map((s) => {
              const on = !!checked[s.name];
              return (
                <button key={s.name} onClick={() => setChecked((c) => ({ ...c, [s.name]: !on }))} style={{ textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 9, cursor: "pointer", border: `1px solid ${on ? C.teal : C.line}`, background: on ? C.panel2 : C.panel, color: C.text }}>
                  <span style={{ width: 18, height: 18, borderRadius: 5, border: `1px solid ${on ? C.teal : C.line}`, background: on ? C.teal : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{on && <Check size={12} color="#fff" />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}><span style={{ fontWeight: 600, fontSize: 14, fontFamily: SERIF }}>{s.name}</span>{s.domain && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{s.domain}</span>}</div>
                    {s.why && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{s.why}</div>}
                  </div>
                  {s.category && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: .4, color: C.violet, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 9px", flexShrink: 0 }}>{s.category}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim }}>YOUR FOCUS LIST</span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{library.length} companies · <span style={{ color: screenable.length ? C.green : C.faint }}>{screenable.length} screenable free</span></span>
          {library.length > 0 && <button onClick={doRecheckAll} disabled={rechecking || addingSeeds || adding} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: C.dim, fontFamily: MONO, fontSize: 10.5 }}>{rechecking ? <Spin /> : <Check size={12} />} re-check names & ATS</button>}
          {screenable.length > 0 && <button onClick={goSonar} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: C.teal, fontFamily: MONO, fontSize: 10.5 }}><Radar size={12} /> pull these in Role Sonar</button>}
        </div>
        {!library.length ? (
          <div style={{ padding: "18px 16px", border: `1px dashed ${C.line}`, borderRadius: 10, color: C.faint, fontSize: 12.5 }}>No focus companies yet. Add a few above — the ones whose ATS we can reach get pulled for free in Role Sonar (no TheirStack credits), and all of them get extra weight in scoring.</div>
        ) : (
          <div style={{ display: "grid", gap: 7 }}>
            {library.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 13px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.panel }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}><span style={{ fontWeight: 600, fontSize: 14, fontFamily: SERIF }}>{c.company}</span>{c.domain && <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{c.domain}</span>}</div>
                </div>
                {c.screenable ? <span style={{ fontFamily: MONO, fontSize: 10, color: C.green, border: `1px solid ${C.green}`, borderRadius: 999, padding: "3px 10px" }}>ATS: {c.ats}{c.jobCount ? " · " + c.jobCount + " open" : ""}</span>
                  : <span style={{ fontFamily: MONO, fontSize: 10, color: C.faint, border: `1px solid ${C.line}`, borderRadius: 999, padding: "3px 10px" }}>not auto-screenable</span>}
                <button onClick={() => removeFromLibrary(c.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.faint, display: "inline-flex" }}><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- 04 · Role Sonar ---------------- */
function Pill({ active, onClick, children, color = C.teal }) {
  return <button onClick={onClick} style={{ padding: "5px 10px", borderRadius: 7, cursor: "pointer", fontFamily: MONO, fontSize: 10.5, letterSpacing: .3, border: `1px solid ${active ? color : C.line}`, background: active ? C.panel2 : "transparent", color: active ? color : C.dim }}>{children}</button>;
}
function Sonar({ found, ready, runRadar, radaring, scoreRoles, scoring, clearFound, scanStatus, lastScan, lastFresh, add, removeFound, verifyFound, verifyBusy, restoreFound, workMode, pipeline, library, goCriteria, goSettings }) {
  const focusSet = new Set((library || []).map((c) => String(c.company || "").toLowerCase().trim()).filter(Boolean));
  const isFocus = (r) => focusSet.has(String(r.company || "").toLowerCase().trim());
  const [focusOnly, setFocusOnly] = useState(false);
  const unscored = found.filter((r) => !r.outdated && !r.dismissed && r.score == null).length;
  const [minScore, setMin] = useState(0);
  const [locSel, setLocSel] = useState([]);
  const [recency, setRecency] = useState("all");
  const [sort, setSort] = useState("score");
  const [showOutdated, setShowOutdated] = useState(false);
  const [liveOnly, setLiveOnly] = useState(false);
  if (!ready) return <Empty icon={SlidersHorizontal} title="Set your Search Criteria first" desc="Role Sonar needs at least a target title to scan the market." action="Go to Search Criteria" onClick={goCriteria} />;

  const inCockpit = (r) => pipeline.some((t) => t.company === r.company && t.title === r.title);
  const hiddenCount = found.filter((r) => r.outdated || r.dismissed || inCockpit(r)).length;
  const activeCount = found.length - hiddenCount;
  const liveCount = found.filter((r) => r.verify?.status === "open").length;
  const focusCount = found.filter((r) => !r.outdated && !r.dismissed && !inCockpit(r) && isFocus(r)).length;
  const countryCounts = {}; let remoteBucketN = 0;
  found.forEach((f) => { if (f.outdated || f.dismissed) return; const cs = roleCountries(f.location); if (!cs.length) remoteBucketN++; else cs.forEach((c) => { countryCounts[c] = (countryCounts[c] || 0) + 1; }); });
  const countryOpts = Object.keys(countryCounts).sort((a, b) => countryCounts[b] - countryCounts[a] || a.localeCompare(b));
  let list = found.filter((r) => {
    if (workMode === "Remote only" && /hybrid|on-?site|in[- ]?office/i.test(r.location || "")) return false;
    if (liveOnly && r.verify?.status !== "open") return false;
    if (!showOutdated && (r.outdated || r.dismissed || inCockpit(r))) return false;
    if (focusOnly && !isFocus(r)) return false;
    if (minScore && (r.score == null || r.score < minScore)) return false;
    if (locSel.length) { const rc = roleCountries(r.location); const inRemote = locSel.includes(REMOTE_BUCKET) && !rc.length; if (!inRemote && !rc.some((c) => locSel.includes(c))) return false; }
    if (recency !== "all") { const d = daysOpen(r.foundAt); if (recency === "today" && d > 0) return false; if (recency === "week" && d > 7) return false; }
    return true;
  });
  list = [...list].sort((a, b) => sort === "score" ? ((b.score || 0) - (a.score || 0)) : ((b.foundAt || 0) - (a.foundAt || 0)));

  return (
    <div>
      <SectionTitle n="04" title="Role Sonar" desc="Hit Run Radar — it scans the market, pulls open roles from your focus companies, and scores every match against your profile. Roles accumulate here over time; send the best to your Cockpit." />
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={runRadar} disabled={radaring || scoring} className="cs-cta" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10, fontFamily: MONO, fontSize: 12 }}>{radaring ? <Spin /> : <Radar size={14} />} {radaring ? "WORKING…" : "RUN RADAR & SCORE"}</button>
        <button onClick={scoreRoles} disabled={scoring || radaring || !unscored} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 10, cursor: unscored ? "pointer" : "default", border: `1px solid ${unscored ? C.teal : C.line}`, background: C.panel, color: unscored ? C.teal : C.faint, fontFamily: MONO, fontSize: 12 }}>{scoring ? <Spin /> : <Sparkles size={14} />} {scoring ? "SCORING…" : `SCORE${unscored ? " (" + unscored + ")" : ""}`}</button>
        {found.length > 0 && <button onClick={clearFound} disabled={radaring || scoring} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "12px 14px", borderRadius: 10, cursor: "pointer", border: `1px solid ${C.line}`, background: C.panel, color: C.faint, fontFamily: MONO, fontSize: 11 }}><Trash2 size={13} /> CLEAR</button>}
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.dim }}>{(radaring || scoring) && scanStatus ? <span style={{ color: C.teal }}>{scanStatus}</span> : <>last scan: {lastScan ? agoLabel(lastScan) : "never"}{lastFresh != null && <span style={{ color: lastFresh ? C.teal : C.faint }}> · +{lastFresh} new</span>}</>}</span>
        <button onClick={goSettings} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", color: C.faint, fontFamily: MONO, fontSize: 10.5 }}><Cog size={12} /> scan settings</button>
      </div>

      {(radaring || scoring) && (
        <div style={{ marginBottom: 16, padding: "16px 18px", borderRadius: 12, border: `1px solid ${C.teal}`, background: C.panel2, boxShadow: `0 0 0 3px ${C.panel}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", border: `3px solid ${C.line}`, borderTopColor: C.teal, animation: "cs-spin 0.8s linear infinite", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.teal, letterSpacing: .3 }}>{scanStatus || "WORKING…"}</div>
              <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>Scanning the market, pulling your focus companies and scoring every match — this can take up to a minute. You can keep this tab open.</div>
            </div>
          </div>
          <div style={{ marginTop: 12, height: 4, borderRadius: 99, background: C.line, overflow: "hidden" }}><div style={{ height: "100%", width: "40%", borderRadius: 99, background: C.teal, animation: "cs-slide 1.3s ease-in-out infinite" }} /></div>
        </div>
      )}
      {found.length > 0 && (
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", padding: "11px 13px", border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>SORT</span><Pill active={sort === "score"} onClick={() => setSort("score")}>BEST MATCH</Pill><Pill active={sort === "new"} onClick={() => setSort("new")}>NEWEST</Pill></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>SCORE</span>{[[0, "ALL"], [60, "60+"], [75, "75+"], [85, "85+"]].map(([v, l]) => <Pill key={v} active={minScore === v} onClick={() => setMin(v)} color={C.green}>{l}</Pill>)}</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>FOUND</span>{[["all", "ANY"], ["week", "≤7d"], ["today", "TODAY"]].map(([v, l]) => <Pill key={v} active={recency === v} onClick={() => setRecency(v)} color={C.violet}>{l}</Pill>)}</div>
          {(countryOpts.length > 0 || remoteBucketN > 0) && <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontFamily: MONO, fontSize: 10, color: C.faint }}>LOCATION</span><Pill active={locSel.length === 0} onClick={() => setLocSel([])} color={C.teal}>ALL</Pill>{countryOpts.map((c) => <Pill key={c} active={locSel.includes(c)} onClick={() => setLocSel(locSel.includes(c) ? locSel.filter((x) => x !== c) : [...locSel, c])} color={C.teal}>{c}{countryCounts[c] ? " (" + countryCounts[c] + ")" : ""}</Pill>)}{remoteBucketN > 0 && <Pill active={locSel.includes(REMOTE_BUCKET)} onClick={() => setLocSel(locSel.includes(REMOTE_BUCKET) ? locSel.filter((x) => x !== REMOTE_BUCKET) : [...locSel, REMOTE_BUCKET])} color={C.teal}>{REMOTE_BUCKET} ({remoteBucketN})</Pill>}</div>}
          <Pill active={liveOnly} onClick={() => setLiveOnly(!liveOnly)} color={C.green}>✓ LIVE ONLY{liveCount ? " (" + liveCount + ")" : ""}</Pill>
          {focusSet.size > 0 && <Pill active={focusOnly} onClick={() => setFocusOnly(!focusOnly)} color={C.teal}>★ FOCUS{focusCount ? " (" + focusCount + ")" : ""}</Pill>}
          {hiddenCount > 0 && <Pill active={showOutdated} onClick={() => setShowOutdated(!showOutdated)} color={C.faint}>{showOutdated ? "HIDE" : "SHOW"} HANDLED ({hiddenCount})</Pill>}
          <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: C.faint }}>{list.length} shown{activeCount - list.length > 0 ? ` · ${activeCount - list.length} filtered` : ""}{hiddenCount ? ` · ${hiddenCount} handled` : ""}</span>
        </div>
      )}

      {found.length === 0 && !radaring && <p style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>No roles yet — hit “Run Radar &amp; Score” to run your first scan.</p>}
      {found.length > 0 && list.length === 0 && !radaring && <p style={{ fontFamily: MONO, fontSize: 12, color: C.dim }}>All current roles are filtered out — loosen the filters above{hiddenCount ? `, or “show handled (${hiddenCount})”` : ""}.</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {list.map((r) => {
          const added = inCockpit(r); const mapped = !!r.research;
          return (
            <div key={r.id} style={{ border: `1px solid ${C.line}`, borderRadius: 10, background: C.panel, overflow: "hidden", opacity: (r.outdated || r.dismissed) ? .55 : 1 }}>
              <div style={{ padding: 16, display: "flex", justifyContent: "space-between", gap: 16 }}>
                <div style={{ flex: 1, display: "flex", gap: 12, minWidth: 0 }}>
                  <Logo domain={r.co && r.co.domain} name={r.company} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}><span style={{ fontSize: 17, fontWeight: 800, fontFamily: SERIF, letterSpacing: -.3 }}>{r.company}</span>{isFocus(r) && <Tag color={C.teal} text="★ FOCUS" />}{r.co && r.co.type && <Tag color={stageColor(r.co.type)} text={r.co.type} />}{r.dismissed && <Tag color={C.faint} text="DISMISSED" />}{r.outdated && !r.dismissed && <Tag color={C.faint} text="OUTDATED" />}<VerifyBadge verify={r.verify} checking={verifyBusy[r.id]} /></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6, flexWrap: "wrap" }}><ScoreBadge score={r.score} /><span style={{ fontSize: 14.5, fontWeight: 600, fontFamily: SERIF, color: C.text }}>{r.title}</span></div>
                    <div style={{ fontFamily: MONO, fontSize: 11, color: C.dim, marginBottom: r.co && (r.co.industry || r.co.size || r.co.hq || r.co.founded || r.co.funding) ? 5 : 8 }}>{r.location}{r.posted ? " · posted " + r.posted : ""}{r.source ? " · via " + r.source : ""} · found {agoLabel(r.foundAt)}</div>
                    {r.co && (r.co.industry || r.co.size || r.co.hq || r.co.founded || r.co.funding) && <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.dim, marginBottom: 8, lineHeight: 1.5 }}>{[r.co.industry, r.co.size && (r.co.size + " emp"), r.co.hq && ("HQ " + r.co.hq), r.co.founded && ("est. " + r.co.founded), r.co.funding].filter(Boolean).join("  ·  ")}</div>}
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: r.signal ? 8 : 0 }}>{r.fit}</div>
                    {r.signal && <Tag color={C.amber} text={"SIGNAL · " + r.signal} />}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch", minWidth: 168 }}>
                  <button onClick={() => add(r)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 9, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${added ? C.line : C.green}`, background: added ? "transparent" : "rgba(16,185,129,.10)", color: added ? C.dim : C.green, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: .3 }}>{added ? <Check size={14} /> : <Plus size={14} />} {added ? "IN COCKPIT" : "ADD TO COCKPIT"}</button>
                  {(r.outdated || r.dismissed)
                    ? <button onClick={() => restoreFound(r.id)} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 9, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${C.line}`, background: "transparent", color: C.faint, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: .3 }}><Undo2 size={14} /> RESTORE</button>
                    : <button onClick={() => removeFound(r.id)} title="won't come back on the next scan" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 9, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${C.amber}`, background: "rgba(243,154,14,.08)", color: C.amber, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: .3 }}><X size={14} /> NOT INTERESTED</button>}
                  <div style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                    <button onClick={() => verifyFound(r.id)} disabled={verifyBusy[r.id]} title="check if still live" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: "none", cursor: verifyBusy[r.id] ? "default" : "pointer", color: C.dim, fontFamily: MONO, fontSize: 10.5, padding: 0 }}>{verifyBusy[r.id] ? <Spin /> : <RefreshCw size={12} />} verify</button>
                    {r.link && <a href={r.link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10.5, color: C.dim, textDecoration: "none" }}><ExternalLink size={12} /> posting</a>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- 04 · Cockpit ---------------- */
function Cockpit({ targets, sel, setSelId, remove, research, draft, busy, patch, markApplied, verifyTarget, verifyBusy, markOutdated, settings, goSettings, appliedCount, goSonar, goTracker }) {
  if (!targets.length) return <Empty icon={Target} title={appliedCount ? "Cockpit clear" : "No targets yet"} desc={appliedCount ? `All caught up — your ${appliedCount} sent application${appliedCount > 1 ? "s are" : " is"} in the Tracker.` : "Add roles from Role Sonar to build your application cockpit."} action={appliedCount ? "Go to Tracker" : "Go to Role Sonar"} onClick={appliedCount ? goTracker : goSonar} />;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 18 }}>
      <div className="cs-scroll" style={{ maxHeight: 580, overflowY: "auto", display: "grid", gap: 8, alignContent: "start" }}>
        {targets.map((t) => { const state = t.drafts ? ["DRAFTED", C.teal] : t.research ? ["MAPPED", C.violet] : ["NEW", C.dim]; return (
          <button key={t.id} onClick={() => setSelId(t.id)} style={{ textAlign: "left", padding: 13, borderRadius: 10, cursor: "pointer", border: `1px solid ${sel?.id === t.id ? C.teal : C.line}`, background: sel?.id === t.id ? C.panel2 : C.panel, color: C.text }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><div style={{ fontSize: 14, fontWeight: 600, fontFamily: SERIF }}>{t.title}</div><ScoreBadge score={t.score} /></div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: C.dim, marginTop: 3 }}>{t.company}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 9, alignItems: "center" }}><span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: .5, color: state[1], border: `1px solid ${state[1]}`, borderRadius: 5, padding: "2px 6px" }}>{state[0]}</span><Dot on={!!t.research} label="icp" /><Dot on={!!t.drafts} label="draft" /></div>
          </button>); })}
      </div>
      {sel && (
        <div className="cs-scroll" style={{ maxHeight: 580, overflowY: "auto", paddingRight: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}><ScoreBadge score={sel.score} big /><div><div style={{ fontSize: 20, fontWeight: 600, fontFamily: SERIF }}>{sel.title}</div><div style={{ fontFamily: MONO, fontSize: 12, color: C.dim, marginTop: 2 }}>{sel.company} · {sel.location}</div></div></div>
            <button onClick={() => remove(sel.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: C.faint }}><Trash2 size={16} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginBottom: 16 }}>
            {sel.link && <a href={sel.link} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 11, color: C.dim, textDecoration: "none" }}><ExternalLink size={12} /> view posting</a>}
            <button onClick={() => verifyTarget(sel)} disabled={verifyBusy[sel.id]} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 11px", borderRadius: 7, cursor: verifyBusy[sel.id] ? "default" : "pointer", border: `1px solid ${C.line}`, background: C.panel2, color: C.text, fontFamily: MONO, fontSize: 10.5, letterSpacing: .5 }}>{verifyBusy[sel.id] ? <Spin /> : <RefreshCw size={12} color={C.teal} />} VERIFY STILL OPEN</button>
            <VerifyBadge verify={sel.verify} checking={verifyBusy[sel.id]} />
            {sel.verify?.note && <span style={{ fontSize: 11.5, color: C.dim }}>{sel.verify.note}</span>}
            {sel.verify?.url && sel.verify.url !== sel.link && <a href={sel.verify.url} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 10.5, color: C.teal, textDecoration: "none", display: "inline-flex", gap: 4, alignItems: "center" }}><ExternalLink size={11} /> current link</a>}
          </div>
          {!sel.research ? <Action icon={Building2} label="MAP KEY STAKEHOLDERS" desc="Research the account & map who to reach." loading={busy[sel.id] === "research"} onClick={() => research(sel)} />
            : <div style={{ marginBottom: 18 }}><Block label="SNAPSHOT" body={sel.research.snapshot} />{sel.research.signal && <Block label="SIGNAL" body={sel.research.signal} color={C.amber} />}{sel.research.why_open && <Block label="WHY THIS ROLE EXISTS" body={sel.research.why_open} />}<PersonaList personas={sel.research.personas} company={sel.company} /><div style={{ marginTop: 14 }}><div style={{ display: "flex", alignItems: "center", gap: 13, flexWrap: "wrap", padding: "13px 15px", borderRadius: 10, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.teal}`, background: C.panel2, marginBottom: 12 }}><SlidersHorizontal size={17} color={C.teal} style={{ flexShrink: 0 }} /><div style={{ display: "flex", flexDirection: "column", gap: 7 }}><span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: .8, color: C.dim, textTransform: "uppercase", fontWeight: 700 }}>Outreach style</span><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: "#fff", background: C.teal, borderRadius: 6, padding: "3px 9px" }}>{settings.msgTone}</span><span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: C.dim, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 9px" }}>{settings.msgLength}</span><span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: C.dim, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 9px" }}>{settings.msgLang === "Auto" ? "Auto language" : settings.msgLang}</span><span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: settings.msgMetrics ? C.amber : C.green, background: C.panel, border: `1px solid ${settings.msgMetrics ? C.amber : C.green}`, borderRadius: 6, padding: "3px 9px" }}>{settings.msgMetrics ? "KPIs upfront" : "No upfront KPIs"}</span></div></div><button onClick={goSettings} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.teal}`, background: C.panel, color: C.teal, fontFamily: MONO, fontSize: 10.5, letterSpacing: .5, fontWeight: 700 }}><Cog size={13} /> EDIT STYLE</button></div>{!sel.drafts ? <Action icon={Mail} label="DRAFT OUTREACH" desc="Write the messages for each key stakeholder." loading={busy[sel.id] === "draft"} onClick={() => draft(sel)} /> : <button onClick={() => draft(sel)} disabled={busy[sel.id] === "draft"} style={ghostBtn}>{busy[sel.id] === "draft" ? <Spin /> : <RefreshCw size={13} />} REGENERATE DRAFTS</button>}</div></div>}
          {sel.drafts && <Drafts target={sel} patch={patch} />}
          <div style={{ marginTop: 18, borderTop: `1px solid ${C.line}`, paddingTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button onClick={() => markApplied(sel.id)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10, cursor: "pointer", border: "none", background: C.green, color: "#fff", fontFamily: MONO, fontSize: 12.5, letterSpacing: .4, fontWeight: 700, boxShadow: "0 6px 18px rgba(16,185,129,.34)" }}><Send size={14} /> MARK AS APPLIED</button>
            <button onClick={() => markOutdated(sel)} title="role no longer online — remove and stop it resurfacing" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.line}`, background: "transparent", color: C.dim, fontFamily: MONO, fontSize: 11.5, letterSpacing: .5 }}><X size={14} /> MARK OUTDATED</button>
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint }}>dismissed &amp; in-cockpit roles leave the list and won't resurface on the next scan</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- 05 · Tracker ---------------- */
function Tracker({ targets, patch, unApply, remove, goCockpit }) {
  const [openId, setOpenId] = useState(null);
  if (!targets.length) return <Empty icon={ClipboardList} title="No applications yet" desc="When you've sent your outreach for a target, hit 'Mark as Applied' in the Cockpit and it lands here." action="Go to Cockpit" onClick={goCockpit} />;
  const sorted = [...targets].sort((a, b) => (b.appliedAt || 0) - (a.appliedAt || 0));
  const stats = [["OPEN", targets.filter((t) => OPEN_STAGES.includes(t.stage)).length, C.teal], ["INTERVIEWING", targets.filter((t) => ["Interviewing", "Final round"].includes(t.stage)).length, C.amber], ["OFFERS", targets.filter((t) => t.stage === "Offer").length, C.green], ["CLOSED", targets.filter((t) => ["Rejected", "Withdrawn"].includes(t.stage)).length, C.faint]];
  return (
    <div>
      <SectionTitle n="06" title="Application Tracker" desc="Applications you've sent — track each through to outcome." />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>{stats.map(([label, n, col]) => <div key={label} style={{ flex: "1 1 120px", border: `1px solid ${C.line}`, borderRadius: 10, padding: "12px 14px", background: C.panel }}><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: col }}>{n}</div><div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: .5, color: C.dim, marginTop: 2 }}>{label}</div></div>)}</div>
      <div style={{ display: "grid", gap: 10 }}>
        {sorted.map((t) => { const open = openId === t.id; const col = STAGE_COLOR[t.stage] || C.dim; const d = daysOpen(t.appliedAt); return (
          <div key={t.id} style={{ border: `1px solid ${C.line}`, borderLeft: `3px solid ${col}`, borderRadius: 10, background: C.panel, overflow: "hidden" }}>
            <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr auto", gap: 14, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, fontFamily: SERIF, display: "flex", gap: 9, alignItems: "center", flexWrap: "wrap" }}><ScoreBadge score={t.score} />{t.title} <span style={{ color: C.dim, fontWeight: 400, fontSize: 13, fontFamily: SANS }}>· {t.company}</span></div>
                <div style={{ display: "flex", gap: 12, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}><span style={{ fontFamily: MONO, fontSize: 10.5, color: C.dim, display: "inline-flex", gap: 5, alignItems: "center" }}><Clock size={11} /> applied {fmtDate(t.appliedAt)} · {d}d open</span>{t.link && <a href={t.link} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 10.5, color: C.dim, textDecoration: "none", display: "inline-flex", gap: 4, alignItems: "center" }}><ExternalLink size={11} /> posting</a>}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <select className="cs-sel" value={t.stage || "Applied"} onChange={(e) => patch(t.id, { stage: e.target.value })} style={{ background: C.bg, color: col, border: `1px solid ${col}`, borderRadius: 7, padding: "7px 11px", fontFamily: MONO, fontSize: 11, outline: "none", cursor: "pointer" }}>{STAGES.map((s) => <option key={s} value={s} style={{ background: C.bg, color: C.text }}>{s}</option>)}</select>
                <button onClick={() => setOpenId(open ? null : t.id)} title="next step & details" style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 7, cursor: "pointer", color: C.dim, padding: 7, display: "flex" }}>{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
              </div>
            </div>
            {open && <div style={{ borderTop: `1px solid ${C.line}`, padding: 14 }}>{t.research && Array.isArray(t.research.personas) && t.research.personas.length > 0 ? <div style={{ marginBottom: 14 }}><PersonaList personas={t.research.personas} company={t.company} /></div> : <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, marginBottom: 14, lineHeight: 1.5 }}>No key stakeholders mapped yet — open this role in the Cockpit and run “Map Key Stakeholders” to pull names &amp; LinkedIn links here.</div>}<Field label="Next step / notes" value={t.note || ""} onChange={(v) => patch(t.id, { note: v })} ph="e.g. follow up with recruiter Fri · intro call booked 12 Jun" />{t.drafts && <div style={{ marginTop: 4 }}><Drafts target={t} patch={patch} /></div>}<div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}><button onClick={() => unApply(t.id)} style={{ ...ghostBtn }}><Undo2 size={13} /> RETURN TO COCKPIT</button><button onClick={() => remove(t.id)} style={{ ...ghostBtn, border: `1px solid ${C.line}`, color: C.dim }}><Trash2 size={13} /> REMOVE</button></div></div>}
          </div>); })}
      </div>
    </div>
  );
}

/* ---------------- 06 · Settings ---------------- */
function SettingsTab({ settings, update, foundCount, clearHistory }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ maxWidth: 760 }}>
      <SectionTitle n="07" title="Settings" desc="Tune how outreach is written, and how Role Sonar scans." />

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 14, background: C.panel }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5, marginBottom: 4 }}>OUTREACH MESSAGING</div>
        <p style={{ margin: "0 0 14px", color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>How the AI writes your first-touch LinkedIn notes and emails. Applies to every draft you generate in the Cockpit.</p>

        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: .5, color: C.dim, marginBottom: 7 }}>TONE</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>{TONES.map((tn) => <Pill key={tn} active={settings.msgTone === tn} onClick={() => update({ msgTone: tn })}>{tn}</Pill>)}</div>

        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: .5, color: C.dim, marginBottom: 7 }}>LENGTH</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>{LENGTHS.map((l) => <Pill key={l} active={settings.msgLength === l} onClick={() => update({ msgLength: l })}>{l}</Pill>)}</div>

        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: .5, color: C.dim, marginBottom: 7 }}>LANGUAGE</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>{LANGS.map((l) => <Pill key={l} active={settings.msgLang === l} onClick={() => update({ msgLang: l })} color={C.violet}>{l === "Auto" ? "AUTO (match role)" : l.toUpperCase()}</Pill>)}</div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div><div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .3 }}>Lead with hard KPIs / numbers in the first message</div><p style={{ margin: "3px 0 0", color: C.dim, fontSize: 12, lineHeight: 1.5 }}>Off keeps the first touch human and narrative; metrics come later in the conversation.</p></div>
          <button onClick={() => update({ msgMetrics: !settings.msgMetrics })} style={{ flexShrink: 0, width: 52, height: 28, borderRadius: 16, border: `1px solid ${settings.msgMetrics ? C.teal : C.line}`, background: settings.msgMetrics ? C.teal : C.panel2, position: "relative", cursor: "pointer" }}><span style={{ position: "absolute", top: 2, left: settings.msgMetrics ? 26 : 2, width: 22, height: 22, borderRadius: "50%", background: settings.msgMetrics ? "#fff" : C.faint, transition: "left .15s" }} /></button>
        </div>

        <Field label="Sign-off name" hint="optional — how to sign your messages" value={settings.msgSign || ""} onChange={(v) => update({ msgSign: v })} ph="e.g. Alex" />
        <Field label="Extra guidance" hint="optional — anything the AI should always keep in mind" area value={settings.msgGuidance || ""} onChange={(v) => update({ msgGuidance: v })} ph="e.g. mention I'm open to relocating · keep it understated · no flattery" />
        <Field label="Example message (your style)" hint="optional — paste a short message you've written. The AI mirrors your voice, not the content." area value={settings.msgExample || ""} onChange={(v) => update({ msgExample: v })} ph="Paste a LinkedIn note or email you wrote yourself — tone, phrasing and sign-off will be matched." />
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 14, background: C.panel }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5, marginBottom: 4 }}>MARKET RADAR DEPTH</div>
        <p style={{ margin: "0 0 12px", color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>How many market roles each scan pulls, and how far back it looks. More = more coverage, but TheirStack charges 1 credit per role returned, so a 50-role scan ≈ 50 credits. Re-running mostly resurfaces the same top roles — the list grows as new jobs get posted, so widening the look-back surfaces more.</p>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, marginBottom: 6 }}>RESULTS PER SCAN</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>{[25, 50].map((n) => <Pill key={n} active={(settings.radarLimit || 50) === n} onClick={() => update({ radarLimit: n })}>{n} / scan</Pill>)}</div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: C.faint, marginBottom: 6 }}>LOOK BACK</div>
        <div style={{ display: "flex", gap: 8 }}>{[[30, "30 days"], [45, "45 days"], [60, "60 days"], [90, "90 days"]].map(([n, l]) => <Pill key={n} active={(settings.radarDays || 45) === n} onClick={() => update({ radarDays: n })}>{l}</Pill>)}</div>
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 14, background: C.panel }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div><div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5, marginBottom: 4 }}>VERIFY ROLES ARE LIVE DURING SCAN</div><p style={{ margin: 0, color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>Cross-checks each freshly found role against its live posting right after the scan and badges it LIVE / NOT FOUND. Strongly recommended — it stops dead listings reaching your Cockpit.</p></div>
          <button onClick={() => update({ verifyOnScan: !settings.verifyOnScan })} style={{ flexShrink: 0, width: 52, height: 28, borderRadius: 16, border: `1px solid ${settings.verifyOnScan ? C.teal : C.line}`, background: settings.verifyOnScan ? C.teal : C.panel2, position: "relative", cursor: "pointer" }}><span style={{ position: "absolute", top: 2, left: settings.verifyOnScan ? 26 : 2, width: 22, height: 22, borderRadius: "50%", background: settings.verifyOnScan ? "#fff" : C.faint, transition: "left .15s" }} /></button>
        </div>
        <p style={{ margin: "10px 0 0", fontFamily: MONO, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>Trade-off: it adds one live check per new role, so a scan is slower and costs a bit more. With this on, a lower scan breadth (3) keeps it quick. Use the “Live only” filter in Role Sonar to see just the confirmed ones.</p>
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 14, background: C.panel }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div><div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5, marginBottom: 4 }}>AUTO-SCAN ON OPEN</div><p style={{ margin: 0, color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>When on, a scan runs automatically when you open the tool if it's been more than 24h. Last scan: <b style={{ color: C.text }}>{fmtWhen(settings.lastScan)}</b>.</p></div>
          <button onClick={() => update({ autoScan: !settings.autoScan })} style={{ flexShrink: 0, width: 52, height: 28, borderRadius: 16, border: `1px solid ${settings.autoScan ? C.teal : C.line}`, background: settings.autoScan ? C.teal : C.panel2, position: "relative", cursor: "pointer" }}><span style={{ position: "absolute", top: 2, left: settings.autoScan ? 26 : 2, width: 22, height: 22, borderRadius: "50%", background: settings.autoScan ? C.bg : C.dim, transition: "left .15s" }} /></button>
        </div>
        <p style={{ margin: "10px 0 0", fontFamily: MONO, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>Note: this only fires while you have the tool open. True unattended daily scanning (even when closed, with an email digest) needs a small backend service — that's a productionization step, not something an in-app tool can do on its own.</p>
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 14, background: C.panel }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5, marginBottom: 4 }}>SCAN HISTORY</div>
        <p style={{ margin: "0 0 12px", color: C.dim, fontSize: 12.5, lineHeight: 1.5 }}>{foundCount} role{foundCount === 1 ? "" : "s"} found so far. History prevents re-finding the same roles. Clearing it means past roles can surface again on the next scan.</p>
        {!confirm ? <button onClick={() => setConfirm(true)} style={{ ...ghostBtn, border: `1px solid ${C.line}`, color: C.dim }} disabled={!foundCount}><Trash2 size={13} /> CLEAR HISTORY</button>
          : <div style={{ display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontFamily: MONO, fontSize: 11, color: C.red }}>Sure? This can't be undone.</span><button onClick={() => { clearHistory(); setConfirm(false); }} style={{ ...ghostBtn, border: `1px solid ${C.red}`, color: C.red }}>YES, CLEAR</button><button onClick={() => setConfirm(false)} style={ghostBtn}>CANCEL</button></div>}
      </div>

      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, background: C.panel2 }}>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5, marginBottom: 8, color: C.teal }}>WHAT A SCAN COSTS</div>
        <p style={{ margin: "0 0 8px", color: C.dim, fontSize: 12.5, lineHeight: 1.6 }}>Each scan is one AI request plus a few live web searches. Web search runs about $0.01 each and a scan uses a handful, so a single scan lands roughly in the <b style={{ color: C.text }}>5–15 cent</b> range; mapping a role's ICP is similar. Daily scanning is a few cents a day.</p>
        <p style={{ margin: 0, fontFamily: MONO, fontSize: 10.5, color: C.faint, lineHeight: 1.6 }}>In this in-app version the calls run through your Claude session rather than a separate bill. The cents above apply if/when this is productized on its own API key. The history/de-dup design exists precisely so you never pay twice for the same role.</p>
      </div>
    </div>
  );
}

/* ---------------- shared ---------------- */
function PersonaList({ personas, company }) {
  return (<div><div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: C.dim, margin: "14px 0 9px" }}>KEY STAKEHOLDERS</div><div style={{ display: "grid", gap: 9 }}>{(personas || []).map((p, i) => { const meta = PERSONA[p.type] || { label: p.type, sub: "", color: C.dim }; const url = "https://www.linkedin.com/search/results/people/?keywords=" + encodeURIComponent((p.linkedin_query || p.title || "") + " " + company); return (<div key={i} style={{ border: `1px solid ${C.line}`, borderLeft: `3px solid ${meta.color}`, borderRadius: 8, padding: 13, background: C.bg }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}><span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color: meta.color }}>{meta.label.toUpperCase()} · {meta.sub}</span><a href={url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", gap: 5, alignItems: "center", fontFamily: MONO, fontSize: 10.5, color: C.dim, textDecoration: "none" }}><Linkedin size={12} /> find</a></div><div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>{p.name || p.title}{p.name && p.title ? <span style={{ color: C.dim, fontWeight: 400 }}> · {p.title}</span> : null}</div>{p.hook && <div style={{ fontSize: 12.5, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>↳ {p.hook}</div>}</div>); })}</div></div>);
}
function Drafts({ target, patch }) {
  const d = target.drafts; const update = (persona, field, val) => patch(target.id, { drafts: { ...d, [persona]: { ...d[persona], [field]: val } } });
  return (<div style={{ display: "grid", gap: 14, marginTop: 6 }}>
    <MsgCard color={PERSONA.hiring_manager.color} title="Hiring Manager — economic buyer"><Editable label="LinkedIn note" value={d.hiring_manager?.linkedin || ""} onChange={(v) => update("hiring_manager", "linkedin", v)} small /></MsgCard>
    <MsgCard color={PERSONA.bridge.color} title="Future Teammate — your bridge"><Editable label="LinkedIn note" value={d.bridge?.linkedin || ""} onChange={(v) => update("bridge", "linkedin", v)} rows={3} /></MsgCard>
    <MsgCard color={PERSONA.recruiter.color} title="Recruiter / TA — process"><Editable label="LinkedIn note" value={d.recruiter?.linkedin || ""} onChange={(v) => update("recruiter", "linkedin", v)} rows={3} /></MsgCard>
  </div>);
}
function Editable({ label, value, onChange, rows = 2, small }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1400); };
  return (<div style={{ marginBottom: 11 }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}><span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: .5, color: C.dim }}>{label}{small ? ` · ${value.length} ch` : ""}</span><button onClick={copy} style={{ display: "inline-flex", gap: 5, alignItems: "center", background: "transparent", border: "none", cursor: "pointer", color: copied ? C.teal : C.faint, fontFamily: MONO, fontSize: 10.5 }}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "copied" : "copy"}</button></div><textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} style={{ width: "100%", background: C.bg, color: C.text, border: `1px solid ${C.line}`, borderRadius: 7, padding: "9px 11px", fontSize: 13, lineHeight: 1.55, fontFamily: SANS, resize: "vertical", outline: "none", boxSizing: "border-box" }} /></div>);
}

const ghostBtn = { display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 8, cursor: "pointer", border: `1px solid ${C.line}`, background: C.panel2, color: C.text, fontFamily: MONO, fontSize: 11, letterSpacing: .5 };
function Spin() { return <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />; }
function SectionTitle({ n, title, desc }) { return (<div style={{ marginBottom: 24 }}><div style={{ display: "flex", alignItems: "baseline", gap: 11 }}><span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: .5, color: C.teal }}>{n}</span><h2 style={{ margin: 0, fontSize: 29, fontWeight: 800, fontFamily: SERIF, letterSpacing: -.6, color: C.text, lineHeight: 1.1 }}>{title}</h2></div><p style={{ margin: "9px 0 0", color: C.dim, fontSize: 14, maxWidth: 660, lineHeight: 1.55 }}>{desc}</p></div>); }
function Tag({ color, text }) { return <span style={{ display: "inline-block", fontFamily: MONO, fontSize: 10.5, letterSpacing: .5, color, border: `1px solid ${color}`, borderRadius: 6, padding: "3px 8px" }}>{text}</span>; }
function Dot({ on, label }) { return <span style={{ display: "inline-flex", gap: 5, alignItems: "center", fontFamily: MONO, fontSize: 10, color: on ? C.teal : C.faint }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: on ? C.teal : C.faint }} /> {label}</span>; }
function Block({ label, body, color }) { return <div style={{ marginBottom: 10 }}><div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: .5, color: color || C.dim, marginBottom: 4 }}>{label}</div><div style={{ fontSize: 13.5, lineHeight: 1.55, color: C.text }}>{body}</div></div>; }
function Action({ icon: Icon, label, desc, loading, onClick }) { return (<button onClick={onClick} disabled={loading} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 13, padding: 15, borderRadius: 10, cursor: loading ? "default" : "pointer", border: `1px dashed ${C.teal}`, background: C.panel, color: C.text }}><div style={{ width: 34, height: 34, borderRadius: 8, display: "grid", placeItems: "center", background: C.panel2, flexShrink: 0 }}>{loading ? <Spin /> : <Icon size={17} color={C.teal} />}</div><div><div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: .5 }}>{loading ? "WORKING… ~20–40s" : label}</div><div style={{ fontSize: 12.5, color: C.dim, marginTop: 2 }}>{desc}</div></div>{!loading && <ChevronRight size={16} color={C.faint} style={{ marginLeft: "auto" }} />}</button>); }
function MsgCard({ color, title, children }) { return <div style={{ border: `1px solid ${C.line}`, borderTop: `3px solid ${color}`, borderRadius: 10, padding: 15, background: C.panel }}><div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: .5, color, marginBottom: 12 }}>{title.toUpperCase()}</div>{children}</div>; }
function Empty({ icon: Icon, title, desc, action, onClick }) { return (<div style={{ display: "grid", placeItems: "center", padding: "70px 20px", textAlign: "center" }}><div style={{ width: 52, height: 52, borderRadius: 12, display: "grid", placeItems: "center", background: C.panel, border: `1px solid ${C.line}`, marginBottom: 16 }}><Icon size={24} color={C.dim} /></div><div style={{ fontSize: 18, fontWeight: 600, fontFamily: SERIF, marginBottom: 6 }}>{title}</div><p style={{ color: C.dim, fontSize: 13.5, maxWidth: 380, lineHeight: 1.5, margin: "0 0 18px" }}>{desc}</p><button onClick={onClick} style={{ ...ghostBtn, border: `1px solid ${C.teal}` }}>{action}</button></div>); }

/* ================= LANDING PAGE + AUTH GATE ================= */

function GradText({ children, style }) {
  return <span style={{ background: GRAD, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", ...style }}>{children}</span>;
}

function Feature({ icon: Icon, title, body }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 16, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 44, height: 44, borderRadius: 11, display: "grid", placeItems: "center", background: C.panel2 }}><Icon size={22} color={C.teal} /></div>
      <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 700, letterSpacing: -.3 }}>{title}</div>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: C.dim }}>{body}</div>
    </div>
  );
}

function AuthCard({ onAuthed }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return "h" + h; };
  const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.bg, color: C.text, fontFamily: SANS, fontSize: 14, outline: "none", boxSizing: "border-box" };

  async function submit() {
    setErr(""); setBusy(true);
    try {
      const em = email.trim().toLowerCase();
      if (!em || !pw) throw new Error("Enter your email and password.");
      const accs = (await loadKey("cs_accounts", [])) || [];
      if (mode === "register") {
        if (pw.length < 6) throw new Error("Use at least 6 characters for your password.");
        if (accs.find((a) => a.email === em)) throw new Error("An account with this email already exists on this device — sign in instead.");
        accs.push({ email: em, name: name.trim(), pw: hash(pw) });
        await saveKey("cs_accounts", accs);
        await saveKey("cs_session", { email: em, name: name.trim() });
        onAuthed(em); return;
      }
      const local = accs.find((a) => a.email === em);
      if (local) {
        if (local.pw !== hash(pw)) throw new Error("Wrong password.");
        await saveKey("cs_session", { email: em, name: local.name || "" });
        onAuthed(em); return;
      }
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: em, password: pw }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) { await saveKey("cs_session", { email: em }); onAuthed(em); return; }
      throw new Error(data.error || "Email or password not recognized.");
    } catch (e) { setErr(e.message); setBusy(false); }
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 18, padding: 28, boxShadow: "0 24px 60px rgba(20,24,60,.10)", width: "100%", maxWidth: 400 }}>
      <div style={{ display: "flex", gap: 4, background: C.panel2, borderRadius: 10, padding: 4, marginBottom: 22 }}>
        {[["signin", "Sign in"], ["register", "Create account"]].map(([m, label]) => (
          <button key={m} onClick={() => { setMode(m); setErr(""); }} style={{ flex: 1, padding: "9px 0", borderRadius: 7, border: "none", cursor: "pointer", fontFamily: MONO, fontSize: 12.5, fontWeight: 700, letterSpacing: .3, background: mode === m ? C.panel : "transparent", color: mode === m ? C.teal : C.dim, boxShadow: mode === m ? "0 1px 3px rgba(0,0,0,.06)" : "none" }}>{label}</button>
        ))}
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {mode === "register" && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" style={inp} />}
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" style={inp} onKeyDown={(e) => e.key === "Enter" && submit()} />
        <input value={pw} onChange={(e) => setPw(e.target.value)} type="password" placeholder="Password" style={inp} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div style={{ fontSize: 12.5, color: C.red, display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.45 }}><AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {err}</div>}
        <button onClick={submit} disabled={busy} style={{ marginTop: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, padding: "13px 18px", borderRadius: 11, border: "none", cursor: busy ? "default" : "pointer", background: GRAD, color: "#fff", fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: .4, boxShadow: "0 8px 22px rgba(109,74,255,.35)", opacity: busy ? .6 : 1 }}>
          {busy ? <Loader2 size={16} className="cs-spin-ld" /> : <ArrowRight size={16} />} {mode === "register" ? "CREATE ACCOUNT" : "SIGN IN"}
        </button>
      </div>
      <div style={{ marginTop: 16, fontSize: 11.5, color: C.faint, lineHeight: 1.5, display: "flex", gap: 7 }}><Lock size={13} style={{ flexShrink: 0, marginTop: 1 }} /> Private access — you need an account to enter the tool. Your session stays on this device.</div>
    </div>
  );
}

function Showcase() {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "absolute", inset: "-6% 8% 2%", background: GRAD, filter: "blur(80px)", opacity: .15, borderRadius: 50, zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 940, margin: "0 auto", borderRadius: 16, border: `1px solid ${C.line}`, background: C.panel, boxShadow: "0 34px 90px rgba(20,24,60,.18)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 15px", borderBottom: `1px solid ${C.line}`, background: C.panel2 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FF5F57" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#FEBC2E" }} />
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#28C840" }} />
          <span style={{ marginLeft: 12, fontFamily: MONO, fontSize: 11, color: C.faint, letterSpacing: .3 }}>careersonar.ai</span>
        </div>
        <img src="/hero-screenshot.png" alt="Career Sonar — the Role Sonar scoring live job matches against your profile" onError={() => setOk(false)} style={{ display: "block", width: "100%", height: "auto" }} />
      </div>
    </div>
  );
}

function Landing({ onAuthed }) {
  const features = [
    [Search, "Screens the whole market for you", "Set your profile, experience, goals and preferences once. Career Sonar scans the market and surfaces the roles that actually fit — so you stop sifting through job boards."],
    [Gauge, "Tells you how well each role fits", "Every opening gets a 0–100 fit score built from YOUR background and goals — not keyword matching — with a plain-language reason. Spend energy only where it counts."],
    [Users, "Reach the people, not the void", "For each role it researches the team behind it and maps the key stakeholders — hiring manager, an internal bridge, the recruiter — with direct links to find them."],
    [Send, "Personal, not anonymous", "It drafts tailored outreach in your own voice, so you arrive as a person with a point of view — not application #4,072 in a faceless pile."],
  ];
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SANS }}>
      <style>{`
        @keyframes cs-spin-ld{to{transform:rotate(360deg)}}
        .cs-spin-ld{animation:cs-spin-ld .8s linear infinite}
        @keyframes cs-ping2{0%{transform:scale(.6);opacity:.4}80%,100%{transform:scale(2.2);opacity:0}}
        .cs-land input::placeholder{color:${C.faint}}
        .cs-land input:focus{border-color:${C.teal}}
        .cs-hero{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);gap:48px;align-items:center;padding:40px 0 64px}
        @media(max-width:860px){.cs-hero{grid-template-columns:1fr;gap:34px;padding:20px 0 44px}.cs-h1{font-size:36px !important;letter-spacing:-1px !important}.cs-sub{font-size:16px !important}}
      `}</style>
      <div className="cs-land" style={{ maxWidth: 1140, margin: "0 auto", padding: "0 22px" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "26px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ position: "relative", width: 56, height: 56, display: "grid", placeItems: "center" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${C.teal}`, animation: "cs-ping2 2.6s cubic-bezier(0,0,.2,1) infinite" }} />
              <Radar size={40} color={C.teal} />
            </div>
            <div>
              <GradText style={{ fontFamily: SERIF, letterSpacing: -.9, fontSize: 33, fontWeight: 800, lineHeight: 1 }}>Career Sonar</GradText>
              <div style={{ fontFamily: MONO, fontSize: 11, color: C.dim, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 600, marginTop: 4 }}>find roles · reach the right people</div>
            </div>
          </div>
          <a href="#start" style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: C.teal, textDecoration: "none" }}>Sign in →</a>
        </header>

        <section id="start" className="cs-hero">
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 99, border: `1px solid ${C.line}`, background: C.panel, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.teal, marginBottom: 22 }}><Sparkles size={13} /> AI JOB-SEARCH RADAR</div>
            <h1 className="cs-h1" style={{ fontFamily: SERIF, fontSize: 50, lineHeight: 1.05, letterSpacing: -1.5, fontWeight: 800, margin: "0 0 20px" }}>The right roles find <GradText>you</GradText> — before you go looking.</h1>
            <p className="cs-sub" style={{ fontSize: 18, lineHeight: 1.6, color: C.dim, maxWidth: 540, margin: "0 0 26px" }}>Career Sonar is your AI job-search radar. It scans the market against your profile, experience and goals, scores how well each role fits, and helps you reach the people behind it — so your search is faster, sharper and personal.</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {["Easier", "Faster", "More efficient"].map((t) => (
                <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 99, background: C.panel, border: `1px solid ${C.line}`, fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color: C.text }}><Check size={14} color={C.green} /> {t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "center" }}><AuthCard onAuthed={onAuthed} /></div>
        </section>

        <section style={{ padding: "4px 0 64px" }}>
          <p style={{ textAlign: "center", fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: 1, color: C.faint, textTransform: "uppercase", margin: "0 0 22px" }}>Every fitting role, scored against your profile — in one view</p>
          <Showcase />
        </section>

        <section style={{ textAlign: "center", padding: "10px 0 50px" }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 30, letterSpacing: -.8, fontWeight: 800, margin: "0 0 14px" }}>Job searching is broken. <GradText>This fixes it.</GradText></h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: C.dim, maxWidth: 640, margin: "0 auto" }}>Endless scrolling, generic applications, no idea who's on the other side. Career Sonar turns the hunt into a focused, intelligent process — driven by your goals, not the job board's.</p>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 18, paddingBottom: 60 }}>
          {features.map(([Icon, title, body]) => <Feature key={title} icon={Icon} title={title} body={body} />)}
        </section>

        <section style={{ paddingBottom: 70 }}>
          <h2 style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: -.6, fontWeight: 800, textAlign: "center", margin: "0 0 34px" }}>From profile to a personal reach-out — in minutes</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18 }}>
            {[["01", "Tell it who you are", "Your experience, goals, target roles, industries and where you'll work."], ["02", "Let the radar run", "It scans the market and your focus companies, then scores every match for fit."], ["03", "Reach the right people", "Get the key stakeholders and a tailored, in-your-voice message for each role."]].map(([n, t, b]) => (
              <div key={n} style={{ padding: 22 }}>
                <GradText style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 800 }}>{n}</GradText>
                <div style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 700, margin: "8px 0 7px" }}>{t}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: C.dim }}>{b}</div>
              </div>
            ))}
          </div>
        </section>

        <footer style={{ borderTop: `1px solid ${C.line}`, padding: "22px 0 40px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, fontFamily: MONO, fontSize: 11.5, color: C.faint }}>
          <span>Career Sonar · your AI job-search radar</span>
          <span>Built for a focused, personal job search.</span>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null); // null = checking session
  useEffect(() => { (async () => { const s = await loadKey("cs_session", null); setAuthed(s && s.email ? s : false); })(); }, []);
  if (authed === null) return <div style={{ minHeight: "100vh", background: C.bg }} />;
  if (!authed) return <Landing onAuthed={(em) => setAuthed({ email: em })} />;
  return <Tool signedInEmail={authed.email} onSignOut={async () => { await saveKey("cs_session", null); setAuthed(false); }} />;
}
