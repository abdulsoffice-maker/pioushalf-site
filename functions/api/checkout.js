// POST /api/checkout  -> creates a Razorpay order and stores the customer + pending order in D1.
// Prices live here (server side) so the browser can never change the amount.
import { PLANS, launchStatus, sisterEligible, discountFor } from "../_plans.js";
const HOME_STATE = "Maharashtra"; // CHANGE to your registered GST state

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const plan = PLANS[b.plan];
  if (plan && plan.limited && !(await launchStatus(env)).open) return json({ error: "The launch offer has ended. Please choose another plan." }, 409);
  const email = String(b.email || "").trim().toLowerCase();
  if (!plan || !b.name || !/^\S+@\S+\.\S+$/.test(email) || !b.phone || !b.state) return json({ error: "Please complete all required fields" }, 400);
  if (b.state === "Outside India") return json({ error: "Members outside India pay in US dollars with PayPal. Please choose that option." }, 400);
  if (b.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(b.gstin)) return json({ error: "GSTIN format looks incorrect" }, 400);

  // A verified sister who is signed in pays half here. Sisters who pay full first are refunded 50% after verification (see _refund.js).
  const gstRate = Number(env.GST_RATE || 18);
  const disc = discountFor(b.plan, await sisterEligible(request, env), b.email);
  const amount = disc ? plan.inr * 50 : plan.inr * 100;
  const taxable = Math.round(amount / (1 + gstRate / 100)); // price is GST-inclusive
  const gst = amount - taxable;
  const intra = b.state === HOME_STATE;
  const cgst = intra ? Math.floor(gst / 2) : 0;
  const sgst = intra ? gst - cgst : 0;
  const igst = intra ? 0 : gst;

  const auth = "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const rz = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify({ amount, currency: "INR", receipt: "pioushalf_" + Date.now(), notes: { site: "pioushalf", plan: b.plan, email } }),
  });
  if (!rz.ok) return json({ error: "Payment provider error. Please try again." }, 502);
  const order = await rz.json();

  await env.DB.prepare(
    `INSERT INTO customers (name,email,phone,state,gstin,is_sister_discount_requested) VALUES (?1,?2,?3,?4,?5,?6)
     ON CONFLICT(email) DO UPDATE SET name=?1, phone=?3, state=?4, gstin=?5, is_sister_discount_requested=?6`
  ).bind(String(b.name).slice(0, 120), email, String(b.phone).slice(0, 20), b.state, b.gstin || null, (b.sister && !disc) ? 1 : 0).run();
  const cust = await env.DB.prepare("SELECT id FROM customers WHERE email=?1").bind(email).first();

  await env.DB.prepare(
    `INSERT INTO orders (customer_id,plan,months,amount_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,gst_rate,place_of_supply,razorpay_order_id,discount_pct)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
  ).bind(cust.id, b.plan, plan.months, amount, taxable, cgst, sgst, igst, gstRate, b.state, order.id, disc).run();

  return json({ key: env.RAZORPAY_KEY_ID, amount, razorpay_order_id: order.id });
}
