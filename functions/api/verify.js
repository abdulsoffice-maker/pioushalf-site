// POST /api/verify -> checks the Razorpay signature, marks the order paid, numbers the invoice,
// stores the invoice HTML in R2 and sets the membership dates.
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function financialYear(d = new Date()) {
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}
const inr = p => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 });

export async function markPaid(env, razorpay_order_id, razorpay_payment_id) {
  const o = await env.DB.prepare(
    `SELECT o.*, c.name, c.email, c.phone, c.gstin FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.razorpay_order_id=?1`
  ).bind(razorpay_order_id).first();
  if (!o) return null;
  if (o.status === "paid") return o; // idempotent: webhook + browser can both call this

  const fy = financialYear();
  await env.DB.prepare(`INSERT INTO invoice_counter (fy,last_no) VALUES (?1,0) ON CONFLICT(fy) DO NOTHING`).bind(fy).run();
  await env.DB.prepare(`UPDATE invoice_counter SET last_no=last_no+1 WHERE fy=?1`).bind(fy).run();
  const { last_no } = await env.DB.prepare(`SELECT last_no FROM invoice_counter WHERE fy=?1`).bind(fy).first();
  const invoice_no = `SAL/${fy}/${String(last_no).padStart(5, "0")}`;

  const start = new Date();
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + o.months);
  const key = `invoices/${fy}/${invoice_no.replaceAll("/", "-")}.html`;

  const html = `<!doctype html><meta charset="utf-8"><title>Tax Invoice ${invoice_no}</title>
<body style="font-family:Arial,sans-serif;max-width:720px;margin:auto">
<h1>Tax Invoice</h1><p><b>Salaamify Group</b><br>GSTIN: ${env.SELLER_GSTIN || "ADD-YOUR-GSTIN"}<br>${env.SELLER_ADDRESS || ""}</p>
<p>Invoice: ${invoice_no}<br>Date: ${start.toISOString().slice(0, 10)}<br>Place of supply: ${o.place_of_supply}</p>
<p>Billed to: ${o.name}<br>${o.email}${o.gstin ? "<br>GSTIN: " + o.gstin : ""}</p>
<table border="1" cellpadding="8" cellspacing="0" width="100%">
<tr><th align="left">Description</th><th>SAC</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Total</th></tr>
<tr><td>Salaamify™ ${o.plan} membership (${o.months} months)</td><td>998439</td><td>${inr(o.taxable_paise)}</td><td>${inr(o.cgst_paise)}</td><td>${inr(o.sgst_paise)}</td><td>${inr(o.igst_paise)}</td><td>${inr(o.amount_paise)}</td></tr></table>
<p>GST rate ${o.gst_rate}%. Payment ID: ${razorpay_payment_id}. This is a computer-generated invoice.</p></body>`;

  await env.BUCKET.put(key, html, { httpMetadata: { contentType: "text/html" } });
  await env.DB.prepare(
    `UPDATE orders SET status='paid', razorpay_payment_id=?1, invoice_no=?2, invoice_r2_key=?3, membership_start=?4, membership_end=?5, paid_at=datetime('now') WHERE id=?6`
  ).bind(razorpay_payment_id, invoice_no, key, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), o.id).run();
  await env.DB.prepare(`INSERT INTO audit_log (actor,action,detail) VALUES ('system','order_paid',?1)`).bind(invoice_no).run();
  return { ...o, invoice_no };
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = b;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) return json({ error: "Missing payment details" }, 400);

  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
  if (expected !== razorpay_signature) return json({ error: "Payment signature mismatch" }, 400);

  const o = await markPaid(env, razorpay_order_id, razorpay_payment_id);
  if (!o) return json({ error: "Order not found" }, 404);
  return json({ ok: true, invoice_no: o.invoice_no });
}
