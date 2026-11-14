// POST /api/auth/verify  { email, code }  -> checks the code, creates the member if new, starts a 30-day session.
import { json, sha256Hex, randomHex, rateLimited, clientIp } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (await rateLimited(env, "verify:" + clientIp(request), 30, 3600)) return json({ error: "Too many attempts. Please try again in an hour." }, 429);
  const email = String(b.email || "").trim().toLowerCase();
  const code = String(b.code || "").trim();
  if (!email || !/^\d{6}$/.test(code)) return json({ error: "Enter the 6-digit code" }, 400);

  const row = await env.DB.prepare(
    `SELECT * FROM login_codes WHERE email = ?1 AND used_at IS NULL AND expires_at > datetime('now') ORDER BY id DESC LIMIT 1`
  ).bind(email).first();
  if (!row) return json({ error: "That code has expired. Please ask for a new one." }, 400);
  if (row.attempts >= 5) return json({ error: "Too many attempts. Please ask for a new code." }, 429);

  await env.DB.prepare(`UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?1`).bind(row.id).run();
  const hash = await sha256Hex(`${email}:${code}:${env.AUTH_SECRET}`);
  if (hash !== row.code_hash) return json({ error: "That code is not correct" }, 400);

  await env.DB.prepare(`UPDATE login_codes SET used_at = datetime('now') WHERE id = ?1`).bind(row.id).run();
  await env.DB.prepare(
    `INSERT INTO members (email, email_verified_at) VALUES (?1, datetime('now'))
     ON CONFLICT(email) DO UPDATE SET email_verified_at = COALESCE(email_verified_at, datetime('now'))`
  ).bind(email).run();
  const member = await env.DB.prepare(`SELECT id, status FROM members WHERE email = ?1`).bind(email).first();
  if (member.status !== "active") return json({ error: "This account is not active. Contact support." }, 403);

  await env.DB.prepare(
    `INSERT INTO verifications (member_id, level, status, reviewed_by, reviewed_at) VALUES (?1, 'email', 'verified', 'system', datetime('now'))
     ON CONFLICT(member_id, level) DO UPDATE SET status = 'verified', reviewed_by = 'system', reviewed_at = datetime('now')`
  ).bind(member.id).run();

  const token = randomHex(32);
  await env.DB.prepare(
    `INSERT INTO sessions (token_hash, member_id, expires_at) VALUES (?1, ?2, datetime('now','+30 days'))`
  ).bind(await sha256Hex(token), member.id).run();

  return json({ ok: true }, 200, {
    "set-cookie": `sal_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
  });
}
