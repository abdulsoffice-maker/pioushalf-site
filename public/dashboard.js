let me = null;
let nextOffset = 0;

function meta(p) {
  return [p.city, p.country].filter(Boolean).join(", ") + (p.profession ? " · " + p.profession : "");
}

function renderGuardians() {
  const list = me.guardians || [];
  $("guardianList").innerHTML = list.length
    ? list.map(g => `<li><span><b>${esc(g.name)}</b> <span class="muted">(${esc(g.relationship)})</span><br>
        <span class="pill ${g.status === "active" ? "ok" : ""}">${g.status === "active" ? "Accepted" : "Invitation sent"}</span></span>
        <button class="linkbtn" data-remove="${Number(g.id)}">Remove</button></li>`).join("")
    : `<li class="muted">No guardian yet. Add one to unlock introductions.</li>`;
  $("inviteForm").hidden = list.length >= 2;
  const verified = (me.verification || []).some(v => v.level === "guardian" && v.status === "verified");
  $("trustLine").textContent = `Trust score ${me.trust_score} / 100` + (verified ? "" : ". Add a guardian to start sending interest.");
}

async function refreshMe() {
  const r = await api("/api/me");
  if (!r.ok) return goSignIn();
  me = r.data;
  renderGuardians();
}

$("inviteForm").elements.relationship.addEventListener("change", e => {
  const other = e.target.value === "Other";
  $("otherRow").hidden = !other;
  $("otherRow").querySelector("input").required = other;
  if (other) $("otherRow").querySelector("input").focus();
});

$("inviteForm").addEventListener("submit", async e => {
  e.preventDefault();
  say("inviteStatus", "Sending…");
  const r = await api("/api/guardian/invite", "POST", Object.fromEntries(new FormData(e.target)));
  if (!r.ok) return say("inviteStatus", r.data.error || "Could not send the invitation", "err");
  e.target.reset();
  $("otherRow").hidden = true;
  say("inviteStatus", "Invitation sent. Your guardian has 7 days to accept.", "ok");
  refreshMe();
});

$("guardianList").addEventListener("click", async e => {
  const id = e.target.dataset.remove;
  if (!id || !confirm("Remove this guardian? If you have no guardian left, your pending introductions are withdrawn.")) return;
  const r = await api("/api/guardian/remove", "POST", { id: Number(id) });
  if (!r.ok) return say("inviteStatus", r.data.error || "Could not remove", "err");
  refreshMe(); loadIntros();
});

function introRow(i, kind) {
  const canWithdraw = kind === "sent" && !["declined", "withdrawn", "approved"].includes(i.status);
  const canReply = kind === "received" && i.status === "awaiting_recipient";
  return `<li><span><b>${esc(i.display_name)}</b>, ${esc(i.age)}<br><span class="muted">${esc(meta(i))}</span>
      ${i.message ? `<br><em>“${esc(i.message)}”</em>` : ""}<br><span class="pill ${i.status === "approved" ? "ok" : ""}">${esc(STATUS_LABEL[i.status] || i.status)}</span></span>
      <span class="actions">${i.room_id ? `<a class="btn gold small" href="/rooms.html?id=${Number(i.room_id)}">Open Discussion Room</a>` : ""}
      ${canWithdraw ? `<button class="linkbtn" data-decide="withdraw" data-id="${Number(i.id)}">Withdraw</button>` : ""}
      ${canReply ? `<button class="btn gold small" data-decide="accept" data-id="${Number(i.id)}">Accept</button>
                    <button class="btn ghost-dark small" data-decide="decline" data-id="${Number(i.id)}">Decline</button>` : ""}</span></li>`;
}

async function loadIntros() {
  const r = await api("/api/interests");
  if (!r.ok) return;
  $("sentList").innerHTML = r.data.sent.length ? r.data.sent.map(i => introRow(i, "sent")).join("") : `<li class="muted">Nothing yet.</li>`;
  $("receivedList").innerHTML = r.data.received.length ? r.data.received.map(i => introRow(i, "received")).join("")
    : `<li class="muted">Nothing yet. Introductions appear here once both guardians have approved.</li>`;
}

