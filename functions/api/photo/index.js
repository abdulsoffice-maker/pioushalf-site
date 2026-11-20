// POST   /api/photo (multipart: file) -> saves the member's profile photo in private storage.
// DELETE /api/photo                   -> removes it.
// The photo is never public. See [id].js for who may view it.
import { json, getMember, randomHex, audit } from "../../_lib.js";

const MAX_BYTES = 5 * 1024 * 1024;
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  const prof = await env.DB.prepare(`SELECT photo_r2_key FROM profiles WHERE member_id = ?1`).bind(me.id).first();
  if (!prof) return json({ error: "Please save your profile first" }, 400);
  if (Number(request.headers.get("content-length") || 0) > MAX_BYTES + 100000) return json({ error: "That photo is too large. Please keep it under 5 MB." }, 413);
  let form;
  try { form = await request.formData(); } catch { return json({ error: "Invalid upload" }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string" || !file.size) return json({ error: "Please choose a photo", field: "file" }, 422);
  if (file.size > MAX_BYTES) return json({ error: "That photo is too large. Please keep it under 5 MB.", field: "file" }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniff(bytes);
  if (!type) return json({ error: "Please upload a JPG, PNG or WebP photo", field: "file" }, 422);

  const today = await env.DB.prepare(`SELECT COUNT(*) AS c FROM audit_log WHERE actor = ?1 AND action = 'photo_upload' AND created_at > datetime('now','-1 day')`).bind(`member:${me.id}`).first();
  if (today.c >= 6) return json({ error: "You have uploaded several times today. Please try again tomorrow." }, 429);

  const key = `photos/${me.id}/${randomHex(8)}`;
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: type } });
  await env.DB.prepare(`UPDATE profiles SET photo_r2_key = ?1, updated_at = datetime('now') WHERE member_id = ?2`).bind(key, me.id).run();
  if (prof.photo_r2_key) await env.BUCKET.delete(prof.photo_r2_key);
  await audit(env, `member:${me.id}`, "photo_upload", "profile photo");
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  const prof = await env.DB.prepare(`SELECT photo_r2_key FROM profiles WHERE member_id = ?1`).bind(me.id).first();
  if (prof && prof.photo_r2_key) {
    await env.BUCKET.delete(prof.photo_r2_key);
    await env.DB.prepare(`UPDATE profiles SET photo_r2_key = NULL WHERE member_id = ?1`).bind(me.id).run();
  }
  return json({ ok: true });
}
