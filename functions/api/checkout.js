// POST /api/checkout  -> creates a Razorpay order and stores the customer + pending order in D1.
// Prices live here (server side) so the browser can never change the amount.
const PLANS = {
  founding: { months: 3, rupees: 999 },
  standard: { months: 3, rupees: 2999 },
  premium:  { months: 6, rupees: 3999 },
  plus:     { months: 12, rupees: 5999 },
};
const HOME_STATE = "Maharashtra"; // CHANGE to your registered GST state

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const plan = PLANS[b.plan];
  const email = String(b.email || "").trim().toLowerCase();
  if (!plan || !b.name || !/^\S+@\S+\.\S+$/.test(email) || !b.phone || !b.state) return json({ error: "Please complete all required fields" }, 400);
  if (b.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(b.gstin)) return json({ error: "GSTIN format looks incorrect" }, 400);

  // Sister discount is NOT applied automatically: staff verify first and refund/adjust. Charge full price here.
  const gstRate = Number(env.GST_RATE || 18);
  const amount = plan.rupees * 100;
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
    body: JSON.stringify({ amount, currency: "INR", receipt: "sal_" + Date.now(), notes: { plan: b.plan, email } }),
  });
  if (!rz.ok) return json({ error: "Payment provider error. Please try again." }, 502);
  const order = await rz.json();

  await env.DB.prepare(
    `INSERT INTO customers (name,email,phone,state,gstin,is_sister_discount_requested) VALUES (?1,?2,?3,?4,?5,?6)
     ON CONFLICT(email) DO UPDATE SET name=?1, phone=?3, state=?4, gstin=?5, is_sister_discount_requested=?6`
  ).bind(String(b.name).slice(0, 120), email, String(b.phone).slice(0, 20), b.state, b.gstin || null, b.sister ? 1 : 0).run();
  const cust = await env.DB.prepare("SELECT id FROM customers WHERE email=?1").bind(email).first();

  await env.DB.prepare(
    `INSERT INTO orders (customer_id,plan,months,amount_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,gst_rate,place_of_supply,razorpay_order_id)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
  ).bind(cust.id, b.plan, plan.months, amount, taxable, cgst, sgst, igst, gstRate, b.state, order.id).run();

  return json({ key: env.RAZORPAY_KEY_ID, amount, razorpay_order_id: order.id });
}
