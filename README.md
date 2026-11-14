# Salaamify Group: go-live guide

What is built: landing site, membership checkout (Razorpay), D1 database, R2 invoice storage, webhook, legal drafts, GST workbook.
What is NOT built yet (Phase 2): member profiles, guardian accounts, discussion rooms, contact-sharing moderation, admin dashboard. These need authentication and a real moderation pipeline and are better built on top of this base.

## Deploy (about 20 minutes)
1. Install tools: `npm i -g wrangler` then `wrangler login` (log in as the pioushalf account).
2. Create the database: `wrangler d1 create pioushalf-db`, then paste the returned `database_id` into `wrangler.toml`.
3. Create the tables: `wrangler d1 execute pioushalf-db --remote --file=schema.sql`.
4. Create storage: `wrangler r2 bucket create pioushalf-private` (keep it private, no public access).
5. Edit `wrangler.toml`: set `SELLER_GSTIN`, `SELLER_ADDRESS`. In `functions/api/checkout.js` set `HOME_STATE` to your GST state.
6. Razorpay: complete KYC, switch to Live mode, copy the Live Key ID and Secret.
7. Create the Pages project: `wrangler pages project create pioushalf-site`, then add secrets:
   `wrangler pages secret put RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
8. In the Cloudflare dashboard, open the Pages project, Settings, Functions, and bind D1 as `DB` and R2 as `BUCKET`.
9. Deploy: `wrangler pages deploy public`.
10. Razorpay dashboard, Webhooks: add `https://pioushalf.com/api/webhook`, event `payment.captured`, using the same secret as step 7.
11. Custom domain: Pages project, Custom domains, add your domain. SSL is automatic. Set SSL/TLS to "Full (strict)" and turn on Always Use HTTPS.
12. Test the full payment flow with Razorpay Test keys first, then switch to Live keys.

## Stage 1 (sign-in and profiles): extra setup
- Already done in your Cloudflare account: D1 database `pioushalf-db` (all tables created) and R2 bucket `pioushalf-private`.
- Add two more secrets to the Pages project: `AUTH_SECRET` (any long random string) and `RESEND_API_KEY`.
- Resend: create a free account, add the domain pioushalf.com and publish the DNS records it shows, so codes can be sent from peace@pioushalf.com.
- Add a Cloudflare rate-limiting rule on `/api/auth/*` (for example 10 requests per minute per IP) to stop abuse.
- Pages used: `/join.html` (email code, then profile). The homepage "Join Salaamify" button links there.

## Stage 2 (guardians and introductions): what it does
- Members add up to two guardians at `/dashboard.html`. The guardian gets an email link to `/guardian.html`, signs in with that same email, and accepts. This unlocks the Guardian verification level (+20 trust).
- Browsing (`/api/browse`) shows only opposite-gender, guardian-verified profiles, with no photos, emails or contact details.
- An interest goes through four steps: sender's guardian, recipient's guardian, then the recipient. Nobody sees an introduction before the step before them has approved it. Every decision is written to `audit_log`.
- Contact details in interest notes and guardian names are blocked the same way as in profiles.
- Limits: 5 interests a day per member, one open introduction per pair, a 30-day wait after a decline.
- Optional vars in `wrangler.toml`: `SITE_URL`, and `REQUIRE_MEMBERSHIP` (set to "1" once live payments work so only paid members can send interest).
- Tables already created in `pioushalf-db`: guardians, interests (plus the stage 1 tables).
- Still to build: Discussion Rooms and AI moderation (stage 3), admin dashboard, mobile and identity and photo verification (stage 4).

## Stage 3 (Discussion Rooms and moderation): what it does
- When both families approve and the recipient accepts, a room is created automatically (`/rooms.html`). There is no private messaging anywhere: the two members and the guardians of both sides see every message.
- A room opens only when a guardian from each family has joined. Guardians can write earlier to welcome everyone. One person guarding both sides cannot open a room alone.
- Contact details (phone numbers, emails, links, social handles, UPI-style ids, numbers written in words including Hindi/Urdu, spaced-out app names) are blocked in rooms, interest notes and profiles. The blocked text is not delivered. Each attempt is saved in `moderation_flags` for the admin queue.
- Three blocked attempts in 24 hours pause the room and email both families' guardians. A guardian reviews it and resumes it.
- Contact sharing unlocks only when a guardian from each family approves it inside the room.
- If a member removes their last guardian, their open rooms pause. A room can't resume until both families have a guardian again.
- Limits: 1000 characters per message, 15 messages a minute per person.
- The filter is pattern-based, so a determined person can still disguise details. Guardians see every message, which is the real safeguard. An AI second check (Cloudflare Workers AI) can be added once the site is live and can be tested there.
- Tables already created in `pioushalf-db`: rooms, room_guardian_joins, room_messages, moderation_flags.
- Still to build: admin dashboard (reads `moderation_flags`, `audit_log`, orders) and the mobile, identity and photo verification levels.

## Support email (peace@pioushalf.com)
In the Cloudflare dashboard for the pioushalf.com domain, open Email, Email Routing, enable it, add the custom address `peace` and forward it to pioushalf@gmail.com (verify the destination address from the email Cloudflare sends). To reply from that address in Gmail, add it under Settings, Accounts, Send mail as. Do this before the site goes live.

## Before accepting real money
- Confirm the SAC code and 18% GST rate with your CA, and that you are GST-registered.
- Have a lawyer review `public/legal.html` and name a grievance officer.
- Decide how sister discounts work. Currently the full price is charged and staff refund the difference after verification.
- Invoices are stored in R2 but not emailed yet; add an email service (for example Resend) in `verify.js`.
- Add Cloudflare Access in front of any future admin pages.

## Files
`docs/Salaamify_Transactions_GST.xlsx` holds Transactions, Settings, GSTR-1 Summary, B2B vs B2C. Export paid orders from D1 with
`wrangler d1 execute pioushalf-db --remote --command "SELECT * FROM orders WHERE status='paid'" --json`.

## Stage 4: admin, support and verification

- **Admin** lives at `/admin.html` (tabs: Overview, Members, Safety, Verifications, Orders, Support, Audit). Access is decided on the server by the `ADMIN_EMAILS` variable in `wrangler.toml` (comma-separated, case-insensitive). Empty means nobody is admin. For extra safety, put Cloudflare Access in front of `/admin.html` and `/api/admin/*`.
- **Orders tab** downloads a CSV whose columns match the Transactions tab of the GST sheet.
- **Support** form at `/support.html` stores tickets in D1 and emails `SUPPORT_NOTIFY`.
- **Identity and photo checks**: members upload from their profile page; files go to the private R2 bucket under `evidence/`, are viewable only by admins, and are deleted when an admin approves or rejects.
- The `tickets` table has already been created in `pioushalf-db`.

## Stage 5: Marriage Safety & Alignment
- Opened from an open Discussion Room. The Brother confirms five clauses in writing (structured answers plus a filtered note); the Sister and both guardians see them, with any differences from the advisory flagged.
- Only the Sister can decide ("agreed" or "own discretion"). The Brother's side can never decide or overrule, and he cannot edit after she decides unless she reopens.
- Wording lives in `functions/_clauses.js` (Mehar floor, distance limit, clause text). Table `marriage_checks` is already created in `pioushalf-db`.
- Figures are self-declared and not verified. Medical certificates are never stored by Salaamify.
