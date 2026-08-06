"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/Button";
import { SmsEnrollment } from "@/components/SmsEnrollment";
import { PrForm, EMPTY_PR, validatePrForm, isPrFormEmpty, type PrFormValue } from "@/components/PrForm";
import { PR_DISTANCES, meetEventForPrDistance, prDistanceGuidance } from "@/lib/vdot";
import { parseTimeToSeconds, getUnitForEvent } from "@/lib/performancePrediction";

type WorkoutType = "easy" | "moderate" | "tempo" | "long_run" | "track" | "race" | "rest" | "cross_train";

interface WeekTemplate {
  [day: number]: { type: WorkoutType; distance: string };
}

const WORKOUT_TYPES: { value: WorkoutType; label: string }[] = [
  { value: "rest",        label: "Rest" },
  { value: "easy",        label: "Easy Run" },
  { value: "moderate",    label: "Moderate Run" },
  { value: "tempo",       label: "Tempo" },
  { value: "long_run",    label: "Long Run" },
  { value: "track",       label: "Track Workout" },
  { value: "race",        label: "Race" },
  { value: "cross_train", label: "Cross Train" },
];

const WEEKLY_MILEAGE_OPTIONS = ["0-20", "20-40", "40-60", "60-80", "80+"];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const defaultWeek: WeekTemplate = {
  0: { type: "easy", distance: "5" },
  1: { type: "moderate", distance: "6" },
  2: { type: "tempo", distance: "7" },
  3: { type: "easy", distance: "5" },
  4: { type: "rest", distance: "" },
  5: { type: "long_run", distance: "12" },
  6: { type: "rest", distance: "" },
};

const COMMON_EVENTS = [
  "100m", "200m", "400m", "800m", "1500m", "Mile", "3000m", "5000m", "10000m",
  "110m Hurdles", "400m Hurdles", "4×100m", "4×400m",
];

