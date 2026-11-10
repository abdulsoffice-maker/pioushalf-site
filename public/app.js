const STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Delhi","Jammu and Kashmir","Ladakh","Chandigarh","Puducherry","Outside India"];
const PLAN_NAMES = { founding: "Founding Member (3 months)", standard: "Standard Marriage (3 months)", premium: "Premium Marriage (6 months)", plus: "Premium Marriage Plus (12 months)" };

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
  form.elements.name.focus();
}));
document.getElementById("coClose").addEventListener("click", () => modal.hidden = true);
modal.addEventListener("click", e => { if (e.target === modal) modal.hidden = true; });
document.addEventListener("keydown", e => { if (e.key === "Escape") modal.hidden = true; });

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
