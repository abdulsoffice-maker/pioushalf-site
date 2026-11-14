// Marriage Safety & Alignment, before a couple finalizes.
// GET  /api/rooms/:id/finalize            -> the clauses, the Brother's written answers and the Sister's decision. Everyone in the room sees the same page.
// POST /api/rooms/:id/finalize { action }
//   submit   Brother only: confirm each clause and answer in writing.
//   decide   Sister only: choice "agreed" or "own_discretion". The Brother's side can never decide for her.
//   reopen   Sister only: take her decision back so she can think again.
import { json, getMember, roomAccess, findContactInfo, systemMessage, notifyMember } from "../../../_lib.js";
import { CLAUSES, ADVISORY_INTRO, HOUSING, MEHAR_FORMS, MEDICAL, differences } from "../../../_clauses.js";

async function load(env, request, params) {
  const me = await getMember(request, env);
  if (!me) return { resp: json({ error: "Not signed in" }, 401) };
  const access = await roomAccess(env, Number(params.id), me);
  if (!access) return { resp: json({ error: "Room not found" }, 404) };
  const people = {};
  for (const id of [access.room.sender_id, access.room.recipient_id]) {
    const m = await env.DB.prepare(`SELECT gender FROM members WHERE id = ?1`).bind(id).first();
    people[m.gender] = id;
  }
  const who = me.id === people.brother ? "brother" : me.id === people.sister ? "sister" : "guardian";
  return { me, access, who, people };
}

function state(row) {
  if (!row || !row.brother_submitted_at) return "waiting_brother";
  if (!row.sister_choice) return "waiting_sister";
  return "ready";
}

export async function onRequestGet({ request, env, params }) {
  const g = await load(env, request, params);
  if (g.resp) return g.resp;
  const row = await env.DB.prepare(`SELECT * FROM marriage_checks WHERE room_id = ?1`).bind(g.access.room.id).first();
  const answers = row && row.brother_answers ? JSON.parse(row.brother_answers) : null;
  return json({
    intro: ADVISORY_INTRO, clauses: CLAUSES, options: { housing: HOUSING, mehar_form: MEHAR_FORMS, medical: MEDICAL },
    you: g.who, room_status: g.access.room.status, state: state(row),
    brother_answers: answers, differences: answers ? differences(answers) : [],
    sister_choice: row ? row.sister_choice : null, sister_medical: row ? row.sister_medical : null, sister_reply: row ? row.sister_reply : null,
  });
}

const text = (v, max) => String(v ?? "").trim().slice(0, max);
const int = (v, max) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n <= max ? n : null; };

