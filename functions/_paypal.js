// PayPal helpers. Prices for members outside India are set here, on the server, in US dollars (cents).
// Prices come from _plans.js. Export of services: no GST is charged (see invoice note).
import { PLANS } from "./_plans.js";
export const PLANS_USD = Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, { months: p.months, cents: p.usd * 100, limited: !!p.limited }]));
export const paypalBase = env => (env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com");

export async function paypalToken(env, fetchFn = fetch) {
  const r = await fetchFn(`${paypalBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: "Basic " + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`), "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error("PayPal sign-in failed");
  return (await r.json()).access_token;
}
