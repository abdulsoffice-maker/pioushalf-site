// GET /api/admin/summary -> headline numbers for the admin overview.
import { json, adminGate } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  const g = await adminGate(request, env);
  if (g.resp) return g.resp;
  const q = async (sql, ...p) => env.DB.prepare(sql).bind(...p).first();
  const all = async (sql, ...p) => (await env.DB.prepare(sql).bind(...p).all()).results;
  const byStatus = rows => Object.fromEntries(rows.map(r => [r.status, r.c]));

  const members = await q(`SELECT COUNT(*) AS total, COALESCE(SUM(status = 'suspended'), 0) AS suspended FROM members`);
  const withProfile = await q(`SELECT COUNT(*) AS c FROM profiles`);
  const guardianVerified = await q(`SELECT COUNT(*) AS c FROM verifications WHERE level = 'guardian' AND status = 'verified'`);
  const interests = byStatus(await all(`SELECT status, COUNT(*) AS c FROM interests GROUP BY status`));
  const rooms = byStatus(await all(`SELECT status, COUNT(*) AS c FROM rooms GROUP BY status`));
  const flagsOpen = await q(`SELECT COUNT(*) AS c FROM moderation_flags WHERE status = 'open'`);
  const verifPending = await q(`SELECT COUNT(*) AS c FROM verifications WHERE status = 'pending'`);
  const ticketsOpen = await q(`SELECT COUNT(*) AS c FROM tickets WHERE status = 'open'`);
  const rev = await q(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(amount_paise), 0) AS gross, COALESCE(SUM(taxable_paise), 0) AS taxable,
            COALESCE(SUM(cgst_paise + sgst_paise + igst_paise), 0) AS gst FROM orders WHERE status = 'paid'`);
  const month = await q(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(amount_paise), 0) AS gross FROM orders WHERE status = 'paid' AND paid_at >= date('now','start of month')`);
  const activeMemberships = await q(`SELECT COUNT(*) AS c FROM orders WHERE status = 'paid' AND membership_end >= date('now')`);

  return json({
    members: { total: members.total, suspended: members.suspended, with_profile: withProfile.c, guardian_verified: guardianVerified.c },
    interests, rooms,
    safety: { open_flags: flagsOpen.c, pending_verifications: verifPending.c, open_tickets: ticketsOpen.c },
    revenue: { paid_orders: rev.orders, gross_paise: rev.gross, taxable_paise: rev.taxable, gst_paise: rev.gst,
               this_month_orders: month.orders, this_month_gross_paise: month.gross, active_memberships: activeMemberships.c },
  });
}
