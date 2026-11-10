// GET /api/guardian/wards -> people this guardian looks after, and the introductions waiting for their approval.
import { json, getMember } from "../../_lib.js";

const SUMMARY = `p.display_name, p.age, p.city, p.country, p.profession, p.education, p.religious_commitment, p.prayer_consistency, p.about`;

export async function onRequestGet({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);

  const { results: wards } = await env.DB.prepare(
    `SELECT g.member_id AS id, p.display_name, g.relationship FROM guardians g
     LEFT JOIN profiles p ON p.member_id = g.member_id
     WHERE g.guardian_member_id = ?1 AND g.status = 'active'`
  ).bind(me.id).all();

  // Introductions the ward sent (we review the person they want to approach)...
  const sent = await env.DB.prepare(
    `SELECT i.id, i.message, i.created_at, 'sender_side' AS side, wp.display_name AS ward_name, ${SUMMARY}
     FROM interests i
     JOIN guardians g ON g.member_id = i.from_member_id AND g.guardian_member_id = ?1 AND g.status = 'active'
     JOIN profiles wp ON wp.member_id = i.from_member_id
     JOIN profiles p ON p.member_id = i.to_member_id
     WHERE i.status = 'awaiting_sender_guardian' ORDER BY i.created_at`
  ).bind(me.id).all();
  // ...and introductions the ward received (we review the person who is approaching them).
  const received = await env.DB.prepare(
    `SELECT i.id, i.message, i.created_at, 'recipient_side' AS side, wp.display_name AS ward_name, ${SUMMARY}
     FROM interests i
     JOIN guardians g ON g.member_id = i.to_member_id AND g.guardian_member_id = ?1 AND g.status = 'active'
     JOIN profiles wp ON wp.member_id = i.to_member_id
     JOIN profiles p ON p.member_id = i.from_member_id
     WHERE i.status = 'awaiting_recipient_guardian' ORDER BY i.created_at`
  ).bind(me.id).all();

  return json({ wards, pending: [...sent.results, ...received.results] });
}
