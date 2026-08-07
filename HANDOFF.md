# Handoff — 2026-08-07

Written at the end of a session that shipped Steps 2 through 6 (PWA and web push,
open team creation, the consistency leaderboard, check-in streaks, retention
measurement) plus email as a third message channel.

**Read this first if you are picking the work up cold.** `CLAUDE.md` explains how
everything works; this file explains what state it is in right now.

---

## Committed and deployed (2026-08-07, second sitting)

The entire session above is now **committed (`7a6e47a` on master, pushed to
GitHub) and live on prform.app**. The six migrations
(`add_planned_session_duration` through `add_email_channel`) are in git and
were already applied to production via `db execute` + `migrate resolve`, so
`prisma migrate deploy` during the build was a no-op, as intended. Do not
regenerate or rename them.

Deploying shipped the VAPID keys into a live build, so **web push is now on**
for immediate sends; only the scheduled-push flush trigger is still missing.

**Found and fixed during the deploy:** `vercel --prod` had been uploading local
`.env` inside the bundle, where Next.js loads it at runtime. Vercel-defined
vars won, but anything undefined there fell through to the local value — which
is how production ran with `NEXTAUTH_URL=http://localhost:3000` baked in
(NextAuth survived because the credentials+JWT flow barely reads it, but its
generated URLs said localhost and cookies were non-secure). `.vercelignore` now
excludes env files (`69112c3`), the domain serves the clean git-integration
build, NextAuth auto-detects `https://prform.app`, and cookies got the
`__Secure-` prefix — which renamed the session cookie and signed everyone out
once. Prefer letting the GitHub push trigger the production build; if using
`vercel --prod`, the ignore file now keeps `.env` out either way.

## Verification state

- `npx tsc --noEmit` clean
- `npm test` — 475 passing
- `npm run test:integration` — 104 passing (needs `npm run test:db:push` first
  after any schema change)
- `npx next build` compiles
- `npm run lint` fails, but it failed before this session too: every route trips
  `no-explicit-any` on the established `(session.user as any).id` pattern.

Neon dropped a connection twice during the session, once mid-migration (correctly
not marked applied, retried) and once mid-test-suite. Both recovered on retry. If
a test run fails with a Prisma engine error, re-run before investigating.

---

## Resend / email: DONE (verified 2026-08-07)

All five verification steps were completed via the Resend MCP. The channel is
proven end to end: gate → ledger → Resend → a real inbox, both immediate and
scheduled.

1. `prform.app` reads **verified** in Resend's own API (not just DNS). Sending
   enabled, us-east-1.
2. `EMAIL_FROM` is set in Vercel production: `PRform <hi@prform.app>`.
3. A real evening check-in went through `sendMessage` (`forceChannel: "EMAIL"`)
   to 609poncho@gmail.com. Ledger row SENT, Resend id recorded.
4. Confirmed in Gmail: landed in the **Inbox**, not spam, from `hi@prform.app`.
5. A morning message scheduled 17 minutes out via `sendAt` was held by Resend
   (status `scheduled`), delivered on time, and confirmed by the user. Resend
   reports `delivered`. `scheduledAt` works.

What changed to make it happen:

- **A sending-only API key restricted to `prform.app`** (`prform-local-dev`,
  minted via the Resend MCP) is now in local `.env` as `RESEND_API_KEY`, with
  `EMAIL_FROM` set to match production. Production keeps its own older key.
- **The user's account had no `ianaTimezone`** (they never enrolled via SMS or
  push), so the gate refused with `no_timezone`. Backfilled to
  `America/Mexico_City`. Any email-preference athlete who never touched SMS or
  push enrolment will hit the same wall — worth remembering when onboarding
  routes someone straight to EMAIL.
- **`scripts/emailSmoke.ts`** is the repeatable test:
  `npx tsx scripts/emailSmoke.ts immediate` or `scheduled [mins]`. It goes
  through the real `sendMessage` path and prints the outcome and ledger row.
- Two ledger rows for 2026-08-07 (EVENING_WAKE_QUESTION and MORNING_VERDICT,
  both EMAIL) exist for the user's own account. Real sends, left in place.

Also fixed in passing: `NEXTAUTH_URL_PRODUCTION` was set in neither Vercel
production nor correctly locally, so `appBaseUrl()` in `lib/emailTemplates.ts`
was falling back to `https://prformm.vercel.app` (production) and a stale
deployment URL (local) for links inside emails. Both now point at
`https://prform.app`. The var feeds email links only, nothing in auth. Like all
env changes it takes effect on the next deploy.

Decision already taken: **send from the root domain**, `hi@prform.app`, not a
`send.` subdomain. DKIM is on the root, it works today, and at pilot scale the
reputation argument for a subdomain does not pay for the DNS work. Revisit at
volume.

---

## Why email matters more than it looks

Resend accepts `scheduledAt`. That makes email **the only channel besides SMS
that can hold a future message for us.** Web push cannot: a scheduled push sits
in our own ledger until `/api/cron/push-flush` delivers it, and that endpoint
needs a five-minute trigger which Vercel Hobby cannot provide (two crons, once
daily, both slots used).

So an athlete on `channelPreference = EMAIL` gets working scheduled reminders
today, on the current plan, with no cron work at all. That is the cheapest route
to a functioning re-engagement loop during the month without SMS.

---

## Still open, in priority order

1. **A five-minute trigger for `/api/cron/push-flush`.** Without it, scheduled
   PUSH messages are never delivered. Three ways out: Vercel Pro ($20/mo) plus a
   `*/5 * * * *` entry in `vercel.json`; a free external pinger (cron-job.org)
   sending `Authorization: Bearer $CRON_SECRET`; or route athletes to EMAIL,
   which needs no trigger. **Do not add a third cron to `vercel.json` on Hobby —
   it fails the deploy.**
2. **iOS Safari and Android Chrome device testing.** Never done; needs HTTPS and
   real phones. Per device: install, open from the home screen, enable
   notifications, press "Send a test" on `/profile`. On iOS push does not exist
   until the app is installed, so testing in a Safari tab proves nothing.
3. **Vercel plan.** Hobby is for non-commercial projects and PRform has live
   Stripe keys. While `EARLY_ACCESS=true` and everyone is grandfathered free that
   is arguably fine. The first paid card means Pro. See `COSTS.md`.

## Working agreements established this session

- **No em dashes in anything a user can see.** 77 were removed from pages,
  components, verdict copy, messaging copy, consent text, email templates and
  the title template. The ones left are in code comments and server logs.
- **No copy that explains a design decision to the athlete.** Ten strings were
  cut for this, e.g. "Nobody sees anyone's sleep, not their hours, not their
  bedtime" and "Nothing else, no streaks nagging you, no marketing". Both were
  defences of a decision nobody had challenged. The enumeration survives in the
  consent text, where it is a promise made to the person it concerns rather than
  a boast made to someone else.
- Decisions worth their own record go in `DECISIONS.md` (D15 and D16 are from
  this session). Costs go in `COSTS.md`.
