# The text-message layer

A two-message-a-day SMS conversation that makes the website optional. Built,
tested, and **not live** — nothing has ever been sent, no Twilio account exists
yet, and the database migration has been written but not run.

This document is the whole picture: what it does, how it is put together, why
the awkward parts are the shape they are, and what remains between here and a
first real message.

---

## 1. The product loop

Two scheduled messages a day, plus replies.

**Evening**, roughly 90 minutes before the computed bedtime:

```
  →  What time are you up tomorrow?
  ←  5:30
  →  Then lights out by 8:15pm. Reply BED when you're down.
  ←  bed                                    (at 20:31)
  →  Got it — 8:31pm. Sleep well.
```

That `bed` timestamp **is** sleep onset. It is our receipt time, not a time the
athlete reports, which is the entire reason the interaction exists.

**Morning**, at the wake time they declared: the verdict — one instruction about
today's run. It asks nothing if a BED reply arrived. If none did, it asks what
time they got down instead.

### Why the wake question matters

The sleep plan computes bedtime backwards from a wake time. It used to assume a
fixed one. Our athletes are boarding-school students whose wake time moves
between 03:00 and 08:30 with their academic load, so a fixed assumption made the
prescription wrong on most nights — not imprecise, wrong. Asking once a night is
the cheapest possible fix and it doubles as the hook that gets a reply.

---

## 2. Status

| | |
|---|---|
| Code | Complete for steps 1–8 |
| Tests | 292 passing, 12 files |
| Typecheck / build | `tsc --noEmit` clean; `next build` succeeds |
| Lint | 115 errors, all pre-existing, none in new files |
| Migration | **Written, not run** — `prisma/migrations/20260805210000_add_sms_layer/` |
| Twilio | No account yet |
| Sending | `SMS_DRY_RUN` defaults to **on**; nothing can send by accident |

### What you can exercise today, with no Twilio account

Outbound dry-run needs no credentials at all — `sendMessage` short-circuits
before it ever looks for a provider. So this whole path works right now:

1. Enrol yourself on `/profile` → the verification code appears **in the server
   log** instead of a text. The UI tells you so.
2. Paste the code → `phoneVerifiedAt` is set, `smsStatus` becomes `ACTIVE`.
3. Hit the cron → it computes your send time and logs the exact message and
   recipient it *would* have scheduled.

### What you cannot exercise without Twilio

**Inbound.** `/api/messaging/inbound` verifies a request signature against real
credentials and returns `503` without them. This is deliberate and is not
relaxed under `SMS_DRY_RUN` — an unauthenticated inbound endpoint would let
anyone write a sleep onset time into another athlete's record by spoofing their
phone number. So the reply half of the conversation (BED, wake times, STOP)
cannot be tested end-to-end until the account exists.

---

## 3. Architecture

### The scheduling decision, which shapes everything else

There is **no frequent tick**. A once-daily cron hands messages to Twilio with a
`sendAt`, and Twilio delivers them at the right minute.

This matters because of a platform constraint. Vercel's cron precision:

| Plan | Minimum interval | Precision |
|---|---|---|
| Hobby | Once per day | **Per-hour (±59 min)** |
| Pro | Once per minute | Per-minute |

A job that nominally starts at 03:00 may actually start at 03:59. Timing a
lights-out text from a cron that imprecise is impossible. Handing the timing to
the provider makes the cron's own punctuality irrelevant — it only has to get
every message *queued* at some point beforehand.

Two consequences, both handled:

- **Each run queues roughly the next 24 hours, not the next few hours.** Twilio
  refuses a `sendAt` less than 15 minutes out, so anything due soon after the
  run risks being rejected by the time we reach it. The cron looks at each
  athlete's *today* and *tomorrow* in their own calendar and takes the first one
  at least 45 minutes away.
- **Consecutive runs overlap on purpose.** The unique constraint on
  `(userId, localDate, messageType)` is what makes that safe: the second run
  finds the row and skips instead of sending a second text.

Twilio's scheduling window is 15 minutes to 35 days, `ScheduleType=fixed`,
`SendAt` in ISO-8601, and it **requires a Messaging Service SID** — a bare "from"
number cannot schedule. Cancellation is `messages(sid).update({status:"canceled"})`
with no documented time restriction.

