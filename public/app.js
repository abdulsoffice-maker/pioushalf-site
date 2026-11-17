const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh","Chandigarh","Puducherry"];
const PLAN_NAMES = { launch: "Launch Offer (12 months)", standard: "Standard Marriage (1 month)", premium: "Premium Marriage (6 months)", plus: "Premium Marriage Plus (12 months)" };

// ---- Prices and currency: India sees rupees, everywhere else US dollars. The visitor can switch. ----
let plansData = null, cur = "INR";
const money = (c, n) => c === "INR" ? "₹" + Number(n).toLocaleString("en-IN") : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
function renderPrices() {
  if (!plansData) return;
  for (const p of plansData.plans) {
    const t = document.querySelector(`[data-total="${p.key}"]`), m = document.querySelector(`[data-month="${p.key}"]`);
    const total = cur === "INR" ? p.inr : p.usd, month = cur === "INR" ? p.inr_month : p.usd_month;
    if (t) t.textContent = money(cur, total);
    if (m) m.textContent = p.months === 1 ? money(cur, total) + " a month" : (p.key === "launch" ? "about " : "") + money(cur, month) + " a month" + (p.key === "launch" ? "" : " · " + money(cur, total) + " in total");
    PLAN_NAMES[p.key] = p.name;
  }
  const L = plansData.launch, card = document.getElementById("launchCard");
  card.hidden = !L.open;
  document.getElementById("launchLeft").textContent = L.open ? L.remaining + " places left" + (L.ends ? " · ends " + L.ends : "") : "";
  document.querySelectorAll(".cur").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cur === cur)));
}
document.querySelectorAll(".cur").forEach(b => b.addEventListener("click", () => { cur = b.dataset.cur; renderPrices(); }));
fetch("/api/plans").then(r => r.json()).then(d => { plansData = d; cur = d.currency; renderPrices(); }).catch(() => {});

const modal = document.getElementById("checkout");
const form = document.getElementById("checkoutForm");
const statusEl = document.getElementById("coStatus");
const payBtn = document.getElementById("payBtn");
let selectedPlan = null;

document.getElementById("stateSel").innerHTML = '<option value="">Select state</option>' + STATES.map(s => `<option>${s}</option>`).join("");

document.querySelectorAll("[data-plan]").forEach(btn => btn.addEventListener("click", () => {
  selectedPlan = btn.dataset.plan;
  document.getElementById("coPlan").textContent = PLAN_NAMES[selectedPlan];
  statusEl.textContent = ""; statusEl.className = "status";
  modal.hidden = false;
  regionSel.value = cur === "USD" ? "abroad" : "india";
  setRegion();
  form.elements.name.focus();
}));
document.getElementById("coClose").addEventListener("click", () => modal.hidden = true);
modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") modal.hidden = true; });

// ---- Outside India: US dollars with PayPal ----
const regionSel = document.getElementById("regionSel"), paypalBox = document.getElementById("paypalBox");
let paypalCfg = null, paypalLoaded = null;
function setRegion() {
  const abroad = regionSel.value === "abroad";
  document.getElementById("indiaFields").hidden = abroad;
  document.getElementById("abroadFields").hidden = !abroad;
  for (const el of document.querySelectorAll("#indiaFields [required]")) el.disabled = abroad;
  payBtn.hidden = abroad; paypalBox.hidden = !abroad;
  const pl = plansData && plansData.plans.find(x => x.key === selectedPlan);
  document.getElementById("coPlan").textContent = PLAN_NAMES[selectedPlan] + (pl ? " · " + (abroad ? money("USD", pl.usd) : money("INR", pl.inr)) : "");
  if (abroad) preparePayPal();
}
regionSel.addEventListener("change", setRegion);
async function preparePayPal() {
  try {
    if (!paypalCfg) paypalCfg = await (await fetch("/api/paypal/config")).json();
    if (!paypalCfg.enabled) { paypalBox.innerHTML = '<p class="muted">PayPal is not switched on yet. Please check back soon or write to peace@pioushalf.com.</p>'; return; }
    document.getElementById("usdPrice").textContent = "Price: US$" + paypalCfg.prices[selectedPlan].toFixed(2) + ". No GST is charged on services supplied outside India.";
    if (!paypalLoaded) paypalLoaded = new Promise((ok, bad) => { const sc = document.createElement("script");
      sc.src = "https://www.paypal.com/sdk/js?client-id=" + encodeURIComponent(paypalCfg.client_id) + "&currency=USD&intent=capture"; sc.onload = ok; sc.onerror = bad; document.head.appendChild(sc); });
    await paypalLoaded;
    paypalBox.innerHTML = "";
    const details = () => { const d = Object.fromEntries(new FormData(form)); return { plan: selectedPlan, name: (d.name || "").trim(), email: (d.email || "").trim(), country: (d.country || "").trim(), sister: !!d.sister }; };
    paypal.Buttons({
      onClick: (data, actions) => {
        const d = details();
        if (!form.elements.terms.checked || d.name.length < 2 || !/^\S+@\S+\.\S+$/.test(d.email) || d.country.length < 2) { setStatus("Please fill in your name, email and country, and accept the terms.", "err"); return actions.reject(); }
        setStatus("");
      },
      createOrder: async () => { const r = await fetch("/api/paypal/create", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(details()) }); const o = await r.json(); if (!r.ok) throw new Error(o.error || "Could not start PayPal"); return o.id; },
      onApprove: async data => {
        setStatus("Confirming payment…");
        const r = await fetch("/api/paypal/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderID: data.orderID }) });
        const o = await r.json();
        if (r.ok) setStatus("Payment received. Invoice " + o.invoice_no + " has been emailed to you. JazakAllah khair.", "ok"); else setStatus(o.error || "Payment could not be confirmed. Contact support.", "err");
      },
      onError: err => setStatus((err && err.message) || "PayPal could not complete. Please try again.", "err"),
    }).render("#paypalBox");
  } catch { paypalBox.innerHTML = '<p class="status err">PayPal could not load. Please try again.</p>'; }
}

function setStatus(msg, cls) { statusEl.textContent = msg; statusEl.className = "status " + (cls || ""); }

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const d = Object.fromEntries(new FormData(form));
  const payload = { plan: selectedPlan, name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(), state: d.state, gstin: (d.gstin || "").toUpperCase().trim(), sister: !!d.sister };
  payBtn.disabled = true; setStatus("Preparing secure payment…");
  try {
    const res = await fetch("/api/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const o = await res.json();
    if (!res.ok) throw new Error(o.error || "Could not start payment");
    const rzp = new Razorpay({
      key: o.key, amount: o.amount, currency: "INR", order_id: o.razorpay_order_id,
      name: "Salaamify™", description: PLAN_NAMES[selectedPlan],
      prefill: { name: payload.name, email: payload.email, contact: payload.phone },
      theme: { color: "#0D1B2A" },
      handler: async r => {
        setStatus("Confirming payment…");
        const v = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(r) });
        const vo = await v.json();
        if (v.ok) setStatus("Payment received. Invoice " + vo.invoice_no + " has been emailed to you. JazakAllah khair.", "ok");
        else setStatus(vo.error || "Payment could not be verified. Contact support.", "err");
      },
      modal: { ondismiss: () => { payBtn.disabled = false; setStatus("Payment cancelled."); } }
    });
    rzp.open();
  } catch (err) { setStatus(err.message, "err"); payBtn.disabled = false; }
});
