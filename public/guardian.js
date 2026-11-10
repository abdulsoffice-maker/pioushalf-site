const token = new URLSearchParams(location.search).get("token");

function line(p) { return [p.city, p.country].filter(Boolean).join(", ") + (p.profession ? " · " + p.profession : ""); }

async function loadWards() {
  const r = await api("/api/guardian/wards");
  if (!r.ok) return goSignIn();
  const { wards, pending } = r.data;

  $("wardList").innerHTML = wards.length
    ? wards.map(w => `<li><span><b>${esc(w.display_name || "Member")}</b> <span class="muted">(you are their ${esc(String(w.relationship || "guardian").toLowerCase())})</span></span></li>`).join("")
    : `<li class="muted">You are not looking after anyone yet.</li>`;

  $("pendingList").innerHTML = pending.length
    ? pending.map(p => {
        const who = p.side === "sender_side"
          ? `${esc(p.ward_name)} would like to be introduced to:`
          : `Someone would like to be introduced to ${esc(p.ward_name)}:`;
        return `<li class="stack"><span>${who}<br><b>${esc(p.display_name)}</b>, ${esc(p.age)}<br>
          <span class="muted">${esc(line(p))}${p.education ? " · " + esc(p.education) : ""}</span><br>
          <span class="small">${esc([p.religious_commitment, p.prayer_consistency && "Prayer: " + p.prayer_consistency].filter(Boolean).join(" · "))}</span>
          ${p.about ? `<br>${esc(p.about)}` : ""}${p.message ? `<br><em>“${esc(p.message)}”</em>` : ""}</span>
          <span class="actions"><button class="btn gold small" data-decide="approve" data-id="${Number(p.id)}">Approve</button>
          <button class="btn ghost-dark small" data-decide="decline" data-id="${Number(p.id)}">Decline</button></span></li>`;
      }).join("")
    : `<li class="muted">Nothing waiting. We will email you when there is something to review.</li>`;
}

async function loadRooms() {
  const r = await api("/api/rooms");
  const rooms = (r.data.rooms || []).filter(x => x.my_role === "guardian");
  const label = { awaiting_guardians: "Waiting for guardians", open: "Open", paused: "Paused for review", closed: "Closed" };
  $("roomList").innerHTML = rooms.length
    ? rooms.map(x => `<li><span><b>${esc(x.title)}</b><br><span class="pill ${x.status === "open" ? "ok" : ""}">${esc(label[x.status] || x.status)}</span></span>
        <a class="btn gold small" href="/rooms.html?id=${Number(x.id)}">Open</a></li>`).join("")
    : `<li class="muted">No rooms yet. One opens when an introduction you approved is accepted.</li>`;
}

$("pendingList").addEventListener("click", async e => {
  const d = e.target.dataset;
  if (!d.decide) return;
  const r = await api("/api/interests/decide", "POST", { id: Number(d.id), decision: d.decide });
  if (!r.ok) return say("pendingStatus", r.data.error || "Could not update", "err");
  say("pendingStatus", "");
  loadWards();
});

$("acceptBtn").addEventListener("click", async () => {
  say("acceptStatus", "Accepting…");
  const r = await api("/api/guardian/accept", "POST", { token });
  if (!r.ok) return say("acceptStatus", r.data.error || "Could not accept", "err");
  history.replaceState(null, "", "/guardian.html");
  $("acceptPanel").hidden = true;
  loadWards();
});

$("logoutBtn").addEventListener("click", signOut);

(async function init() {
  const r = await api("/api/me");
  if (!r.ok) return goSignIn();
  if (token) $("acceptPanel").hidden = false;
  loadWards();
  loadRooms();
})();
