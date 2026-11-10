// POST /api/auth/request  { email }  -> emails a 6-digit sign-in code (valid 10 minutes).
// Always answers "ok" so the form cannot be used to discover which emails are registered.
import { json, sha256Hex } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const email = String(b.email || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid email address" }, 400);

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM login_codes WHERE email = ?1 AND created_at > datetime('now','-10 minutes')`
  ).bind(email).first();
  if (recent.c >= 3) return json({ ok: true }); // quietly stop after 3 codes in 10 minutes

  const n = new Uint32Array(1); crypto.getRandomValues(n);
  const code = String(n[0] % 1000000).padStart(6, "0");
  const hash = await sha256Hex(`${email}:${code}:${env.AUTH_SECRET}`);

  await env.DB.prepare(
    `INSERT INTO login_codes (email, code_hash, expires_at) VALUES (?1, ?2, datetime('now','+10 minutes'))`
  ).bind(email, hash).run();

  if (env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from: env.MAIL_FROM || "Salaamify <peace@pioushalf.com>",
        to: [email],
        subject: `Your Salaamify code: ${code}`,
        text: `Assalamu alaikum,\n\nYour Salaamify sign-in code is ${code}. It works for 10 minutes.\n\nIf you did not ask for this, you can ignore this email.\n\nSalaamify, A Gift of Peace`,
      }),
    });
    if (!r.ok) return json({ error: "We could not send the email. Please try again shortly." }, 502);
  }
  return json({ ok: true });
}
