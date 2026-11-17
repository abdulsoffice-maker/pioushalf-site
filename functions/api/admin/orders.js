// GET /api/admin/orders            -> paid orders (membership and revenue view), newest first
// GET /api/admin/orders?format=csv -> the same rows as a CSV whose columns match the Transactions tab of the GST sheet,
//                                    so it can be pasted straight in for GSTR-1 filing.
import { json, adminGate, csvCell } from "../../_lib.js";

import { PLAN_LABELS as PLAN_NAMES } from "../../_plans.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const sp = new URL(request.url).searchParams;
  const csv = sp.get("format") === "csv";
  const exportRows = sp.get("kind") === "export";   // overseas (USD, zero-rated) orders have their own list and CSV

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.plan, o.months, o.amount_paise, o.taxable_paise, o.cgst_paise, o.sgst_paise, o.igst_paise, o.place_of_supply,
            o.razorpay_payment_id, o.invoice_no, o.currency, o.amount_minor, o.provider, o.membership_start, o.membership_end, o.paid_at, c.name, c.email, c.gstin
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.status = 'paid' AND o.currency = ?2 ORDER BY o.paid_at DESC, o.id DESC LIMIT ?1`
  ).bind(csv ? 5000 : 200, exportRows ? "USD" : "INR").all();

  if (!csv) return json({ orders: results.map(o => ({ ...o, plan_name: PLAN_NAMES[o.plan] || o.plan, active: o.membership_end >= new Date().toISOString().slice(0, 10) })) });

  const head = ["Date", "Invoice No", "Customer", "Customer GSTIN", "Place of supply", "Plan", "Razorpay Payment ID", exportRows ? "Total paid (USD, no GST)" : "Total paid (INR, GST included)", "Status"];
  const rows = results.map(o => [
    String(o.paid_at || "").slice(0, 10), o.invoice_no, o.name, o.gstin || "", o.place_of_supply,
    `${PLAN_NAMES[o.plan] || o.plan} (${o.months} months)`, o.razorpay_payment_id, (exportRows ? o.amount_minor / 100 : o.amount_paise / 100).toFixed(2), "paid",
  ]);
  const body = [head, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, { headers: {
    "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="salaamify-transactions${exportRows ? "-export" : ""}.csv"`, "cache-control": "no-store",
  } });
}
