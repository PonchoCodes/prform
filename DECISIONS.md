# Decisions log — overnight session, 2026-08-06

Every ambiguous call made without you, with the options considered and which
was picked. Conservative option chosen throughout unless noted.

---

## D1. Strava deauth event shape: accept both `delete` and `authorized:"false"`

**Question**: Strava's docs say deauthorization arrives as an athlete *update*
with `updates.authorized === "false"`; the existing handler matched athlete
*delete*. Replace the condition, or accept both?

**Options**: (a) match only the documented shape; (b) accept either shape.

**Picked (b)** — accepting both cannot misfire (both unambiguously mean "this
athlete revoked access"), while (a) bets token cleanup on Strava never having
shipped the other shape. Cleanup on a revoked athlete is idempotent and safe.

## D2. Pre-existing uncommitted SMS work: verify and commit, don't rebuild

**Question**: The working tree contained a full uncommitted Phase 3
implementation from a previous session. Rebuild from scratch per the brief, or
audit the existing work against the spec and commit it in units?

**Options**: (a) `git checkout .` and rebuild; (b) verify item-by-item against
the Phase 3 spec, fix gaps, commit in dependency-ordered units.

**Picked (b)** — the work was green (292 tests passing at session start) and
discarding working, tested code to rewrite the same spec is waste with new-bug
risk. Every file was read and checked against the spec before being committed;
gaps found are logged here and in SESSION-REPORT.md.

## D3. user-select guard implemented as a source-scanning test

**Question**: "Add a test asserting no response body contains token, secret, or
Stripe fields" — response bodies are produced by routes that need a live DB and
session, which the unit test suite (deliberately) has no harness for.

**Options**: (a) stand up a DB + request harness overnight; (b) assert the
invariant at its root — value-level tests on `toClientUser` (already present,
asserts serialized payload contains no secret values and no forbidden keys)
plus a new source scan failing any `prisma.user.find*` without `select`.

**Picked (b)** — (a) means new test infrastructure and a test database nobody
reviewed, against an explicit "no new dependencies" rule. The pair of tests in
(b) enforces both the payload shape and the query discipline that caused the
original leak.

## D4. Session-RPE → TSS normalization: linear, anchored at RPE 7 = threshold

**Question**: The PMC counts TSS (hour at threshold = 100). Foster load is
minutes × RPE. How do the two scales meet?

**Options**: (a) linear — `tss = min × rpe × 100/420`, so an hour at RPE 7 is
100; (b) quadratic in intensity (IF² analog), which would rate an easy hour
(RPE 3) ~18 TSS instead of ~43.

**Picked (a)** — Foster's validation is of the linear product, and (b)
punishes easy volume for exactly the athletes this path serves. Against
HR-based TSS, (a)'s easy-hour value (~43) is in the right range; (b)'s is not.

## D5. Manual load on a day Strava also recorded: manual is skipped

**Question**: Athlete has Strava AND logs the same run manually. Sum, average,
or pick one?

**Picked skip-manual** — it is almost always the same run twice, and summing
manufactures fatigue. Strava wins because that is the merge layer's existing
ground-truth rule. Cost: a genuinely separate second session on a Strava day
is under-counted; rarer and safer than the alternative.

## D6. Quality → compliance mapping: FINE counts as on-target

**Question**: The trend's compliance series is binary (hit the prescribed
session or didn't). Where do three quality values land?

**Picked** NAILED_IT and FINE → on-target, ROUGH → off. "Fine" means the
session went as prescribed, which is what the pace check measures from
outside. Mapping FINE to 50% would need a fractional series and would tell
athletes their ordinary completed sessions half-failed.

## D7. SMS enrolment appears in onboarding as an optional step-4 section

**Question**: Phase 3 spec says onboarding collects phone/timezone/opt-in; the
existing implementation put enrolment on the profile page only.

**Picked both** — the same self-serve component (`SmsEnrollment`) is embedded
in onboarding step 4, clearly optional, and stays in profile settings. It
still requires explicit consent + verification; skipping it changes nothing.
Deliberately NOT a blocking step: a phone number must never be a condition of
finishing signup.

## D8. Twilio verification codes cannot actually send yet — left DRY_RUN

The verification flow is scaffolded end to end (code issue, HMAC storage,
attempt caps, confirm endpoint) but no credentials exist, so codes are logged
under DRY_RUN rather than sent. Enrolment therefore cannot complete against
production until credentials land — expected and unchanged from the design.

## D9. Cross-team 403s enforced by pure tests + source scan, not live HTTP

**Question**: "Write tests that attempt to read another team's data and
assert a 403" — the unit suite has no request harness or test database.

**Options**: (a) build a DB-backed HTTP harness overnight; (b) split the 403
into its two halves and pin both: `isCoachOf` (pure) is tested to refuse any
non-coach including for nonexistent teams, and a source scan fails the build
unless every [teamId] route calls assertCoachOf and contains a 403 — plus
scans proving no team route reads a user identity from a request body.

**Picked (b)** — (a) means new test infrastructure and a database nobody
reviewed (and the no-new-dependencies rule almost certainly bites). The live
version is queued as a morning decision in SESSION-REPORT.md.

## D10. Coach status thresholds

A night is "short" at ≥45 min under target (above self-report noise, below
the athlete-facing 60-min line — the coach's lever needs a day of lead).
2 short nights = amber, 3+ (or ≥60%) = red, zero logged nights = amber
("no signal is a signal"), 1–2 logged nights = insufficient to flag unless
already bad. All in one file (lib/team/status.ts) with the reasoning inline.

## D11. Team session precedence in the merge layer

Athlete's own record of a day (Strava, then manual log) > coach's planned
session > weekly template > assumed filler. The coach's plan is dated
knowledge and beats generic Tuesdays; the athlete's record of what actually
happened beats everyone. Two teams planning the same date: first membership
wins — any automatic rule is arbitrary, and coaches should resolve it.

## D12. Team sessions carry a nominal 60-minute duration

PlannedSession has no duration field (per your spec). The sleep algorithm
keys load bonuses off the session type, so the duration only has to be a
plausible session. If coaches want real durations, that's a schema addition.

## D13. Fixed a pre-existing merge bug rather than preserving behaviour

For Strava-connected users, a manual workout on a day with NO Strava
activity was dropped entirely from the plan — contradicting the documented
"fall back to manual one-offs" contract and starving the new load model.
Fixed (manual counts when Strava is absent that day). Behaviour change for
existing Strava users is strictly additive: days that previously showed
nothing now show what they logged.

## D14. "Leave team" lives on the Team page, not the profile

The consent text originally drafted said "from my profile"; the membership
UI landed on /team (one page, both roles), so the consent text says "from
the Team page" instead. Recorded because consent wording is load-bearing.

## D15. The streak counts check-ins, and the old "Night Streak" tile was wrong

`/sleep` showed `currentStreak` — consecutive nights that HIT THEIR TARGET —
under the label "Night Streak", beside two hit-rate percentages. That told an
athlete who logged an honest bad night that they had lost something, which is
the exact behaviour that teaches teenagers to stop logging bad nights.

The tile now shows the check-in streak and the two rates are relabelled
"Target Hit, 7 Days" / "Target Hit, 30 Days" — they were always honest numbers,
they just needed to say what they measured. `currentStreak` stays in the API
response for the hit-rate family; it is no longer displayed as "the streak"
anywhere.

Three quantities called "streak" now exist. They are documented together in
CLAUDE.md so nobody merges them: the habit (lib/streak.ts), the target-hit
count (the API), and the recovery-score input (lib/sleepAlgorithm.ts).

## D16. A hold, not a freeze

Requested as a proposal first; you chose the hold. Both were on the table.

**A freeze** is a token spent to protect a streak across a night you know you
will miss. Rejected because a token has a balance, a balance is a second thing
to check, earn and be reminded about, and this product's messaging is built on
not being one more thing to check. It also duplicates the automatic weekly
skip, leaving one athlete with two forgiveness systems and no way to predict
which one saved them.

**A hold** is what shipped: a date range the athlete marks as away. No balance,
no economy, no notification, no limit. Days inside a hold are removed from the
streak question entirely, so a fortnight in hospital leaves a 40-day streak at
40 rather than at 1.

Three properties make it safe to have no rules at all:

1. A held day is not a checked-in day either, so it cannot be farmed. Marking
   every day as held gives a streak of zero.
2. A hold does not consume the weekly forgiveness. A declared absence quietly
   spending the one skip somebody was saving for something unforeseen would be
   the mechanic working against its own purpose.
3. A held night is never "at risk". Telling someone on a hospital ward to log
   last night to keep their streak would be the app at its worst.

Forgiveness covers the night you did not see coming. A hold covers the
fortnight you did.
