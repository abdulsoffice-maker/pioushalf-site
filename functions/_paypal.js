// PayPal helpers. Prices for members outside India are set here, on the server, in US dollars (cents).
// CHANGE THESE to your final USD prices. Export of services: no GST is charged (see invoice note).
export const PLANS_USD = {
  founding: { months: 3,  cents: 1200 },
  standard: { months: 3,  cents: 3500 },
  premium:  { months: 6,  cents: 4500 },
  plus:     { months: 12, cents: 7000 },
};
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
