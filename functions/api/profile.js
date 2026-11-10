// PUT /api/profile -> creates or updates the signed-in member's profile.
// Free-text fields are checked for phone numbers, emails, links and social handles before saving.
import { json, getMember, findContactInfo } from "../_lib.js";

const TEXT_LIMITS = {
  display_name: 40, city: 60, country: 60, languages: 120, profession: 80, education: 120,
  marriage_goals: 600, islamic_learning: 400, family_values: 600, marriage_preferences: 600, lifestyle_preferences: 600, about: 800,
};
const PRAYER = ["Always on time", "Most of the time", "Working on it"];
const COMMITMENT = ["Practising", "Moderately practising", "Learning"];
const PHOTO = ["hidden", "guardian_approved", "members"];

export async function onRequestPut({ request, env }) {
  const member = await getMember(request, env);
  if (!member) return json({ error: "Not signed in" }, 401);

  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }

  const out = {};
  for (const [field, max] of Object.entries(TEXT_LIMITS)) {
    const v = String(b[field] ?? "").trim();
    if (v.length > max) return json({ error: `${field.replace(/_/g, " ")} is too long (maximum ${max} characters)`, field }, 422);
    const hit = findContactInfo(v);
    if (hit) {
      await env.DB.prepare(`INSERT INTO audit_log (actor, action, detail) VALUES (?1, 'contact_blocked', ?2)`)
        .bind(`member:${member.id}`, `profile field ${field}: ${hit}`).run();
      return json({ error: `Please remove ${hit}. Contact details can only be shared after both guardians approve.`, field }, 422);
    }
    out[field] = v || null;
  }
  if (!out.display_name || out.display_name.length < 2) return json({ error: "Please add a display name (first name or initials)", field: "display_name" }, 422);

  const age = Number(b.age);
  if (!Number.isInteger(age) || age < 18 || age > 80) return json({ error: "Age must be between 18 and 80", field: "age" }, 422);
  if (b.prayer_consistency && !PRAYER.includes(b.prayer_consistency)) return json({ error: "Choose a prayer option", field: "prayer_consistency" }, 422);
  if (b.religious_commitment && !COMMITMENT.includes(b.religious_commitment)) return json({ error: "Choose a commitment option", field: "religious_commitment" }, 422);
  const photo = b.photo_privacy || "guardian_approved";
  if (!PHOTO.includes(photo)) return json({ error: "Choose a photo privacy option", field: "photo_privacy" }, 422);

  // Gender is chosen once and then fixed, so Discussion Rooms can always pair a brother, a sister and a guardian.
  if (!member.gender) {
    if (!["brother", "sister"].includes(b.gender)) return json({ error: "Please choose brother or sister", field: "gender" }, 422);
    await env.DB.prepare(`UPDATE members SET gender = ?1 WHERE id = ?2`).bind(b.gender, member.id).run();
  }

  await env.DB.prepare(
    `INSERT INTO profiles (member_id, display_name, age, city, country, languages, profession, education, marriage_goals,
        religious_commitment, prayer_consistency, islamic_learning, family_values, marriage_preferences, lifestyle_preferences,
        about, photo_privacy, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,datetime('now'))
     ON CONFLICT(member_id) DO UPDATE SET display_name=?2, age=?3, city=?4, country=?5, languages=?6, profession=?7, education=?8,
        marriage_goals=?9, religious_commitment=?10, prayer_consistency=?11, islamic_learning=?12, family_values=?13,
        marriage_preferences=?14, lifestyle_preferences=?15, about=?16, photo_privacy=?17, updated_at=datetime('now')`
  ).bind(
    member.id, out.display_name, age, out.city, out.country, out.languages, out.profession, out.education, out.marriage_goals,
    b.religious_commitment || null, b.prayer_consistency || null, out.islamic_learning, out.family_values, out.marriage_preferences,
    out.lifestyle_preferences, out.about, photo
  ).run();

  return json({ ok: true });
}
