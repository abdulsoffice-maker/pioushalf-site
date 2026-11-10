// GET /api/rooms -> Discussion Rooms I can see: as one of the two members, or as an active guardian of either.
import { json, getMember } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);

  const { results } = await env.DB.prepare(
    `SELECT r.id, r.status, r.contacts_unlocked, r.created_at, r.updated_at, r.sender_id, r.recipient_id,
            sp.display_name AS sender_name, rp.display_name AS recipient_name
     FROM rooms r
     JOIN profiles sp ON sp.member_id = r.sender_id
     JOIN profiles rp ON rp.member_id = r.recipient_id
     WHERE r.sender_id = ?1 OR r.recipient_id = ?1
        OR r.sender_id IN (SELECT member_id FROM guardians WHERE guardian_member_id = ?1 AND status = 'active')
        OR r.recipient_id IN (SELECT member_id FROM guardians WHERE guardian_member_id = ?1 AND status = 'active')
     ORDER BY r.updated_at DESC LIMIT 100`
  ).bind(me.id).all();

  return json({
    rooms: results.map(r => {
      const isMember = r.sender_id === me.id || r.recipient_id === me.id;
      return {
        id: r.id, status: r.status, contacts_unlocked: !!r.contacts_unlocked, updated_at: r.updated_at,
        my_role: isMember ? "member" : "guardian",
        title: isMember ? (r.sender_id === me.id ? r.recipient_name : r.sender_name) : `${r.sender_name} and ${r.recipient_name}`,
      };
    }),
  });
}
