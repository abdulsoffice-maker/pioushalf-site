// POST /api/verification/upload  (multipart: level = identity | photo, file)
// The document goes to the private R2 bucket and is seen only by admins. It is deleted once a decision is made.
import { json, getMember, randomHex, audit } from "../../_lib.js";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = {
  identity: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  photo: ["image/jpeg", "image/png", "image/webp"],
};

// The file's first bytes must match what it claims to be, so a renamed script or text file is refused.
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  return null;
}

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);

  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BYTES + 100000) return json({ error: "That file is too large. Please keep it under 5 MB." }, 413);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Invalid upload" }, 400); }
  const level = String(form.get("level") || "");
  const file = form.get("file");
  if (!TYPES[level]) return json({ error: "Choose identity or photo" }, 400);
  if (!file || typeof file === "string" || !file.size) return json({ error: "Please choose a file", field: "file" }, 422);
  if (file.size > MAX_BYTES) return json({ error: "That file is too large. Please keep it under 5 MB.", field: "file" }, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type || !TYPES[level].includes(type))
    return json({ error: level === "identity" ? "Please upload a JPG, PNG, WebP or PDF" : "Please upload a JPG, PNG or WebP photo", field: "file" }, 422);

  const existing = await env.DB.prepare(`SELECT status, evidence_r2_key FROM verifications WHERE member_id = ?1 AND level = ?2`).bind(me.id, level).first();
  if (existing && existing.status === "verified") return json({ error: "This is already verified" }, 409);

  const today = await env.DB.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE actor = ?1 AND action = 'evidence_upload' AND created_at > datetime('now','-1 day')`).bind(`member:${me.id}`).first();
  if (today.c >= 6) return json({ error: "You have uploaded several times today. Please try again tomorrow." }, 429);

  const key = `evidence/${me.id}/${level}-${randomHex(8)}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
  if (existing && existing.evidence_r2_key) await env.BUCKET.delete(existing.evidence_r2_key);
  await env.DB.prepare(
    `INSERT INTO verifications (member_id, level, status, evidence_r2_key, created_at) VALUES (?1, ?2, 'pending', ?3, datetime('now'))
     ON CONFLICT(member_id, level) DO UPDATE SET status = 'pending', evidence_r2_key = ?3, reviewed_by = NULL, reviewed_at = NULL, created_at = datetime('now')`
  ).bind(me.id, level, key).run();
  await audit(env, `member:${me.id}`, "evidence_upload", level);
  return json({ ok: true });
}
