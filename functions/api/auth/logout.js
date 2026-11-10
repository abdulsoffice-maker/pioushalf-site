// POST /api/auth/logout -> ends the session.
import { json, sha256Hex } from "../../_lib.js";

export async function onRequestPost({ request, env }) {
  const m = (request.headers.get("cookie") || "").match(/(?:^|;\s*)sal_session=([a-f0-9]{64})/);
  if (m) await env.DB.prepare(`DELETE FROM sessions WHERE token_hash = ?1`).bind(await sha256Hex(m[1])).run();
  return json({ ok: true }, 200, { "set-cookie": "sal_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
}
