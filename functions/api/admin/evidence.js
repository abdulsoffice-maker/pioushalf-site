// GET /api/admin/evidence?member_id=&level= -> streams one pending verification document to an admin.
import { json, adminGate, audit } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const u = new URL(request.url);
  const v = await env.DB.prepare(
    `SELECT evidence_r2_key FROM verifications WHERE member_id = ?1 AND level = ?2 AND status = 'pending' AND evidence_r2_key IS NOT NULL`
  ).bind(Number(u.searchParams.get("member_id")), String(u.searchParams.get("level"))).first();
  if (!v) return json({ error: "Not found" }, 404);
  const obj = await env.BUCKET.get(v.evidence_r2_key);
  if (!obj) return json({ error: "File missing" }, 404);

  await audit(env, `admin:${g.me.id}`, "evidence_viewed", `member ${Number(u.searchParams.get("member_id"))} ${u.searchParams.get("level")}`);
  return new Response(obj.body, { headers: {
    "content-type": (obj.httpMetadata && obj.httpMetadata.contentType) || "application/octet-stream",
    "content-disposition": "inline", "cache-control": "no-store", "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  } });
}
