// GET  /api/admin/tickets?status=open|closed -> support requests from the public support form.
// POST /api/admin/tickets { id, status } -> close or reopen one.
import { json, adminGate, audit } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const status = new URL(request.url).searchParams.get("status") === "closed" ? "closed" : "open";
  const { results } = await env.DB.prepare(`SELECT id, name, email, message, status, created_at, closed_at FROM tickets WHERE status = ?1 ORDER BY id DESC LIMIT 200`).bind(status).all();
  return json({ tickets: results });
}

export async function onRequestPost({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (!["open", "closed"].includes(b.status)) return json({ error: "Invalid status" }, 400);
  const r = await env.DB.prepare(`UPDATE tickets SET status = ?1, closed_at = CASE WHEN ?1 = 'closed' THEN datetime('now') ELSE NULL END WHERE id = ?2`).bind(b.status, Number(b.id)).run();
  if (r.meta && r.meta.changes === 0) return json({ error: "Ticket not found" }, 404);
  await audit(env, `admin:${g.me.id}`, `ticket_${b.status}`, `ticket ${Number(b.id)}`);
  return json({ ok: true });
}
