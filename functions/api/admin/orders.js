// GET /api/admin/orders            -> paid orders (membership and revenue view), newest first
// GET /api/admin/orders?format=csv -> the same rows as a CSV whose columns match the Transactions tab of the GST sheet,
//                                    so it can be pasted straight in for GSTR-1 filing.
import { json, adminGate, csvCell } from "../../_lib.js";

const PLAN_NAMES = { founding: "Founding Member", standard: "Standard Marriage", premium: "Premium Marriage", plus: "Premium Marriage Plus" };

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const csv = new URL(request.url).searchParams.get("format") === "csv";

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.plan, o.months, o.amount_paise, o.taxable_paise, o.cgst_paise, o.sgst_paise, o.igst_paise, o.place_of_supply,
            o.razorpay_payment_id, o.invoice_no, o.membership_start, o.membership_end, o.paid_at, c.name, c.email, c.gstin
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.status = 'paid' ORDER BY o.paid_at DESC, o.id DESC LIMIT ?1`
  ).bind(csv ? 5000 : 200).all();

  if (!csv) return json({ orders: results.map(o => ({ ...o, plan_name: PLAN_NAMES[o.plan] || o.plan, active: o.membership_end >= new Date().toISOString().slice(0, 10) })) });

  const head = ["Date", "Invoice No", "Customer", "Customer GSTIN", "Place of supply", "Plan", "Razorpay Payment ID", "Total paid (INR, GST included)", "Status"];
  const rows = results.map(o => [
    String(o.paid_at || "").slice(0, 10), o.invoice_no, o.name, o.gstin || "", o.place_of_supply,
    `${PLAN_NAMES[o.plan] || o.plan} (${o.months} months)`, o.razorpay_payment_id, (o.amount_paise / 100).toFixed(2), "paid",
  ]);
  const body = [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, { headers: {
    "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="salaamify-transactions.csv"', "cache-control": "no-store",
  } });
}