### Module map

```
lib/messaging/
  time.ts              IANA local-time arithmetic on Intl. No dependency.
  provider.ts          MessageProvider interface, schedule window, E.164
  twilio.ts            THE ONLY FILE THAT IMPORTS THE TWILIO SDK
  config.ts            DRY_RUN, kill switch, daily cap, credentials
  gate.ts              the send rails, pure
  send.ts              the single path any message takes; cancellation
  night.ts             writing a message's meaning into the right night
  plan.ts              plan lookup keyed by local date
  copy.ts              every outbound message body
  consent.ts           the exact consent wording (server-side only)
  verificationCode.ts  code generation, HMAC hashing, constant-time compare
  verdictFor.ts        assembles VerdictInput outside a request

lib/messageParser.ts   inbound text → intent. Pure, no LLM.
lib/sleepGuards.ts     what a night's signals add up to, and when to refuse

app/api/cron/messaging/route.ts     daily: housekeeping, then queue the evening
app/api/messaging/inbound/route.ts  provider webhook
app/api/messaging/enroll/route.ts   GET status / POST enrol / DELETE turn off
app/api/messaging/verify/route.ts   confirm the code — the only place
                                    phoneVerifiedAt is ever set
```

Everything outside `twilio.ts` talks to the `MessageProvider` interface, so
WhatsApp later is a sibling file, not a rewrite:

```ts
interface MessageProvider {
  schedule(to, body, sendAt): Promise<SendResult>
  sendNow(to, body): Promise<SendResult>
  cancel(providerMessageSid): Promise<CancelResult>
  verifySignature({ url, signature, params, rawBody }): boolean
  normalizeInbound(params, receivedAt): NormalizedInbound | null
}
```

### The three flows

**Daily cron** (`0 3 * * *`)

```
close unresolved nights (INFERRED)
  ↓
for each ACTIVE, verified athlete
  ↓
build their plan → tonight's bedtime → minus 90 min → their local instant
  ↓
sendMessage(EVENING_WAKE_QUESTION, sendAt: that instant)
```

**Wake time declared** (inbound)

```
parse "5:30" → WAKE_TIME
  ↓
write SleepLog.declaredWakeAt  (resolved against nightDate + 1)
  ↓
recompute the plan with that wake as the anchor
  ↓
reply LIGHTS_OUT with the bedtime
  ↓
cancel any queued MORNING_VERDICT, then schedule a new one at the declared wake
```

**BED** (inbound)

```
write SleepLog.sleepOnsetAt = receipt timestamp, source TIMESTAMPED
  ↓
reply BED_ACK echoing the time
  ↓
cancel + re-schedule MORNING_VERDICT, now without the "what time did you get
down?" question
```

That last cancel-and-reschedule is the price of pre-scheduling: the morning
message's text is fixed the night before, but whether it needs to ask for a
bedtime depends on something that happens after. Rescheduling is the only way to
change text already queued.

### Data model

```
User            phoneNumber (UNIQUE), phoneVerifiedAt, ianaTimezone,
                smsOptInAt, smsOptInText, smsStatus

SleepLog        + sleepOnsetAt, wakeAt, declaredWakeAt   (real instants)
                + confidence, needsReview, needsReviewNote
                + source converted String → SleepSource enum

SentMessage     userId, localDate, messageType, scheduledFor, sentAt,
                providerMessageSid, status, body, sendCount
                UNIQUE (userId, localDate, messageType)

InboundMessage  userId?, fromNumber, rawBody, intent, parsedValue,
                receivedAt, providerMessageSid

PhoneVerification  userId, phoneNumber, codeHash, expiresAt, attempts,
                   consumedAt
```

Notes on choices that will look odd otherwise:

- **`phoneNumber` is unique.** An inbound webhook identifies the sender only by
  their number, so a duplicate makes routing ambiguous — and it is the one
  schema-level guarantee that a coach cannot attach an athlete's number to a
  second account. Nullable-unique in Postgres allows many NULLs, so non-SMS
  users are unaffected.
- **`SentMessage.localDate` is a `String` "YYYY-MM-DD", not a DateTime.**
  `SleepLog.date` is a DateTime pinned to UTC midnight, and that pattern is
  exactly what makes local-date reasoning error-prone. "The athlete's Tuesday"
  is not an instant.
