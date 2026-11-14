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
