// Wraps every request. If an API call crashes or answers 5xx, the fault is written to error_log (shown in the admin Errors tab)
// and the visitor gets a calm message instead of a stack trace. Logging never breaks the request itself.
export async function onRequest(context) {
  const { request, env } = context;
  const path = new URL(request.url).pathname;
  const isApi = path.startsWith("/api/");
  let response;
  try {
    response = await context.next();
  } catch (err) {
    await record(env, request, path, 500, err);
    return new Response(JSON.stringify({ error: "Something went wrong on our side. We have been told and are looking into it. Please try again shortly." }),
      { status: 500, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }
  if (isApi && response.status >= 500) await record(env, request, path, response.status, "Responded with " + response.status);
  return response;
}

async function record(env, request, path, status, err) {
  try {
    const recent = await env.DB.prepare(`SELECT COUNT(*) AS c FROM error_log WHERE created_at > datetime('now','-1 minute')`).first();
    if (recent.c >= 50) return; // a flood of one fault should not fill the log
    const msg = String((err && err.message) || err).slice(0, 300);
    await env.DB.prepare(`INSERT INTO error_log (method, path, status, message) VALUES (?1, ?2, ?3, ?4)`).bind(request.method, path.slice(0, 200), status, msg).run();
  } catch {}
}
