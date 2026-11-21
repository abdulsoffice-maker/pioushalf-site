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
    <p class="muted small">Documents are seen only by our review team and deleted once checked.</p>
    ${st("mobile") === "verified" ? "" : d.sms ? `<form id="smsForm" novalidate><label>Mobile number<input name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="98XXXXXXXX or +971…"></label>
      <p class="muted small">We send a 6-digit code by SMS. Only a scrambled fingerprint of your number is kept, never the number itself.</p>
      <button class="btn navybtn small" type="submit" id="smsSend">Send code</button>
      <label id="smsCodeRow" hidden>Code from SMS<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8"></label>
      <button class="btn gold small" type="button" id="smsCheck" hidden>Verify mobile</button><p class="status" id="smsStatus" role="status"></p></form>`
      : `<p class="muted small">Mobile verification opens soon.</p>`}
    ${up("identity", "Identity document", "Aadhaar, passport, driving licence or voter ID (JPG, PNG, WebP or PDF, up to 5 MB).", "image/jpeg,image/png,image/webp,application/pdf")}
    ${up("photo", "Verification photo", "A clear recent photo of your face for the review team only (JPG, PNG or WebP, up to 5 MB).", "image/jpeg,image/png,image/webp")}`;
  const sf = $("smsForm");
  if (sf) {
    sf.addEventListener("submit", async e => {
      e.preventDefault(); say("smsStatus", "Sending…");
      const r = await api("/api/phone/start", "POST", { phone: sf.elements.phone.value });
      if (!r.ok) return say("smsStatus", r.data.error || "Could not send the code", "err");
      $("smsCodeRow").hidden = false; $("smsCheck").hidden = false; say("smsStatus", "Code sent. Please enter it below.", "ok");
    });
    $("smsCheck").addEventListener("click", async () => {
      say("smsStatus", "Checking…");
      const r = await api("/api/phone/check", "POST", { phone: sf.elements.phone.value, code: sf.elements.code.value });
      if (!r.ok) return say("smsStatus", r.data.error || "Could not verify", "err");
      say("smsStatus", "Mobile verified. JazakAllah khair.", "ok"); setTimeout(loadProfile, 700);
    });
  }
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
  $("photoBox").hidden = !d.profile;
  if (d.profile) showPhoto(d.member.id, !!d.profile.photo_r2_key);
  show("profile");
}
function showPhoto(id, has) {
  const img = $("myPhoto");
  img.hidden = !has; if (has) img.src = "/api/photo/" + id + "?t=" + Date.now();
  $("photoRemove").hidden = !has;
}
$("photoForm").addEventListener("submit", async e => {
  e.preventDefault();
  const file = e.target.elements.file.files[0];
  if (!file) return say("photoStatus", "Please choose a photo", "err");
  say("photoStatus", "Uploading…");
  const fd = new FormData(); fd.append("file", file);
  const res = await fetch("/api/photo", { method: "POST", body: fd, credentials: "same-origin" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return say("photoStatus", data.error || "Upload failed. Please try again.", "err");
  e.target.reset(); say("photoStatus", "Photo saved.", "ok"); loadProfile();
});
$("photoRemove").addEventListener("click", async () => {
  await fetch("/api/photo", { method: "DELETE", credentials: "same-origin" });
  say("photoStatus", "Photo removed.", "ok"); loadProfile();
});

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

$("logoutBtn").addEventListener("click", async () => { await api("/api/auth/logout", "POST"); location.href = "/goodbye.html"; });

// Already signed in? Go straight to the profile.
loadProfile();
