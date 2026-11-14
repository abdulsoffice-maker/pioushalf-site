// Shared helpers for the Salaamify API. Files starting with "_" are not exposed as routes.

export const json = (obj, status = 200, headers = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function randomHex(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, "0")).join("");
}

// Returns the signed-in member row, or null.
export async function getMember(request, env) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)sal_session=([a-f0-9]{64})/);
  if (!m) return null;
  const hash = await sha256Hex(m[1]);
  return await env.DB.prepare(
    `SELECT m.* FROM sessions s JOIN members m ON m.id = s.member_id
     WHERE s.token_hash = ?1 AND s.expires_at > datetime('now') AND m.status = 'active'`
  ).bind(hash).first();
}

// Trust score: 100 points across the five verification levels.
export const TRUST_POINTS = { email: 20, mobile: 20, identity: 25, photo: 15, guardian: 20 };
export const LEVELS = Object.keys(TRUST_POINTS);
export function trustScore(rows) {
  return rows.filter(r => r.status === "verified").reduce((s, r) => s + (TRUST_POINTS[r.level] || 0), 0);
}

// ---- Contact-detail detection -------------------------------------------------
// Catches phone numbers (digits, spaced digits, English and Hindi/Urdu number words, o-for-zero), emails (including
// "name at gmail dot com" and UPI-style ids), links, social handles, and "my instagram id is ..." style sharing,
// including apps spelled with spaces ("w h a t s a p p"). Returns a short label, or null if the text is clean.
// This is a pattern check, so a determined person can still disguise details. Guardians see every message.
const W = { zero: "0", oh: "0", shunya: "0", sifar: "0", one: "1", ek: "1", two: "2", do: "2", three: "3", teen: "3",
  four: "4", char: "4", chaar: "4", five: "5", panch: "5", paanch: "5", six: "6", chhe: "6", seven: "7", saat: "7",
  eight: "8", aath: "8", nine: "9", nau: "9" };
const NUMWORDS = Object.keys(W).join("|");
const spaced = word => word.split("").join("[\\s._\\-*]*");
const APPS = ["whatsapp", "telegram", "instagram", "insta", "snapchat", "facebook", "tiktok", "signal", "wechat", "viber", "linkedin", "twitter", "skype", "fb"];
const APP_RE = new RegExp("\\b(" + APPS.map(spaced).join("|") + ")\\b", "i");
const CONTEXT_RE = /\b(id|number|no\.?|handle|dm|contact|add me|message me|msg me|reach me|call me|find me|username|profile|link)\b/i;

export function findContactInfo(text) {
  const t = String(text || "");
  if (!t.trim()) return null;

  if (/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\]|\bat\b)\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\]|\bdot\b)\s*[a-z]{2,}/i.test(t)) return "an email address";
  if (/\b(gmail|yahoo|hotmail|outlook|icloud|proton(mail)?|rediff(mail)?)\s*(\.|\(dot\)|\bdot\b)\s*(com|in|net|co)\b/i.test(t)) return "an email address";
  if (/[a-z0-9._-]{2,}@[a-z0-9]{2,}/i.test(t)) return "an email address or payment ID";
  if (/(https?:\/\/|www\.)\S+/i.test(t) || /\b[a-z0-9-]{2,}\.(com|in|net|org|me|io|co|app|xyz|info|link)\b/i.test(t)) return "a website or link";
  if (/(^|\s)@[a-z0-9_.]{3,}/i.test(t)) return "a social media handle";
  if (APP_RE.test(t) && CONTEXT_RE.test(t)) return "a social media contact";

  // Turn written-out numbers into digits, then look for a long run of digits.
  const n = t.toLowerCase()
    .replace(new RegExp(`\\b(double|triple)[\\s-]+(${NUMWORDS}|\\d)\\b`, "g"), (m, a, b) => (W[b] ?? b).repeat(a === "double" ? 2 : 3))
    .replace(new RegExp(`\\b(${NUMWORDS})\\b`, "g"), w => W[w])
    .replace(/(\d)([\s._\-]*)o(?=[\s._\-]*\d)/g, "$10");
  if (/(\d[\s().\-_,*]*){8,}/.test(n)) return "a phone number";
  return null;
}

// ---- Email via Resend (silently skipped if no key is set, e.g. in local tests) ----
export async function sendMail(env, { to, subject, text }) {
  if (!env.RESEND_API_KEY) return true;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: env.MAIL_FROM || "Salaamify <peace@pioushalf.com>", to: [to], subject, text }),
  });
  return r.ok;
}

export const siteUrl = env => env.SITE_URL || "https://pioushalf.com";

// Trust score as SQL, for lists.
export const TRUST_SQL = `(SELECT COALESCE(SUM(CASE v.level WHEN 'email' THEN 20 WHEN 'mobile' THEN 20 WHEN 'identity' THEN 25 WHEN 'photo' THEN 15 WHEN 'guardian' THEN 20 ELSE 0 END),0)
  FROM verifications v WHERE v.member_id = p.member_id AND v.status = 'verified')`;

export async function hasActiveMembership(env, email) {
  const r = await env.DB.prepare(
    `SELECT 1 AS ok FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE c.email = ?1 AND o.status = 'paid' AND o.membership_end >= date('now') LIMIT 1`
  ).bind(email).first();
  return !!r;
}

export async function guardianVerified(env, memberId) {
  const r = await env.DB.prepare(`SELECT 1 AS ok FROM verifications WHERE member_id = ?1 AND level = 'guardian' AND status = 'verified'`).bind(memberId).first();
  return !!r;
}

