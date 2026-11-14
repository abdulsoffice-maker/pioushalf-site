// GET  /api/admin/errors?status=open|resolved -> faults the site recorded about itself.
// POST /api/admin/errors { id } or { all: true } -> mark as resolved.
import { json, adminGate, audit } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const flag = new URL(request.url).searchParams.get("status") === "resolved" ? "resolved" : "open";
  const { results } = await env.DB.prepare(`SELECT id, method, path, status, message, created_at FROM error_log WHERE status_flag = ?1 ORDER BY id DESC LIMIT 200`).bind(flag).all();
  return json({ errors: results });
}

export async function onRequestPost({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (b.all === true) await env.DB.prepare(`UPDATE error_log SET status_flag = 'resolved' WHERE status_flag = 'open'`).run();
  else {
    const r = await env.DB.prepare(`UPDATE error_log SET status_flag = 'resolved' WHERE id = ?1 AND status_flag = 'open'`).bind(Number(b.id)).run();
    if (r.meta && r.meta.changes === 0) return json({ error: "Not found" }, 404);
  }
  await audit(env, `admin:${g.me.id}`, "errors_resolved", b.all ? "all" : `error ${Number(b.id)}`);
  return json({ ok: true });
}
