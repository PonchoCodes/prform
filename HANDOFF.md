# Handoff — 2026-08-12

Written at the end of a session that added a triggered PWA install modal,
sharing one component with the settings page. The modal opens from the
dashboard with the athlete's real bedtime and reminder time in the headline.

**Read this first if you are picking the work up cold.** `CLAUDE.md` explains how
everything works; this file explains what state it is in right now.

---

## Committed and deployed (2026-08-12)

The PWA install prompt was added as a modal plus a shared instructions component.
Commit `34a3d4d` on master, pushed to GitHub. Migration `20260812000000_add_pwa_prompt_state`
applied to Neon via `db execute` + `migrate resolve`. Build Ready in 51s;
`/api/user/pwa-prompt` live on prform.app (401 unauthenticated = route exists).

**What changed:**

- `lib/pwaDetect.ts` — `isStandalone`, `getPlatform`, `isInAppBrowser`, `getInstallContext`.
- `lib/pwaPrompt.ts` — eligibility logic for the five render conditions.
- `components/PWAInstallProvider.tsx` — captures `beforeinstallprompt` once at the root.
- `components/PWAInstallInstructions.tsx` — the shared component (modal + settings).
- `components/PWAInstallPrompt.tsx` — the modal, fired from the dashboard.
- `app/api/user/pwa-prompt/route.ts` — POST to record dismissal or install.
- Three `User` schema columns: `pwaPromptState`, `pwaPromptDismissedAt`, `pwaPromptShowCount`.
- `lib/messaging/config.ts` exports `EVENING_LEAD_MINUTES = 90` (shared with the cron).
- Tests: `lib/pwaDetect.test.ts` (8), `lib/pwaPrompt.test.ts` (13).

npx tsc clean; npm test 496 passing; npx next build compiles.

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

## Resolved since (2026-08-07, third sitting)

- **The push-flush trigger.** The user upgraded to Vercel Pro; `vercel.json` now
  carries `{ "path": "/api/cron/push-flush", "schedule": "*/5 * * * *" }`. If
  the plan ever drops to Hobby that entry must come out or deploys fail.
- **The morning verdict now exists on push and email.** It was only ever created
  by an SMS wake-time reply, which push and email athletes cannot send. The
  daily cron now pre-schedules it for every reachable athlete at the plan's
  recommended wake time via `lib/messaging/morning.ts` (`replaceExisting:
  false`); an SMS reply still cancels and re-queues at the declared wake time.
- **The iOS home-screen icon is a static `app/apple-icon.png`** built from the
  wordmark by `scripts/buildIcons.mjs`, replacing the generated "PRf" tile
  route. iOS captures the icon exactly once, at Add to Home Screen — anyone who
  installed while it was broken must remove and re-add the app.

## Still open, in priority order

1. **Device testing: PWA install + the new modal.** iOS Safari and Android Chrome,
   real phones with HTTPS. On each: open prform.app, scroll to the plan (modal
   should open with your real bedtime + reminder time). Tap the Share button
   (iOS) or Install button (Android). Confirm the home screen app launches and
   persists. The modal's other branches (in-app webview, iOS Chrome, desktop)
   also need verification: the in-app browser should say "open in Safari," iOS
   Chrome should say the same, desktop should link to mobile.

2. **iOS Safari and Android Chrome push notifications.** Install the app, enable
   notifications, press "Send a test" on `/profile`. On iOS this cannot be
   tested in a Safari tab (push doesn't exist there). First full end-to-end:
   tonight's cron (03:00 UTC) should queue evening + morning for the user's
   account, five-minute flush should deliver both on time.

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
