// GET  /api/reviews -> approved reviews for the home page (first name and city only, as the member chose).
// POST /api/reviews { rating, body, show_name, show_city, consent } -> a paying member shares their experience.
// Reviews wait for an admin to approve them. Contact details are refused. One review per member (a new one replaces the old).
import { json, getMember, findContactInfo, rateLimited } from "../_lib.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT rating, body, show_name AS name, show_city AS city FROM reviews WHERE status = 'approved' ORDER BY decided_at DESC, id DESC LIMIT 6`
  ).all();
  return json({ reviews: results }, 200, { "cache-control": "public, max-age=300" });
}

export async function onRequestPost({ request, env }) {
  const me = await getMember(request, env);
  if (!me) return json({ error: "Please sign in first" }, 401);
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const paid = await env.DB.prepare(
    `SELECT 1 AS ok FROM orders o JOIN customers c ON c.id = o.customer_id WHERE LOWER(c.email) = LOWER(?1) AND o.status = 'paid' LIMIT 1`
  ).bind(me.email).first();
  if (!paid) return json({ error: "Reviews are open to members who have joined a plan." }, 403);
  if (b.consent !== true) return json({ error: "Please tick the box to allow us to show your review.", field: "consent" }, 422);

  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "Please choose 1 to 5 stars", field: "rating" }, 422);
  const body = String(b.body || "").trim();
  if (body.length < 20 || body.length > 600) return json({ error: "Please write between 20 and 600 characters", field: "body" }, 422);
  const name = String(b.show_name || "").trim().slice(0, 30) || null;
  const city = String(b.show_city || "").trim().slice(0, 40) || null;
  for (const [f, v] of [["body", body], ["show_name", name], ["show_city", city]]) {
    const hit = v && findContactInfo(v);
    if (hit) return json({ error: `Please remove ${hit} from your review.`, field: f }, 422);
  }
  if (await rateLimited(env, `review:${me.id}`, 3, 86400)) return json({ error: "Please try again tomorrow." }, 429);

  await env.DB.prepare(`DELETE FROM reviews WHERE member_id = ?1`).bind(me.id).run();
  await env.DB.prepare(`INSERT INTO reviews (member_id, rating, body, show_name, show_city) VALUES (?1,?2,?3,?4,?5)`).bind(me.id, rating, body, name, city).run();
  return json({ ok: true });
}
