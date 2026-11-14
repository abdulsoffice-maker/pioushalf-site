// Your data (Digital Personal Data Protection Act 2023: access and erasure).
// GET  /api/account                          -> everything we hold about you, as a download.
// POST /api/account { action: "delete", confirm: "DELETE" } -> closes and erases your account.
// Tax invoices and payment records are kept because the law requires it. Everything personal is removed.
import { json, getMember, audit, systemMessage } from "../_lib.js";

export async function onRequestGet({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  const all = async (sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results;
  const data = {
    exported_at: new Date().toISOString(),
    account: { email: me.email, gender: me.gender, joined: me.created_at },
    profile: await env.DB.prepare(`SELECT * FROM profiles WHERE member_id = ?1`).bind(me.id).first(),
    verification: await all(`SELECT level, status, created_at FROM verifications WHERE member_id = ?1`, me.id),
    guardians: await all(`SELECT name, email, relationship, status, invited_at FROM guardians WHERE member_id = ?1`, me.id),
    introductions: await all(`SELECT id, from_member_id = ?1 AS sent_by_me, message, status, created_at FROM interests WHERE from_member_id = ?1 OR to_member_id = ?1`, me.id),
    room_messages_i_wrote: await all(`SELECT room_id, body, created_at FROM room_messages WHERE author_id = ?1 ORDER BY id`, me.id),
    support_messages: await all(`SELECT message, status, created_at FROM tickets WHERE email = ?1`, me.email),
    payments: await all(`SELECT o.invoice_no, o.plan, o.months, o.amount_paise, o.status, o.paid_at, o.membership_end FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.email = ?1`, me.email),
  };
  await audit(env, `member:${me.id}`, "data_exported", null);
  return new Response(JSON.stringify(data, null, 2), { headers: {
    "content-type": "application/json", "content-disposition": 'attachment; filename="my-salaamify-data.json"', "cache-control": "no-store" } });
}

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Not signed in" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (b.action !== "delete" || b.confirm !== "DELETE") return json({ error: "Please type DELETE to confirm" }, 422);

  // uploaded documents
  const { results: ev } = await env.DB.prepare(`SELECT evidence_r2_key AS k FROM verifications WHERE member_id = ?1 AND evidence_r2_key IS NOT NULL`).bind(me.id).all();
  for (const e of ev) await env.BUCKET.delete(e.k);

  // introductions end, rooms close
  await env.DB.prepare(`UPDATE interests SET status = 'withdrawn', updated_at = datetime('now') WHERE (from_member_id = ?1 OR to_member_id = ?1) AND status NOT IN ('declined','withdrawn')`).bind(me.id).run();
  const { results: rooms } = await env.DB.prepare(`SELECT id FROM rooms WHERE (sender_id = ?1 OR recipient_id = ?1) AND status != 'closed'`).bind(me.id).all();
  for (const r of rooms) {
    await env.DB.prepare(`UPDATE rooms SET status = 'closed', updated_at = datetime('now') WHERE id = ?1`).bind(r.id).run();
    await systemMessage(env, r.id, "A member has left Salaamify and this room was closed.");
  }
  // their own words are removed from rooms
  await env.DB.prepare(`UPDATE room_messages SET body = '[removed]' WHERE author_id = ?1 AND kind = 'message'`).bind(me.id).run();

  await env.DB.prepare(`DELETE FROM profiles WHERE member_id = ?1`).bind(me.id).run();
  await env.DB.prepare(`DELETE FROM verifications WHERE member_id = ?1`).bind(me.id).run();
  await env.DB.prepare(`DELETE FROM guardians WHERE member_id = ?1`).bind(me.id).run();
  await env.DB.prepare(`UPDATE guardians SET status = 'removed', guardian_member_id = NULL WHERE guardian_member_id = ?1`).bind(me.id).run();
  await env.DB.prepare(`DELETE FROM tickets WHERE email = ?1`).bind(me.email).run();
  await env.DB.prepare(`DELETE FROM login_codes WHERE email = ?1`).bind(me.email).run();
  await env.DB.prepare(`DELETE FROM sessions WHERE member_id = ?1`).bind(me.id).run();
  await env.DB.prepare(`UPDATE members SET status = 'deleted', email = ?1, gender = NULL WHERE id = ?2`).bind(`deleted-${me.id}@deleted.invalid`, me.id).run();
  await audit(env, `member:${me.id}`, "account_deleted", `member ${me.id}`);
  return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json", "set-cookie": "sal_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax" } });
}
