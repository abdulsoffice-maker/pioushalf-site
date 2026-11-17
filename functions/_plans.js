import { getMember } from "./_lib.js";
// The ONE place prices live. Totals are what the member pays once, GST-inclusive in India, no GST abroad.
// inr = rupees, usd = dollars. Monthly rates are shown for comparison only.
export const PLANS = {
  launch:   { months: 12, inr: 3999,  usd: 49,  name: "Launch Offer (12 months)", limited: true },
  standard: { months: 1,  inr: 1599,  usd: 17,  name: "Standard Marriage (1 month)" },
  premium:  { months: 6,  inr: 8394,  usd: 84,  name: "Premium Marriage (6 months)" },    // ₹1,399 / $14 a month
  plus:     { months: 12, inr: 13188, usd: 132, name: "Premium Marriage Plus (12 months)" }, // ₹1,099 / $11 a month
};
// Names for orders saved before the price change.
export const PLAN_LABELS = { founding: "Founding Member (old)", ...Object.fromEntries(Object.entries(PLANS).map(([k, p]) => [k, p.name])) };

// Launch offer: first LAUNCH_CAP paid members, and only until LAUNCH_ENDS (YYYY-MM-DD). Both set in wrangler.toml.
export async function launchStatus(env) {
  const cap = Number(env.LAUNCH_CAP || 1000), ends = env.LAUNCH_ENDS || "";
  const row = await env.DB.prepare(`SELECT COUNT(*) AS c FROM orders WHERE plan = 'launch' AND status = 'paid'`).first();
  const taken = row ? row.c : 0;
  const today = new Date().toISOString().slice(0, 10);
  const open = taken < cap && (!ends || today <= ends);
  return { open, cap, remaining: Math.max(0, cap - taken), ends: ends || null };
}

// "Verify first, pay half": a signed-in sister whose identity is verified pays 50% on every plan except the Launch Offer,
// when she pays with her own account email. Returns that email, or null.
export async function sisterEligible(request, env) {
  const me = await getMember(request, env);
  if (!me || me.gender !== "sister") return null;
  const v = await env.DB.prepare(`SELECT 1 AS ok FROM verifications WHERE member_id = ?1 AND level = 'identity' AND status = 'verified'`).bind(me.id).first();
  return v ? me.email.toLowerCase() : null;
}
export const discountFor = (planKey, eligibleEmail, typedEmail) => (eligibleEmail && eligibleEmail === String(typedEmail).trim().toLowerCase() && planKey !== "launch" ? 50 : 0);
