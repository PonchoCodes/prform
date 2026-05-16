# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint via Next.js
npm run seed         # Seed demo user (demo@prform.com / demo1234)

npx prisma migrate dev --name <name>   # Create and apply a migration
npx prisma generate                    # Regenerate Prisma client (required after every schema change)
npx prisma studio                      # Browse the database
npx prisma migrate deploy              # Apply pending migrations to production (run before deploy if schema changed)

vercel --prod        # Deploy to production (linked to ponchocodes-projects/prform-o3m8)
```

There are no tests.

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
```

Production is deployed at **https://prformm.vercel.app** (Vercel project `prform-o3m8`).

## Architecture

**PRform** is a sleep optimization app for competitive runners and swimmers. The core product is a 14-day sleep plan algorithm in `lib/sleepAlgorithm.ts`.

### The Sleep Algorithm

`calculateSleepPlan(user, meets, workouts, currentTSB?, opts?)` is the most important function. It returns a `DailySleepPlan[]` array where index 0 is `startDayOffset` (typically yesterday at `-1`) and the rest are today through day +13.

How it computes each day's bedtime:
- **Base sleep need**: 8–9h from age brackets, +30 min female, +20 min swimming
- **Training load bonus**: +15 min moderate, +20 min tempo/track, +30 min long_run, +15 min day-after-hard
- **Meet ramp**: bedtime shifted progressively earlier over 10 days before each meet (up to 60 min for A-priority). Uses `SHIFT_FRACTIONS` lookup table for the phase schedule
- **Circadian correction**: if recent sleep logs show the athlete's actual phase is delayed, the ramp compensates for the delay on top of the meet advance
- **Recovery score** (0–100): deducted by consecutive hard days, meet proximity, and a `globalSleepPenalty` computed from recent missed nights; boosted by sleep streak

The internal `WorkoutType` values (`easy`, `moderate`, `tempo`, `long_run`, `track`, `race`, `rest`, `cross_train`) drive the algorithm. The UI maps sport-specific labels to these — swimmers see "Threshold" but the stored value is `tempo`.

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

### Design System

Defined in `tailwind.config.ts`:
- Colors: white `#FFFFFF`, black `#0A0A0A`, gray `#6B6B6B` / `#E5E5E5`, accent `#E8FF00`
- **No border radius anywhere** — all elements are sharp-cornered
- No shadows
- Section labels: `text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B]`
- Toggle buttons: selected = `bg-[#0A0A0A] text-white border-[#0A0A0A]`, unselected = `border-[#E5E5E5] hover:border-[#0A0A0A]`
- Dark mode via `dark:` variants — background `#1a1a1a`, cards `#242424`
