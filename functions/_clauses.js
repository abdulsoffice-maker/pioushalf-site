// Salaamify Marriage Safety & Alignment advisory. One place for the wording, so the page, the checks and the room notices agree.
export const MEHAR_FLOOR_INR = 5000000;   // suggested baseline: this amount or the groom's yearly income, whichever is higher
export const MAX_DISTANCE_KM = 75;

export const ADVISORY_INTRO =
  "Before a family introduction becomes a marriage commitment, Salaamify asks the Brother to give his confirmations in writing, so the Sister and both guardians can see them. " +
  "These clauses are a protective advisory from Salaamify. Please record whatever your families agree on in your Nikah Nama or marriage agreement. " +
  "The Sister's side holds the final decision. If she chooses to proceed without them, she does so at her own discretion and Salaamify will respect her choice. " +
  "Salaamify is not a party to any marriage, does not enforce these clauses and does not give legal advice.";

export const CLAUSES = [
  { id: 1, title: "Family and character verification",
    text: "Both families will visit each other's homes more than once to observe religious character, Islamic values and family background, and will not overlook early warning signs or red flags." },
  { id: 2, title: "Independence, health and financial stability",
    text: "The groom is able to support a household. He will share a recent medical and fitness certificate with the Sister's family directly (Salaamify does not store it). " +
          `He either owns a home or can afford to rent and maintain a separate residence within ${MAX_DISTANCE_KM} km of the Sister's parental home.` },
  { id: 3, title: "A secure and dignified Mehar",
    text: "The Mehar is the wife's right and she is encouraged to state it openly. As a baseline for her security, Salaamify suggests a Mehar of at least " +
          `₹${MEHAR_FLOOR_INR.toLocaleString("en-IN")} or the groom's total yearly income, whichever is higher, in cash, gold or property.` },
  { id: 4, title: "Separate living accommodation",
    text: "From the first day of the marriage the couple will live in an independent, private residence, separate from in-laws. Islam places on the husband the responsibility of providing suitable separate lodging for his wife." },
  { id: 5, title: "Good faith",
    text: "Both sides will honour these understandings in good faith, as a sincere framework that sits alongside the civil and family laws that apply to them." },
];

export const HOUSING = { own: "I own my home", rent_separate: "I can rent and maintain a separate home", other: "Another arrangement (please explain in my note)" };
export const MEHAR_FORMS = { cash: "Cash", gold: "Gold", property: "Property", other: "Other (please explain in my note)" };
export const MEDICAL = { will_share: "I will share it with her family", already_shared: "I have already shared it", not_willing: "I am not willing to share it" };

// Points where the Brother's answers differ from the advisory. Shown to the Sister and the guardians so she can decide with full information.
export function differences(a) {
  const d = [];
  if (a.housing === "other") d.push("Housing: not an owned home or a rented separate home.");
  if (a.distance_km > MAX_DISTANCE_KM) d.push(`Housing: ${a.distance_km} km from the Sister's parental home (advisory is within ${MAX_DISTANCE_KM} km).`);
  const floor = Math.max(MEHAR_FLOOR_INR, a.yearly_income_inr || 0);
  if (a.mehar_amount_inr < floor) d.push(`Mehar: ₹${a.mehar_amount_inr.toLocaleString("en-IN")} offered, advisory baseline is ₹${floor.toLocaleString("en-IN")}.`);
  if (a.mehar_form === "other") d.push("Mehar: form is 'other', see his note.");
  if (a.medical === "not_willing") d.push("Medical certificate: he is not willing to share it.");
  return d;
}
