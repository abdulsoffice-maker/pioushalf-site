// Marriage Safety & Alignment page. Everything shown here is visible to the Brother, the Sister and both guardians.
const roomId = Number(new URLSearchParams(location.search).get("room"));
let D = null;
const inr = n => "₹" + Number(n).toLocaleString("en-IN");
const opts = o => Object.entries(o).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join("");

function renderAnswers() {
  const a = D.brother_answers; $("answers").hidden = !a; if (!a) return;
  $("answersBody").innerHTML = `<ul class="rows">
    <li><span>Housing</span><b>${esc(D.options.housing[a.housing])}, ${esc(a.distance_km)} km from her parental home</b></li>
    <li><span>Yearly income (his own statement)</span><b>${inr(a.yearly_income_inr)}</b></li>
    <li><span>Mehar offered</span><b>${inr(a.mehar_amount_inr)} (${esc(D.options.mehar_form[a.mehar_form])})</b></li>
    <li><span>Medical certificate</span><b>${esc(D.options.medical[a.medical])}</b></li>
    ${a.note ? `<li class="stack"><span>His note</span><b>${esc(a.note)}</b></li>` : ""}</ul>
    ${D.differences.length ? `<div class="banner"><b>Where his answers differ from the advisory</b><ul>${D.differences.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : `<p class="pill ok">His answers meet the advisory baseline.</p>`}
    <p class="muted small">Income and other figures are his own statement. Salaamify has not verified them. Families should check them directly.</p>`;
}

function renderBrother() {
  const box = $("brotherForm");
  box.hidden = !(D.you === "brother" && D.state !== "ready");
  if (box.hidden) return;
  const a = D.brother_answers || {};
  box.innerHTML = `<h2 id="bf">Your written confirmations</h2><p class="muted">Please read each clause, then answer honestly. Your guardian and the Sister's guardian will see this.</p>
  <form id="bForm" class="form two-col" novalidate>
    <fieldset class="full"><legend>I have read and agree to each clause</legend>${D.clauses.map(c => `<label class="check"><input type="checkbox" name="ack" value="${c.id}" ${a.acks ? "checked" : ""}> ${c.id}. ${esc(c.title)}</label>`).join("")}</fieldset>
    <label>Housing<select name="housing"><option value="">Choose</option>${opts(D.options.housing)}</select></label>
    <label>Distance from her parental home (km)<input name="distance_km" type="number" min="0" max="20000" inputmode="numeric" value="${esc(a.distance_km ?? "")}"></label>
    <label>My yearly income (₹, numbers only)<input name="yearly_income_inr" type="number" min="0" inputmode="numeric" value="${esc(a.yearly_income_inr ?? "")}"></label>
    <label>Mehar I offer (₹, numbers only)<input name="mehar_amount_inr" type="number" min="0" inputmode="numeric" value="${esc(a.mehar_amount_inr ?? "")}"></label>
    <label>Form of Mehar<select name="mehar_form"><option value="">Choose</option>${opts(D.options.mehar_form)}</select></label>
    <label>Medical and fitness certificate<select name="medical"><option value="">Choose</option>${opts(D.options.medical)}</select></label>
    <label class="full">A note or questions for the Sister (no phone numbers, emails or links)<textarea name="note" rows="3" maxlength="600">${esc(a.note || "")}</textarea></label>
    <div class="full"><button class="btn gold" type="submit">Submit my written confirmations</button><p class="status" id="bStatus" role="status"></p></div>
  </form>`;
  const f = $("bForm");
  for (const k of ["housing", "mehar_form", "medical"]) if (a[k]) f.elements[k].value = a[k];
  f.addEventListener("submit", async e => {
    e.preventDefault(); say("bStatus", "Sending…");
    const body = { action: "submit", acks: [...f.querySelectorAll("[name=ack]:checked")].map(x => +x.value) };
    for (const k of ["housing", "distance_km", "yearly_income_inr", "mehar_amount_inr", "mehar_form", "medical", "note"]) body[k] = f.elements[k].value;
    const r = await api(`/api/rooms/${roomId}/finalize`, "POST", body);
    if (!r.ok) return say("bStatus", r.data.error || "Could not send", "err");
    load();
  });
}

function renderSister() {
  const box = $("sisterForm");
  box.hidden = !(D.you === "sister" && D.state === "waiting_sister");
  if (box.hidden) return;
  box.innerHTML = `<h2 id="sf">Your decision</h2>
  <p>Have you reviewed the Salaamify Safety &amp; Security clauses and the Brother's confirmations with your guardian? Salaamify will not let the Brother's side decide for you.</p>
  <form id="sForm" class="form" novalidate>
    <label class="check"><input type="radio" name="choice" value="agreed"> Yes, agreed. We will record these in our Nikah Nama or marriage agreement.</label>
    <label class="check"><input type="radio" name="choice" value="own_discretion"> I am proceeding at my own discretion, without or against the advisory.</label>
    <label class="check" id="riskRow" hidden><input type="checkbox" name="accept_own_risk"> I understand this is my own choice and Salaamify has advised me to protect these points.</label>
    <label>A reply to the Brother (optional, no contact details)<textarea name="reply" rows="3" maxlength="600"></textarea></label>
    <div><button class="btn gold" type="submit">Save my decision</button><p class="status" id="sStatus" role="status"></p></div>
  </form>`;
  const f = $("sForm");
  f.addEventListener("change", () => { $("riskRow").hidden = f.elements.choice.value !== "own_discretion"; });
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const r = await api(`/api/rooms/${roomId}/finalize`, "POST", { action: "decide", choice: f.elements.choice.value, accept_own_risk: f.elements.accept_own_risk.checked, reply: f.elements.reply.value });
    if (!r.ok) return say("sStatus", r.data.error || "Could not save", "err");
    load();
  });
}

function renderResult() {
  const box = $("resultBox");
  const msgs = {
    waiting_brother: D.you === "brother" ? "" : "Waiting for the Brother to give his written confirmations.",
    waiting_sister: D.you === "sister" ? "" : "Waiting for the Sister to review and decide.",
  };
  box.hidden = false;
  if (D.state === "ready") {
    box.innerHTML = `<h2>${D.sister_choice === "agreed" ? "Agreed and ready" : "Ready, at the Sister's own discretion"}</h2>
      <p>${D.sister_choice === "agreed" ? "The Sister agreed to these clauses. Please record them in your Nikah Nama or marriage agreement." : "The Sister chose to proceed at her own discretion."} The families may now proceed to the family introduction.</p>
      ${D.sister_reply ? `<p><b>Her reply:</b> ${esc(D.sister_reply)}</p>` : ""}
      ${D.you === "sister" ? `<button class="linkbtn" id="reopen">Change my decision</button>` : ""}`;
    const rb = $("reopen"); if (rb) rb.onclick = async () => { await api(`/api/rooms/${roomId}/finalize`, "POST", { action: "reopen" }); load(); };
  } else if (msgs[D.state]) box.innerHTML = `<p>${esc(msgs[D.state])}</p>`;
  else box.hidden = true;
}

async function load() {
  const r = await api(`/api/rooms/${roomId}/finalize`);
  if (r.status === 401) return goSignIn();
  if (!r.ok) return say("topStatus", "We could not open this page.", "err");
  D = r.data;
  $("back").href = "/rooms.html?id=" + roomId;
  $("intro").textContent = D.intro;
  $("clauseList").innerHTML = D.clauses.map(c => `<li><b>${esc(c.title)}.</b> ${esc(c.text)}</li>`).join("");
  if (D.room_status !== "open") say("topStatus", "This is available once the Discussion Room is open.", "err");
  renderAnswers(); renderBrother(); renderSister(); renderResult();
}
$("logoutBtn").addEventListener("click", signOut);
load();