document.querySelector("main").addEventListener("click", async e => {
  const d = e.target.dataset;
  if (d.decide) {
    const r = await api("/api/interests/decide", "POST", { id: Number(d.id), decision: d.decide });
    if (!r.ok) return say("introStatus", r.data.error || "Could not update", "err");
    say("introStatus", "");
    loadIntros(); loadBrowse(true);
  }
  if (d.send) {
    const card = e.target.closest(".pcard");
    card.querySelector(".sendbox").hidden = false;
    e.target.hidden = true;
    card.querySelector("textarea").focus();
  }
  if (d.cancel) {
    const card = e.target.closest(".pcard");
    card.querySelector(".sendbox").hidden = true;
    card.querySelector("[data-send]").hidden = false;
  }
  if (d.confirm) {
    const card = e.target.closest(".pcard");
    const message = card.querySelector("textarea").value;
    const err = card.querySelector(".status");
    err.textContent = "Sending…"; err.className = "status";
    const r = await api("/api/interests", "POST", { to_member_id: Number(d.confirm), message });
    if (!r.ok) { err.textContent = r.data.error || "Could not send"; err.className = "status err"; return; }
    loadIntros(); loadBrowse(true);
  }
});

function card(p) {
  const status = p.interest_status && !["declined", "withdrawn"].includes(p.interest_status) ? STATUS_LABEL[p.interest_status] : null;
  return `<article class="pcard">
    <h3>${esc(p.display_name)}, ${esc(p.age)}</h3>
    <p class="muted">${esc(meta(p))}</p>
    <p class="small">${esc([p.religious_commitment, p.prayer_consistency && "Prayer: " + p.prayer_consistency].filter(Boolean).join(" · "))}</p>
    <p><span class="pill ok">Trust ${Number(p.trust_score)} / 100</span></p>
    ${p.about ? `<p class="clamp">${esc(p.about)}</p>` : ""}
    ${status ? `<p class="pill">${esc(status)}</p>` : `
      <button class="btn gold small" data-send="${Number(p.id)}">Send interest</button>
      <div class="sendbox form" hidden>
        <label>A short, respectful note (optional)<textarea rows="3" maxlength="400"></textarea></label>
        <div><button class="btn gold small" data-confirm="${Number(p.id)}">Send</button> <button class="linkbtn" data-cancel="1">Cancel</button></div>
        <p class="status" role="status"></p>
      </div>`}
  </article>`;
}

async function loadBrowse(reset) {
  if (reset) nextOffset = 0;
  if (nextOffset == null) return;
  const q = new URLSearchParams(new FormData($("filterForm")));
  for (const [k, v] of [...q]) if (!v) q.delete(k);
  q.set("offset", nextOffset);
  const r = await api("/api/browse?" + q);
  if (!r.ok) { $("results").innerHTML = ""; return say("browseStatus", r.data.error || "Could not load profiles", "err"); }
  say("browseStatus", "");
  const html = r.data.profiles.map(card).join("");
  if (reset || nextOffset === 0) $("results").innerHTML = html || "";
  else $("results").insertAdjacentHTML("beforeend", html);
  if (nextOffset === 0 && !r.data.profiles.length) say("browseStatus", "No profiles match yet. New members join every week, insha'Allah.");
  nextOffset = r.data.next_offset;
  $("moreBtn").hidden = nextOffset == null;
}

$("filterForm").addEventListener("submit", e => { e.preventDefault(); loadBrowse(true); });
$("moreBtn").addEventListener("click", () => loadBrowse(false));
$("logoutBtn").addEventListener("click", signOut);

(async function init() {
  const r = await api("/api/me");
  if (!r.ok) return goSignIn();
  me = r.data;
  if (!me.profile || !me.member.gender) { location.href = "/join.html"; return; }
  $("hello").textContent = `Assalamu alaikum, ${me.profile.display_name}`;
  if (me.is_admin) { const a = document.createElement("a"); a.href = "/admin.html"; a.textContent = "Admin"; document.querySelector(".nav nav").appendChild(a); }
  renderGuardians();
  loadIntros();
  loadBrowse(true);
})();
