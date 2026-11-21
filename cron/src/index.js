// pioushalf-cron: keeps the site tidy and catches what could slip through.
//   every 30 minutes  reconcile: an order paid at Razorpay but never confirmed here (closed tab and missed webhook) is confirmed now.
//   daily 03:00 IST   cleanup of expired codes and sessions, and an email if the site recorded errors.
import { markPaid } from "../../functions/api/verify.js";
import { sendMail } from "../../functions/_lib.js";

export async function reconcile(env, fetchFn = fetch) {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) return { skipped: true };
  const { results } = await env.DB.prepare(
    `SELECT razorpay_order_id AS id FROM orders WHERE status = 'created' AND provider = 'razorpay' AND created_at < datetime('now','-10 minutes') AND created_at > datetime('now','-3 days') ORDER BY id LIMIT 20`
  ).all();
  let confirmed = 0;
  const auth = "Basic " + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  for (const o of results) {
    try {
      const r = await fetchFn(`https://api.razorpay.com/v1/orders/${encodeURIComponent(o.id)}/payments`, { headers: { authorization: auth } });
      if (!r.ok) continue;
      const pay = ((await r.json()).items || []).find(p => p.status === "captured");
      if (pay) { await markPaid(env, o.id, pay.id); confirmed++; }
    } catch (err) {
      try { await env.DB.prepare(`INSERT INTO error_log (method, path, status, message) VALUES ('CRON', 'reconcile', 500, ?1)`).bind(`${o.id}: ${String((err && err.message) || err).slice(0, 250)}`).run(); } catch {}
    }
  }
  return { checked: results.length, confirmed };
}

export async function cleanup(env) {
  await env.DB.prepare(`DELETE FROM login_codes WHERE created_at < datetime('now','-1 day')`).run();
  await env.DB.prepare(`DELETE FROM rate_hits WHERE created_at < datetime('now','-1 day')`).run();
  await env.DB.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run();
  await env.DB.prepare(`DELETE FROM error_log WHERE status_flag = 'resolved' AND created_at < datetime('now','-90 days')`).run();
  const e = await env.DB.prepare(`SELECT COUNT(*) AS c FROM error_log WHERE status_flag = 'open'`).first();
  if (e.c > 0) {
    await sendMail(env, { to: env.SUPPORT_NOTIFY || "peace@pioushalf.com", subject: `PiousHalf: ${e.c} site error(s) need a look`,
      text: `The site recorded ${e.c} open error(s). Open the admin Errors tab: ${env.SITE_URL || "https://pioushalf.com"}/admin.html` });
  }
  return { open_errors: e.c };
}

// Daily copy of the database into the private bucket (backups/YYYY-MM-DD.json); copies older than 30 days are deleted.
// Login codes, sessions and rate counters are left out because they are short-lived secrets.
export async function backup(env) {
  const skip = new Set(["sessions", "login_codes", "rate_hits"]);
  const { results: tables } = await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`).all();
  const dump = { taken_at: new Date().toISOString(), tables: {} };
  for (const t of tables) {
    if (skip.has(t.name) || !/^[A-Za-z0-9_]+$/.test(t.name)) continue;
    const { results } = await env.DB.prepare(`SELECT * FROM ${t.name} LIMIT 100000`).all();
    dump.tables[t.name] = results;
  }
  const day = new Date().toISOString().slice(0, 10);
  await env.BUCKET.put(`backups/${day}.json`, JSON.stringify(dump), { httpMetadata: { contentType: "application/json" } });
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const list = await env.BUCKET.list({ prefix: "backups/" });
  let removed = 0;
  for (const o of list.objects) {
    const d = o.key.slice(8, 18);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d < cutoff) { await env.BUCKET.delete(o.key); removed++; }
  }
  return { tables: Object.keys(dump.tables).length, removed };
}

export default {
  async scheduled(event, env) {
    if (event.cron === "*/30 * * * *") await reconcile(env);
    else {
      await cleanup(env);
      try { await backup(env); } catch (err) {
        try { await env.DB.prepare(`INSERT INTO error_log (method, path, status, message) VALUES ('CRON', 'backup', 500, ?1)`).bind(String((err && err.message) || err).slice(0, 300)).run(); } catch {}
      }
    }
  },
};
