// POST /api/guardian/accept { token } -> the signed-in guardian accepts an invitation.
// The guardian must sign in with the same email address the invitation was sent to.
import { json, getMember, sha256Hex } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);

  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (!/^[a-f0-9]{64}$/.test(String(b.token || ""))) return json({ error: "This invitation link is not valid" }, 400);

  const g = await env.DB.prepare(
    `SELECT * FROM guardians WHERE token_hash = ?1 AND status = 'invited' AND invited_at > datetime('now','-7 days')`
  ).bind(await sha256Hex(b.token)).first();
  if (!g) return json({ error: "This invitation has expired or was already used. Ask for a new one." }, 400);
  if (g.email !== me.email) return json({ error: `Please sign in with ${g.email}, the address this invitation was sent to.` }, 403);
  if (g.member_id === me.id) return json({ error: "You cannot be your own guardian" }, 400);

  await env.DB.prepare(
    `UPDATE guardians SET status = 'active', guardian_member_id = ?1, accepted_at = datetime('now'), token_hash = NULL WHERE id = ?2`
  ).bind(me.id, g.id).run();
  await env.DB.prepare(
    `INSERT INTO verifications (member_id, level, status, reviewed_by, reviewed_at) VALUES (?1, 'guardian', 'verified', ?2, datetime('now'))
     ON CONFLICT(member_id, level) DO UPDATE SET status = 'verified', reviewed_by = ?2, reviewed_at = datetime('now')`
  ).bind(g.member_id, `guardian:${me.id}`).run();
  await env.DB.prepare(`INSERT INTO audit_log (actor, action, detail) VALUES (?1, 'guardian_accepted', ?2)`)
    .bind(`member:${me.id}`, `ward ${g.member_id}`).run();

  return json({ ok: true });
}
