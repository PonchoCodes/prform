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

## Phase 3 — Texting layer: DONE (verified + committed; one gap filled)

A complete, tested SMS layer was found **uncommitted** in the working tree at
session start (built by the previous session, left unstaged — see DECISIONS.md
D2). Every file was read and checked against your spec, then committed in nine
dependency-ordered units (`43e69e1`..`a23a9ac`), with the full test suite and
`tsc` run against each commit's exact content (`git stash --keep-index`
verification). Item-by-item:

1. **Schema** — ✓ All specified columns/models exist, plus extras that earn
   their place: `SentMessage.sendCount` (so repeatable types can't undercount
   the cap), `SleepLog.needsReview`/`needsReviewNote` (flagged nights), and a
   `PhoneVerification` table storing keyed HMACs, never codes. The `source`
   enum replaces the legacy string and the migration backfills `'manual'` →
   `MANUAL`. Migration `20260805210000_add_sms_layer` is written, **not run**.
2. **calculateSleepPlan** — ✓ takes `declaredWakeByDate`; only the bedtime
   anchor moves. Tests assert the circadian machinery (CBTmin, meet ramp)
   still keys off the habitual wake.
3. **Provider interface** — ✓ `MessageProvider` (schedule/sendNow/cancel/
   verifySignature/normalizeInbound); only `lib/messaging/twilio.ts` may
   import the SDK. DRY_RUN defaults ON, kill switch, per-user daily cap
   counted from the ledger, gate refuses UNVERIFIED and STOPPED (verification
   codes may go to unverified numbers — nothing else).
4. **messageParser** — ✓ pure, 19-case test table, no LLM. STOP matched first
   and inside short sentences; times in every format you listed plus
   "half five" / "quarter to six"; durations; UNPARSED → one clarifying text,
   never a guess.
5. **STOP cancels via the API** — ✓ `cancelAllScheduled` cancels by stored
   provider SID; the same `cancelScheduled` path runs when a declared wake
   time is revised (and when BED arrives, since the morning text is
   re-scheduled with new copy).
6. **Guards** — ✓ 2–14h plausible window; INFERRED close-out at declared wake
   + 2h (swept by the daily cron); double-BED = split night, flagged, never
   scored; flagged rows carry no duration and are excluded from the trend at
   the query. A missing reply cannot produce a 27-hour night — that exact
   case has a test.
7. **Unreachable-target verdict** — ✓ `short_night` branch, top of the ladder,
   names the deficit to the half hour and moves tomorrow's session. Fires at
   ≥60 min shortfall.
8. **Onboarding** — ✓ **gap found and filled this session**: enrolment
   (phone, IANA timezone from the browser, explicit opt-in with the server's
   consent text + timestamp, verification scaffold) existed only on the
   profile page. It's now also onboarding step 4, clearly optional
   (commit `414ad07`). Codes are issued/confirmed end-to-end but DRY_RUN
   means nothing sends until credentials exist.

**Nothing was sent tonight and nothing can send**: no Twilio credentials
exist, `SMS_DRY_RUN` defaults to true, and the provider is null without
config — the send path logs and stops.

## Phase 4 — Coach side: DONE

Commits `043f620`, `5bfeec0`, `1b05f41`, `5dd3077`.

1. **Models** — Team (name, sport, season, coachId, joinCode,
   joinCodeExpiresAt), TeamMembership (role, joinedAt, consentAt, consentText
   verbatim, status ACTIVE/LEFT/REMOVED), PlannedSession (teamId, date,
   sessionType, description, targetPaces). Migration
   `20260806100000_add_coach_layer` written, **not applied**.
2. **Self-enrolment only, enforced in the API** — the join route writes a
   membership for the session user, full stop. No route under /api/teams
   accepts a userId/athleteId/email in a body, and `lib/team/guard.test.ts`
   scans the route sources and fails the build if one ever appears. Join
   codes: 6 chars from an unambiguous alphabet, 14-day expiry, rotate button;
   invalid and expired codes get one indistinguishable answer.
3. **Consent screen** — shown at join, stored verbatim server-side
   (`lib/team/consent.ts`, versioned). It enumerates exactly what the coach
   can see (name, color, counts, recommendation) and cannot (bedtimes, wake
   times, hours, charts, messages, phone, PRs/paces). Leaving is immediate
   and the record survives as LEFT.
4. **assertCoachOf on every coach route** — plus a 403 on refusal, with
   "not yours" and "doesn't exist" identical. Enforced two ways: pure tests
   on the decision (`isCoachOf` refuses any non-coach, including for missing
   teams) and the source scan requiring the call + a 403 in every
   `[teamId]` route. There is no HTTP harness in the unit suite (no test
   DB), so a true end-to-end cross-team 403 request isn't exercised — the
   scan + pure tests pin both halves of it. If you want the live version,
   that's a supertest-style harness + test DB decision for you (noted in
   handoff).
