// GET  /api/admin/verifications -> identity and photo documents waiting for review.
// POST /api/admin/verifications { member_id, level, decision }  decision: approve | reject
// The uploaded document is deleted from storage as soon as a decision is made. Only the result is kept.
import { json, adminGate, audit, notifyMember } from "../../_lib.js";

const REVIEWABLE = ["identity", "photo"];

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const { results } = await env.DB.prepare(
    `SELECT v.member_id, v.level, v.created_at, m.email, p.display_name, p.age, p.city
     FROM verifications v JOIN members m ON m.id = v.member_id LEFT JOIN profiles p ON p.member_id = v.member_id
     WHERE v.status = 'pending' AND v.evidence_r2_key IS NOT NULL ORDER BY v.created_at LIMIT 200`
  ).all();
  return json({ pending: results });
}

export async function onRequestPost({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const memberId = Number(b.member_id);
  if (!REVIEWABLE.includes(b.level) || !["approve", "reject"].includes(b.decision)) return json({ error: "Invalid request" }, 400);

  const v = await env.DB.prepare(`SELECT evidence_r2_key FROM verifications WHERE member_id = ?1 AND level = ?2 AND status = 'pending'`).bind(memberId, b.level).first();
  if (!v) return json({ error: "Nothing pending for that member" }, 404);

  const status = b.decision === "approve" ? "verified" : "rejected";
  await env.DB.prepare(
    `UPDATE verifications SET status = ?1, evidence_r2_key = NULL, reviewed_by = ?2, reviewed_at = datetime('now') WHERE member_id = ?3 AND level = ?4`
  ).bind(status, `admin:${g.me.id}`, memberId, b.level).run();
  if (v.evidence_r2_key) await env.BUCKET.delete(v.evidence_r2_key);
  await audit(env, `admin:${g.me.id}`, `verification_${status}`, `member ${memberId} ${b.level}`);

  const what = b.level === "identity" ? "identity" : "photo";
  await notifyMember(env, memberId,
    status === "verified" ? `Your ${what} verification was approved` : `Please upload your ${what} document again`,
    status === "verified" ? `Alhamdulillah, your ${what} verification was approved. Your trust score has been updated.`
                          : `We could not verify the ${what} document you uploaded. Please upload a clearer one from your profile page.`);
  return json({ ok: true, status });
}