- **`SentMessage.sendCount`** exists because the unique constraint collapses
  repeats onto one row, and the daily cap counts this table. Without it the cap
  would undercount the genuinely repeatable types — a clarification reply, or a
  second BED acknowledgment.
- **`InboundMessage.userId` is nullable.** A message from an unrecognised number
  is still recorded; that case is evidence of a routing or verification bug, and
  dropping it hides the thing worth seeing.
- **`InboundMessage.rawBody` is verbatim** — original case, spacing, emoji.
  The parser will be wrong about real messages, and the only way to fix it is to
  read what people actually wrote.

### Timezone discipline

Every conversion derives the offset from a zone **plus an instant**. No UTC
offset is ever stored or computed with. `-05:00` is true of New York in January
and false in July; a stored offset sends someone a lights-out text an hour off
for half the year.

Built on `Intl.DateTimeFormat` — Node ships full ICU, so no dependency. Both DST
edge cases are handled and tested against real 2026 transitions:

- **Gap** (spring forward): 02:30 on 8 March in New York never happens. Returns
  `exact: false` and an instant pushed *past* the transition, never an hour
  before the time asked for.
- **Overlap** (fall back): 01:30 on 1 November happens twice. Returns the
  earlier, so a text arrives on the first pass.

Auckland is in the test suite because "spring is March" is wrong for half the
world.

### Which night a message belongs to

**A night is filed under the local date it begins** — the evening the athlete
goes to bed. This matches what the app already does: the dashboard's morning
confirmation card posts under *yesterday's* date, and a plan day's
`recommendedBedtime` and `recommendedWakeTime` sit on consecutive calendar days.

One rule implements it: **noon is the cut.** From midday onward a message opens
the coming night; before midday it closes the one just ended. That handles all
four cases correctly:

| Message | Local time | Night |
|---|---|---|
| `bed` | 21:30 Aug 5 | Aug 5 |
| `bed` | 00:40 Aug 6 | Aug 5 |
| `up` | 05:15 Aug 6 | Aug 5 |
| `5:30` (declaring tomorrow) | 20:00 Aug 5 | Aug 5 |

Getting this backwards would have filed every text-sourced night one day off
from every web-sourced one, on the same table, invisibly.

A declared wake resolves against `nightDate + 1`. Resolving it against the
night's own date would put a 05:30 wake fourteen hours *before* the bedtime it
anchors.

---

## 4. Safety rails

Every message goes through `sendMessage`. Nothing bypasses it, because the daily
cap is counted from the ledger it writes.

### The gate, in order

| Rail | Behaviour |
|---|---|
| Kill switch | Absolute. Nothing goes out, including replies and codes. |
| No number / no timezone | Refused — without a zone there is no local day to key on. |
| `STOPPED` | Refused. Checked **before** verification so the weaker failure can never mask it. |
| Not verified | Refused. Requires both `phoneVerifiedAt` **and** `smsStatus === ACTIVE`; if they disagree, that is a refusal. |
| Daily cap | Sum of `sendCount` for the local date, excluding `CANCELED`/`FAILED`. Default 5. |

`VERIFICATION_CODE` is the only carve-out, and only on the verification rail — a
code must reach a number precisely because it is not yet verified. It still
cannot reach someone who texted STOP, and still counts against the cap. A test
asserts it is the *only* type that bypasses, so a new enum value cannot quietly
join it.

### Two invariants

**1. The ledger row is written before the provider is called.** If the process
dies between the two, the retry finds the row and stops. That trades a missed
message for never double-sending, which is the right way round: a teenager who
gets no text is mildly let down; one who gets the same text twice at 06:00 mutes
the thread.

**2. `SMS_DRY_RUN` defaults to `true`.** A missing or misspelled variable in a
new environment means silence. The inverse default would make "forgot to
configure staging" and "started texting minors" the same event.

### STOP

STOP sets `smsStatus = STOPPED` and then **cancels every queued message** by
stored SID. Suppression alone is not enough — someone who opts out at 21:00 has
a 06:00 message already sitting in Twilio's schedule, and texting them after
they said STOP is the failure that gets a sending number blocked.

We deliberately send **no** acknowledgment of our own: the status change now
blocks every send, and Twilio's Advanced Opt-Out has already replied at the
Messaging Service.

