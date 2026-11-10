// GET  /api/admin/flags?status=open|reviewed -> contact-sharing violations caught in Discussion Rooms.
// POST /api/admin/flags { id } -> mark one as reviewed.
import { json, adminGate, audit } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const status = new URL(request.url).searchParams.get("status") === "reviewed" ? "reviewed" : "open";
  const { results } = await env.DB.prepare(
    `SELECT f.id, f.room_id, f.member_id, f.label, f.excerpt, f.status, f.created_at, m.email, p.display_name,
            (SELECT COUNT(*) FROM moderation_flags x WHERE x.member_id = f.member_id) AS member_total_flags
     FROM moderation_flags f JOIN members m ON m.id = f.member_id LEFT JOIN profiles p ON p.member_id = f.member_id
     WHERE f.status = ?1 ORDER BY f.id DESC LIMIT 200`
  ).bind(status).all();
  return json({ flags: results });
}

export async function onRequestPost({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const r = await env.DB.prepare(`UPDATE moderation_flags SET status = 'reviewed' WHERE id = ?1 AND status = 'open'`).bind(Number(b.id)).run();
  if (r.meta && r.meta.changes === 0) return json({ error: "Flag not found or already reviewed" }, 404);
  await audit(env, `admin:${g.me.id}`, "flag_reviewed", `flag ${Number(b.id)}`);
  return json({ ok: true });
}
