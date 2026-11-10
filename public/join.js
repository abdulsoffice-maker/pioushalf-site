const $ = id => document.getElementById(id);
const steps = { email: $("stepEmail"), code: $("stepCode"), profile: $("stepProfile") };
let email = "";
const next = (() => {
  const n = new URLSearchParams(location.search).get("next");
  return n && /^\/[A-Za-z0-9_\-\/.?=&%]*$/.test(n) && !n.startsWith("//") ? n : null;
})();

function show(name) {
  Object.entries(steps).forEach(([k, el]) => el.hidden = k !== name);
  $("logoutBtn").hidden = name !== "profile";
}
function say(id, msg, cls) { const el = $(id); el.textContent = msg || ""; el.className = "status " + (cls || ""); }

async function api(path, method, body) {
  const res = await fetch(path, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  let data = {};
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

$("emailForm").addEventListener("submit", async e => {
  e.preventDefault();
  email = e.target.email.value.trim().toLowerCase();
  say("emailStatus", "Sending your code…");
  const r = await api("/api/auth/request", "POST", { email });
  if (!r.ok) return say("emailStatus", r.data.error || "Something went wrong", "err");
  $("codeHint").textContent = `We sent a code to ${email}. It works for 10 minutes.`;
  say("emailStatus", "");
  show("code");
  $("codeForm").code.focus();
});

$("backEmail").addEventListener("click", () => show("email"));

$("codeForm").addEventListener("submit", async e => {
  e.preventDefault();
  say("codeStatus", "Checking…");
  const r = await api("/api/auth/verify", "POST", { email, code: e.target.code.value.trim() });
  if (!r.ok) return say("codeStatus", r.data.error || "Could not verify the code", "err");
  say("codeStatus", "");
  loadProfile();
});

const LEVEL_NAMES = { email: "Email", mobile: "Mobile", identity: "Identity", photo: "Photo", guardian: "Guardian" };

function renderTrust(d) {
  const badges = d.verification.map(v =>
    `<li class="${v.status === "verified" ? "on" : ""}">${LEVEL_NAMES[v.level]}${v.status === "verified" ? " verified" : v.status === "pending" && (v.level === "identity" || v.level === "photo") ? " (under review)" : ""}</li>`).join("");
  const st = lv => (d.verification.find(v => v.level === lv) || {}).status;
  const up = (lv, label, hint, accept) => st(lv) === "verified" ? "" :
    `<form class="uploadForm" data-level="${lv}" novalidate><label>${label}<input type="file" name="file" accept="${accept}"></label>
      <p class="muted small">${hint}</p><button class="btn navybtn small" type="submit">${st(lv) === "pending" ? "Replace upload" : "Upload for review"}</button><p class="status" role="status"></p></form>`;
  $("trust").innerHTML = `<p><b>Trust score: ${d.trust_score} / 100</b></p><ul class="vbadges">${badges}</ul>
    <p class="muted small">Mobile verification opens in a later release. Documents are seen only by our review team and deleted once checked.</p>
    ${up("identity", "Identity document", "Aadhaar, passport, driving licence or voter ID (JPG, PNG, WebP or PDF, up to 5 MB).", "image/jpeg,image/png,image/webp,application/pdf")}
    ${up("photo", "Verification photo", "A clear recent photo of your face for the review team only (JPG, PNG or WebP, up to 5 MB).", "image/jpeg,image/png,image/webp")}`;
  document.querySelectorAll(".uploadForm").forEach(f => f.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = f.querySelector(".status"), file = f.elements.file.files[0];
    if (!file) { msg.textContent = "Please choose a file"; msg.className = "status err"; return; }
    const fd = new FormData(); fd.append("level", f.dataset.level); fd.append("file", file);
    msg.textContent = "Uploading…"; msg.className = "status";
    let res, data = {};
    try { res = await fetch("/api/verification/upload", { method: "POST", body: fd }); data = await res.json(); } catch { res = { ok: false }; }
    if (res.ok) { msg.textContent = "Received. We will review it soon."; msg.className = "status ok"; setTimeout(loadProfile, 800); }
    else { msg.textContent = data.error || "Upload failed. Please try again."; msg.className = "status err"; }
  }));
}

async function loadProfile() {
  const r = await api("/api/me", "GET");
  if (!r.ok) return show("email");
  const d = r.data;
  if (next) { location.href = next; return; }
  const f = $("profileForm");
  if (d.profile) for (const [k, v] of Object.entries(d.profile)) if (f.elements[k] && v != null) f.elements[k].value = v;
  if (d.member.gender) { f.elements.gender.value = d.member.gender; f.elements.gender.disabled = true; }
  renderTrust(d);
  show("profile");
}

$("profileForm").addEventListener("submit", async e => {
  e.preventDefault();
  const f = e.target;
  const body = Object.fromEntries(new FormData(f));
  if (f.elements.gender.disabled) body.gender = f.elements.gender.value;
  body.age = Number(body.age);
  say("profileStatus", "Saving…");
  const r = await api("/api/profile", "PUT", body);
  if (!r.ok) {
    say("profileStatus", r.data.error || "Could not save", "err");
    const bad = r.data.field && f.elements[r.data.field];
    if (bad) bad.focus();
    return;
  }
  say("profileStatus", "Profile saved. JazakAllah khair.", "ok");
  loadProfile();
});

$("logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", "POST"); show("email"); });

// Already signed in? Go straight to the profile.
loadProfile();
