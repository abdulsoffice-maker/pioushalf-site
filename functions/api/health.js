// GET /api/health -> {"ok":true} when the database and file storage both answer. Point an uptime monitor at this.
export async function onRequestGet({ env }) {
  const out = { ok: true, database: "ok", storage: "ok" };
  try { await env.DB.prepare("SELECT 1").first(); } catch { out.ok = false; out.database = "down"; }
  try { await env.BUCKET.head("health-check"); } catch { out.ok = false; out.storage = "down"; }
  return new Response(JSON.stringify(out), { status: out.ok ? 200 : 503, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}
