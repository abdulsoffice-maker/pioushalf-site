$("supportForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target, body = Object.fromEntries(new FormData(f));
  say("supportStatus", "Sending…");
  const r = await api("/api/support", "POST", body);
  if (r.ok) { f.reset(); say("supportStatus", "Thank you. We have your message and will reply by email.", "ok"); }
  else say("supportStatus", r.data.error || "Something went wrong. Please try again.", "err");
});
