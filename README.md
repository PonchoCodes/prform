# PRform — Sleep Sharp. Race Faster.

Performance sleep optimization for competitive runners. PRform calculates the exact bedtime needed every night of a training cycle using sport science principles, then delivers a behavioral wind-down protocol to shift circadian rhythm before race day.

---

## Setup & Local Run

### Prerequisites
- Node.js 18+
- npm

### Install & Run

```bash
cd prform
npm install
npx prisma migrate dev --name init
npx ts-node --compiler-options '{"module":"CommonJS"}' prisma/seed.ts
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo Login
```
Email:    demo@prform.com
Password: demo1234
```

The demo account ships with 8 weeks of historical training data and 3 upcoming meets (A race in 18 days, B race in 6 days, C race in 45 days).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Backend | Next.js API Routes |
| Database | SQLite via Prisma ORM (Prisma v7 + better-sqlite3 adapter) |
| Auth | NextAuth.js v4 with credentials provider |
| Charts | Recharts |
| Animations | Framer Motion + Tailwind CSS keyframes |

---

## Sleep Algorithm

**File:** `lib/sleepAlgorithm.ts`  
**Function:** `calculateSleepPlan(user, workouts, meets): DailySleepPlan[]`

### 1. Base Sleep Need

| Age | Hours |
|---|---|
| 13–17 | 9.0 |
| 18–25 | 8.5 |
| 26+ | 8.0 |

Female athletes add +0.5h.

### 2. Training Load Adjustment

- **Rest / Easy / Cross-Train:** +0 min
- **Moderate Run:** +15 min
- **Tempo / Track:** +20 min
- **Long Run:** +30 min
- **Day after any hard workout:** +15 min

### 3. Pre-Meet Bedtime Shift

| Days Out | A Race | B Race | C Race |
|---|---|---|---|
| 10–8 days | −15 min | −11 min | −8 min |
| 7–5 days | −30 min | −23 min | −15 min |
| 4–2 days | −45 min | −34 min | −23 min |
| Night before | −60 min | −45 min | −30 min |

**Citation:** Mah et al. (2011) — "The Effects of Sleep Extension on the Athletic Performance of Collegiate Basketball Players," *Sleep*, 34(7), 943–950.

### 4. Wake Time Logic

Bedtime = `wake_time − total_sleep_need`. Pre-meet shifts move bedtime earlier while keeping wake time fixed.

### 5. Recovery Score (0–100)

- **Base:** 100
- **−5** per consecutive hard day without rest
- **−10** if meet within 3 days
- **−3** per hour of sleep deficit vs. baseline
- **+5** per rest day in the past 3 days

### 6. Wind-Down Phase Times

Given bedtime T: Phase 1 = T−120min, Phase 2 = T−90min, Phase 3 = T−30min, Phase 4 = T−15min.

---

## Wind-Down Protocol

PRform structures the 3 hours before bed into a repeating behavioral sequence that, done consistently, trains pre-sleep physiology and shifts the circadian phase.

**Dim Lights (T−120 min):** Overhead LEDs exceed 500 lux; lamps average 50–100 lux. Transitioning reduces light exposure by ~85%, allowing the melatonin ramp to begin on schedule. (Brainard et al., 2001)

**Night Mode (T−90 min):** Even dim screens emit blue light. iOS Night Shift / Android Night Mode shifts display warmth to reduce melatonin suppression. Direct deeplinks provided because behavioral friction is the primary barrier to use. (Chang et al., 2015, *PNAS*)

**Phone Away (T−30 min):** Social media triggers dopaminergic arousal. Physical distance eliminates the temptation loop. (Ward et al., 2017, *Journal of the Association for Consumer Research*)

**Lights Off / Lie Down (T−15 min):** From CBT-I: entering the sleep environment close to desired sleep onset reinforces the bed-sleep association and reduces sleep-onset latency. (Morin, 1993)

**Why consistency beats technology:** The circadian rhythm is entrained by the *pattern* of cues across multiple nights. Going to bed at the same time for 5+ consecutive nights is more powerful than any supplement or device.

---

## References

1. Mah, C.D. et al. (2011). Sleep extension and athletic performance. *Sleep*, 34(7), 943–950.
2. Lewy, A.J. et al. (1998). The human phase response curve to melatonin. *Chronobiology International*, 15(1), 71–83.
3. Brainard, G.C. et al. (2001). Action spectrum for melatonin regulation in humans. *Journal of Neuroscience*, 21(16), 6405–6412.
4. Chang, A.M. et al. (2015). Evening use of light-emitting eReaders negatively affects sleep. *PNAS*, 112(4), 1232–1237.
5. American Academy of Sleep Medicine. (2017). Healthy sleep habits. aasm.org
6. Burgess, H.J. et al. (2010). Human phase response curves to melatonin. *JCEM*, 95(7), 3325–3331.
