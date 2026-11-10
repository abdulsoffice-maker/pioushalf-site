// POST /api/guardian/remove { id } -> a member removes one of their guardians.
// With no active guardian left, guardian verification is withdrawn and interests waiting on that guardian are withdrawn too.
import { json, getMember } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const g = await env.DB.prepare(`SELECT id FROM guardians WHERE id = ?1 AND member_id = ?2 AND status != 'removed'`).bind(Number(b.id), me.id).first();
  if (!g) return json({ error: "Guardian not found" }, 404);

  await env.DB.prepare(`UPDATE guardians SET status = 'removed', token_hash = NULL WHERE id = ?1`).bind(g.id).run();
  const left = await env.DB.prepare(`SELECT COUNT(*) AS c FROM guardians WHERE member_id = ?1 AND status = 'active'`).bind(me.id).first();
  if (left.c === 0) {
    await env.DB.prepare(`DELETE FROM verifications WHERE member_id = ?1 AND level = 'guardian'`).bind(me.id).run();
    await env.DB.prepare(
      `UPDATE interests SET status = 'withdrawn', declined_by = 'system', updated_at = datetime('now')
       WHERE (from_member_id = ?1 AND status = 'awaiting_sender_guardian') OR (to_member_id = ?1 AND status = 'awaiting_recipient_guardian')`
    ).bind(me.id).run();
    await env.DB.prepare(
      `UPDATE rooms SET status = 'paused', updated_at = datetime('now') WHERE (sender_id = ?1 OR recipient_id = ?1) AND status IN ('awaiting_guardians','open')`
    ).bind(me.id).run();
  }
  return json({ ok: true });
}
