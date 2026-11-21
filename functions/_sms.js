// Mobile verification through Twilio Verify (Twilio generates, sends and checks the code; we never see it).
// Secrets to add in Cloudflare Pages: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SID.
export const smsEnabled = env => !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_VERIFY_SID);

// Accepts +E.164, or a 10-digit Indian mobile (starts 6-9) which becomes +91.
export function normalisePhone(input) {
  let s = String(input || "").replace(/[\s\-().]/g, "");
  if (/^0?[6-9]\d{9}$/.test(s)) s = "+91" + s.replace(/^0/, "");
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

async function twilio(env, path, params, fetchFn) {
  const r = await fetchFn(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SID}/${path}`, {
    method: "POST",
    headers: { authorization: "Basic " + btoa(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}
export const sendCode = (env, phone, fetchFn = fetch) => twilio(env, "Verifications", { To: phone, Channel: "sms" }, fetchFn);
export const checkCode = (env, phone, code, fetchFn = fetch) => twilio(env, "VerificationCheck", { To: phone, Code: code }, fetchFn);
