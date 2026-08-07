# What PRform costs to run

Last updated 2026-08-07.

A running ledger of every service PRform depends on, what it costs today, and
what makes it cost more. Kept because the pilot is about to add a metered
channel (Twilio) to a stack that has so far been free, and "how much does one
athlete cost per month" should be a number you can look up rather than derive.

## Today

| Service | What it does | Cost now | Plan |
|---|---|---|---|
| Vercel | Hosting, crons, deploys | **$0** | Hobby |
| Neon | Postgres, prod + `prform_test` | **$0** | Free tier |
| Resend | Transactional email | **$0** | Free tier |
| Web push | Evening and morning notifications | **$0** | Not a paid service |
| Twilio | SMS | **$0** | Not signed up |
| Stripe | Subscriptions | **$0** until a card is charged | Pay per transaction |
| Strava | Activity sync | **$0** | Free, capped at 10 athletes |
| prform.app | Domain | ~$15–25/yr | |

**Running total: roughly $20 a year**, all of it the domain.

## What each one costs when it stops being free

### Vercel

Hobby is free. Pro is **$20/month**.

Two separate reasons you may need Pro, and only one of them is technical:

1. **Cron frequency.** Hobby allows two cron jobs, triggered once a day. Both
   slots are used (`strava-reminders`, `messaging`). `/api/cron/push-flush`
   needs to run every five minutes and has no slot. Workarounds that cost
   nothing: an external pinger (cron-job.org, Upstash QStash), or routing
   scheduled messages to a channel that can hold them itself (Twilio, Resend).
2. **The commercial-use policy.** Hobby is for personal, non-commercial
   projects. PRform has live Stripe keys and a $5/month subscription. While
   `EARLY_ACCESS=true` and every member is grandfathered free, that is arguably
   still non-commercial. **The first time a card is charged, move to Pro.** The
   cron capability comes along with it.

### Neon

Free tier is 0.5 GB and one project. The next tier up is **$19/month**.

Nothing here grows quickly. The biggest table by row count will be `SleepLog`
at one row per athlete per night: 100 athletes for a year is ~36,000 rows,
which is nothing. `StravaActivity` is larger per row but bounded by the 10
athlete Strava cap. Free tier is likely fine well past the pilot.

### Resend

Free tier is **3,000 emails/month, capped at 100/day**. Next tier is
**$20/month** for 50,000.

The daily cap binds before the monthly one. At two messages a day per athlete,
100/day is about **50 athletes**. Today only the waitlist approval and the two
Strava reminder emails send, so usage is negligible.

### Twilio (not live yet)

The only genuinely metered channel, and the one worth watching.

| Item | Cost |
|---|---|
| Phone number | ~$1.15/month |
| Outbound SMS (US) | ~$0.0079 per segment |
| Inbound SMS | ~$0.0075 each |
| A2P 10DLC brand registration | ~$4 one-off |
| A2P 10DLC campaign | ~$2–10/month |

**Per athlete, per month:** two scheduled messages a day is ~60 outbound, plus
replies. Call it **$0.50–0.70/month per athlete** all in.

- 25 athletes: ~$20/month
- 50 athletes: ~$35/month
- 200 athletes: ~$130/month

A message over 160 GSM-7 characters bills as two segments, which is why
`MAX_BODY_LENGTH` in `lib/messaging/copy.ts` is 320 and the morning message
drops the streak clause before it drops the verdict.

### Stripe

**2.9% + $0.30** per successful charge. On a $5/month subscription that is
$0.445, so **you keep $4.56**, about 91%.

### Web push

**Free, at any volume, forever.** There is no per-message cost and no account
to sign up for. This is the strongest argument for making push the default
channel and SMS the upgrade rather than the other way round: at 50 athletes,
push costs $0/month and SMS costs ~$35/month for the same two messages a day.

## The number that matters

Cost per athlete per month, by channel:

| Channel | Cost |
|---|---|
| Push only | **$0.00** |
| Email only | **$0.00** up to 50 athletes, then $20/month flat |
| SMS | **~$0.50–0.70** |

Revenue per paying athlete is **$4.56** after Stripe. So SMS costs roughly 13%
of revenue per athlete and push costs nothing. Both are affordable; they are
just not the same decision at 500 athletes as at 50.

## Triggers to revisit this file

- First paid subscription → move Vercel to Pro ($20/month).
- Twilio account opened → this stops being a $20/year project.
- Past ~50 athletes on email → Resend's 100/day cap binds.
- Past 10 Strava athletes → the cap is Strava's, not a cost, but it changes
  what the product can promise.
- Neon past 0.5 GB → $19/month.
