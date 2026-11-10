// GET /api/me -> the signed-in member, their profile, verification levels and trust score.
import { json, getMember, trustScore, LEVELS, TRUST_POINTS, isAdmin } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const member = await getMember(request, env);
  if (!member) return json({ error: "Not signed in" }, 401);

  const profile = await env.DB.prepare(`SELECT * FROM profiles WHERE member_id = ?1`).bind(member.id).first();
  const { results } = await env.DB.prepare(`SELECT level, status FROM verifications WHERE member_id = ?1`).bind(member.id).all();
  const byLevel = Object.fromEntries(results.map(r => [r.level, r.status]));

  const { results: guardians } = await env.DB.prepare(
    `SELECT id, name, relationship, status, invited_at FROM guardians WHERE member_id = ?1 AND status != 'removed' ORDER BY id`
  ).bind(member.id).all();

  return json({
    guardians,
    is_admin: isAdmin(member, env),
    member: { id: member.id, email: member.email, gender: member.gender, role: member.role },
    profile: profile || null,
    verification: LEVELS.map(level => ({ level, status: byLevel[level] || "not_started", points: TRUST_POINTS[level] })),
    trust_score: trustScore(results),
  });
}
