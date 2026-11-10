// POST /api/support { name, email, message, website }  -> public support form. "website" is a hidden trap for bots.
import { json, sendMail } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (b.website) return json({ ok: true }); // a bot filled the hidden field: pretend it worked, store nothing

  const name = String(b.name || "").trim(), email = String(b.email || "").trim().toLowerCase(), message = String(b.message || "").trim();
  if (name.length < 2 || name.length > 80) return json({ error: "Please enter your name", field: "name" }, 422);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid email so we can reply", field: "email" }, 422);
  if (message.length < 10) return json({ error: "Please tell us a little more", field: "message" }, 422);
  if (message.length > 2000) return json({ error: "Please keep your message under 2000 characters", field: "message" }, 422);

  const today = await env.DB.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE email = ?1 AND created_at > datetime('now','-1 day')`).bind(email).first();
  if (today.c >= 3) return json({ error: "We already have your recent messages and will reply soon." }, 429);
  const all = await env.DB.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE created_at > datetime('now','-1 hour')`).first();
  if (all.c >= 60) return json({ error: "We are receiving a lot of messages right now. Please try again later." }, 429);

  await env.DB.prepare(`INSERT INTO tickets (name, email, message) VALUES (?1, ?2, ?3)`).bind(name, email, message).run();
  try {
    await sendMail(env, { to: env.SUPPORT_NOTIFY || "peace@pioushalf.com", subject: "New Salaamify support message", text: `From: ${name} <${email}>\n\n${message}` });
  } catch {}
  return json({ ok: true });
}
