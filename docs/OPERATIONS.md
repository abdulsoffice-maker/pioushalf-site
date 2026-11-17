# PiousHalf operations guide

## Sister 50% discount: step by step
1. A sister pays the full price at checkout (the invoice is GST-inclusive at the full amount).
2. She completes verification (identity and photo) and her guardian accepts.
3. In Razorpay Dashboard, open Transactions, find her payment, and issue a **partial refund** of half the amount.
4. Issue a **credit note** for the refunded part (GST rule) and record it in the Transactions sheet as a negative row.
5. Tell her by email that the refund will arrive in 5 to 7 working days.

## Monthly
- Export the database: Cloudflare, D1, pioushalf-db, Export. Keep the file somewhere private. (D1 also keeps 30 days of recovery.)
- Download the Orders CSV from the admin Orders tab and paste it into the Transactions sheet before filing GSTR-1.
- Clear or resolve the admin Errors tab.

## Always on
- Uptime monitor on https://pioushalf.com/api/health (UptimeRobot, email alert).
- Worker `pioushalf-cron` checks payments every 30 minutes and cleans up and emails error alerts daily.

## Brand protection (ask a trademark attorney)
- Trademark applications in India, one per brand and class: SALAAMIFY, PIOUSHALF, THE TALKING PEN ACADEMY, HEARTS FIND PEACE.
- Use ™ now; use ® only after registration.
- Keep domains on auto-renew with registrar lock and two-step sign-in. Reserve matching social handles.

## Prices, Launch Offer and sister discount (current)
- Prices live only in `functions/_plans.js`. Standard 1 month ₹1,599 / $17; Premium 6 months ₹8,394 / $84 (₹1,399 / $14 a month); Plus 12 months ₹13,188 / $132 (₹1,099 / $11 a month); Launch Offer 12 months ₹3,999 / $49.
- Launch Offer closes at `LAUNCH_CAP` paid members (1000) or on `LAUNCH_ENDS` (2027-03-31), both in wrangler.toml. It is not combined with the sister discount.
- Currency follows the visitor's country (India = ₹ + Razorpay, elsewhere = $ + PayPal); visitors can switch.
- Sister discount, preferred route (verify first, pay half): a sister signs in, uploads her ID, you approve it, and when she is signed in and pays with her own account email every plan except the Launch Offer is 50% off at checkout (INR and USD). No refund and no credit note are needed; the invoice is for the half price.
- Backup route (refund): if she pays full price first and ticks the box, the 50% is refunded automatically after you approve her ID. She must verify within 30 days.
- (Refund route detail) she pays full price and ticks the box; when an admin approves her identity verification (account email = payment email, gender sister) 50% is refunded to the original payment method (Razorpay or PayPal). She must verify within 30 days. Failures appear in the Errors tab and retry on the next verification approval.
- Ask your CA about a GST credit note for the refunded part of Indian invoices.
