# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npm run lint         # ESLint via Next.js
npm run seed         # Seed demo user (demo@prform.com / demo1234)

npx prisma migrate dev --name <name>   # Create and apply a migration
npx prisma generate                    # Regenerate Prisma client (required after schema changes)
npx prisma studio                      # Browse database
```

There are no tests.

## Environment

Requires a `.env` file at the project root:
```
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="prform-super-secret-key-2024-hackathon"
NEXTAUTH_URL="http://localhost:3000"
```

## Architecture

**PRform** is a sleep optimization app for competitive runners and swimmers. The core product is a proprietary 14-day sleep plan algorithm in `lib/sleepAlgorithm.ts`.

### The Sleep Algorithm

`calculateSleepPlan(user, workouts, meets): DailySleepPlan[]` is the single most important function in the codebase. It:

- Computes a base sleep need from age brackets (13–17: 9h, 18–25: 8.5h, 26+: 8h), biological sex (+30 min for female), and sport (+20 min for swimming)
- Adds per-workout training load: moderate +15 min, tempo/track +20 min, long_run +30 min, day-after-hard +15 min
- Shifts bedtime earlier in the 10 days before a meet (up to 60 min for A-priority, scaled down for B/C)
- Calculates a 0–100 recovery score from consecutive hard days, meet proximity, and sleep deficit

The internal `WorkoutType` values (`easy`, `moderate`, `tempo`, `long_run`, `track`, `race`, `rest`, `cross_train`) are what the algorithm operates on. The UI maps sport-specific labels onto these values — swimmers see "Threshold" but the stored value is `tempo`.

### Data Flow

`/api/sleep-plan` is the main data endpoint. It fetches the user, their template workouts (repeating weekly schedule), one-off logged workouts, and meets; builds a 14-day workout list (one-offs override templates); runs `calculateSleepPlan`; and returns `{ plan, user, meets, templateWorkouts, oneOffWorkouts }` all in one response. The dashboard consumes this single endpoint.

### Database

SQLite via Prisma 7 with the `better-sqlite3` adapter. The adapter is configured in `prisma.config.ts` (not the standard `datasource` url field). **After any schema change, run both `prisma migrate dev` and `prisma generate`** — the generated client won't reflect new fields until regenerated.

Key model relationships: `User → Workout[]` and `User → Meet[]`. Workouts are dual-purpose: `isTemplate: true` + `dayOfWeek` = repeating schedule slot; `isTemplate: false` + `date` = logged one-off.

### Auth

NextAuth v4 with a credentials provider (`lib/auth.ts`). The session JWT carries `userId` and `onboardingDone`. All API routes call `getServerSession(authOptions)` and extract `(session.user as any).id`. Users who haven't finished onboarding are redirected to `/onboarding` by the sleep-plan route.

### Design System

Strict editorial aesthetic defined in `tailwind.config.ts`:
- Colors: white `#FFFFFF`, black `#0A0A0A`, gray `#6B6B6B` / `#E5E5E5`, accent `#E8FF00`
- **No border radius anywhere** — all UI elements are sharp-cornered
- No shadows
- Toggle buttons: selected = `bg-[#0A0A0A] text-white border-[#0A0A0A]`, unselected = `border-[#E5E5E5] hover:border-[#0A0A0A]`
- Section labels: `text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B]`
