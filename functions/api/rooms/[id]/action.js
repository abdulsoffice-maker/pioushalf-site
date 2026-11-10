// POST /api/rooms/:id/action { action }
//   join              guardian: join the room. It opens once a guardian from each family has joined.
//   unlock_contacts   guardian: approve sharing contact details. Filtering stops once both families' guardians approve.
//   resume            guardian: reopen a paused room after reviewing it.
//   close             anyone in the room: end the discussion.
import { json, getMember, roomAccess, joinedSides, systemMessage, notifyMember } from "../../../_lib.js";

export async function onRequestPost({ request, env, params }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  const access = await roomAccess(env, Number(params.id), me);
  if (!access) return json({ error: "Room not found" }, 404);
  const { room, role, side } = access;

  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const action = b.action;
  if (room.status === "closed") return json({ error: "This room has been closed" }, 400);

  const setStatus = async status =>
    env.DB.prepare(`UPDATE rooms SET status = ?1, updated_at = datetime('now') WHERE id = ?2`).bind(status, room.id).run();

  if (action === "close") {
    await setStatus("closed");
    await systemMessage(env, room.id, "This room was closed.");
    return json({ ok: true, status: "closed" });
  }

  if (role !== "guardian") return json({ error: "Only a guardian can do that" }, 403);

  if (action === "join") {
    await env.DB.prepare(`INSERT OR IGNORE INTO room_guardian_joins (room_id, guardian_member_id, side) VALUES (?1, ?2, ?3)`).bind(room.id, me.id, side).run();
    let status = room.status;
    if (status === "awaiting_guardians") {
      const joined = await joinedSides(env, room);
      if (joined.has("sender") && joined.has("recipient")) {
        status = "open";
        await setStatus("open");
        await systemMessage(env, room.id, "A guardian from each family has joined. The room is now open. Please keep every message focused on marriage.");
        await notifyMember(env, room.sender_id, "Your Discussion Room is open", "Both guardians have joined. Your Discussion Room is now open.");
        await notifyMember(env, room.recipient_id, "Your Discussion Room is open", "Both guardians have joined. Your Discussion Room is now open.");
      }
    }
    return json({ ok: true, status });
  }

  if (action === "unlock_contacts") {
    if (room.status !== "open") return json({ error: "Contact details can be approved once the room is open" }, 400);
    const col = side === "sender" ? "sender_guardian_ok" : "recipient_guardian_ok";
    await env.DB.prepare(`UPDATE rooms SET ${col} = 1, updated_at = datetime('now') WHERE id = ?1`).bind(room.id).run();
    const fresh = await env.DB.prepare(`SELECT sender_guardian_ok, recipient_guardian_ok FROM rooms WHERE id = ?1`).bind(room.id).first();
    if (fresh.sender_guardian_ok && fresh.recipient_guardian_ok && !room.contacts_unlocked) {
      await env.DB.prepare(`UPDATE rooms SET contacts_unlocked = 1 WHERE id = ?1`).bind(room.id).run();
      await systemMessage(env, room.id, "Both guardians have approved sharing contact details. Messages are no longer filtered in this room. Please share only what your families have agreed on.");
      return json({ ok: true, contacts_unlocked: true });
    }
    return json({ ok: true, contacts_unlocked: false });
  }

  if (action === "resume") {
    if (room.status !== "paused") return json({ error: "This room is not paused" }, 400);
    const joined = await joinedSides(env, room);
    if (!(joined.has("sender") && joined.has("recipient")))
      return json({ error: "A guardian from each family needs to join before the room can resume" }, 400);
    await env.DB.prepare(`UPDATE moderation_flags SET status = 'reviewed' WHERE room_id = ?1 AND status = 'open'`).bind(room.id).run();
    await setStatus("open");
    await systemMessage(env, room.id, "A guardian reviewed the room and reopened it. Please keep every message focused on marriage.");
    return json({ ok: true, status: "open" });
  }

  return json({ error: "Unknown action" }, 400);
}
