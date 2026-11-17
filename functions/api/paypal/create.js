// POST /api/paypal/create { plan, name, email, country, sister }  -> creates a PayPal order (USD) and the pending order here.
import { PLANS_USD, paypalBase, paypalToken } from "../../_paypal.js";
import { launchStatus, sisterEligible, discountFor } from "../../_plans.js";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env, fetchFn = fetch }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const plan = PLANS_USD[b.plan];
  const email = String(b.email || "").trim().toLowerCase();
  const name = String(b.name || "").trim(), country = String(b.country || "").trim();
  if (!plan || name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || country.length < 2) return json({ error: "Please complete all required fields" }, 400);
  if (plan && plan.limited && !(await launchStatus(env)).open) return json({ error: "The launch offer has ended. Please choose another plan." }, 409);
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) return json({ error: "PayPal is not switched on yet" }, 503);

  const disc = discountFor(b.plan, await sisterEligible(request, env), b.email);
  const cents = disc ? plan.cents / 2 : plan.cents;
  let token, order;
  try {
    token = await paypalToken(env, fetchFn);
    const r = await fetchFn(`${paypalBase(env)}/v2/checkout/orders`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ reference_id: b.plan, description: `Salaamify ${b.plan} membership (${plan.months} months)`,
        custom_id: "pioushalf", amount: { currency_code: "USD", value: (cents / 100).toFixed(2) } }] }),
    });
    if (!r.ok) throw new Error("create failed");
    order = await r.json();
  } catch { return json({ error: "Payment provider error. Please try again." }, 502); }

  await env.DB.prepare(
    `INSERT INTO customers (name,email,phone,state,gstin,is_sister_discount_requested) VALUES (?1,?2,'-',?3,NULL,?4)
     ON CONFLICT(email) DO UPDATE SET name=?1, state=?3, is_sister_discount_requested=?4`
  ).bind(name.slice(0, 120), email, country.slice(0, 60), (b.sister && !disc) ? 1 : 0).run();
  const cust = await env.DB.prepare("SELECT id FROM customers WHERE email=?1").bind(email).first();
  await env.DB.prepare(
    `INSERT INTO orders (customer_id,plan,months,amount_paise,taxable_paise,cgst_paise,sgst_paise,igst_paise,gst_rate,place_of_supply,razorpay_order_id,provider,currency,amount_minor,discount_pct)
     VALUES (?1,?2,?3,0,0,0,0,0,0,'Outside India (export of services)',?4,'paypal','USD',?5,?6)`
  ).bind(cust.id, b.plan, plan.months, "pp_" + order.id, cents, disc).run();
  return json({ id: order.id });
}