interface Meet {
  name: string;
  date: string;
  raceTime: string;
  primaryEvent: string;
  personalBest: string;
  priority: "A" | "B" | "C";
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);

  // Step 1: Essentials
  const [age, setAge] = useState("");
  const [biologicalSex, setBiologicalSex] = useState("");
  const [wakeTime, setWakeTime] = useState("06:00");
  const [bedTime, setBedTime] = useState("22:00");

  // Step 2: Current Fitness
  const [pr, setPr] = useState<PrFormValue>(EMPTY_PR);
  const [prAcknowledged, setPrAcknowledged] = useState(false);
  const [prShowErrors, setPrShowErrors] = useState(false);
  const [weeklyMileage, setWeeklyMileage] = useState("");
  const [goalRaceDistanceId, setGoalRaceDistanceId] = useState("");

  // Step 3: Your Next Race
  const [meet, setMeet] = useState<Meet>({
    name: "",
    date: "",
    raceTime: "",
    primaryEvent: "",
    personalBest: "",
    priority: "A",
  });
  const [skipRace, setSkipRace] = useState(false);

  // Step 4: Training week (+ optional text messages). Strava is deliberately
  // absent from onboarding: the athlete cap (10) means most new users cannot
  // connect anyway, and the product has to stand on its own without it. It is
  // offered afterward, from the dashboard and /strava, as an upgrade.
  const [weekTemplate, setWeekTemplate] = useState<WeekTemplate>(defaultWeek);

  const [unitPreference, setUnitPreference] = useState<"imperial" | "metric">("imperial");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof navigator !== "undefined") {
      setUnitPreference(navigator.language.startsWith("en-US") ? "imperial" : "metric");
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stepParam = params.get("step");
    if (stepParam) setStep(parseInt(stepParam));
  }, []);

  // The PR step is skippable: leaving it blank falls back to history-inferred
  // paces. A partly-filled form is a mistake though, so it blocks until fixed.
  const prSkipped = isPrFormEmpty(pr);
  const prValidation = validatePrForm(pr);
  const prGuidance = pr.distanceId ? prDistanceGuidance(pr.distanceId) : null;
  const prNeedsAcknowledgement = !!prGuidance && !prGuidance.reliable;
  const prReady = prValidation.ok && (!prNeedsAcknowledgement || prAcknowledged);
  const prProvided = !prSkipped && prReady;

  const handleContinue = () => {
    if (step === 2 && !prSkipped && !prReady) {
      setPrShowErrors(true);
      return;
    }
    setPrShowErrors(false);
    setStep(step + 1);
  };

  const updateDay = (day: number, field: "type" | "distance", value: string) => {
    setWeekTemplate((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);

    // The declared PR doubles as the race PR when the meet's primary event is
    // the same distance — no reason to ask for the same time twice. Otherwise
    // fall back to whatever was typed into the meet form.
    const prSeconds = prProvided ? parseTimeToSeconds(pr.time) : null;
    const prMeetEvent = prProvided ? meetEventForPrDistance(pr.distanceId) : null;
    const reusePr =
      prSeconds !== null && !!prMeetEvent && meet.primaryEvent === prMeetEvent;

    // Meet times are stored as total seconds regardless of how they were typed.
    const meetPbSeconds = reusePr
      ? prSeconds
      : meet.personalBest.trim()
        ? parseTimeToSeconds(meet.personalBest)
        : null;

    const meets =
      skipRace || !meet.name || !meet.date
        ? []
        : [
            {
              ...meet,
              personalBest: meetPbSeconds !== null ? String(meetPbSeconds) : null,
              personalBestUnit:
                meetPbSeconds !== null && meet.primaryEvent
                  ? getUnitForEvent(meet.primaryEvent)
                  : null,
            },
          ];

    const payload = {
      sport: "track",
      age: parseInt(age),
      biologicalSex,
      currentWakeTime: wakeTime,
      currentBedTime: bedTime,
      weekTemplate,
      meets,
      unitPreference,
      weeklyMileage: weeklyMileage || null,
      goalRaceDistanceId: goalRaceDistanceId || null,
      ...(prProvided && prSeconds !== null
        ? { prDistanceId: pr.distanceId, prTimeSeconds: prSeconds, prRecency: pr.recency }
        : {}),
    };

    const res = await fetch("/api/user/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    // Early-access users are grandfathered into free access — never route
    // them to Stripe.
    router.push(data.earlyAccessUser ? "/dashboard" : "/subscribe");
  };

  const TOTAL_STEPS = 4;
  const progress = (step / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex flex-col">
      <nav className="border-b border-[#E5E5E5] dark:border-[#333] px-6 h-14 flex items-center justify-between">
        <span className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">
          Step {step} of {TOTAL_STEPS}
        </span>
      </nav>

      {/* Progress bar */}
      <div className="h-1 bg-[#E5E5E5] dark:bg-[#333]">
        <div
          className="h-1 bg-[#E8FF00] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {/* Step 1: The Essentials */}
            {step === 1 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Step 1 of {TOTAL_STEPS}</p>
                <h1 className="font-black text-3xl uppercase mb-2">The Essentials</h1>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] font-mono mb-8">
                  Four things and we can calculate your first bedtime tonight.
                </p>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2">Age</label>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                      placeholder="Your age"
                      min={13}
                      max={80}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-3">Biological Sex</label>
                    <div className="flex gap-3">
                      {["male", "female", "other"].map((s) => (
                        <button
                          key={s}
                          onClick={() => setBiologicalSex(s)}
                          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            biologicalSex === s
                              ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                              : "border-[#E5E5E5] dark:border-[#444] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5]"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2">Current Wake Time</label>
                    <input
                      type="time"
                      value={wakeTime}
                      onChange={(e) => setWakeTime(e.target.value)}
                      className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2">Current Bedtime</label>
                    <input
                      type="time"
                      value={bedTime}
                      onChange={(e) => setBedTime(e.target.value)}
                      className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Current Fitness */}
            {step === 2 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Step 2 of {TOTAL_STEPS}</p>
                <h1 className="font-black text-3xl uppercase mb-2">Current Fitness</h1>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] font-mono mb-8">
                  One recent race result and PRform can prescribe every training pace today —
                  no waiting for weeks of data.
                </p>

                <div className="space-y-8">
                  <PrForm
                    value={pr}
                    onChange={setPr}
                    shortDistanceAcknowledged={prAcknowledged}
                    onAcknowledgeShortDistance={setPrAcknowledged}
                    showErrors={prShowErrors}
                  />

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-3">
                      Weekly Mileage
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKLY_MILEAGE_OPTIONS.map((m) => (
                        <button
                          key={m}
                          type="button"
                          aria-pressed={weeklyMileage === m}
                          onClick={() => setWeeklyMileage(weeklyMileage === m ? "" : m)}
                          className={`flex-1 min-w-[72px] py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            weeklyMileage === m
                              ? "bg-[#0A0A0A] text-white border-[#0A0A0A] dark:bg-[#F5F5F5] dark:text-[#0A0A0A] dark:border-[#F5F5F5]"
                              : "border-[#E5E5E5] dark:border-[#444] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5]"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="goal-race" className="block text-xs font-bold uppercase tracking-wider mb-2">
                      Goal Race Distance{" "}
                      <span className="text-[#6B6B6B] dark:text-[#A0A0A0] normal-case font-normal">(optional)</span>
                    </label>
                    <select
                      id="goal-race"
                      value={goalRaceDistanceId}
                      onChange={(e) => setGoalRaceDistanceId(e.target.value)}
                      className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] bg-white"
                    >
                      <option value="">No specific goal yet</option>
                      {PR_DISTANCES.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setPr(EMPTY_PR);
                      setPrAcknowledged(false);
                      setPrShowErrors(false);
                      setStep(3);
                    }}
                    className="w-full text-center text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] py-2 transition-colors"
                  >
                    Skip — I&apos;ll let PRform learn from my training →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Your Next Race */}
            {step === 3 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Step 3 of {TOTAL_STEPS}</p>
                <h1 className="font-black text-3xl uppercase mb-2">Your Next Race</h1>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] font-mono mb-8">
                  When is it? We&apos;ll build your sleep plan backward from race day.
                </p>

                <div className="space-y-4">
                  <div className="border border-[#E5E5E5] dark:border-[#333] p-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-1">Meet Name</label>
                        <input
                          type="text"
                          placeholder="e.g. State Championships"
                          value={meet.name}
                          onChange={(e) => setMeet((m) => ({ ...m, name: e.target.value }))}
                          className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-2 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-1">Meet Date</label>
                        <input
                          type="date"
                          value={meet.date}
                          onChange={(e) => setMeet((m) => ({ ...m, date: e.target.value }))}
                          className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-1">Race Start Time</label>
                        <input
                          type="time"
                          value={meet.raceTime}
                          onChange={(e) => setMeet((m) => ({ ...m, raceTime: e.target.value }))}
                          className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-1">Primary Event</label>
                        <select
                          value={meet.primaryEvent}
                          onChange={(e) => setMeet((m) => ({ ...m, primaryEvent: e.target.value }))}
                          className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] bg-white"
                        >
                          <option value="">Select event…</option>
                          {COMMON_EVENTS.map((ev) => (
                            <option key={ev} value={ev}>{ev}</option>
                          ))}
                        </select>
                      </div>
                      {prProvided && meetEventForPrDistance(pr.distanceId) === meet.primaryEvent && meet.primaryEvent ? (
                        <div className="border border-[#E5E5E5] dark:border-[#444] px-4 py-3">
                          <p className="text-xs font-bold uppercase tracking-wider mb-1">Personal Best</p>
                          <p className="text-sm font-mono">
                            {pr.time}{" "}
                            <span className="text-[#6B6B6B] dark:text-[#A0A0A0]">
                              — from the PR you entered
                            </span>
                          </p>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-wider mb-1">
                            Personal Best <span className="text-[#6B6B6B] dark:text-[#A0A0A0] normal-case">(optional — e.g. 51.8 or 1:52.4)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 51.8 or 1:52.4"
                            value={meet.personalBest}
                            onChange={(e) => setMeet((m) => ({ ...m, personalBest: e.target.value }))}
                            className="w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                          />
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider mb-2">Priority</label>
                        <div className="flex gap-2">
                          {(["A", "B", "C"] as const).map((p) => (
                            <button
                              key={p}
                              onClick={() => setMeet((m) => ({ ...m, priority: p }))}
                              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider border transition-colors ${
                                meet.priority === p
                                  ? p === "A"
                                    ? "bg-[#E8FF00] text-[#0A0A0A] border-[#E8FF00]"
                                    : "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                                  : "border-[#E5E5E5] dark:border-[#444] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5]"
                              }`}
                            >
                              {p} Race
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => { setSkipRace(true); setStep(4); }}
                    className="w-full text-center text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] py-2 transition-colors"
                  >
                    Skip for now →
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Your Training Week */}
            {step === 4 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Step 4 of {TOTAL_STEPS}</p>
                <h1 className="font-black text-3xl uppercase mb-2">Your Training Week</h1>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-8">
                  Sketch a typical week — sleep targets move with your training load.
                  You can adjust any day later, or log workouts as they happen.
                </p>

                <div className="border border-[#E5E5E5] dark:border-[#444] p-4 space-y-3">
                  {DAYS.map((day, i) => (
                    <div key={day} className="border border-[#E5E5E5] dark:border-[#333] p-4">
                      <p className="text-xs font-bold uppercase tracking-wider mb-3">{day}</p>
                      <div className="flex gap-3">
                        <select
                          value={weekTemplate[i]?.type ?? "rest"}
                          onChange={(e) => updateDay(i, "type", e.target.value)}
                          className="flex-1 border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] bg-white"
                        >
                          {WORKOUT_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                        {weekTemplate[i]?.type !== "rest" && (
                          <input
                            type="number"
                            value={weekTemplate[i]?.distance ?? ""}
                            onChange={(e) => updateDay(i, "distance", e.target.value)}
                            placeholder="Miles"
                            className="w-24 border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-xs focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]"
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-4">
                  Use Strava? You can connect it any time from your dashboard —
                  synced runs then take over from this schedule automatically.
                </p>

                {/* Optional: text messages. Self-enrolment with explicit consent;
                    fully skippable — Continue works with this untouched. */}
                <h2 className="font-black text-xl uppercase mt-10 mb-2 border-b border-[#E5E5E5] dark:border-[#333] pb-3">
                  Texts, Not Tabs{" "}
                  <span className="text-xs font-mono normal-case text-[#6B6B6B] dark:text-[#A0A0A0]">(optional)</span>
                </h2>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-6">
                  One text each evening, one each morning — run PRform without opening the site.
                </p>
                <SmsEnrollment />
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="flex gap-4 mt-10">
          {step > 1 && (
            <Button variant="ghost" size="lg" onClick={() => setStep(step - 1)} className="flex-1">
              Back
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button variant="secondary" size="lg" onClick={handleContinue} className="flex-1">
              Continue →
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={handleSubmit} disabled={loading} className="flex-1">
              {loading ? "Saving..." : "Go to Dashboard →"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
