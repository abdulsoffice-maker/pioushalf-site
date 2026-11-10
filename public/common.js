// Small helpers shared by the dashboard and guardian pages.
// esc() must wrap every piece of member-written text that goes into innerHTML.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, method = "GET", body) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

function say(id, msg, cls) { const el = $(id); if (el) { el.textContent = msg || ""; el.className = "status " + (cls || ""); } }

const STATUS_LABEL = {
  awaiting_sender_guardian: "Waiting for your guardian",
  awaiting_recipient_guardian: "Waiting for their guardian",
  awaiting_recipient: "Waiting for their reply",
  approved: "Approved. The Discussion Room opens in the next release.",
  declined: "Declined",
  withdrawn: "Withdrawn",
};

function goSignIn() {
  location.href = "/join.html?next=" + encodeURIComponent(location.pathname + location.search);
}

async function signOut() { await api("/api/auth/logout", "POST"); location.href = "/join.html"; }
