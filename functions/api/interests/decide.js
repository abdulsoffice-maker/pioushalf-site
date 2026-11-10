// POST /api/interests/decide { id, decision }
//   decision: approve | decline (guardians and the recipient), accept (recipient), withdraw (sender)
// Flow: sender's guardian -> recipient's guardian -> recipient -> approved (Discussion Room opens in the next release).
import { json, getMember, notifyGuardians, notifyMember, systemMessage } from "../../_lib.js";

async function isGuardianOf(env, guardianId, wardId) {
  const r = await env.DB.prepare(`SELECT 1 AS ok FROM guardians WHERE member_id = ?1 AND guardian_member_id = ?2 AND status = 'active'`).bind(wardId, guardianId).first();
  return !!r;
}

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const i = await env.DB.prepare(`SELECT * FROM interests WHERE id = ?1`).bind(Number(b.id)).first();
  if (!i) return json({ error: "Not found" }, 404);
  const d = b.decision;
  let next = null, by = null;

  if (d === "withdraw") {
    if (i.from_member_id !== me.id || ["declined", "withdrawn", "approved"].includes(i.status)) return json({ error: "You cannot withdraw this" }, 403);
    next = "withdrawn"; by = "sender";
  } else if (i.status === "awaiting_sender_guardian" && (d === "approve" || d === "decline") && await isGuardianOf(env, me.id, i.from_member_id)) {
    next = d === "approve" ? "awaiting_recipient_guardian" : "declined"; by = "sender_guardian";
  } else if (i.status === "awaiting_recipient_guardian" && (d === "approve" || d === "decline") && await isGuardianOf(env, me.id, i.to_member_id)) {
    next = d === "approve" ? "awaiting_recipient" : "declined"; by = "recipient_guardian";
  } else if (i.status === "awaiting_recipient" && i.to_member_id === me.id && (d === "accept" || d === "decline")) {
    next = d === "accept" ? "approved" : "declined"; by = "recipient";
  } else {
    return json({ error: "That action is not available right now" }, 403);
  }

  // The status check in WHERE stops two people deciding the same step at once.
  const r = await env.DB.prepare(
    `UPDATE interests SET status = ?1, declined_by = ?2, updated_at = datetime('now') WHERE id = ?3 AND status = ?4`
  ).bind(next, ["declined", "withdrawn"].includes(next) ? by : null, i.id, i.status).run();
  if (r.meta && r.meta.changes === 0) return json({ error: "This introduction was just updated. Please refresh." }, 409);

  await env.DB.prepare(`INSERT INTO audit_log (actor, action, detail) VALUES (?1, 'interest_decision', ?2)`)
    .bind(`member:${me.id}`, `interest ${i.id}: ${i.status} -> ${next}`).run();
  if (next === "awaiting_recipient_guardian") await notifyGuardians(env, i.to_member_id, "An introduction is waiting for your approval", "An introduction request for the person you look after needs your review.");
  if (next === "awaiting_recipient") await notifyMember(env, i.to_member_id, "An introduction is waiting for your reply", "Both guardians have approved an introduction. You can now accept or decline it.");
  if (next === "approved") {
    await env.DB.prepare(`INSERT OR IGNORE INTO rooms (interest_id, sender_id, recipient_id) VALUES (?1, ?2, ?3)`).bind(i.id, i.from_member_id, i.to_member_id).run();
    const room = await env.DB.prepare(`SELECT id FROM rooms WHERE interest_id = ?1`).bind(i.id).first();
    if (room) await systemMessage(env, room.id, "Assalamu alaikum. This is your Marriage Discussion Room. It opens once a guardian from each family has joined. Everyone in the room, including both guardians, sees every message.");
    await notifyMember(env, i.from_member_id, "Your introduction was accepted", "Alhamdulillah, your introduction was accepted. Your Discussion Room opens once both guardians join.");
    await notifyGuardians(env, i.from_member_id, "A Discussion Room is waiting for you", "An approved introduction now has a Discussion Room. Please join it so the discussion can begin.");
    await notifyGuardians(env, i.to_member_id, "A Discussion Room is waiting for you", "An approved introduction now has a Discussion Room. Please join it so the discussion can begin.");
  }
  return json({ ok: true, status: next });
}
