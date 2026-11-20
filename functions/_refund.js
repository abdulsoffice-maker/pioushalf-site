// Sister discount: members who are sisters get 50% back on Standard, Premium and Plus once her identity is verified.
// It fires by itself the moment both are true: (1) she paid and asked for the discount, (2) her identity verification is approved.
// It never applies to the Launch Offer. A sister must verify within 30 days of paying.
import { sendMail } from "./_lib.js";
import { paypalBase, paypalToken } from "./_paypal.js";

export async function applySisterDiscountForEmail(env, email, fetchFn = fetch) {
  const m = await env.DB.prepare(
    `SELECT m.id FROM members m JOIN verifications v ON v.member_id = m.id AND v.level = 'identity' AND v.status = 'verified'
     WHERE m.email = ?1 AND m.gender = 'sister' AND m.status = 'active'`).bind(String(email).toLowerCase()).first();
  if (!m) return [];
  const { results } = await env.DB.prepare(
    `SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE c.email = ?1 AND c.is_sister_discount_requested = 1 AND o.status = 'paid' AND o.plan != 'launch'
       AND o.refund_id IS NULL AND o.discount_pct = 0 AND o.paid_at > datetime('now','-30 days')`).bind(String(email).toLowerCase()).all();
  const done = [];
  for (const r of results) done.push(await refundHalf(env, r.id, fetchFn));
  return done;
}

async function refundHalf(env, orderId, fetchFn) {
  // claim the order first so two triggers at once can never refund twice
  const claim = await env.DB.prepare(`UPDATE orders SET refund_id = 'pending' WHERE id = ?1 AND refund_id IS NULL`).bind(orderId).run();
  if (claim.meta && claim.meta.changes === 0) return { id: orderId, skipped: true };
  const o = await env.DB.prepare(`SELECT o.*, c.name, c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?1`).bind(orderId).first();
  const usd = o.currency === "USD";
  const half = usd ? Math.floor(o.amount_minor / 2) : Math.floor(o.amount_paise / 2);
  try {
    let refundId;
    if (usd) {
      const token = await paypalToken(env, fetchFn);
      const r = await fetchFn(`${paypalBase(env)}/v2/payments/captures/${o.razorpay_payment_id}/refund`, {
        method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ amount: { value: (half / 100).toFixed(2), currency_code: "USD" }, note_to_payer: "Sister discount (50%)" }) });
      if (!r.ok) throw new Error("PayPal refund failed");
      refundId = (await r.json()).id;
    } else {
      const r = await fetchFn(`https://api.razorpay.com/v1/payments/${o.razorpay_payment_id}/refund`, {
        method: "POST", headers: { authorization: "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`), "content-type": "application/json" },
        body: JSON.stringify({ amount: half, notes: { site: "pioushalf", reason: "sister discount 50%" } }) });
      if (!r.ok) throw new Error("Razorpay refund failed");
      refundId = (await r.json()).id;
    }
    await env.DB.prepare(`UPDATE orders SET refund_id = ?1, refund_minor = ?2, refunded_at = datetime('now') WHERE id = ?3`).bind(refundId, half, o.id).run();
    await env.DB.prepare(`INSERT INTO audit_log (actor,action,detail) VALUES ('system','sister_discount_refund',?1)`).bind(`${o.invoice_no} ${usd ? "$" : "₹"}${(half / 100).toFixed(2)}`).run();
    try {
      await sendMail(env, { to: o.email, subject: "Your 50% sister discount has been refunded",
        text: `Assalamu alaikum ${o.name},\n\nYour identity is verified, so ${usd ? "$" : "₹"}${(half / 100).toFixed(2)} (50%) has been refunded to your original payment method for invoice ${o.invoice_no}. It usually reaches you in 5 to 7 working days.\n\nPiousHalf, A Gift of Peace` });
    } catch {}
    return { id: orderId, refunded: half };
  } catch (e) {
    // release the claim so it can be retried, and leave a trace for the admin
    await env.DB.prepare(`UPDATE orders SET refund_id = NULL WHERE id = ?1 AND refund_id = 'pending'`).bind(orderId).run();
    await env.DB.prepare(`INSERT INTO error_log (method, path, status, message) VALUES ('SYSTEM', 'sister_refund', 500, ?1)`).bind(`order ${orderId}: ${e.message}`).run();
    return { id: orderId, error: e.message };
  }
}
