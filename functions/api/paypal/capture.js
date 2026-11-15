// POST /api/paypal/capture { orderID } -> takes the payment PayPal approved, checks amount and currency, then confirms the order.
import { paypalBase, paypalToken } from "../../_paypal.js";
import { markPaid } from "../verify.js";
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

export async function onRequestPost({ request, env, fetchFn = fetch }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const id = String(b.orderID || "");
  if (!/^[A-Z0-9]{10,30}$/.test(id)) return json({ error: "Invalid order" }, 400);
  const row = await env.DB.prepare(`SELECT id, status, amount_minor, currency FROM orders WHERE razorpay_order_id = ?1 AND provider = 'paypal'`).bind("pp_" + id).first();
  if (!row) return json({ error: "Order not found" }, 404);
  if (row.status === "paid") { const o = await markPaid(env, "pp_" + id, null); return json({ ok: true, invoice_no: o.invoice_no }); }

  let cap;
  try {
    const token = await paypalToken(env, fetchFn);
    const r = await fetchFn(`${paypalBase(env)}/v2/checkout/orders/${id}/capture`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });
    if (!r.ok) throw new Error("capture failed");
    cap = await r.json();
  } catch { return json({ error: "We could not complete the PayPal payment. You have not been charged. Please try again." }, 502); }

  const c = cap.purchase_units && cap.purchase_units[0] && cap.purchase_units[0].payments && cap.purchase_units[0].payments.captures && cap.purchase_units[0].payments.captures[0];
  if (!c || cap.status !== "COMPLETED" || c.status !== "COMPLETED") return json({ error: "The payment is not complete yet. If PayPal took money, we will confirm it by email." }, 402);
  if (c.amount.currency_code !== row.currency || Math.round(parseFloat(c.amount.value) * 100) !== row.amount_minor) return json({ error: "Payment amount did not match. Please contact support." }, 400);

  const o = await markPaid(env, "pp_" + id, c.id);
  return json({ ok: true, invoice_no: o.invoice_no });
}
