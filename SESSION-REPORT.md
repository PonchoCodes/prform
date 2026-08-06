# Session Report — overnight run, 2026-08-06

Written as the session progresses. Sections are marked **DONE / PARTIAL / SKIPPED**
as they close. The morning handoff is at the bottom.

Hard rules held all night: no migration was applied to Neon, no message was sent
(no Twilio credentials exist; `SMS_DRY_RUN` defaults to true), nothing was
deployed or pushed, and the only dependency in play is the Twilio Node SDK
(already in package.json when the session began).

---

## Phase 1 — Security and unblocking: DONE

### 1.1 /api/sleep-plan full-user leak — DONE (was already fixed, audit completed)

The fix itself landed in commit `5ef9158` (previous session): the route now
fetches with an explicit `select` and passes the row through `toClientUser()`
(`lib/clientUser.ts`), an allowlist that names exactly what the browser may see.

**Consumers of the `user` object in the sleep-plan response** — there is exactly
one: `app/dashboard/page.tsx`. No other page fetches `/api/sleep-plan`. What it
reads:

| Field | Used for |
|---|---|
| `prDistanceId` | whether to show the "add a PR" prompt |
| `prPromptDismissedAt` | whether that prompt was dismissed |
| `subscriptionStatus` | trial/subscription banner |
| `trialEndsAt` | trial countdown banner |
| `earlyAccessUser` | suppressing the billing banner for grandfathered users |
| `unitPreference` | pace formatting (mi vs km) |

**Sensitive fields that were being exposed before `5ef9158`** (the route
returned the entire Prisma `User` row to the browser):

- `password` — the bcrypt hash
- `stravaAccessToken`, `stravaRefreshToken`, `stravaTokenExpiry`, `stravaAthleteId`
- `stripeCustomerId`, `stripeSubscriptionId`
- PII not needed by the dashboard: `email`, `name`, `age`, `biologicalSex`,
  plus internal flags (`approved`, `userMaxHR`, `userThresholdHR`, …)

The bcrypt hash and the Strava tokens are the serious ones: the tokens are live
credentials for the athlete's Strava account, and the hash is offline-crackable.

### 1.2 Same pattern everywhere — DONE (commit `bb87b86`)

Audited every `prisma.user.find*` in the codebase. All committed routes already
used explicit selects. Three remaining unselected reads, none of which leaked to
a response body but all of which fetched the full row server-side:

- `lib/auth.ts` login query — fetched everything to compare one hash. Now
  selects the five fields it uses (and is documented as the one query allowed
  to read `password`).
- `app/api/auth/register/route.ts` — existence check; now selects `{ id }`.
- `scripts/seedAnalysis.ts` — dev seed; now selects `{ id }`.

**Regression guard**: `lib/userSelectGuard.test.ts` scans all source and fails,
naming the file, if any `prisma.user.find*` call lacks a `select`. There is no
allowlist — even login doesn't need one. This complements
`lib/clientUser.test.ts`, which asserts the serialized sleep-plan `user` payload
contains no password/token/Stripe values and no key matching
`/password|token|secret|stripe|refresh|athleteId/i`.

Other models (Workout, Meet, SleepLog, StravaActivity) carry no credentials;
routes returning those rows whole are fine.

### 1.3 Strava deauthorization webhook — DONE (commit `68691db`, real bug found)

Handling existed (`app/api/strava/webhook/route.ts` → `handleDeauthorization`:
deletes synced activities, clears tokens, marks disconnected) **but was wired to
the wrong event shape**. It matched `object_type=athlete, aspect_type=delete`,
while Strava delivers revocation as an athlete **update** with
`updates: {"authorized": "false"}` (confirmed against
developers.strava.com/docs/webhooks). Every real deauthorization would have
been silently ignored. The handler now accepts both shapes. This was the item
blocking the rate-limit application — worth re-testing once with a real
disconnect before submitting.

---

## Phase 2 — Make Strava optional: DONE