// ---- Notifications. Emails never contain names or profile details, only a prompt to sign in. ----
export async function notifyGuardians(env, memberId, subject, text) {
  try {
    const { results } = await env.DB.prepare(`SELECT email, name FROM guardians WHERE member_id = ?1 AND status = 'active'`).bind(memberId).all();
    for (const g of results) {
      await sendMail(env, { to: g.email, subject, text: `Assalamu alaikum ${g.name},\n\n${text}\n\nReview it here: ${siteUrl(env)}/guardian.html\n\nSalaamify, A Gift of Peace` });
    }
  } catch {}
}

export async function notifyMember(env, memberId, subject, text) {
  try {
    const m = await env.DB.prepare(`SELECT email FROM members WHERE id = ?1`).bind(memberId).first();
    if (m) await sendMail(env, { to: m.email, subject, text: `Assalamu alaikum,\n\n${text}\n\nOpen your dashboard: ${siteUrl(env)}/dashboard.html\n\nSalaamify, A Gift of Peace` });
  } catch {}
}

// ---- Discussion Rooms ----
// Who may see a room: the two members, and an active guardian of either. Guardians count for the sender side first,
// so one person guarding both sides cannot satisfy both sides' "guardian has joined" rule.
export async function roomAccess(env, roomId, me) {
  const room = await env.DB.prepare(`SELECT * FROM rooms WHERE id = ?1`).bind(roomId).first();
  if (!room) return null;
  if (me.id === room.sender_id) return { room, role: "member", side: "sender" };
  if (me.id === room.recipient_id) return { room, role: "member", side: "recipient" };
  const g = await env.DB.prepare(
    `SELECT member_id FROM guardians WHERE guardian_member_id = ?1 AND status = 'active' AND member_id IN (?2, ?3)
     ORDER BY CASE WHEN member_id = ?2 THEN 0 ELSE 1 END LIMIT 1`
  ).bind(me.id, room.sender_id, room.recipient_id).first();
  if (!g) return null;
  return { room, role: "guardian", side: g.member_id === room.sender_id ? "sender" : "recipient" };
}

// Sides that currently have an active guardian who has joined.
export async function joinedSides(env, room) {
  const { results } = await env.DB.prepare(
    `SELECT DISTINCT j.side FROM room_guardian_joins j
     JOIN guardians g ON g.guardian_member_id = j.guardian_member_id AND g.status = 'active'
       AND g.member_id = CASE j.side WHEN 'sender' THEN ?2 ELSE ?3 END
     WHERE j.room_id = ?1`
  ).bind(room.id, room.sender_id, room.recipient_id).all();
  return new Set(results.map(r => r.side));
}

export async function systemMessage(env, roomId, body) {
  await env.DB.prepare(`INSERT INTO room_messages (room_id, kind, body) VALUES (?1, 'system', ?2)`).bind(roomId, body).run();
}

export async function roomLabels(env, room) {
  const labels = {};
  for (const id of [room.sender_id, room.recipient_id]) {
    const p = await env.DB.prepare(`SELECT p.display_name, m.gender FROM members m LEFT JOIN profiles p ON p.member_id = m.id WHERE m.id = ?1`).bind(id).first();
    labels[id] = `${(p && p.display_name) || "Member"} (${p && p.gender === "sister" ? "Sister" : "Brother"})`;
  }
  const { results } = await env.DB.prepare(
    `SELECT guardian_member_id AS gid, name FROM guardians WHERE status = 'active' AND member_id IN (?1, ?2)`
  ).bind(room.sender_id, room.recipient_id).all();
  for (const g of results) if (!labels[g.gid]) labels[g.gid] = `${g.name} (Guardian)`;
  return labels;
}

// ---- Admin ----
// Admins are members whose email is in the ADMIN_EMAILS variable (comma separated) or whose role is 'admin'.
// With ADMIN_EMAILS empty and no admin rows, nobody is an admin.
export function isAdmin(member, env) {
  if (!member) return false;
  if (member.role === "admin") return true;
  const list = String(env.ADMIN_EMAILS || "").toLowerCase().split(",").map(x => x.trim()).filter(Boolean);
  return list.includes(String(member.email).toLowerCase());
}

// Returns { me } for an admin, or { resp } with the right 401/403 response.
export async function adminGate(request, env) {
  const me = await getMember(request, env);
  if (!me) return { resp: json({ error: "Not signed in" }, 401) };
  if (!isAdmin(me, env)) return { resp: json({ error: "Not allowed" }, 403) };
  return { me };
}

export async function audit(env, actor, action, detail) {
  await env.DB.prepare(`INSERT INTO audit_log (actor, action, detail) VALUES (?1, ?2, ?3)`).bind(actor, action, detail ?? null).run();
}

// CSV cell that is safe to open in Excel or Google Sheets (a leading = + - @ would be run as a formula).
export function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Simple built-in rate limit: returns true when this key has made `max` hits in the last `seconds`. Otherwise records a hit.
export async function rateLimited(env, key, max, seconds) {
  try {
    const r = await env.DB.prepare(`SELECT COUNT(*) AS c FROM rate_hits WHERE key = ?1 AND created_at > datetime('now', ?2)`).bind(key, `-${seconds} seconds`).first();
    if (r.c >= max) return true;
    await env.DB.prepare(`INSERT INTO rate_hits (key) VALUES (?1)`).bind(key).run();
  } catch {}
  return false;
}
export const clientIp = request => request.headers.get("cf-connecting-ip") || "unknown";
