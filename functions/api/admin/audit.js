// GET /api/admin/audit?action= -> the latest 200 entries of the audit log.
import { json, adminGate } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const action = (new URL(request.url).searchParams.get("action") || "").slice(0, 60);
  const { results } = action
    ? await env.DB.prepare(`SELECT id, actor, action, detail, created_at FROM audit_log WHERE action = ?1 ORDER BY id DESC LIMIT 200`).bind(action).all()
    : await env.DB.prepare(`SELECT id, actor, action, detail, created_at FROM audit_log ORDER BY id DESC LIMIT 200`).all();
  return json({ entries: results });
}