### 2.1 Verdict branch audit — which branches actually require Strava

`lib/verdict.ts` now has ten branches (the tenth, `short_night`, arrived with
the SMS work). First match wins, top to bottom:

| Branch | Trigger | Strava required? |
|---|---|---|
| `short_night` | declared wake makes target unreachable | No — declared wake + plan |
| `needs_pr` | no resolvable pace table | No — this *is* the no-data state |
| `race_day` / `race_tomorrow` | meet dates | No — Meet rows |
| `back_off` / `recover` | fatigue signal present | **Partially — see below** |
| `taper` | A/B meet within 7 days | No — Meet rows |
| `go_hard` / `threshold` / `easy` | planned training load | No — merged template/manual workouts |

Your expectation was right, with one refinement: the fatigue signal
(`fatigueReason`) is a 3-way OR of sleep debt (sleep logs — never needed
Strava), recovery score (plan — never needed Strava), and **TSB, which was the
one Strava-only input**. A no-Strava athlete could reach `back_off` via sleep
debt already; they just had no fatigue signal from training stress itself.

Pace values printed in every branch resolve from the declared PR without
Strava (that was the point of `5ef9158`).

### 2.2 Manual workout entry + load — DONE (commit `2f625d2`)

- `Workout.effort` (1–10) already existed in schema and API; what was missing
  was any UI to enter it and anything consuming it as load. Both added.
- Schedule page → Past tab → "+ Log Workout": date, session type, duration
  (minutes), session RPE 1–10.
- `lib/trainingLoad.ts` (pure, 20 tests): Foster session-RPE. Load = minutes ×
  RPE; normalized to the PMC's TSS scale as one hour at RPE 7 (threshold) =
  100 TSS, linear — see DECISIONS.md D4 for why linear and not RPE².
- `calculatePMC` accepts an extra daily-TSS map; the sleep-plan route feeds it
  manual loads, so ATL/CTL/TSB — and through TSB the verdict's fatigue branch —
  run with zero Strava. Days with a Strava activity ignore manual entries
  (D5: same ground-truth rule as the workout merge layer; one run must not
  count twice).

### 2.3 Self-reported quality — DONE (same commit)

- New nullable `Workout.quality` enum `NAILED_IT | FINE | ROUGH`; migration
  `20260806090000_add_workout_quality` **written, NOT applied**.
- Three-button control on manual rows in the activity log; tap again to clear.
- Trend chart accepts either source per day: pace-scored (Strava vs resolved
  paces) wins where it exists; quality scores the rest. `NAILED_IT`/`FINE`
  count on-target, `ROUGH` off (D6). Null = missing, never "rough".

### 2.4 Strava removed from onboarding — DONE (commit `414ad07`)

Step 4 is now the weekly training template (previously hidden behind a
toggle) plus optional SMS enrolment. Strava is offered afterward — the
dashboard verdict already nudges "Connect Strava" once an athlete would
benefit, and /strava remains. Onboarding no longer mentions it.

### 2.5 Cap handled gracefully — DONE (was mostly done; copy aligned)

`/api/strava/connect` already refused over-cap connections with a redirect
(never a raw error). The /strava page copy now says sync is full, they're set
up without it, and they'll be connected when a slot opens. The generic
connection-error branch no longer prints the raw error code either.

**Note for the morning**: there is no waitlist/queue that *automatically*
connects athlete #11 when a slot opens — "we'll connect you when a slot
opens" is honest (you approve slots by nature of the cap) but manual. A
stored "wants Strava" flag + notification would be a small follow-up.

---

## Phase 3 — Texting layer: IN PROGRESS

A complete, tested SMS layer was found **uncommitted** in the working tree at
session start (built by the previous session, left unstaged). This session
verified it against the spec item by item and committed it in reviewable units.
Details below as verification completes.

---

## Phase 4 — Coach side: NOT STARTED

---

## Morning handoff

(completed at end of session)
