// api/auth.js — Career Sonar sign-in gate
// Validates the owner login against environment variables, so the password
// is NEVER stored in the (public) source code.
//
// Set these in Vercel → Project → Settings → Environment Variables:
//   CS_AUTH_EMAIL     = mail@alexanderpenk.de
//   CS_AUTH_PASSWORD  = CareerSonar
//
// Multiple owner logins are supported via comma-separated lists, paired by position:
//   CS_AUTH_EMAIL    = me@x.com,team@x.com
//   CS_AUTH_PASSWORD = pwOne,pwTwo
//
// This is a lightweight gate for a personal tool — not hardened multi-user auth.
// POST { email, password } -> 200 { ok:true }  |  401 { ok:false }  |  500 { error }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const em = String(body.email || "").trim().toLowerCase();
    const pw = String(body.password || "");

    const cfgEmail = (process.env.CS_AUTH_EMAIL || "").trim().toLowerCase();
    const cfgPass = process.env.CS_AUTH_PASSWORD || "";
    if (!cfgEmail || !cfgPass) {
      return res.status(500).json({ error: "Sign-in is not configured yet. Add CS_AUTH_EMAIL and CS_AUTH_PASSWORD in your Vercel environment variables." });
    }
    if (!em || !pw) return res.status(400).json({ ok: false, error: "Enter your email and password." });

    const emails = cfgEmail.split(",").map((s) => s.trim()).filter(Boolean);
    const passes = cfgPass.split(",").map((s) => s);
    const idx = emails.indexOf(em);
    const match = idx !== -1 && (passes[idx] === pw || (passes.length === 1 && passes[0] === pw));

    if (match) return res.status(200).json({ ok: true });
    return res.status(401).json({ ok: false, error: "Email or password not recognized." });
  } catch (e) {
    return res.status(500).json({ error: String((e && e.message) || e) });
  }
}
