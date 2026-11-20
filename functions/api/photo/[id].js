// GET /api/photo/<member id> -> the member's profile photo, only for people allowed to see it:
//   the member, their active guardians, admins, or the other side of an introduction both guardians have approved
//   (and only if the member chose "after guardian approval" and their photo check is verified).
import { getMember, isAdmin } from "../../_lib.js";

const deny = () => new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });

export async function onRequestGet({ request, env, params }) {
  const me = await getMember(request, env);
  if (!me) return deny();
  const id = Number(params.id);
  if (!Number.isInteger(id)) return deny();
  const prof = await env.DB.prepare(`SELECT photo_r2_key, photo_privacy FROM profiles WHERE member_id = ?1`).bind(id).first();
  if (!prof || !prof.photo_r2_key) return deny();

  let ok = me.id === id || isAdmin(me, env);
  if (!ok) ok = !!(await env.DB.prepare(`SELECT 1 AS ok FROM guardians WHERE member_id = ?1 AND guardian_member_id = ?2 AND status = 'active'`).bind(id, me.id).first());
  if (!ok && prof.photo_privacy === "guardian_approved") {
    ok = !!(await env.DB.prepare(
      `SELECT 1 AS ok FROM interests i WHERE i.status = 'approved'
         AND ((i.from_member_id = ?1 AND i.to_member_id = ?2) OR (i.from_member_id = ?2 AND i.to_member_id = ?1))
         AND EXISTS (SELECT 1 FROM verifications v WHERE v.member_id = ?2 AND v.level = 'photo' AND v.status = 'verified') LIMIT 1`
    ).bind(me.id, id).first());
  }
  if (!ok) return deny();

  const obj = await env.BUCKET.get(prof.photo_r2_key);
  if (!obj) return deny();
  return new Response(obj.body, { headers: { "content-type": obj.httpMetadata?.contentType || "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}
