// GET /api/plans -> prices for the pricing section, the visitor's country (from Cloudflare) and whether the launch offer is open.
import { PLANS, launchStatus } from "../_plans.js";

export async function onRequestGet({ request, env }) {
  const country = (request.cf && request.cf.country) || request.headers.get("cf-ipcountry") || "";
  const launch = await launchStatus(env);
  const plans = Object.entries(PLANS).filter(([k]) => k !== "launch" || launch.open).map(([key, p]) => ({
    key, name: p.name, months: p.months, inr: p.inr, usd: p.usd,
    inr_month: Math.round(p.inr / p.months), usd_month: Math.round((p.usd / p.months) * 100) / 100,
  }));
  return new Response(JSON.stringify({ country, currency: country === "IN" || !country ? "INR" : "USD", plans, launch }),
    { headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