STOP, a revised wake time, and a BED reply all route through the **same**
`cancelScheduled` function. Three callers, one implementation, so the opt-out
path cannot drift from the ones exercised daily.

> **The kill switch being absolute depends on Advanced Opt-Out being enabled on
> the Messaging Service.** That is a console setting, and it is what answers
> STOP/HELP when our own code is halted. See §9.

---

## 5. Parsing

`lib/messageParser.ts` — pure, deterministic, no model call. A language model
here would be slower than the webhook budget, cost money per inbound,
occasionally invent a wake time nobody sent, and be impossible to test
exhaustively. The vocabulary is a dozen intents and a handful of time formats.
That is a table.

**The rule:** when nothing matches, say so. An `UNPARSED` result costs one
clarifying text. A wrong guess writes a fabricated number into someone's sleep
record and then draws it on a chart.

Handled:

| Intent | Examples |
|---|---|
| `STOP` | `STOP`, `unsubscribe`, `cancel`, `quit`, `opt-out`, `please stop`, `stop texting me` |
| `HELP` | `HELP`, `info` |
| `BED` | `bed`, `in bed`, `lights out`, `down`, `goodnight`, `gn`, `asleep` |
| `UP` | `up`, `im up`, `awake`, `good morning`, `gm` |
| `WAKE_TIME` | `5`, `5:30`, `530`, `0530`, `5:30am`, `5.30`, `half 5`, `half five`, `quarter to 6`, `five thirty`, `seven o'clock`, `noon`, `midnight`, `about 5:30`, `5:30ish`, `I'll be up at about 4:45` |
| `DURATION` | `about 7 hours`, `7.5 hours`, `7h30m`, `seven and a half hours`, `90 minutes` |

Two judgment calls worth knowing:

**A short sentence containing "stop" counts as STOP** — up to five words. Longer
sentences do not, so *"what time should I stop drinking coffee before bed"* does
not opt anyone out. Erring toward honouring an opt-out costs a user who can
re-enrol; erring the other way costs a carrier complaint.

**Bare numbers need context, so the parser takes one.** `11` is 11:00 answering
*"what time are you up?"* and 23:00 answering *"what time did you get down?"*
There is no context-free reading that gets both right. The context comes from
the last message actually **delivered** (ordered by `sentAt`), not the last one
created — the morning message is written to the ledger the night before, so
ordering by creation would flip the reading of every reply sent that evening.

Both conventions are echoed back to the athlete in the reply, so a misreading is
visible in the thread rather than silent in the database.

---

## 6. Guards

`lib/sleepGuards.ts` — pure, takes `now` as an argument. Every rule exists
because the alternative is a plausible-looking wrong number that moves the trend
chart, the recovery score and the verdict at once.

**Plausible window: 2–14 hours, inclusive.** Two hours excludes a nap and the
athlete who fires BED and UP within the hour by mistake. Fourteen is past what
even a sick teenager sleeps and, more usefully, well under 24 — the point at
which a modular duration wraps and starts looking normal again.

Outside the window, `resolveNight` returns `{ kind: "review" }` **with no
`minutes` field at all**, so there is no number for a caller to accidentally
store. Tests assert the absence, not just the flag.

**No wake signal by declared wake + 2h → close at the declared wake, mark
`INFERRED`.** A real UP always beats the declared time. The inferred close is
still subject to the plausibility window, so a wake declared for the following
evening gets flagged rather than closed at 27 hours.

**Two BEDs with no UP between = a split night.** Detected as
`sleepOnsetAt != null && wakeAt == null`. The *first* onset is kept — it is still
true the night began then — the row is flagged, and no duration is written.
There is no honest arithmetic over two onsets and one wake, and nowhere to
record "minus the ninety minutes in the middle". Both messages survive verbatim
in `InboundMessage`.

**The 27-hour night has two locks.** The write path refuses to store a duration
on a flagged row, *and* `/api/trend` filters `needsReview: false` at the query.
Belt and braces, because that chart is the thing the product points at and a
single 27-hour night would lift a fortnight of the rolling mean and read as
progress.

**Webhook-retry dedupe.** Twilio retries on timeout or 5xx. Without a check on
`providerMessageSid`, a redelivered BED looks like a second BED and gets filed as
a split night — a retry manufacturing a data-quality problem that never
happened.

