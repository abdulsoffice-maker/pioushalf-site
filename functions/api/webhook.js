// POST /api/webhook  -> Razorpay server-to-server confirmation (covers users who close the tab after paying).
// In Razorpay Dashboard > Webhooks, add https://YOUR-DOMAIN/api/webhook with event payment.captured
// and set the same secret as RAZORPAY_WEBHOOK_SECRET.
import { markPaid } from "./verify.js";

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map(x => x.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost({ request, env }) {
  const raw = await request.text();
  const sig = request.headers.get("x-razorpay-signature") || "";
  if ((await hmacHex(env.RAZORPAY_WEBHOOK_SECRET, raw)) !== sig) return new Response("bad signature", { status: 401 });

  const evt = JSON.parse(raw);
  if (evt.event === "payment.captured") {
    const p = evt.payload.payment.entity;
    await markPaid(env, p.order_id, p.id);
  }
  return new Response("ok");
}
