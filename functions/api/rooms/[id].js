// GET /api/rooms/:id?after=N -> room details, who is in it, and messages (all of them are visible to every participant).
// There are no private inboxes: members and both families' guardians see the same conversation.
import { json, getMember, roomAccess, joinedSides, roomLabels } from "../../_lib.js";

export async function onRequestGet({ request, env, params }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  const access = await roomAccess(env, Number(params.id), me);
  if (!access) return json({ error: "Room not found" }, 404);
  const { room } = access;

  const after = Math.max(0, parseInt(new URL(request.url).searchParams.get("after")) || 0);
  const { results } = after
    ? await env.DB.prepare(`SELECT id, author_id, kind, body, created_at FROM room_messages WHERE room_id = ?1 AND id > ?2 ORDER BY id LIMIT 200`).bind(room.id, after).all()
    : await env.DB.prepare(`SELECT * FROM (SELECT id, author_id, kind, body, created_at FROM room_messages WHERE room_id = ?1 ORDER BY id DESC LIMIT 100) ORDER BY id`).bind(room.id).all();

  const labels = await roomLabels(env, room);
  const joined = await joinedSides(env, room);
  const iJoined = access.role === "guardian"
    ? !!(await env.DB.prepare(`SELECT 1 AS ok FROM room_guardian_joins WHERE room_id = ?1 AND guardian_member_id = ?2`).bind(room.id, me.id).first())
    : null;

  return json({
    room: {
      id: room.id, status: room.status, contacts_unlocked: !!room.contacts_unlocked,
      sender_guardian_ok: !!room.sender_guardian_ok, recipient_guardian_ok: !!room.recipient_guardian_ok,
      guardians_joined: { sender: joined.has("sender"), recipient: joined.has("recipient") },
    },
    me: { id: me.id, role: access.role, side: access.side, joined: iJoined },
    participants: Object.entries(labels).map(([id, label]) => ({ id: Number(id), label })),
    messages: results.map(m => ({
      id: m.id, kind: m.kind, body: m.body, created_at: m.created_at, mine: m.author_id === me.id,
      author: m.kind === "system" ? null : (labels[m.author_id] || "Former guardian"),
    })),
  });
}