---

## 7. The sleep plan and the verdict

### The one change to sleep logic

`calculateSleepPlan` takes `opts.declaredWakeByDate` — `"YYYY-MM-DD" → "HH:MM"`.
Any day without an entry falls back to `currentWakeTime`, which is the existing
behaviour for every day.

The important part is that "wake anchor" and "circadian anchor" had to become two
different things, or the change would have silently altered the circadian model:

| Consumer | Anchor | Why |
|---|---|---|
| `buildMeetShiftSchedule` | baseline (unchanged) | Meet advance is measured against habitual phase. A one-off 04:00 exam wake would compute as "no advance needed" and rewrite the race prep. |
| `computePRCPlan` — CBTmin, zones, light exposure | baseline − ramp (unchanged) | Setting an alarm does not move a circadian pacemaker. |
| Tonight's bedtime, `recommendedWakeTime` | declared, else circadian | The only thing a declaration is evidence about. |

A test asserts CBTmin, both zone boundaries, the light-exposure block, the daily
and cumulative shift, and `preRaceShiftMinutes` are all identical with and
without a declaration on a meet-ramp day.

`DailySleepPlan` gained `declaredWakeTime`, `achievableSleepHours` and
`sleepShortfallMinutes`. `totalSleepHours` keeps its meaning — the target — so
the debt and trend logic that reads it is unaffected.

Two existing clamps survive, and the 45-minute one turns out to bind harder than
the 20:00 floor:

```
default wake 07:00, bedtime 21:45; athlete declares 03:00 for tomorrow
  → 03:00 − 9.25h = 17:45
  → shift limit binds first: 21:00 (45 min earlier than last night)
  → achievable 6.0h against a 9.25h target = 195 min short
```

Keeping the limit is right, not a workaround. Telling a 17-year-old who normally
sleeps at 22:00 to be *asleep* at 17:45 is not a plan, it is an instruction to
lie in the dark for three hours. The honest number is what they will actually
get.

### The verdict branch

```
kind:    "short_night"
verdict: "You'll be about 3.5 hours short tonight."
reason:  "The wake time you gave leaves 6h against a 9.3h target.
          Move tomorrow's threshold or make it aerobic — on that much
          sleep the session costs more than it returns."
```

Placed **first in the ladder**, above `race_day` and above `needs_pr`. The
`needs_pr` case is the sharpest: its headline is literally *"Sleep 9.3h
tonight."*, a number we already know cannot happen. The PR nudge survives as the
branch's `action`.

Threshold is 60 minutes, bound to `SLEEP_DEBT_MINUTES` rather than declared
separately — the two are different signals, but if they disagreed about what an
hour down means, the same lost sleep would sit either side of two different
lines. Rounded to the half hour, because the underlying number comes from age
brackets and training load against a doubly-clamped bedtime, and "3h17m short"
would claim precision the model does not have.

The morning text carries the **same** verdict as the dashboard.
`lib/messaging/verdictFor.ts` assembles the identical `VerdictInput` the browser
builds — same pace resolution, same PMC/TSB, same debt window — and calls
`computeVerdict`. One ladder, not two: the athlete must not be told one thing by
the app and another by a text sent the same morning.

---

## 8. Consent and self-enrolment

**The athlete being enrolled is always the athlete making the request.**
`POST /api/messaging/enroll` takes no user identifier — no `userId`, no email, no
athlete parameter. The subject comes from the session and nowhere else, so there
is no request a coach can construct that enrols someone else. Most of these
athletes are minors and coaches will arrive with rosters; the answer to "can you
bulk-add my team" is no at the level of the API, not at the level of whatever UI
exists today.

The second lock is verification. `phoneVerifiedAt` stays null through enrolment
and is set in exactly one place, after a code sent *to that number* comes back.
Typing someone else's number into your own account gets you nothing.

**Consent wording lives server-side** (`lib/messaging/consent.ts`) and the server
writes its own copy, never the client's — otherwise a modified client could
record any wording it liked against a real opt-in, producing a record
indistinguishable from a genuine one. Stored with a version prefix so a past
opt-in stays traceable to the wording that produced it.

Verification code handling:

