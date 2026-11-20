// GET  /api/admin/reviews -> reviews waiting for approval.
// POST /api/admin/reviews { id, action: approve | reject } -> publish or hide one.
import { json, adminGate, audit } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const { results } = await env.DB.prepare(
    `SELECT id, rating, body, show_name, show_city, created_at FROM reviews WHERE status = 'pending' ORDER BY id LIMIT 100`
  ).all();
  return json({ reviews: results });
}

export async function onRequestPost({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (!["approve", "reject"].includes(b.action)) return json({ error: "Invalid action" }, 400);
  const r = await env.DB.prepare(`UPDATE reviews SET status = ?1, decided_at = datetime('now') WHERE id = ?2 AND status = 'pending'`)
    .bind(b.action === "approve" ? "approved" : "rejected", Number(b.id)).run();
  if (r.meta && r.meta.changes === 0) return json({ error: "Review not found" }, 404);
  await audit(env, `admin:${g.me.id}`, `review_${b.action}`, `review ${Number(b.id)}`);
  return json({ ok: true });
}
