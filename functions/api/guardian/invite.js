// POST /api/guardian/invite { name, email, relationship } -> emails a guardian a link to accept (valid 7 days).
import { json, getMember, findContactInfo, randomHex, sha256Hex, sendMail, siteUrl } from "../../_lib.js";

const RELATIONSHIPS = ["Father", "Mother", "Brother", "Uncle", "Aunt", "Grandparent", "Imam or teacher", "Other"];

export async function onRequestPost({ request, env }) {
  const member = await getMember(request, env);
  if (!member) return json({ error: "Not signed in" }, 401);

  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  if (name.length < 2 || name.length > 60) return json({ error: "Please enter your guardian's name", field: "name" }, 422);
  if (findContactInfo(name)) return json({ error: "Please enter only a name", field: "name" }, 422);
  if (!RELATIONSHIPS.includes(b.relationship)) return json({ error: "Please choose the relationship", field: "relationship" }, 422);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ error: "Please enter a valid email for your guardian", field: "email" }, 422);
  if (email === member.email) return json({ error: "Your guardian needs their own email address", field: "email" }, 422);

  const profile = await env.DB.prepare(`SELECT display_name FROM profiles WHERE member_id = ?1`).bind(member.id).first();
  if (!profile) return json({ error: "Please save your profile first so your guardian knows who you are" }, 400);

  const open = await env.DB.prepare(`SELECT COUNT(*) AS c FROM guardians WHERE member_id = ?1 AND status IN ('invited','active')`).bind(member.id).first();
  const existing = await env.DB.prepare(`SELECT status FROM guardians WHERE member_id = ?1 AND email = ?2`).bind(member.id, email).first();
  if (existing && existing.status === "active") return json({ error: "That person is already your guardian" }, 400);
  if (!existing || existing.status === "removed") {
    if (open.c >= 2) return json({ error: "You can have up to two guardians" }, 400);
  }

  const token = randomHex(32);
  await env.DB.prepare(
    `INSERT INTO guardians (member_id, name, email, relationship, token_hash, status, invited_at)
     VALUES (?1, ?2, ?3, ?4, ?5, 'invited', datetime('now'))
     ON CONFLICT(member_id, email) DO UPDATE SET name = ?2, relationship = ?4, token_hash = ?5, status = 'invited', invited_at = datetime('now')`
  ).bind(member.id, name, email, b.relationship, await sha256Hex(token)).run();

  const ok = await sendMail(env, {
    to: email,
    subject: `${profile.display_name} has asked you to be their guardian on Salaamify`,
    text: `Assalamu alaikum ${name},\n\n${profile.display_name} has asked you to be their guardian (wali) on Salaamify, a guardian-led Islamic marriage platform.\n\nAs a guardian you review and approve every introduction before any contact happens, and you take part in every discussion.\n\nTo accept, open this link and sign in with this email address (it works for 7 days):\n${siteUrl(env)}/guardian.html?token=${token}\n\nIf you do not know this person, please ignore this email.\n\nSalaamify, A Gift of Peace`,
  });
  if (!ok) return json({ error: "We could not send the invitation email. Please try again shortly." }, 502);
  return json({ ok: true });
}
