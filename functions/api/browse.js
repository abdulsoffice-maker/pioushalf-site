// GET /api/browse?min_age=&max_age=&country=&min_trust=&offset=  -> opposite-gender, guardian-verified profiles.
// Shows only profile basics. Never emails, contact details or photos.
import { json, getMember, TRUST_SQL } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  if (!me.gender) return json({ error: "Please complete your profile first" }, 400);
  const mine = await env.DB.prepare(`SELECT 1 AS ok FROM profiles WHERE member_id = ?1`).bind(me.id).first();
  if (!mine) return json({ error: "Please complete your profile first" }, 400);

  const u = new URL(request.url);
  const want = me.gender === "brother" ? "sister" : "brother";
  const where = [`m.gender = ?`, `m.status = 'active'`, `p.member_id != ?`,
    `EXISTS (SELECT 1 FROM verifications gv WHERE gv.member_id = p.member_id AND gv.level = 'guardian' AND gv.status = 'verified')`];
  const args = [want, me.id];

  const minAge = parseInt(u.searchParams.get("min_age")), maxAge = parseInt(u.searchParams.get("max_age"));
  if (minAge >= 18) { where.push(`p.age >= ?`); args.push(minAge); }
  if (maxAge >= 18) { where.push(`p.age <= ?`); args.push(maxAge); }
  const country = (u.searchParams.get("country") || "").trim().slice(0, 60);
  if (country) { where.push(`LOWER(p.country) = LOWER(?)`); args.push(country); }
  const minTrust = parseInt(u.searchParams.get("min_trust")) || 0;
  const offset = Math.max(0, parseInt(u.searchParams.get("offset")) || 0);

  const { results } = await env.DB.prepare(
    `SELECT * FROM (
       SELECT p.member_id AS id, p.display_name, p.age, p.city, p.country, p.profession, p.education,
              p.religious_commitment, p.prayer_consistency, p.about, p.updated_at, ${TRUST_SQL} AS trust_score,
              (SELECT i.status FROM interests i WHERE (i.from_member_id = ? AND i.to_member_id = p.member_id)
                  OR (i.from_member_id = p.member_id AND i.to_member_id = ?) ORDER BY i.id DESC LIMIT 1) AS interest_status
       FROM profiles p JOIN members m ON m.id = p.member_id
       WHERE ${where.join(" AND ")}
     ) WHERE trust_score >= ? ORDER BY trust_score DESC, updated_at DESC LIMIT 20 OFFSET ?`
  ).bind(me.id, me.id, ...args, minTrust, offset).all();

  return json({ profiles: results, next_offset: results.length === 20 ? offset + 20 : null });
}