5. **Exception list, not a roster** — the dashboard shows flagged athletes
   only (red sorts first), each with color, a trend like "Short on sleep 3
   of 5 nights", and a recommendation. `deriveAthleteStatus` is pure and
   tested, including a test asserting no clock time or hours value can
   appear in any string it emits. All-green renders as "nothing needs you
   today", with a count of athletes deliberately not shown.
6. **PlannedSession feeds the verdict** — the merge layer overlays team
   sessions as a `team` source: athlete's own record (Strava, manual) beats
   the coach's plan, which beats template and assumed. The go_hard/
   threshold/easy branches therefore run with no Strava and no athlete
   input. (Also fixed a real pre-existing merge bug found here: manual
   workouts on Strava-connected accounts vanished on days without a Strava
   activity.)
7. **No leaderboards** — nothing anywhere returns more than one athlete's
   data in a comparable form; the only ordering is red-before-amber.

---

## Phase 4 — Coach side: NOT STARTED

---

## Morning handoff

### Ready to review

- **Commit list** (each one green when made — full suite + tsc were run
  against every commit's exact staged content):
  - `68691db` Strava deauth accepted as athlete-update (real bug, Phase 1.3)
  - `bb87b86` user-select guard test + tightened reads (Phase 1.2)
  - `43e69e1`..`a23a9ac` — the nine SMS-layer units (Phase 3)
  - `2f625d2` session-RPE load + quality (Phase 2)
  - `414ad07` onboarding without Strava, texts offered (Phase 2/3)
  - `043f620`..`5dd3077` — the four coach-layer units (Phase 4)
- Final state: **338 tests, 0 skipped**, `npx tsc --noEmit` clean,
  `npx next build` succeeds (see verification section below).

### Needs your decision

1. **HTTP-level 403 tests** — the unit suite has no DB/request harness, so
   the cross-team 403 is enforced by pure tests + source scans rather than a
   live request. Standing up a real harness (test DB + route invocation) is
   a dependency/infra decision I wasn't going to make overnight (D9).
2. **Strava cap follow-up** — the cap message promises "we'll connect you
   when a slot opens" but nothing records who's waiting. Small follow-up:
   a wantsStrava flag + email when the tier is raised.
3. **Coach status thresholds** (D10) — 45-min short-night line, 2 short =
   amber, 3+ = red, no-data = amber. Tunable in one place
   (`lib/team/status.ts`).
4. **Verdict copy for team-session days** uses the same branches as before;
   the coach's note shows on the schedule page but not in the verdict
   headline. Fine for now, your call later.

### Needs credentials / a migration run (in this order)

1. Review + apply the two new migrations (per the drift workflow — `migrate
   dev` would offer to drop Neon):
   - `20260805210000_add_sms_layer` (also backfills SleepLog.source)
   - `20260806090000_add_workout_quality`
   - `20260806100000_add_coach_layer`
   Each file has the exact `db execute` + `migrate resolve` lines at the top.
2. `npx prisma generate` after pulling, if your local client predates the
   schema changes.
3. Twilio: account + Messaging Service SID + the four env vars in
   `.env.example`, then review DRY_RUN output for a few days before flipping
   `SMS_DRY_RUN=false`. Inbound webhook URL must match
   `TWILIO_INBOUND_WEBHOOK_URL` byte-for-byte or every inbound is rejected.
4. Re-test one real Strava deauthorization once, then submit the rate-limit
   application (the deauth handler was matching the wrong event shape until
   tonight — `68691db`).
5. Vercel cron for `/api/cron/messaging` ships in `vercel.json`; it needs
   `CRON_SECRET` set to be callable.

### What I'd do differently

- The uncommitted SMS layer forced an evening of archaeology-then-commit.
  Worth agreeing a rule: sessions end with a clean tree, even mid-feature.
- `lib/verdict.test.ts` asserts on copy substrings in places; fine now, but
  it will make copy edits noisier than they should be.
- The schedule page is pushing 700 lines of client component; next touch
  should split the tabs into components.

### Verification (run at session end)

- `npm test` — 17 files, 338 tests, all passed, none skipped.
- `npx tsc --noEmit` — clean.
- `npx next build` — succeeds (run directly; `npm run build` would run
  `prisma migrate deploy`, which is why it was not used).
- No migration applied: the three new migration directories exist only as
  files; `prisma migrate` was never invoked against a database tonight.
- No message sent: no credentials exist, DRY_RUN defaults on, and the send
  path refuses when the provider is unconfigured.
