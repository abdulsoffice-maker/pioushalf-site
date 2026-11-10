// GET  /api/admin/members?q=&offset=   -> members, newest first.
// POST /api/admin/members { id, status }  status: active | suspended. Suspending signs the person out everywhere.
import { json, adminGate, audit, TRUST_SQL } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const u = new URL(request.url);
  const q = (u.searchParams.get("q") || "").trim().slice(0, 80);
  const offset = Math.max(0, parseInt(u.searchParams.get("offset")) || 0);
  const like = `%${q.replace(/[%_]/g, "")}%`;

  const { results } = await env.DB.prepare(
    `SELECT m.id, m.email, m.gender, m.role, m.status, m.created_at, p.display_name, p.age, p.city, p.country,
            ${TRUST_SQL.replace(/p\.member_id/g, "m.id")} AS trust_score,
            (SELECT COUNT(*) FROM guardians g WHERE g.member_id = m.id AND g.status = 'active') AS guardians
     FROM members m LEFT JOIN profiles p ON p.member_id = m.id
     WHERE (?1 = '%%' OR m.email LIKE ?1 OR p.display_name LIKE ?1)
     ORDER BY m.id DESC LIMIT 50 OFFSET ?2`
  ).bind(like, offset).all();
  return json({ members: results, next_offset: results.length === 50 ? offset + 50 : null });
}

export async function onRequestPost({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const id = Number(b.id);
  if (!["active", "suspended"].includes(b.status)) return json({ error: "Status must be active or suspended" }, 400);
  if (id === g.me.id) return json({ error: "You cannot change your own account" }, 400);
  const m = await env.DB.prepare(`SELECT id FROM members WHERE id = ?1`).bind(id).first();
  if (!m) return json({ error: "Member not found" }, 404);

  await env.DB.prepare(`UPDATE members SET status = ?1 WHERE id = ?2`).bind(b.status, id).run();
  if (b.status === "suspended") await env.DB.prepare(`DELETE FROM sessions WHERE member_id = ?1`).bind(id).run();
  await audit(env, `admin:${g.me.id}`, `member_${b.status}`, `member ${id}`);
  return json({ ok: true });
}
