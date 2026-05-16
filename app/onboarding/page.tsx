"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/Button";

type WorkoutType = "easy" | "moderate" | "tempo" | "long_run" | "track" | "race" | "rest" | "cross_train";

interface WeekTemplate {
  [day: number]: { type: WorkoutType; distance: string };
}

function getWorkoutTypes(sport: string): { value: WorkoutType; label: string }[] {
  if (sport === "swimming") return [
    { value: "rest",        label: "Rest" },
    { value: "easy",        label: "Easy Swim" },
    { value: "moderate",    label: "Moderate Swim" },
    { value: "tempo",       label: "Threshold" },
    { value: "long_run",    label: "Distance Swim" },
    { value: "cross_train", label: "Dryland" },
    { value: "race",        label: "Race" },
    { value: "cross_train", label: "Cross Train" },
  ];
  return [
    { value: "rest",        label: "Rest" },
    { value: "easy",        label: "Easy Run" },
    { value: "moderate",    label: "Moderate Run" },
    { value: "tempo",       label: "Tempo" },
    { value: "long_run",    label: "Long Run" },
    { value: "track",       label: "Track Workout" },
    { value: "race",        label: "Race" },
    { value: "cross_train", label: "Cross Train" },
  ];
}

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
  "100m Fly", "200m Fly", "400m IM", "200m Free", "500m Free", "1650m Free",
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
  const [sport, setSport] = useState("track");
  const [age, setAge] = useState("");
  const [biologicalSex, setBiologicalSex] = useState("");
  const [wakeTime, setWakeTime] = useState("06:00");
  const [bedTime, setBedTime] = useState("22:00");

  // Step 2: Your Next Race
  const [meet, setMeet] = useState<Meet>({
    name: "",
    date: "",
    raceTime: "",
    primaryEvent: "",
    personalBest: "",
    priority: "A",
  });
  const [skipRace, setSkipRace] = useState(false);

  // Step 3: Data source
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaAthleteId, setStravaAthleteId] = useState<string | null>(null);
  const [showManualSchedule, setShowManualSchedule] = useState(false);
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
    if (params.get("connected") === "1") {
      setStravaConnected(true);
      setStep(3);
      window.history.replaceState({}, "", "/onboarding");
      return;
    }
    const stepParam = params.get("step");
    if (stepParam) setStep(parseInt(stepParam));
  }, []);

  useEffect(() => {
    if (step !== 3) return;
    fetch("/api/strava/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.connected) {
          setStravaConnected(true);
          setStravaAthleteId(d.athleteName ?? null);
        }
      })
      .catch(() => {});
  }, [step]);

  const updateDay = (day: number, field: "type" | "distance", value: string) => {
    setWeekTemplate((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);

    const meets = skipRace || !meet.name || !meet.date
      ? []
      : [meet];

    const payload = {
      sport,
      age: parseInt(age),
      biologicalSex,
      currentWakeTime: wakeTime,
      currentBedTime: bedTime,
      weekTemplate,
      meets,
      unitPreference,
    };

    await fetch("/api/user/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    router.push("/subscribe");
  };

  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex flex-col">
      <nav className="border-b border-[#E5E5E5] dark:border-[#333] px-6 h-14 flex items-center justify-between">
        <span className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">
          Step {step} of 3
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
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Step 1 of 3</p>
                <h1 className="font-black text-3xl uppercase mb-2">The Essentials</h1>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] font-mono mb-8">
                  Four things and we can calculate your first bedtime tonight.
                </p>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-3">Your Sport</label>
                    <div className="flex gap-3">
                      {[{ value: "track", label: "Track & Field" }, { value: "swimming", label: "Swimming" }].map((s) => (
                        <button
                          key={s.value}
                          onClick={() => setSport(s.value)}
                          className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            sport === s.value
                              ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                              : "border-[#E5E5E5] dark:border-[#444] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5]"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
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

            {/* Step 2: Your Next Race */}
            {step === 2 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Step 2 of 3</p>
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
                    onClick={() => { setSkipRace(true); setStep(3); }}
                    className="w-full text-center text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] py-2 transition-colors"
                  >
                    Skip for now →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Connect Your Data */}
            {step === 3 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">Step 3 of 3</p>
                <h1 className="font-black text-3xl uppercase mb-2">Connect Your Data</h1>
                <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-8">
                  Connect Strava and PRform updates your sleep plan automatically after every run.
                </p>

                {/* Strava card */}
                <div className={`border-2 p-6 mb-4 transition-colors ${stravaConnected ? "border-[#0A0A0A] dark:border-[#F5F5F5]" : "border-[#E5E5E5] dark:border-[#444]"}`}>
                  <div className="flex items-center gap-4 mb-4">
                    <div>
                      <p className="font-black text-sm uppercase tracking-wider">Strava</p>
                      <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] font-mono">Recommended — automatic sync</p>
                    </div>
                    {stravaConnected && (
                      <div className="ml-auto bg-[#E8FF00] px-2 py-1 text-xs font-bold uppercase tracking-wider">
                        Connected
                      </div>
                    )}
                  </div>
                  {stravaConnected ? (
                    <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] font-mono">
                      {stravaAthleteId ? `Logged in as ${stravaAthleteId}.` : "Strava account linked."} Your runs will sync automatically.
                    </p>
                  ) : (
                    <div>
                      <a href="/api/strava/connect?returnTo=/onboarding">
                        <img
                          src="/strava/btn_strava_connect.png"
                          alt="Connect with Strava"
                          style={{ height: "48px", width: "auto", cursor: "pointer" }}
                        />
                      </a>
                      <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-3">
                        By connecting Strava, you agree to our{" "}
                        <a href="/privacy" className="underline hover:text-[#0A0A0A]">Privacy Policy</a>{" "}
                        and the{" "}
                        <a href="https://www.strava.com/legal/api" target="_blank" rel="noopener noreferrer" className="underline hover:text-[#0A0A0A]">Strava API Agreement</a>.
                      </p>
                    </div>
                  )}
                </div>

                {/* Manual fallback toggle */}
                <button
                  onClick={() => setShowManualSchedule((v) => !v)}
                  className="w-full text-left border border-[#E5E5E5] dark:border-[#444] p-4 text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors flex items-center justify-between"
                >
                  <span>Set weekly schedule manually {stravaConnected ? "(optional override)" : ""}</span>
                  <span>{showManualSchedule ? "▲" : "▼"}</span>
                </button>

                {showManualSchedule && (
                  <div className="border border-t-0 border-[#E5E5E5] dark:border-[#444] p-4 space-y-3">
                    {DAYS.map((day, i) => (
                      <div key={day} className="border border-[#E5E5E5] dark:border-[#333] p-4">
                        <p className="text-xs font-bold uppercase tracking-wider mb-3">{day}</p>
                        <div className="flex gap-3">
                          <select
                            value={weekTemplate[i]?.type ?? "rest"}
                            onChange={(e) => updateDay(i, "type", e.target.value)}
                            className="flex-1 border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] bg-white"
                          >
                            {getWorkoutTypes(sport).map((t) => (
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
                )}
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
          {step < 3 ? (
            <Button variant="secondary" size="lg" onClick={() => setStep(step + 1)} className="flex-1">
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