| Concern | Handling |
|---|---|
| Predictability | `crypto.randomInt`, not `Math.random` |
| Database leak | **HMAC**-SHA256 keyed with `NEXTAUTH_SECRET` — a plain digest of six digits is reversible by trying all million inputs |
| Replay to another number | The number is bound into the digest |
| Brute force | 5 attempts, counted *before* the response |
| Timing attack | `timingSafeEqual` |
| Resend as a nuisance vector | 60s cooldown, plus it counts against the daily cap |
| Partial failure | Code consumption and account activation in one transaction |

`DELETE /api/messaging/enroll` turns texts off from the web. Withdrawing consent
should be at least as easy as giving it, and an athlete who has changed phones
cannot rely on being able to text STOP.

---

## 9. Message catalogue

| Type | When | Once per day? |
|---|---|---|
| `EVENING_WAKE_QUESTION` | 90 min before computed bedtime | **Yes** — cron-owned |
| `MORNING_VERDICT` | At the wake time: the plan's, pre-scheduled by the cron for every reachable athlete, or the declared one when a reply re-schedules it | **Yes** — cron-owned |
| `LIGHTS_OUT` | Reply to a wake time | No |
| `BED_ACK` | Reply to BED | No |
| `CLARIFICATION` | Nothing parsed | No |
| `HELP_REPLY` | Reply to HELP | No |
| `STOP_ACK` | Reserved — Twilio answers STOP | No |
| `VERIFICATION_CODE` | Enrolment | No |

The two cron-owned types are suppressed on a repeat; everything else is counted
rather than suppressed, because an athlete can legitimately send two unparseable
messages, or two BEDs on a split night.

All copy lives in `lib/messaging/copy.ts`. House style: lower-case sentence case,
no exclamation marks, no emoji, a number wherever there is one. These land on a
lock screen at 21:00 next to messages from the athlete's friends — anything that
reads like marketing gets muted, and a muted athlete is a lost one.

---

## 10. Environment

```bash
# Log every message and recipient, hand nothing to Twilio.
# DEFAULTS TO TRUE. Set to "false" only after reviewing DRY_RUN output.
SMS_DRY_RUN=true

# Global brake. Any truthy value halts all outbound messages.
SMS_KILL_SWITCH=false

# Hard ceiling per athlete per local day, enforced against the ledger.
SMS_MAX_PER_USER_PER_DAY=5

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
# Not optional: scheduling requires a Messaging Service.
TWILIO_MESSAGING_SERVICE_SID=
# The exact public URL Twilio posts to. Signature verification hashes the URL
# Twilio signed, so this must match byte for byte — scheme, host and path.
TWILIO_INBOUND_WEBHOOK_URL=

# Guards both cron endpoints. Vercel Cron sends it as a Bearer token.
CRON_SECRET=

# Already required by NextAuth; also keys the verification-code HMAC.
NEXTAUTH_SECRET=
```

---

## 11. Next steps to a live build

Ordered. Steps 1 and 2 have external lead time — start them first.

### 1. Twilio account and A2P 10DLC registration ← start now, weeks of lead time

US carriers filter unregistered application-to-person traffic. Without a
registered 10DLC campaign, messages are delivered unreliably or not at all.

1. Create a Twilio account, buy a number.
2. Register a Brand and a Campaign (A2P 10DLC). Use case: account
   notifications / higher education. Expect days to weeks.
3. Have the consent flow ready to show them — carriers ask how opt-in is
   collected. `lib/messaging/consent.ts` plus the `/profile` screenshot is the
   answer, and it is deliberately written to satisfy exactly this.

### 2. Messaging Service

1. Create a Messaging Service and add the number to its sender pool.
2. **Enable Advanced Opt-Out.** This is what answers STOP and HELP at the
   provider level and is the assumption that makes our kill switch safe to be
   absolute. If you would rather not rely on it, tell me and I will exempt the
   two mandatory types from the kill switch instead.
3. Copy the `MG…` SID.

### 3. Run the migration

Not with `migrate dev` — it offers to drop the Neon database.

```bash
npx prisma db execute \
  --file prisma/migrations/20260805210000_add_sms_layer/migration.sql \
  --schema prisma/schema.prisma

npx prisma migrate resolve --applied 20260805210000_add_sms_layer
npx prisma generate
```

