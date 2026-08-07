# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build (runs `prisma migrate deploy` first — see warning below)
npm run lint         # ESLint via Next.js
npm run test         # Vitest unit tests (lib/**/*.test.ts) — fast, no database, no network
npm run test:watch   # Vitest in watch mode
npm run test:integration  # Route-level tests against a real Postgres (see below)
npm run test:db:setup     # One-off: create the prform_test database on Neon
npm run test:db:push      # Apply migrations to prform_test (re-run after a schema change)
npm run seed         # Seed demo user (demo@prform.com / demo1234)

npx prisma migrate dev --name <name>   # Create and apply a migration
npx prisma generate                    # Regenerate Prisma client (required after every schema change)
npx prisma studio                      # Browse the database
npx prisma migrate deploy              # Apply pending migrations to production (run before deploy if schema changed)

vercel --prod        # Deploy to production (linked to ponchocodes-projects/prform-o3m8)
```

Unit tests cover the VDOT/pace model (`lib/vdot.test.ts`, `lib/paceSource.test.ts`) and the
pure logic in `lib/`, and run under Vitest with no database.

**Integration tests (`tests/integration/`) are the exception**: they run route handlers
against a real Postgres database, and they are the only tests that prove cross-team
authorization actually holds. They are excluded from `npm test` — it must stay fast and
offline — and run with `npm run test:integration` (~3 minutes; every query is a Neon round
trip).

- The database is `prform_test`, a sibling of production on the same Neon project, addressed
  by `TEST_DATABASE_URL`. Create it once with `npm run test:db:setup`, then `npm run test:db:push`.
  **Re-run `test:db:push` after every schema change** or the tests run against a stale schema.
- `tests/integration/setup.ts` points `DATABASE_URL` at the test database before any route
  module is imported (`lib/prisma.ts` reads it at import time) and **refuses to run unless the
  database name contains "test"** — these tests truncate tables.
- The only production code substituted is `getServerSession`, mocked per test file. Everything
  below it — the guard, Prisma, the real rows, the serialized response — is the real path.
  So these tests prove things about handlers, not about NextAuth or middleware.
- `lib/team/guard.test.ts` (the source scan) stays. It is weaker but cheap, and it catches a
  brand new route that forgets the guard entirely — which the integration tests, being a fixed
  list of routes, would not notice.

**`npm run build` runs `prisma migrate deploy` against whatever `DATABASE_URL` points at.**
To compile without touching the database, run `npx next build` directly.

## Environment

Requires a `.env` file at the project root with these variables:

```
DATABASE_URL          # Neon PostgreSQL connection string
NEXTAUTH_SECRET       # NextAuth JWT secret
NEXTAUTH_URL          # http://localhost:3000 for local dev
STRAVA_CLIENT_ID      # Strava API app ID
STRAVA_CLIENT_SECRET  # Strava API app secret
STRAVA_REDIRECT_URI   # http://localhost:3000/api/strava/callback for local dev
STRAVA_WEBHOOK_VERIFY_TOKEN
EARLY_ACCESS          # "true" = invite-only gate active (see EARLY ACCESS TOGGLE below)
ADMIN_EMAIL           # Email allowed into /admin (waitlist approval UI)
VAPID_PUBLIC_KEY      # Web push. Generate with `npm run push:keys`
VAPID_PRIVATE_KEY     # Rotating the pair unsubscribes every device
VAPID_SUBJECT         # mailto: or https:// — how a push service contacts you
```

Production is served at **https://prform.app** — the canonical host, and the value of
`SITE_URL` in `lib/seo.ts`. The Vercel deployment URL **https://prformm.vercel.app**
(project `prform-o3m8`) still resolves and serves the same app, so every page emits a
canonical tag pointing at prform.app to keep the two hosts from competing as duplicates.

## Architecture

**PRform** is a sleep optimization app for competitive distance runners. The core product is a 14-day sleep plan algorithm in `lib/sleepAlgorithm.ts`.

Swimming was removed from scope, including the sleep-need modifier it carried. `User.sport`
remains a schema column and is always written as `"track"`, but nothing reads it — it is no
longer part of `UserInput` in `lib/sleepAlgorithm.ts`. One swimming reference is deliberate:
`swim` in `CROSS_RE` in `lib/workoutDataSource.ts`, which classifies a runner's cross-training
swim and is still correct.

### The Sleep Algorithm

`calculateSleepPlan(user, meets, workouts, currentTSB?, opts?)` is the most important function. It returns a `DailySleepPlan[]` array where index 0 is `startDayOffset` (typically yesterday at `-1`) and the rest are today through day +13.

How it computes each day's bedtime:
- **Base sleep need**: 8–9h from age brackets, +30 min female
- **Training load bonus**: +15 min moderate, +20 min tempo/track, +30 min long_run, +15 min day-after-hard
- **Meet ramp**: bedtime shifted progressively earlier over 10 days before each meet (up to 60 min for A-priority). Uses `SHIFT_FRACTIONS` lookup table for the phase schedule
- **Circadian correction**: if recent sleep logs show the athlete's actual phase is delayed, the ramp compensates for the delay on top of the meet advance
- **Recovery score** (0–100): deducted by consecutive hard days, meet proximity, and a `globalSleepPenalty` computed from recent missed nights; boosted by sleep streak

The internal `WorkoutType` values (`easy`, `moderate`, `tempo`, `long_run`, `track`, `race`, `rest`, `cross_train`) drive the algorithm.

### Data Flow

`/api/sleep-plan` is the single main endpoint consumed by the dashboard. It:
1. Fetches the user, meets, and workouts (via `getWorkoutsForDateRange` which merges Strava + manual + template workouts)
2. Fetches sleep logs for the plan window and the most recent 3 nights
3. Runs `calculateSleepPlan` for yesterday through day +13
4. Runs `calculatePerformancePrediction` for each upcoming meet that has `primaryEvent` and reference times — fetches sleep logs for the 10-night pre-race window to do so
5. Returns `{ plan, user, meets, conflicts, yesterdayPlan, meetPredictions }`

`meetPredictions` is a `Record<meetId, PerformancePrediction>` used by the dashboard hero card and recovery score section.

### Workout Data Source

`lib/workoutDataSource.ts` is the merge layer. For any date range it returns a unified `NormalizedWorkout[]` by:
- Taking Strava activities as ground truth when they exist for a date
- Falling back to manual one-off workouts (`isTemplate: false`)
- Falling back to template workouts expanded by `dayOfWeek` (`isTemplate: true`)
- Flagging Strava/manual conflicts for the UI to resolve

### VDOT and Training Paces

`lib/vdot.ts` is the single source of truth for the Daniels/Gilbert model — VDOT from a race
performance, race times from a VDOT, and the full training pace table. Nothing else should
implement these formulas.

- Training paces come from inverting the oxygen-cost regression at a target %VO2max. The
  previous linear approximation (`vVDOT ≈ 0.072·vdot + 0.27`) ran 7–13% slow across the usable
  range and was replaced; correcting it made every displayed pace faster.
- Marathon pace is derived by inverting the model at 42195 m, not from a fixed %VO2max, because
  the sustainable fraction rises with fitness.
- `PaceTable` fields are all `*Ms` (metres/second). Format them with `formatPace(ms, unit)` from
  `lib/unitUtils.ts` so the athlete's imperial/metric preference is honoured. The old
  `*MinKm` string fields were removed — they held min/**mile** values despite the name.
- 800m is flagged unreliable via `prDistanceGuidance` (too anaerobic for the %VO2max curve). The
  UI warns and offers longer distances but still allows it.

`lib/paceSource.ts` resolves which paces to actually show. Two signals feed it: the athlete's
declared PR (`User.prDistanceId` / `prTimeSeconds` / `prSetOn`) and VDOT inferred from workout
history. They are blended **in VDOT space**, never pace space — blending five paces independently
can invert their ordering.

- Declared-PR confidence decays linearly from 1.0 at 3 months old to a 0.2 floor at 24 months.
  A decay, not an expiry: a hard cutoff would make paces jump on an arbitrary date.
- Observed data ramps in over `OBSERVED_FULL_WEIGHT_EFFORTS` (8) qualifying hard efforts, and a
  staler PR is displaced sooner.
- `PerformanceReport.resolved` carries the paces plus a `source` with `label`/`detail` strings —
  every surface that shows a pace shows where it came from.
- `calculateVDOT` deliberately returns null rather than falling back to "most recent run of any
  kind". A confidently wrong VDOT from an easy shakeout is worse than none.

### Performance Prediction

`lib/performancePrediction.ts` (no server imports — safe to import in client components):
- `calculatePerformancePrediction(meet, sleepLogs, user)` — computes a `PerformancePrediction` from the 10 nights before the meet. Formula: `paceChangePct = avgDeficitHours × 2`, capped at 8% slower / 5% faster.
- `parseTimeToSeconds` — handles `"51.8"`, `"1:52.4"`, `"16:42"`, `"1:04:30"`
- `formatSecondsForDisplay` — converts stored seconds back to human-readable form for form editing
- `formatTimeFromSeconds` / `formatTimeDifference` — display helpers for the UI
- `getUnitForEvent(event)` — returns `"seconds"` for short track events (100m–400m, hurdles, 4×100), `"mmss"` for everything else

### Meet Model

The `Meet` model stores: `name`, `date`, `distances`, `priority` (A/B/C), `raceTime` (HH:MM 24h), and the four event fields: `primaryEvent` (e.g. `"400m"`), `personalBest` (seconds as numeric string, e.g. `"51.8"`), `recentBest` (same format), `personalBestUnit` (`"seconds"` or `"mmss"`).

Times are always stored as total seconds regardless of display format. The meets page form parses user input at save time and restores the formatted string at edit time using `formatSecondsForDisplay`.

The meets page also handles `?edit=<meetId>` URL param — arriving from the dashboard "ADD EVENT + PR →" button auto-opens the edit form for that meet.

### Database

PostgreSQL via Neon, managed with Prisma 7. Connection is configured in `prisma.config.ts` (datasource url field). **After any schema change, run both `prisma migrate dev` and `prisma generate`** — the generated client won't reflect new fields until regenerated.

Key model relationships: `User → Workout[]`, `User → Meet[]`, `User → SleepLog[]`. Workouts are dual-purpose: `isTemplate: true` + `dayOfWeek` = repeating weekly schedule slot; `isTemplate: false` + `date` = one-off logged workout.

### Auth

NextAuth v4 with a credentials provider (`lib/auth.ts`). The session JWT carries `userId` and `onboardingDone`. All API routes call `getServerSession(authOptions)` and extract `(session.user as any).id`. Users who haven't completed onboarding are redirected to `/onboarding` by the sleep-plan route.

### Strava Integration

OAuth flow: `/api/strava/connect` → Strava OAuth → `/api/strava/callback` (stores tokens on User). Activities sync via webhook (`/api/strava/webhook`) and manual trigger (`/api/strava/sync`). Strava activities are stored in `StravaActivity` and fed into `workoutDataSource` alongside manual workouts.

### Text Messages (SMS)

**See [MESSAGING.md](./MESSAGING.md) for the full design.** Two scheduled messages a day
that make the website optional: an evening question about tomorrow's wake time, and a
morning verdict. Built and tested; **not live** — there is no Twilio account yet, the
migration `20260805210000_add_sms_layer` is written but unrun, and `SMS_DRY_RUN` defaults
to `true` so nothing can send by accident.

Things to know before touching it:

- **Timing belongs to Twilio, not to us.** A once-daily cron (`/api/cron/messaging`)
  schedules messages with a `sendAt`. Vercel Hobby crons fire anywhere inside a 59-minute
  window, so nothing may depend on when the cron actually runs.
- **`lib/messaging/twilio.ts` is the only file allowed to import the Twilio SDK.**
  Everything else goes through the `MessageProvider` interface so WhatsApp is a new driver.
- **Every outbound message goes through `sendMessage`.** The daily cap is counted from the
  `SentMessage` ledger it writes, so a send that skips it is a send the cap cannot see.
  Never reply with TwiML — that routes around the ledger, the cap and the gate.
- **A night is filed under the local date it *begins*** (the evening), matching the
  dashboard's morning confirmation card. `nightDateFor` implements it: noon is the cut.
- **Store IANA zone strings, never UTC offsets.** All local-time maths goes through
  `lib/messaging/time.ts`.
- `calculateSleepPlan` now accepts `opts.declaredWakeByDate`. It changes only the bedtime
  anchor — the circadian model (CBTmin, PRC zones, meet ramp) still uses the athlete's
  habitual wake, and `lib/sleepAlgorithm.test.ts` asserts that.

### Teams

Anyone signed in can create a team and becomes its **owner**. There is no role to be granted,
no approval, and no billing gate — a captain organizing six people needs a roster as much as a
salaried coach does. There is deliberately **no directory, no browse and no search**: a team is
reachable by join code alone, which is what keeps a roster of minors from being enumerable.

- **"Owner", not "coach", throughout.** `Team.ownerId`, `assertOwnerOf`, `OWNER_VISIBILITY_NOTE`.
  The permissions never depended on which of the two you were; only the word did. Renamed in
  `20260807000000_rename_coach_to_owner` with `ALTER TABLE ... RENAME COLUMN` — a generated
  drop-and-add would have detached every existing team from its owner.
- **Owning a team and being on it are separate facts, and both can be true.** An owner may join
  their own team (a captain runs too), still past the consent screen with no carve-out. An owner
  who never joins still owns it. Leaving ends the membership and not the ownership.
- **A user can hold any number of ACTIVE memberships** — cross country and track are two
  rosters. Nothing has ever limited this; `GET /api/teams` returns `owned` and `memberships`
  separately, with `ownedByYou` on a membership so the UI can explain a team appearing in both.
- **Two guards, and they are not interchangeable.** `assertOwnerOf` for anything that changes
  state or exposes one athlete's status to another; `assertMemberOf` for team-wide reads the
  whole squad is entitled to. `lib/team/guard.test.ts` scans every route source and **fails the
  build if an owner-only route uses the weaker check** — downgrading requires adding the file to
  `MEMBER_SCOPED_ROUTES` in that test, where it is visible in review.
- **Self-enrolment is the only path onto a roster.** No endpoint under `/api/teams` writes a
  membership for anyone but the session user, and the guard test fails the build if `body.userId`,
  `body.athleteId` or `body.email` ever appears in one of these files.
- **The consent text is stored verbatim per membership** (`TEAM_CONSENT_VERSION`). Rewording
  `lib/team/consent.ts` governs future joins only and never rewrites a past athlete's record.
  It has moved twice: `2026-08-07.1` when "my coach" became "the person who runs this team",
  and `2026-08-07.2` when the leaderboard added a disclosure to *teammates*.

#### The consistency leaderboard

`lib/team/leaderboard.ts` (pure) + `GET /api/teams/[teamId]/leaderboard` (the only
member-scoped team route).

- **It ranks nights logged out of nights possible. Nothing else, ever.** Not duration, not
  bedtime, not whether a target was hit. An athlete can decide to open the app; they cannot
  decide to sleep nine hours before a chemistry final. Ranking a squad on duration would put
  the kid with the hardest life at the bottom of a public list and teach everyone that the way
  to climb it is to lie.
- **The query is the privacy boundary.** It selects `date` from SleepLog and nothing else — the
  values are never loaded, so no careless spread can put one on the wire.
  `tests/integration/teams.leaderboard.test.ts` walks the real response for sleep-shaped keys,
  clock times, decimals, and the seeded athlete's actual values.
- **Weekly, Monday to Sunday, reset every Monday** — an all-time board buries the athlete who
  missed a fortnight in September until June.
- **The window ends yesterday**, because a night is filed under the date it *begins*; counting
  today would mark everyone late every day.
- **A mid-week joiner is not judged on the days before they joined**, and "no nights possible
  yet" is `rate: null`, not 0% — having had no chance is not a miss.

### Retention measurement

`lib/retention.ts` (pure) + `/api/admin/retention` + `/admin/retention`. **No third-party
analytics, deliberately** — the people measured here are mostly minors, and their behavioural
data does not go to a vendor whose retention policy we do not control. Everything is computed
from rows already held.

- **Guarded twice**: the page redirects non-admins, the API refuses them independently, and it
  fails closed when `ADMIN_EMAIL` is unset. A page guard protects the page, not the data.
- **The payload is counts.** No names, no emails, no user ids. Team names appear because
  comparing teams is the point of the rollup. `tests/integration/admin.retention.test.ts` walks
  the response for athlete names, emails, ids and sleep values.
- **Funnel steps are strict subsets**, in order: signed up → onboarded → first log → 7
  consecutive days → active in week 4 (days 21–27 after signup). Someone who skipped onboarding
  but logged anyway is excluded from the later steps, or the shape stops being a funnel.
- **Seven consecutive days here is strict** — no forgiveness, no holds. The athlete-facing
  streak is generous on purpose; a retention number that inherited that would report a habit
  that had not formed.
- **A cohort younger than four weeks reports "too soon", never 0%**, which would read as a
  collapse rather than as arithmetic that has not happened yet.
- **Weekly active = logged at least one night that week.** Not opens, not page views.
- **Team rows are not a partition**: an athlete on two teams counts in both, and the solo row is
  users on no team, so the rows do not sum to the account total.
- `User.onboardingCompletedAt` is the timestamp the funnel needs; the boolean alone cannot
  answer "signed up in week 12 and onboarded". Pre-existing rows were backfilled to `createdAt`,
  which understates the gap rather than inventing one.

### The check-in streak

`lib/streak.ts` (pure). **Counts consecutive days CHECKED IN, never targets hit.** An athlete who
was up until 1am with a lab report and logged it honestly at 6:30 has kept their streak — they
did the thing the streak is for. Breaking it there would teach them to stop reporting bad nights,
which destroys the data the product runs on.

- **Three different "streaks" exist and must never share a label.** `computeCheckInStreak` is the
  habit shown to the athlete. `currentStreak` in `/api/sleep-log/streak` counts consecutive nights
  that hit their target and survives only because the hit rates beside it are the same family of
  number. `sleepStreak` in `lib/sleepAlgorithm.ts` feeds the recovery score and is physiology —
  leave it alone.
- **One skipped night per week, rolling, automatic.** A miss is bridged only if no other miss was
  bridged in the previous seven days. Calendar-week allowances would forgive a Sunday *and* a
  Monday — two nights in two days out of a promise that says one a week. Two misses in a row
  therefore always break it.
- **A forgiven night adds nothing to the count.** Forgiveness buys continuity, not credit.
- **Last night unlogged is `atRisk`, not broken.** Athletes log on the way to practice; a streak
  that broke at midnight would be wrong for the seven hours they were asleep.
- **Silent below three days** (`STREAK_ANNOUNCE_FROM`) — announcing a one-day streak tells someone
  they have nothing to protect. `streakSentence` is the single source of the wording, shared by
  the dashboard and the morning message so the two cannot disagree.
- **The morning message drops the streak, never the verdict**, when the body would exceed
  `MAX_BODY_LENGTH`.
- **A hold, not a freeze.** `StreakHold` is a date range the athlete marks as away. Held days are
  removed from the question entirely: not counted, not missed, and they **do not consume the
  weekly forgiveness**. A held night is never `atRisk`. It needs no limit because a held day is
  not a checked-in day either, so it cannot be farmed. See D16 in DECISIONS.md.

### PWA and Web Push

PRform is installable, and web push is a second delivery channel sitting behind the same
send path as SMS. During the pilot — no Twilio account yet — **push is the only channel that
exists**, which is why the routing below fails toward push rather than toward nothing.

- **`public/sw.js` is hand-written; there is no next-pwa or workbox.** It caches only
  content-hashed build output. **No page HTML and no API response is ever cached**: every page
  is personalized behind a session, so a cached page is one athlete's dashboard on disk, and on
  a shared device the next person offline would be shown it. Navigations are network-only with
  `public/offline.html` as the fallback.
- **`lib/messaging/push.ts` is the only file allowed to import `web-push`**, exactly as
  `twilio.ts` is the only one allowed to import Twilio.
- **The provider contract is split.** `OutboundProvider` (schedule / sendNow / cancel, plus
  `channel` and `canSchedule`) is what `sendMessage` talks to; `MessageProvider` extends it with
  the inbound half (`verifySignature`, `normalizeInbound`) that only SMS has. The inbound
  webhook types its provider as `MessageProvider`, so a push driver cannot be wired to it.
- **Push cannot be scheduled by anyone but us.** No push service has a `sendAt`. A push with a
  future send time is written to the ledger as SCHEDULED with nothing handed to a provider —
  `sendMessage` returns `held` — and `lib/messaging/pushFlush.ts` delivers it when due, or
  abandons it if it is more than two hours overdue. **A scheduled text survives this app being
  down; a scheduled push does not.**
- **`/api/cron/push-flush` runs every five minutes via `vercel.json`** (the project is on
  Vercel Pro as of 2026-08-07). If the plan ever drops to Hobby the entry must come out —
  Hobby allows two once-a-day crons and a third fails the deploy — and an external pinger
  with the same `Bearer CRON_SECRET` takes over. `/api/cron/messaging` also calls the flush
  opportunistically so the queue degrades rather than silently accumulating.
- **The morning verdict is pre-scheduled by the daily cron for every reachable athlete** at
  the plan's recommended wake time, via `scheduleMorning` in `lib/messaging/morning.ts` with
  `replaceExisting: false`. This is what makes the morning message exist on push and email,
  which have no reply path. An SMS reply still wins: the inbound handler calls the same
  function with `replaceExisting: true`, cancelling the pre-scheduled row and re-queueing at
  the declared wake time.
- **There are three channels: SMS, PUSH and EMAIL.** `lib/messaging/email.ts` is the only file
  allowed to build message emails, and it is the **only channel besides SMS that can schedule** —
  Resend accepts a `scheduledAt`, so an athlete on EMAIL gets working scheduled reminders with
  no five-minute flush trigger and no Vercel upgrade.
- **Email is not in the messaging cron's candidate query by address alone.** Every account has
  an email, so including it would enrol the whole user base in a daily message nobody asked
  for. An athlete reaches it by setting `channelPreference = EMAIL`.
- **Channel routing lives in `lib/messaging/channel.ts`** and is pure. AUTO goes SMS, then push,
  then email, which is a ranking of how likely a message is to be read at 21:00. An explicit
  choice is honoured strictly with no substitution.
- **Three kill switches**, one per channel (`SMS_KILL_SWITCH`, `PUSH_KILL_SWITCH`,
  `EMAIL_KILL_SWITCH`). They exist to be reached for in a hurry, and a flag that stops three
  channels when you meant to stop one is a flag nobody trusts at 2am.
  **Replies are pinned with `forceChannel: "SMS"`** — HELP, BED_ACK, LIGHTS_OUT, CLARIFICATION,
  and the verification code, which proves control of the number it is sent to. Only the
  scheduled messages route by channel.
- **`STOP` silences every channel.** The gate refuses a push from a STOPPED athlete too;
  delivering the same message by another road because STOP is an SMS word is the behaviour
  `gate.test.ts` and `push.send.test.ts` both pin shut.
- **The daily cap counts both channels from one ledger.** An athlete's attention does not have
  separate budgets for a text and a notification.
- **A push-only athlete's timezone comes from the browser**, captured by `/api/push/subscribe`.
  Without it the gate refuses everything with `no_timezone`. It only ever fills a blank — a
  zone chosen during SMS enrolment is never overwritten.
- **iOS requires the PWA be installed before push exists at all.** In a Safari tab `PushManager`
  is absent, so a permission request there does nothing. `lib/pwa/install.ts` detects this
  (including an iPad reporting a Mac user agent, caught via `maxTouchPoints`) and returns
  `needs_install`, which the UI renders as the literal Share → Add to Home Screen steps.
- **The install prompt appears after a night has been logged**, not on first visit — except in
  onboarding (step 5), where the ask is part of setup. Dismissal is stored on the User so it
  does not reappear on their other device, and `/profile` is the way back for anyone who
  dismissed it.
- **Icons in `public/icons/` are built from the wordmark** by
  `node scripts/buildIcons.mjs "path/to/PRForm Favicon.png"`. Android Chrome will not offer to
  install without a 192 and a 512. The maskable variant draws the mark at 66% so a launcher can
  crop it to any shape, and `icon-badge.png` is alpha-only because Android discards a badge's
  colour and keeps the silhouette. Re-run the script when the artwork changes.
- `npm run push:keys` generates a VAPID pair. **Rotating it unsubscribes every device**, because
  a subscription is minted against one public key.

### SEO

`lib/seo.ts` holds the canonical host, title, description, and keywords — change copy there,
not in individual pages. Two constants (`SUBSCRIPTION_PRICE_USD`, `TRIAL_DAYS`) mirror
`/subscribe` and must be kept in sync with it, because they are asserted publicly in JSON-LD.

- `app/robots.ts` and `app/sitemap.ts` generate /robots.txt and /sitemap.xml. The sitemap is
  `force-dynamic` so it lists `/request-access` or `/signup` depending on `EARLY_ACCESS`.
- `app/opengraph-image.tsx` renders the 1200×630 social card and doubles as the Twitter image.
  It **must** stay on `runtime = "edge"` — next/og's node build resolves its bundled fallback
  font through `fileURLToPath` on a path that is malformed on Windows, crashing both the build
  and the route at request time. `app/icon.tsx` dodges the same bug via `force-dynamic`.
  `app/apple-icon.png` is deliberately a static file, not a route: iOS fetches it exactly once,
  at Add to Home Screen, and a fetch that fails then leaves a screenshot tile forever. It is
  written by `scripts/buildIcons.mjs` from the wordmark artwork.
- `lib/structuredData.ts` builds the landing page's Organization + WebSite + SoftwareApplication
  JSON-LD. Everything asserted there has to be true on the page — no invented ratings.
- Canonical URLs are set **per page**, never on the root layout: metadata cascades, so a
  canonical there would point every page at `/`. Pages needing their own `openGraph` must build
  it with `pageOpenGraph()` — Next replaces the `openGraph` object wholesale rather than merging,
  so a partial silently drops og:type, og:site_name, and og:locale.

### Design System

Defined in `tailwind.config.ts`:
- Colors: white `#FFFFFF`, black `#0A0A0A`, gray `#6B6B6B` / `#E5E5E5`, accent `#E8FF00`
- **No border radius anywhere** — all elements are sharp-cornered
- No shadows
- Section labels: `text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B]`
- Toggle buttons: selected = `bg-[#0A0A0A] text-white border-[#0A0A0A]`, unselected = `border-[#E5E5E5] hover:border-[#0A0A0A]`
- Dark mode via `dark:` variants — background `#1a1a1a`, cards `#242424`

