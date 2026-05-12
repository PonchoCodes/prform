<div align="center">

```
██████╗ ██████╗ ███████╗ ██████╗ ██████╗ ███╗   ███╗
██╔══██╗██╔══██╗██╔════╝██╔═══██╗██╔══██╗████╗ ████║
██████╔╝██████╔╝█████╗  ██║   ██║██████╔╝██╔████╔██║
██╔═══╝ ██╔══██╗██╔══╝  ██║   ██║██╔══██╗██║╚██╔╝██║
██║     ██║  ██║██║     ╚██████╔╝██║  ██║██║ ╚═╝ ██║
╚═╝     ╚═╝  ╚═╝╚═╝      ╚═════╝ ╚═╝  ╚═╝╚═╝     ╚═╝
```

### **SLEEP SHARP. RACE FASTER.**

*The precision sleep coach built to put a PR on your next meet day.*

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square&logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?style=flat-square&logo=prisma)](https://prisma.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=flat-square&logo=vercel)](https://prformm.vercel.app)
[![License: MIT](https://img.shields.io/badge/License-MIT-E8FF00?style=flat-square)](LICENSE)

</div>

---

## What Is PRform?

Most runners optimize everything except the one thing that determines race-day performance more than any workout: **when they sleep**.

PRform is a full-stack web application that applies sport science to your training and meet calendar, computing the exact bedtime you need every single night of your training cycle. The algorithm works backward from meet day, progressively shifting your sleep phase earlier so that on race morning, your core body temperature, alertness, and reaction time all peak at the gun.

Then it holds you accountable. The wind-down dashboard delivers a live, time-stamped 3-hour behavioral countdown before bed every night. Not a notification you swipe away. A protocol you follow.

**This is how you run a PR. You start the night before.**

---

## Live Demo

**[prformm.vercel.app](https://prformm.vercel.app)**

```
Email:    demo@prform.com
Password: demo1234
```

Pre-loaded with 8 weeks of training data, a weekly template, and three upcoming meets.

---

## Quick Start (local)

```bash
# Clone and install
git clone https://github.com/PonchoCodes/prform.git
cd prform
npm install

# Set up environment — create .env with your Neon connection string and a secret
DATABASE_URL="postgresql://..."
NEXTAUTH_SECRET="..."

# Apply migrations and seed demo data
npx prisma migrate deploy
npm run seed

# Run
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Strava Setup

**Step 1:** Create a Strava API application at https://www.strava.com/settings/api

**Step 2:** Set Authorization Callback Domain to your domain (or `localhost` for local dev)

**Step 3:** Add to `.env`:
```
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
STRAVA_WEBHOOK_VERIFY_TOKEN=prform_webhook_secret_2026
```

**Step 4:** Webhooks are registered automatically when a user connects Strava. For local development, use ngrok to expose localhost:3000 to Strava:
```bash
ngrok http 3000
```
Then set `STRAVA_REDIRECT_URI` and `NEXTAUTH_URL` to the ngrok URL so Strava can reach the webhook endpoint at `<ngrok-url>/api/strava/webhook`.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 14 App Router | Server components, API routes, file-based routing |
| Language | TypeScript 5 | Type-safe algorithm and data models |
| Styling | Tailwind CSS 3 | Design system tokens, zero-config utility classes |
| Database | PostgreSQL (Neon) via Prisma 7 | Serverless-compatible Neon driver, Prisma v7 adapter-neon |
| Hosting | Vercel | Serverless functions, automatic deploys from GitHub |
| Auth | NextAuth.js v4 | JWT-based sessions, credentials provider |
| Charts | Recharts | Sleep ramp visualization on meet detail pages |
| Animation | Framer Motion + Tailwind keyframes | Page transitions, fade-up scroll, accent pulse, ticker |

---

## Application Pages

```
/                Landing page (dark hero, feature grid, marquee ticker)
/signup          Create account
/login           Sign in (demo credentials shown)
/onboarding      4-step setup wizard (profile, sleep, workouts, meets)
/dashboard       Primary view: tonight's bedtime, wind-down timeline,
                 weekly schedule, recovery score, upcoming meets
/schedule        Weekly template view + one-off workout logging + effort rating (1-5)
/meets           Full meet CRUD + 10-day sleep ramp chart per meet
/profile         Edit all profile data + wind-down notification toggles
```

---

## The Sleep Algorithm

> **File:** `lib/sleepAlgorithm.ts`
> **Signature:** `calculateSleepPlan(user, workouts, meets): DailySleepPlan[]`

Returns one `DailySleepPlan` object per day for the next 14 days. Each object contains: `recommendedBedtime`, `recommendedWakeTime`, `totalSleepHours`, `trainingLoadLevel`, `daysUntilNextMeet`, `recoveryScore`, and `windDown` phase times.

### Step 1: Base Sleep Need

Sleep need is determined by age, then adjusted for biological sex based on sex-specific differences in homeostatic sleep pressure documented in Burgard and Ailshire (2013).

| Age Range | Base Hours |
|---|---|
| 13-17 | 9.0 h |
| 18-25 | 8.5 h |
| 26+ | 8.0 h |
| Female athletes | +0.5 h |

### Step 2: Training Load Adjustment

Every night after a hard workout, your body requires additional slow-wave sleep to complete muscular repair and glycogen resynthesis. PRform adds sleep time proportional to that day's and the previous day's training load.

| Workout Type | Added Sleep |
|---|---|
| Rest / Easy Run / Cross Train | +0 min |
| Moderate Run | +15 min |
| Tempo / Track Workout | +20 min |
| Long Run | +30 min |
| Day AFTER any hard workout | +15 min additional |

### Step 3: Pre-Meet Circadian Phase Shift (the core innovation)

This is what separates PRform from a simple sleep tracker.

The human circadian rhythm is not fixed. It can be advanced (shifted earlier) through consistent, progressively earlier bedtimes in the days before a target event. PRform implements this phase-advance protocol automatically, counting backward from meet day with multipliers scaled to race priority.

```
Days Until Race Day    A Race    B Race    C Race
10 - 8 days           -15 min   -11 min   -8 min
7 - 5 days            -30 min   -23 min   -15 min
4 - 2 days            -45 min   -34 min   -23 min
Night before          -60 min   -45 min   -30 min
```

If multiple meets overlap their phase-shift windows, the highest-priority meet's values are applied.

**Why this works:** Sleep timing determines when your body temperature minimum occurs (typically 2 hours before natural wake time). This temperature minimum is also when your CNS reaction speed, grip force, VO2 max utilization efficiency, and hormone output are all at peak. The Stanford sleep extension study (Mah et al., 2011) documented 5% sprint time improvement, improved shooting accuracy, and faster reaction times simply by advancing and extending sleep over 5-7 weeks. PRform implements this same phase-advance logic in a systematic, athlete-calibrated protocol.

### Step 4: Wake Time and Total Sleep Calculation

```
Bedtime = WakeTime - TotalSleepNeed - PreMeetShift
```

Wake time stays fixed (your training schedule demands it). Bedtime moves earlier. Sleep opportunity expands. Recovery improves. Meet-day performance peaks.

### Step 5: Recovery Score (0-100)

A single composite score that tells you exactly how ready you are to run a PR.

```
Start:           100
Per consecutive hard day (no rest):    -5
Meet within 3 days:                   -10
Per hour of sleep deficit vs baseline: -3
Per rest day in last 3 days:           +5
Final range: clamped 0-100
```

### Step 6: Wind-Down Phase Times

Given a target bedtime T, four behavioral cue times are computed and stored:

| Phase | Time | Instruction |
|---|---|---|
| Phase 1 | T - 120 min | Dim overhead lights. Move to lamps only. |
| Phase 2 | T - 90 min | Enable Night Shift / Night Mode on all devices. |
| Phase 3 | T - 30 min | Put phone across the room. No more screens. |
| Phase 4 | T - 15 min | Lights off or near-dark. Lie down. |

These times are stored in the `DailySleepPlan` object and consumed in real time by the wind-down countdown component on the dashboard, which re-evaluates phase status every 60 seconds.

---

## The Wind-Down Protocol

PRform is not a white noise machine. It does not dim your lights. It does not block your apps. What it does is more powerful: it tells you exactly what to do, and exactly when, so that you build the behavioral consistency that physically moves your circadian phase earlier over multiple nights.

### Why consistency is more powerful than technology

Your circadian rhythm is not reset by any single device or supplement. It is entrained by the repeating pattern of light exposure, core temperature, and behavioral cues across 5-7 consecutive nights. A perfect blackout room used only once before a race does almost nothing. The same basic behaviors repeated nightly for a week before a meet shifts your sleep phase by 30-90 minutes, which is measurable in reaction time, alertness, and performance output.

PRform structures the 3 hours before bed into a repeating behavioral sequence that your body learns to associate with pre-sleep physiology. This is classical conditioning applied to sleep performance.

### The science behind each phase

**Phase 1: Dim Lights (T - 120 min)**

Melatonin onset is suppressed by light at intensities above 10-100 lux, with the strongest effect at 480nm (blue wavelength). Standard overhead LEDs in homes typically measure 300-800 lux. Transitioning to desk lamps or table lamps, which average 30-100 lux, reduces light-mediated melatonin suppression by 70-90% and allows the natural melatonin ramp to begin on schedule.

Source: Brainard GC et al. (2001). Action spectrum for melatonin regulation in humans: evidence for a novel circadian photoreceptor. *Journal of Neuroscience*, 21(16), 6405-6412.

**Phase 2: Night Mode on All Devices (T - 90 min)**

Even dim phone screens emit blue wavelength light at 20-50 lux measured at eye distance. iOS Night Shift and Android Night Mode warm the display color temperature from ~6500K to ~3500K, shifting emission below 550nm and substantially reducing ipRGC stimulation. PRform provides direct deeplinks to display settings on both platforms because behavioral friction (the 3 extra taps required to find these settings) is the primary documented barrier to their use among athletes.

Source: Chang AM et al. (2015). Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness. *PNAS*, 112(4), 1232-1237.

**Phase 3: Phone Across the Room (T - 30 min)**

Social media, messaging, and content consumption activate dopaminergic reward pathways that are neurochemically incompatible with the cortisol and core temperature decline required for sleep onset. Mere physical proximity to a smartphone has been shown to reduce available cognitive capacity even when the device is face-down and silent. Distance removes the temptation loop entirely.

Source: Ward AF et al. (2017). Brain drain: the mere presence of one's own smartphone reduces available cognitive capacity. *Journal of the Association for Consumer Research*, 2(2), 140-154.

**Phase 4: Lie Down in Near-Dark (T - 15 min)**

From Cognitive Behavioral Therapy for Insomnia (CBT-I), the most clinically validated sleep intervention: entering the sleep environment 10-20 minutes before target sleep onset, while not yet fully drowsy, reinforces the bed-sleep association through stimulus control. This directly reduces sleep onset latency over multiple nights by training the brain to associate the physical act of lying down in the dark with the physiological cascade that precedes sleep.

Source: Morin CM (1993). *Insomnia: Psychological assessment and management*. Guilford Press.

---

## Design System

PRform mirrors the aesthetic of Citius Mag, the premier running media brand. Sharp, editorial, high-contrast. No softness.

```
Background:     #FFFFFF (pure white) / #0A0A0A (near black)
Primary text:   #0A0A0A
Accent:         #E8FF00 (electric yellow-green, used sparingly)
Secondary:      #6B6B6B
Borders:        #E5E5E5 (1px only, no shadows anywhere)

Headings:       DM Sans, weight 800-900, uppercase
Body:           DM Sans, weight 400, line-height 1.7
Data/times:     JetBrains Mono (all sleep times, countdowns, scores)

border-radius:  0 on everything
box-shadow:     none on everything
```

### Animations implemented

| Animation | Implementation |
|---|---|
| Fade-up on scroll | IntersectionObserver, 400ms ease-out, 80ms child stagger |
| Ticker marquee | CSS keyframes, pauses on hover |
| Number count-up | `requestAnimationFrame` loop, 600ms, triggers on viewport entry |
| Accent pulse | CSS keyframes, 2s loop, 0.85-1.0-0.85 opacity |
| Page transitions | Framer Motion `AnimatePresence`, 150ms opacity fade |
| Button press | `active:scale-[0.97]` via Tailwind |
| Link underline wipe | CSS pseudo-element `scaleX` transform, 200ms |
| Card hover | Border color transition to `#0A0A0A` |

---

## Database Schema

```prisma
model User {
  id              String    @id @default(cuid())
  email           String    @unique
  password        String    (bcrypt, 12 rounds)
  name            String?
  age             Int?
  biologicalSex   String?   ("male" | "female" | "other")
  weeklyMileage   String?   ("0-30" | "30-50" | "50-70" | "70+")
  experienceLevel String?   ("high_school" | "collegiate" | "post_collegiate" | "masters")
  currentWakeTime String?   (HH:MM 24h)
  currentBedTime  String?   (HH:MM 24h)
  restedFeeling   String?   ("well" | "sometimes" | "rarely")
  onboardingDone  Boolean   @default(false)
  notifPhase1-4   Boolean   @default(true)
  workouts        Workout[]
  meets           Meet[]
  sessions        Session[]
}

model Workout {
  id         String   (cuid)
  userId     String
  date       DateTime
  type       String   ("easy" | "moderate" | "tempo" | "long_run" | "track" | "race" | "rest" | "cross_train")
  distance   Float?
  duration   Int?     (minutes)
  effort     Int?     (1-5 perceived effort)
  isTemplate Boolean  (weekly template vs one-off)
  dayOfWeek  Int?     (0=Mon, 6=Sun, for templates)
}

model Meet {
  id        String
  userId    String
  name      String
  date      DateTime
  distances String   (freeform, e.g. "5K, 10K")
  priority  String   ("A" | "B" | "C")
}
```

---

## API Routes

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account (bcrypt hash, duplicate check) |
| ANY | `/api/auth/[...nextauth]` | NextAuth JWT handler |
| GET | `/api/sleep-plan` | Run algorithm, return full 14-day plan |
| GET/POST/PUT/DELETE | `/api/workouts` | Full workout CRUD |
| GET/POST/PUT/DELETE | `/api/meets` | Full meet CRUD |
| GET/PUT | `/api/user/profile` | Read and update user profile + notif prefs |
| POST | `/api/user/onboarding` | Save all onboarding data in one transaction |

---

## Scientific References

1. **Mah CD, Mah KE, Kezirian EJ, Dement WC.** (2011). The effects of sleep extension on the athletic performance of collegiate basketball players. *Sleep*, 34(7), 943-950.
   > The foundational study establishing that sleep extension and phase advancement improves sprint speed (5%), reaction time, shooting accuracy, and subjective well-being in competitive athletes.

2. **Lewy AJ, Bauer VK, Ahmed S, et al.** (1998). The human phase response curve (PRC) to melatonin is about 12 hours out of phase with the PRC to light. *Chronobiology International*, 15(1), 71-83.
   > Establishes the phase-response curve framework used to time melatonin-onset advancement via progressive earlier bedtimes.

3. **Brainard GC, Hanifin JP, Greeson JM, et al.** (2001). Action spectrum for melatonin regulation in humans: evidence for a novel circadian photoreceptor. *Journal of Neuroscience*, 21(16), 6405-6412.
   > Quantifies the blue-light sensitivity of ipRGCs, providing the physiological basis for Phase 1 and Phase 2 of the wind-down protocol.

4. **Chang AM, Aeschbach D, Duffy JF, Czeisler CA.** (2015). Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness. *PNAS*, 112(4), 1232-1237.
   > Documents melatonin delay, next-morning alertness reduction, and REM suppression from evening screen use. Basis for Phase 2 and Phase 3.

5. **Burgard SA, Ailshire JA.** (2013). Gender and time for sleep among U.S. adults. *American Sociological Review*, 78(1), 51-69.
   > Documents the sex-based difference in sleep duration that informs the +0.5h female athlete adjustment in the base sleep need calculation.

6. **American Academy of Sleep Medicine.** (2017). Healthy sleep habits. *AASM Sleep Education*. [aasm.org/healthy-sleep-habits](https://aasm.org/healthy-sleep-habits)
   > Provides the clinical guidelines for sleep duration by age that ground the tiered base sleep need values.

7. **Burgess HJ, Revell VL, Molina TA, Eastman CI.** (2010). Human phase response curves to three days of daily melatonin: 0.5 mg versus 3.0 mg. *Journal of Clinical Endocrinology and Metabolism*, 95(7), 3325-3331.
   > Supports the multi-night phase-shift strategy: circadian advancement requires 3-7 consecutive nights of shifted timing to produce measurable DLMO change.

8. **Ward AF, Duke K, Gneezy A, Bos MW.** (2017). Brain drain: the mere presence of one's own smartphone reduces available cognitive capacity. *Journal of the Association for Consumer Research*, 2(2), 140-154.
   > The "phone across the room" instruction in Phase 3 is derived from this study showing cognitive load reduction from smartphone proximity alone.

---

## Roadmap

- [ ] Push notifications (Service Worker + Web Push API)
- [ ] Wearable integrations (Garmin, Whoop, Oura ring) to auto-import actual sleep vs. target
- [ ] Group/team dashboard for coaches to monitor athlete recovery scores
- [ ] AI-personalized wind-down adjustments based on logged perceived effort patterns
- [ ] Exportable race-week sleep plans (PDF) for athletes sharing with coaches

---

<div align="center">

**PRform**

Built for athletes who understand that the race is won the night before.

*Sleep Sharp. Race Faster.*

</div>