The migration is additive except for one in-place conversion of
`SleepLog.source` from `TEXT` to the `SleepSource` enum. That is safe because
the column has exactly one value in every row that has ever existed — all three
writers wrote the literal `"manual"`, and nothing read it.

### 4. Environment variables

Set all of §10 in Vercel (Production and Preview). **Leave `SMS_DRY_RUN=true`.**

`TWILIO_INBOUND_WEBHOOK_URL` should be `https://prform.app/api/messaging/inbound`
— the production host, never a preview URL, since the signature is computed over
the exact URL.

### 5. Point the webhook at the app

In the Messaging Service, set the inbound webhook to that same URL, `POST`.
Verify a `403` for an unsigned request before trusting anything else.

### 6. Watch DRY_RUN for a full day

This is your gate, and it needs no real sends.

1. Enrol yourself on `/profile`. Take the code from the server log.
2. Confirm it — you are now `ACTIVE` and `phoneVerifiedAt` is set.
3. Trigger the cron manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" \
        https://prform.app/api/cron/messaging
   ```
4. Read the log lines. Each one prints type, recipient, local date, `sendAt`,
   and the exact body.

What to check:
- Is the evening send time about 90 minutes before the bedtime the dashboard
  shows?
- Is `sendAt` correct in **your** local time, not UTC?
- Does the response report `nightsClosed` / `nightsFlagged` sensibly?
- Does a second cron run report `duplicate` rather than queueing again?

### 7. First real send

Flip `SMS_DRY_RUN=false` with **only your own number enrolled**. Walk the whole
loop: evening question → reply a time → check the lights-out reply → reply
`bed` → check the acknowledgment → confirm the morning message arrives at the
declared time. Then text `STOP` and confirm in the Twilio console that the
queued morning message is actually **cancelled**, not merely suppressed.

Then re-enrol (remember: you will need to text `START` to clear the carrier-level
opt-out, which we cannot do from our side) and leave it running for a week
before anyone else is added.

### 8. Only then, other athletes

Consider lowering `SMS_MAX_PER_USER_PER_DAY` to 3 for the first cohort, and keep
`SMS_KILL_SWITCH` documented somewhere you can reach from a phone.

---

## 12. Known gaps and deferred decisions

- **A night can sit open for the better part of a day** before the daily cron
  closes it as `INFERRED`. A consequence of Hobby cron granularity, and benign —
  an open row has `actualSleepHours: null` and contributes to no average. Moving
  to Pro and running the housekeeping hourly would tighten it.
- **The morning message's text is fixed the night before.** Its verdict reflects
  what was known at declaration time. Sleep debt is therefore one night stale in
  the text, though the dashboard is current. Fixing it properly needs a tick at
  wake time, which needs Pro.
- **`STOP_ACK` is defined but unused** — Twilio answers STOP. It exists so that
  dropping Advanced Opt-Out later is a code change, not a schema change.
- **No inbound rate limiting** beyond the outbound daily cap. A hostile sender
  could write `InboundMessage` rows. Bounded by Twilio's own pricing and the
  fact that unknown numbers get no reply, but worth revisiting.
- **`toE164` is deliberately strict** and not a full libphonenumber: bare
  national numbers are accepted only for `+1`. A rejected number is a form
  error; a mis-parsed one routes an athlete's sleep data to a stranger.
- **The onboarding flow does not yet include SMS enrolment** — it lives on
  `/profile`. `SmsEnrollment` is standalone, so adding it as a fifth onboarding
  step is one line.

---

## 13. Test coverage

```
lib/messageParser.test.ts              19 tests  (~150 table rows)
lib/sleepGuards.test.ts                17
lib/messaging/time.test.ts             16   real 2026 DST transitions
lib/messaging/gate.test.ts             12
lib/messaging/verificationCode.test.ts 10
lib/sleepAlgorithm.test.ts              9   wake anchor, circadian invariance
lib/verdict.test.ts                    66   (11 new for short_night)
```

The pure core — parsing, guards, timezone maths, the gate, the verdict ladder —
is covered exhaustively because all of it is deterministic and takes its clock
as an argument. The route handlers and the Prisma writes are not unit-tested;
they are thin orchestration over the tested parts, and the meaningful failures
there are integration failures that DRY_RUN day is designed to catch.
