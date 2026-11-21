// POST /api/phone/start { phone } -> sends a 6-digit code by SMS to a signed-in member.
import { json, getMember, rateLimited, sha256Hex } from "../../_lib.js";
import { smsEnabled, normalisePhone, sendCode } from "../../_sms.js";

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  if (!smsEnabled(env)) return json({ error: "Mobile verification is not switched on yet. Please check back soon." }, 503);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const phone = normalisePhone(b.phone);
  if (!phone) return json({ error: "Please enter a valid mobile number, for example 98XXXXXXXX or +9715XXXXXXXX", field: "phone" }, 422);
  const hash = await sha256Hex(phone);
  const taken = await env.DB.prepare(`SELECT member_id FROM phones WHERE phone_hash = ?1`).bind(hash).first();
  if (taken && taken.member_id !== me.id) return json({ error: "This number is already linked to another account.", field: "phone" }, 409);
  if (await rateLimited(env, `sms:m:${me.id}`, 4, 3600) || await rateLimited(env, `sms:p:${hash}`, 4, 3600)) return json({ error: "Too many codes requested. Please try again in an hour." }, 429);
  const r = await sendCode(env, phone);
  if (!r.ok) return json({ error: "We could not send the code. Please check the number and try again." }, 502);
  return json({ ok: true });
}
