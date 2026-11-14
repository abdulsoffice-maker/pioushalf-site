// Admin screens. Every call is checked again on the server, so hiding a tab here is only for tidiness.
const TABS = ["Overview", "Members", "Safety", "Verifications", "Orders", "Support", "Errors", "Audit"];
const inr = p => "₹" + (p / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const view = () => $("view");
let current = "Overview";

function table(head, rows) {
  return `<div class="tblwrap"><table class="tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${head.length}" class="muted">Nothing here.</td></tr>`}</tbody></table></div>`;
}
const td = v => `<td>${esc(v)}</td>`;

const screens = {
  async Overview() {
    const r = await api("/api/admin/summary"); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    const d = r.data, c = (n, l) => `<div class="card"><b>${esc(n)}</b>${esc(l)}</div>`;
    const sum = o => Object.entries(o).map(([k, v]) => `${esc(k.replace(/_/g, " "))}: ${esc(v)}`).join(", ") || "none";
    return `<h2>Overview</h2><div class="cards">
      ${c(d.members.total, "Members")}${c(d.members.with_profile, "With profile")}${c(d.members.guardian_verified, "Guardian verified")}${c(d.members.suspended, "Suspended")}
      ${c(d.safety.open_flags, "Open safety flags")}${c(d.safety.pending_verifications, "Documents to review")}${c(d.safety.open_tickets, "Open support tickets")}${c(d.safety.open_errors, "Site errors to look at")}
      ${c(d.revenue.active_memberships, "Active memberships")}${c(inr(d.revenue.gross_paise), "Total collected")}${c(inr(d.revenue.this_month_gross_paise), "This month")}${c(inr(d.revenue.gst_paise), "GST included in total")}</div>
      <p class="muted">Introductions: ${sum(d.interests)}</p><p class="muted">Discussion rooms: ${sum(d.rooms)}</p>`;
  },
  async Members() {
    const r = await api("/api/admin/members?q=" + encodeURIComponent(screens._q || "")); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    const rows = r.data.members.map(m => `<tr>${td(m.id)}${td(m.display_name || "(no profile)")}${td(m.email)}${td(m.gender || "")}${td(m.trust_score)}${td(m.guardians)}${td(m.status)}
      <td><button class="btn small ${m.status === "active" ? "navybtn" : "gold"}" data-mid="${m.id}" data-to="${m.status === "active" ? "suspended" : "active"}">${m.status === "active" ? "Suspend" : "Reinstate"}</button></td></tr>`);
    return `<h2>Members</h2><form id="memSearch" class="form"><label>Search name or email<input name="q" value="${esc(screens._q || "")}"></label></form>
      <p class="status" id="adminMsg" role="status"></p>${table(["ID", "Name", "Email", "Gender", "Trust", "Guardians", "Status", ""], rows)}`;
  },
  async Safety() {
    const r = await api("/api/admin/flags?status=open"); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    const rows = r.data.flags.map(f => `<tr>${td(f.created_at)}${td(f.display_name || f.email)}${td(f.label)}${td(f.excerpt)}${td(f.member_total_flags)}
      <td><button class="btn small navybtn" data-flag="${f.id}">Mark reviewed</button></td></tr>`);
    return `<h2>Contact-sharing violations</h2><p class="muted">Messages blocked in Discussion Rooms. Three in 24 hours pauses the room automatically.</p><p class="status" id="adminMsg" role="status"></p>${table(["When", "Member", "Type", "Blocked text", "Total flags", ""], rows)}`;
  },
  async Verifications() {
    const r = await api("/api/admin/verifications"); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    const rows = r.data.pending.map(v => `<tr>${td(v.display_name || v.email)}${td(v.age || "")}${td(v.level)}${td(v.created_at)}
      <td><a href="/api/admin/evidence?member_id=${v.member_id}&level=${v.level}" target="_blank" rel="noopener">View document</a></td>
      <td><button class="btn small gold" data-v="${v.member_id}|${v.level}|approve">Approve</button> <button class="btn small navybtn" data-v="${v.member_id}|${v.level}|reject">Reject</button></td></tr>`);
    return `<h2>Identity and photo checks</h2><p class="muted">Compare the document with the profile. The file is deleted when you decide.</p><p class="status" id="adminMsg" role="status"></p>${table(["Member", "Age", "Type", "Uploaded", "", ""], rows)}`;
  },
  async Orders() {
    const r = await api("/api/admin/orders"); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    const rows = r.data.orders.map(o => `<tr>${td((o.paid_at || "").slice(0, 10))}${td(o.invoice_no)}${td(o.name)}${td(o.plan_name)}${td(inr(o.amount_paise))}${td(o.membership_end || "")}${td(o.active ? "Active" : "Expired")}</tr>`);
    return `<h2>Memberships and revenue</h2><p><a class="btn gold small" href="/api/admin/orders?format=csv">Download CSV for the GST sheet</a></p>${table(["Paid", "Invoice", "Customer", "Plan", "Amount", "Ends", "Status"], rows)}`;
  },
  async Support() {
    const r = await api("/api/admin/tickets?status=open"); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    const rows = r.data.tickets.map(t => `<tr>${td(t.created_at)}${td(t.name)}<td><a href="mailto:${esc(t.email)}">${esc(t.email)}</a></td>${td(t.message)}<td><button class="btn small navybtn" data-t="${t.id}">Close</button></td></tr>`);
    return `<h2>Open support tickets</h2><p class="status" id="adminMsg" role="status"></p>${table(["When", "Name", "Email", "Message", ""], rows)}`;
  },
  async Errors() {
    const r = await api("/api/admin/errors"); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    const rows = r.data.errors.map(x => `<tr>${td(x.created_at)}${td(x.method + " " + x.path)}${td(x.status)}${td(x.message)}<td><button class="btn small navybtn" data-err="${x.id}">Resolved</button></td></tr>`);
    return `<h2>Site errors</h2><p class="muted">The site records its own faults here. Visitors only see a calm message. If the same one keeps appearing, tell your developer.</p>
      <p class="status" id="adminMsg" role="status"></p>${rows.length ? `<p><button class="btn small gold" data-err="all">Mark all resolved</button></p>` : ""}${table(["When", "Request", "Code", "What happened", ""], rows)}`;
  },
  async Audit() {
    const r = await api("/api/admin/audit"); if (!r.ok) return `<p class="status err">Could not load.</p>`;
    return `<h2>Audit log</h2>${table(["When", "Who", "Action", "Detail"], r.data.entries.map(e => `<tr>${td(e.created_at)}${td(e.actor)}${td(e.action)}${td(e.detail)}</tr>`))}`;
  },
};

async function open(tab) {
  current = tab;
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-selected", b.textContent === tab));
  view().innerHTML = "<p class='muted'>Loading…</p>";
  view().innerHTML = await screens[tab]();
}

view().addEventListener("click", async e => {
  const b = e.target.closest("button[data-mid],button[data-flag],button[data-v],button[data-t],button[data-err]"); if (!b) return;
  let r;
  if (b.dataset.mid) r = await api("/api/admin/members", "POST", { id: +b.dataset.mid, status: b.dataset.to });
  else if (b.dataset.flag) r = await api("/api/admin/flags", "POST", { id: +b.dataset.flag });
  else if (b.dataset.err) r = await api("/api/admin/errors", "POST", b.dataset.err === "all" ? { all: true } : { id: +b.dataset.err });
  else if (b.dataset.t) r = await api("/api/admin/tickets", "POST", { id: +b.dataset.t, status: "closed" });
  else { const [m, l, d] = b.dataset.v.split("|"); r = await api("/api/admin/verifications", "POST", { member_id: +m, level: l, decision: d }); }
  if (r.ok) await open(current); else say("adminMsg", r.data.error || "Failed", "err");
});
view().addEventListener("submit", e => {
  if (e.target.id !== "memSearch") return;
  e.preventDefault(); screens._q = e.target.elements.q.value.trim(); open("Members");
});
$("logoutBtn").addEventListener("click", signOut);

(async function init() {
  const me = await api("/api/me");
  if (!me.ok) return goSignIn();
  if (!me.data.is_admin) { say("gate", "This area is for the Salaamify team.", "err"); return; }
  $("app").hidden = false;
  $("tabs").innerHTML = TABS.map(t => `<button type="button" role="tab" aria-selected="false">${t}</button>`).join("");
  $("tabs").addEventListener("click", e => { if (e.target.matches("button")) open(e.target.textContent); });
  open("Overview");
})();
