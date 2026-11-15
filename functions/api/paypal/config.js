// GET /api/paypal/config -> the public client id the PayPal button needs, and the plan prices in USD.
import { PLANS_USD } from "../../_paypal.js";
export async function onRequestGet({ env }) {
  const prices = Object.fromEntries(Object.entries(PLANS_USD).map(([k, v]) => [k, v.cents / 100]));
  return new Response(JSON.stringify({ enabled: !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET), client_id: env.PAYPAL_CLIENT_ID || null, prices }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
