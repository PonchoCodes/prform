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