export async function onRequestPost({ request, env, params }) {
  const g = await load(env, request, params);
  if (g.resp) return g.resp;
  const { room } = g.access;
  let b;
  try { b = await request.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (room.status !== "open") return json({ error: "The room must be open to do this" }, 400);
  const row = await env.DB.prepare(`SELECT * FROM marriage_checks WHERE room_id = ?1`).bind(room.id).first();
  const now = state(row);

  if (b.action === "submit") {
    if (g.who !== "brother") return json({ error: "Only the Brother gives these confirmations" }, 403);
    if (now === "ready") return json({ error: "The Sister has already decided. This can only change if she reopens it." }, 409);

    if (!Array.isArray(b.acks) || !CLAUSES.every(c => b.acks.includes(c.id))) return json({ error: "Please confirm every clause", field: "acks" }, 422);
    if (!HOUSING[b.housing]) return json({ error: "Please choose your housing", field: "housing" }, 422);
    if (!MEHAR_FORMS[b.mehar_form]) return json({ error: "Please choose the form of Mehar", field: "mehar_form" }, 422);
    if (!MEDICAL[b.medical]) return json({ error: "Please answer about the medical certificate", field: "medical" }, 422);
    const distance = int(b.distance_km, 20000), income = int(b.yearly_income_inr, 10 ** 10), mehar = int(b.mehar_amount_inr, 10 ** 11);
    if (distance === null) return json({ error: "Please enter the distance in km (0 if the same locality)", field: "distance_km" }, 422);
    if (income === null) return json({ error: "Please enter your yearly income in rupees, numbers only", field: "yearly_income_inr" }, 422);
    if (mehar === null) return json({ error: "Please enter the Mehar in rupees, numbers only", field: "mehar_amount_inr" }, 422);
    const note = text(b.note, 600);
    if (findContactInfo(note)) return json({ error: "Please do not include contact details in your note", field: "note" }, 422);

    const answers = { acks: CLAUSES.map(c => c.id), housing: b.housing, distance_km: distance, yearly_income_inr: income, mehar_form: b.mehar_form, mehar_amount_inr: mehar, medical: b.medical, note };
    await env.DB.prepare(
      `INSERT INTO marriage_checks (room_id, brother_answers, brother_submitted_at) VALUES (?1, ?2, datetime('now'))
       ON CONFLICT(room_id) DO UPDATE SET brother_answers = ?2, brother_submitted_at = datetime('now')`
    ).bind(room.id, JSON.stringify(answers)).run();
    await systemMessage(env, room.id, "The Brother has given his written confirmations for Marriage Safety & Alignment. The Sister and both guardians can review them now.");
    await notifyMember(env, g.people.sister, "Written confirmations are ready to review", "The Brother has submitted his written confirmations. Please review them in your Discussion Room before deciding.");
    return json({ ok: true, state: "waiting_sister" });
  }

  if (b.action === "decide") {
    if (g.who !== "sister") return json({ error: "Only the Sister makes this decision" }, 403);
    if (now !== "waiting_sister") return json({ error: now === "ready" ? "You have already decided" : "The Brother has not submitted yet" }, 409);
    if (!["agreed", "own_discretion"].includes(b.choice)) return json({ error: "Please choose one option", field: "choice" }, 422);
    if (b.choice === "own_discretion" && b.accept_own_risk !== true) return json({ error: "Please tick the box to confirm you are choosing this yourself", field: "accept_own_risk" }, 422);
    if (!MEDICAL[b.medical]) return json({ error: "Please answer about your medical certificate", field: "medical" }, 422);
    const reply = text(b.reply, 600);
    if (findContactInfo(reply)) return json({ error: "Please do not include contact details in your reply", field: "reply" }, 422);

    await env.DB.prepare(`UPDATE marriage_checks SET sister_choice = ?1, sister_reply = ?2, sister_medical = ?3, sister_decided_at = datetime('now') WHERE room_id = ?4`).bind(b.choice, reply || null, b.medical, room.id).run();
    await systemMessage(env, room.id, b.choice === "agreed"
      ? "The Sister has reviewed the Safety & Alignment clauses and agreed. Please record them in your Nikah Nama or marriage agreement. The families may now proceed to the family introduction."
      : "The Sister has reviewed the Safety & Alignment clauses and chosen to proceed at her own discretion. The families may now proceed to the family introduction.");
    await notifyMember(env, g.people.brother, "The Sister has responded", "She has reviewed your written confirmations. Please open your Discussion Room.");
    return json({ ok: true, state: "ready" });
  }

  if (b.action === "reopen") {
    if (g.who !== "sister") return json({ error: "Only the Sister can reopen this" }, 403);
    if (now !== "ready") return json({ error: "Nothing to reopen" }, 409);
    await env.DB.prepare(`UPDATE marriage_checks SET sister_choice = NULL, sister_reply = NULL, sister_medical = NULL, sister_decided_at = NULL WHERE room_id = ?1`).bind(room.id).run();
    await systemMessage(env, room.id, "The Sister has reopened her decision on the Safety & Alignment clauses.");
    return json({ ok: true, state: "waiting_sister" });
  }
  return json({ error: "Unknown action" }, 400);
}
