// POST /api/phone/check { phone, code } -> marks the member's mobile as verified when the code is right.
import { json, getMember, rateLimited, sha256Hex, audit } from "../../_lib.js";
import { smsEnabled, normalisePhone, checkCode } from "../../_sms.js";

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  if (!smsEnabled(env)) return json({ error: "Mobile verification is not switched on yet." }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const phone = normalisePhone(b.phone), code = String(b.code || "").trim();
  if (!phone || !/^\d{4,8}$/.test(code)) return json({ error: "Please enter the number and the code from the SMS", field: "code" }, 422);
  if (await rateLimited(env, `smscheck:${me.id}`, 8, 3600)) return json({ error: "Too many attempts. Please try again in an hour." }, 429);
  const r = await checkCode(env, phone, code);
  if (!r.ok || r.data.status !== "approved") return json({ error: "That code is not right or has expired.", field: "code" }, 422);
  const hash = await sha256Hex(phone);
  try {
    await env.DB.prepare(`INSERT INTO phones (member_id, phone_hash) VALUES (?1, ?2) ON CONFLICT(member_id) DO UPDATE SET phone_hash = ?2, verified_at = datetime('now')`).bind(me.id, hash).run();
  } catch { return json({ error: "This number is already linked to another account." }, 409); }
  await env.DB.prepare(
    `INSERT INTO verifications (member_id, level, status, reviewed_by, reviewed_at) VALUES (?1, 'mobile', 'verified', 'system', datetime('now'))
     ON CONFLICT(member_id, level) DO UPDATE SET status = 'verified', reviewed_by = 'system', reviewed_at = datetime('now')`
  ).bind(me.id).run();
  await audit(env, `member:${me.id}`, "mobile_verified", "mobile number verified");
  return json({ ok: true });
}
