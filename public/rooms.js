const roomId = Number(new URLSearchParams(location.search).get("id")) || 0;
let lastId = 0;
let state = null;

const ROOM_LABEL = { awaiting_guardians: "Waiting for guardians", open: "Open", paused: "Paused for review", closed: "Closed" };

function when(ts) {
  const d = new Date(String(ts).replace(" ", "T") + "Z");
  return isNaN(d) ? "" : d.toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/* ---------- list ---------- */
async function showList() {
  $("listView").hidden = false;
  const r = await api("/api/rooms");
  if (r.status === 401) return goSignIn();
  const rooms = r.data.rooms || [];
  $("roomList").innerHTML = rooms.length
    ? rooms.map(x => `<li><span><b>${esc(x.title)}</b><br><span class="pill ${x.status === "open" ? "ok" : ""}">${esc(ROOM_LABEL[x.status] || x.status)}</span>
        ${x.my_role === "guardian" ? `<span class="pill">You are a guardian here</span>` : ""}</span>
        <a class="btn gold small" href="/rooms.html?id=${Number(x.id)}">Open</a></li>`).join("")
    : `<li class="muted">No rooms yet. A room opens when an introduction is accepted by both families.</li>`;
}

/* ---------- one room ---------- */
function bannerText(room) {
  if (room.status === "awaiting_guardians") {
    const a = room.guardians_joined.sender, b = room.guardians_joined.recipient;
    return `Waiting for a guardian from each family to join (${[a, b].filter(Boolean).length} of 2 so far). Guardians can write here already; members can write once the room opens.`;
  }
  if (room.status === "open") {
    return "Everyone here, including both guardians, sees every message. " + (room.contacts_unlocked
      ? "Both guardians have approved sharing contact details."
      : "Phone numbers, emails, links and social handles are blocked until both guardians approve.");
  }
  if (room.status === "paused") return "This room is paused for review. A guardian can review it and resume it.";
  return "This room is closed.";
}

function renderMessages(all) {
  // Two refreshes can overlap (a poll landing just after sending), so only draw messages newer than the last one shown.
  const msgs = all.filter(m => m.id > lastId);
  const t = $("thread");
  const nearBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
  t.insertAdjacentHTML("beforeend", msgs.map(m => m.kind === "system"
    ? `<li class="sys">${esc(m.body)}</li>`
    : `<li class="msg ${m.mine ? "mine" : ""}"><b>${esc(m.author)}</b><span>${esc(m.body)}</span><time>${esc(when(m.created_at))}</time></li>`).join(""));
  if (msgs.length) { lastId = msgs[msgs.length - 1].id; if (nearBottom) t.scrollTop = t.scrollHeight; }
}

function renderControls() {
  const { room, me } = state, c = [];
  if (me.role === "guardian" && me.joined === false && room.status !== "closed")
    c.push(`<button class="btn gold small" data-act="join">Join this room</button>`);
  if (me.role === "guardian" && room.status === "open" && !room.contacts_unlocked) {
    const mine = me.side === "sender" ? room.sender_guardian_ok : room.recipient_guardian_ok;
    c.push(mine ? `<span class="pill ok">You approved sharing contact details. Waiting for the other family's guardian.</span>`
                : `<button class="btn navybtn small" data-act="unlock_contacts">Approve sharing contact details</button>`);
  }
  if (me.role === "guardian" && room.status === "paused") c.push(`<button class="btn gold small" data-act="resume">I have reviewed this. Resume the room</button>`);
  if (room.status === "open") c.push(`<a class="btn navybtn small" href="/finalize.html?room=${Number(room.id)}">Marriage Safety &amp; Alignment</a>`);
  if (room.status !== "closed") c.push(`<button class="linkbtn" data-act="close">Close this room</button>`);
  $("controls").innerHTML = c.join(" ");
}

function renderRoom(first) {
  const { room, me } = state;
  $("banner").textContent = bannerText(room);
  $("banner").className = "banner " + room.status;
  const canWrite = room.status === "open" || (room.status === "awaiting_guardians" && me.role === "guardian");
  $("composer").hidden = room.status === "closed";
  $("composer").elements.body.disabled = !canWrite;
  $("sendBtn").disabled = !canWrite;
  if (!canWrite && room.status !== "closed") say("sendStatus", room.status === "paused" ? "Paused." : "You can write once the room opens.");
  else if (canWrite && $("sendStatus").textContent && !$("sendStatus").classList.contains("err")) say("sendStatus", "");
  renderControls();
}

async function load(first) {
  if (document.hidden && !first) return;
  const r = await api(`/api/rooms/${roomId}` + (lastId ? `?after=${lastId}` : ""));
  if (r.status === 401) return goSignIn();
  if (!r.ok) { $("roomView").hidden = false; $("roomTitle").textContent = "Room not found"; $("composer").hidden = true; $("banner").textContent = "This room does not exist, or you are not part of it."; return; }
  state = r.data;
  if (first) {
    $("roomView").hidden = false;
    $("people").textContent = "In this room: " + state.participants.map(p => p.label).join(", ");
    $("roomTitle").textContent = "Marriage Discussion Room";
  }
  renderMessages(state.messages);
  renderRoom(first);
}

$("composer").addEventListener("submit", async e => {
  e.preventDefault();
  const ta = e.target.elements.body, body = ta.value.trim();
  if (!body) return;
  $("sendBtn").disabled = true; say("sendStatus", "Sending…");
  const r = await api(`/api/rooms/${roomId}/messages`, "POST", { body });
  $("sendBtn").disabled = false;
  if (!r.ok) { say("sendStatus", r.data.error || "Could not send", "err"); if (r.data.paused) load(false); return; }
  ta.value = ""; say("sendStatus", "");
  load(false);
});

$("controls").addEventListener("click", async e => {
  const a = e.target.dataset.act;
  if (!a) return;
  if (a === "close" && !confirm("Close this room? Nobody will be able to write in it again.")) return;
  const r = await api(`/api/rooms/${roomId}/action`, "POST", { action: a });
  if (!r.ok) return say("ctlStatus", r.data.error || "Could not do that", "err");
  say("ctlStatus", "");
  load(false);
});

$("logoutBtn").addEventListener("click", signOut);

if (roomId) { load(true); setInterval(() => load(false), 8000); } else showList();