## Early Access Toggle

The `EARLY_ACCESS` env var controls an invite-only beta gate (`lib/earlyAccess.ts`):

- **`EARLY_ACCESS=true`** — allowlist gate active. Registration (`/api/auth/register`) and Strava OAuth (`/api/strava/connect`) require an APPROVED `Waitlist` entry for the email. The landing page CTA becomes "Request Access" → `/request-access`, which feeds `POST /api/waitlist`. Approvals happen at `/admin` (restricted to `ADMIN_EMAIL`) and are capped at `EARLY_ACCESS_APPROVAL_CAP` (currently 25). This is intentionally higher than the Strava athlete cap (10) — members past 10 use the app with manual/template workouts until the Strava tier is raised.
- **`EARLY_ACCESS=false`** — gate disabled, open registration. New users go through the existing Stripe flow (card required, 30-day trial, then $5/month).

**Grandfathering**: approving a waitlist entry sets `earlyAccessUser=true` (and `approved=true`) on the User — at approval time if the account exists, otherwise when they register with the approved email. The payment bypass is tied to `earlyAccessUser` on the User, NOT to the `EARLY_ACCESS` flag: flipping the flag to false must never route early-access users to Stripe, charge them, or start a trial. Their accounts, data, and Strava connections are untouched by the flip.

**Strava cap**: the Strava Standard tier allows 10 connected athletes. `/api/strava/connect` enforces this cap (`STRAVA_ATHLETE_CAP`) independently of `EARLY_ACCESS` — setting the flag to false does NOT lift it.

**Pausing the beta**: keep `EARLY_ACCESS=true` and simply stop approving waitlist entries.
