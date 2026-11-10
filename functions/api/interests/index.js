// GET  /api/interests               -> introductions I sent and the ones waiting for me.
// POST /api/interests { to_member_id, message } -> send an interest. It then needs both guardians and the recipient to agree.
import { json, getMember, findContactInfo, guardianVerified, hasActiveMembership, notifyGuardians } from "../../_lib.js";

const OTHER = `p.display_name, p.age, p.city, p.country, p.profession, p.education, p.religious_commitment, p.prayer_consistency`;

export async function onRequestGet({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);

  const sent = await env.DB.prepare(
    `SELECT i.id, i.status, i.message, i.created_at, (SELECT id FROM rooms WHERE interest_id = i.id) AS room_id, i.to_member_id AS other_id, ${OTHER}
     FROM interests i JOIN profiles p ON p.member_id = i.to_member_id WHERE i.from_member_id = ?1 ORDER BY i.id DESC LIMIT 100`
  ).bind(me.id).all();
  // A recipient only sees an introduction once both guardians have approved it.
  const received = await env.DB.prepare(
    `SELECT i.id, i.status, i.message, i.created_at, (SELECT id FROM rooms WHERE interest_id = i.id) AS room_id, i.from_member_id AS other_id, ${OTHER}
     FROM interests i JOIN profiles p ON p.member_id = i.from_member_id
     WHERE i.to_member_id = ?1 AND i.status IN ('awaiting_recipient','approved') ORDER BY i.id DESC LIMIT 100`
  ).bind(me.id).all();
  return json({ sent: sent.results, received: received.results });
}

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const toId = Number(b.to_member_id);
  const message = String(b.message || "").trim();
  if (!Number.isInteger(toId) || toId === me.id) return json({ error: "Choose a profile to send your interest to" }, 400);
  if (message.length > 400) return json({ error: "Please keep your message under 400 characters", field: "message" }, 422);
  const hit = findContactInfo(message);
  if (hit) {
    await env.DB.prepare(`INSERT INTO audit_log (actor, action, detail) VALUES (?1, 'contact_blocked', ?2)`).bind(`member:${me.id}`, `interest message: ${hit}`).run();
    return json({ error: `Please remove ${hit}. Contact details can only be shared after both guardians approve.`, field: "message" }, 422);
  }

  if (!me.gender || !(await env.DB.prepare(`SELECT 1 AS ok FROM profiles WHERE member_id = ?1`).bind(me.id).first()))
    return json({ error: "Please complete your profile first" }, 400);
  if (!(await guardianVerified(env, me.id))) return json({ error: "Add a guardian and wait for them to accept before sending interest" }, 403);
  if (env.REQUIRE_MEMBERSHIP === "1" && !(await hasActiveMembership(env, me.email))) return json({ error: "An active membership is needed to send interest" }, 402);

  const target = await env.DB.prepare(`SELECT id, gender, status FROM members WHERE id = ?1`).bind(toId).first();
  const targetProfile = target && await env.DB.prepare(`SELECT 1 AS ok FROM profiles WHERE member_id = ?1`).bind(toId).first();
  if (!target || target.status !== "active" || !targetProfile || !target.gender || target.gender === me.gender || !(await guardianVerified(env, toId)))
    return json({ error: "This profile is not available" }, 404);

  const open = await env.DB.prepare(
    `SELECT id FROM interests WHERE ((from_member_id = ?1 AND to_member_id = ?2) OR (from_member_id = ?2 AND to_member_id = ?1))
       AND (status NOT IN ('declined','withdrawn') OR updated_at > datetime('now','-30 days')) LIMIT 1`
  ).bind(me.id, toId).first();
  if (open) return json({ error: "There is already an introduction between you two" }, 409);

  const today = await env.DB.prepare(`SELECT COUNT(*) AS c FROM interests WHERE from_member_id = ?1 AND created_at > datetime('now','-1 day')`).bind(me.id).first();
  if (today.c >= 5) return json({ error: "You can send up to 5 interests a day. Please try again tomorrow." }, 429);

  await env.DB.prepare(`INSERT INTO interests (from_member_id, to_member_id, message) VALUES (?1, ?2, ?3)`).bind(me.id, toId, message || null).run();
  await notifyGuardians(env, me.id, "An introduction is waiting for your approval", "A new introduction request needs your review.");
  return json({ ok: true });
}
