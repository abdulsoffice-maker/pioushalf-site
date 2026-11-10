// POST /api/rooms/:id/messages { body }
// Rules: a member can post only once a guardian from each side has joined; guardians can post earlier to welcome everyone.
// Contact details are blocked until both guardians approve sharing. Three blocked attempts pause the room.
import { json, getMember, roomAccess, findContactInfo, systemMessage, notifyGuardians } from "../../../_lib.js";

const STRIKES_TO_PAUSE = 3;

export async function onRequestPost({ request, env, params }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  const access = await roomAccess(env, Number(params.id), me);
  if (!access) return json({ error: "Room not found" }, 404);
  const { room } = access;

  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const body = String(b.body || "").trim();
  if (!body) return json({ error: "Please write a message" }, 400);
  if (body.length > 1000) return json({ error: "Please keep each message under 1000 characters" }, 422);

  if (room.status === "closed") return json({ error: "This room has been closed" }, 403);
  if (room.status === "paused") return json({ error: "This room is paused. A guardian needs to review it and resume it." }, 403);
  if (room.status === "awaiting_guardians" && access.role === "member")
    return json({ error: "The room opens once a guardian from each family has joined. Please wait for them." }, 403);

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM room_messages WHERE room_id = ?1 AND author_id = ?2 AND created_at > datetime('now','-1 minute')`
  ).bind(room.id, me.id).first();
  if (recent.c >= 15) return json({ error: "You are sending messages very quickly. Please slow down." }, 429);

  if (!room.contacts_unlocked) {
    const hit = findContactInfo(body);
    if (hit) {
      await env.DB.prepare(`INSERT INTO moderation_flags (room_id, member_id, kind, label, excerpt) VALUES (?1, ?2, 'contact_attempt', ?3, ?4)`)
        .bind(room.id, me.id, hit, body.slice(0, 200)).run();
      const strikes = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM moderation_flags WHERE room_id = ?1 AND member_id = ?2 AND status = 'open' AND created_at > datetime('now','-1 day')`
      ).bind(room.id, me.id).first();
      if (strikes.c >= STRIKES_TO_PAUSE) {
        await env.DB.prepare(`UPDATE rooms SET status = 'paused', updated_at = datetime('now') WHERE id = ?1`).bind(room.id).run();
        await systemMessage(env, room.id, "This room has been paused because contact details were shared more than once. A guardian will review it.");
        await notifyGuardians(env, room.sender_id, "A Discussion Room was paused", "A Discussion Room was paused after repeated attempts to share contact details.");
        await notifyGuardians(env, room.recipient_id, "A Discussion Room was paused", "A Discussion Room was paused after repeated attempts to share contact details.");
        return json({ error: "This room has been paused because contact details were shared more than once.", paused: true }, 422);
      }
      return json({
        error: `Please remove ${hit}. Contact details can be shared only after both guardians approve. (${strikes.c} of ${STRIKES_TO_PAUSE} warnings)`,
        blocked: true,
      }, 422);
    }
  }

  const r = await env.DB.prepare(`INSERT INTO room_messages (room_id, author_id, body) VALUES (?1, ?2, ?3)`).bind(room.id, me.id, body).run();
  await env.DB.prepare(`UPDATE rooms SET updated_at = datetime('now') WHERE id = ?1`).bind(room.id).run();
  return json({ ok: true });
}
