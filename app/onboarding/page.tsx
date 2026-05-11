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

interface Meet {
  name: string;
  date: string;
  distances: string;
  priority: "A" | "B" | "C";
  raceTime: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);

  // Step 1: Profile
  const [sport, setSport] = useState("track");
  const [age, setAge] = useState("");
  const [biologicalSex, setBiologicalSex] = useState("");
  const [weeklyMileage, setWeeklyMileage] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");

  // Step 2: Sleep baseline
  const [wakeTime, setWakeTime] = useState("06:00");
  const [bedTime, setBedTime] = useState("22:00");
  const [restedFeeling, setRestedFeeling] = useState("");

  // Step 3: Data source
  const [stravaConnected, setStravaConnected] = useState(false);
  const [stravaAthleteId, setStravaAthleteId] = useState<string | null>(null);
  const [showManualSchedule, setShowManualSchedule] = useState(false);
  const [weekTemplate, setWeekTemplate] = useState<WeekTemplate>(defaultWeek);

  // Step 4: Meets
  const [meets, setMeets] = useState<Meet[]>([
    { name: "", date: "", distances: "", priority: "A", raceTime: "" },
  ]);

  const [loading, setLoading] = useState(false);

  // On mount: check if returning from Strava OAuth (connected=1 in URL) and
  // advance to step 4. Also poll Strava connection status when on step 3.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "1") {
      setStravaConnected(true);
      setStep(4);
      // Clean the URL without a hard reload
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

  const addMeet = () =>
    setMeets((prev) => [...prev, { name: "", date: "", distances: "", priority: "A", raceTime: "" }]);

  const updateMeet = (i: number, field: keyof Meet, value: string) =>
    setMeets((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  const removeMeet = (i: number) =>
    setMeets((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = async () => {
    setLoading(true);

    const payload = {
      sport,
      age: parseInt(age),
      biologicalSex,
      weeklyMileage,
      experienceLevel,
      currentWakeTime: wakeTime,
      currentBedTime: bedTime,
      restedFeeling,
      weekTemplate,
      meets: meets.filter((m) => m.name && m.date),
    };

    await fetch("/api/user/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    router.push("/dashboard");
  };

  const progress = (step / 4) * 100;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="border-b border-[#E5E5E5] px-6 h-14 flex items-center justify-between">
        <span className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B]">
          Step {step} of 4
        </span>
      </nav>

      {/* Progress bar */}
      <div className="h-1 bg-[#E5E5E5]">
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
            {step === 1 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Step 1 of 4</p>
                <h1 className="font-black text-3xl uppercase mb-8">Athlete Profile</h1>
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
                              : "border-[#E5E5E5] hover:border-[#0A0A0A]"
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
                      className="w-full border border-[#E5E5E5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A]"
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
                              : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-3">Weekly Mileage</label>
                    <div className="grid grid-cols-2 gap-3">
                      {["0-30", "30-50", "50-70", "70+"].map((m) => (
                        <button
                          key={m}
                          onClick={() => setWeeklyMileage(m)}
                          className={`py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            weeklyMileage === m
                              ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                              : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                          }`}
                        >
                          {m} mi/wk
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-3">Experience Level</label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: "high_school", label: "High School" },
                        { value: "collegiate", label: "Collegiate" },
                        { value: "post_collegiate", label: "Post-Collegiate" },
                        { value: "masters", label: "Masters" },
                      ].map((e) => (
                        <button
                          key={e.value}
                          onClick={() => setExperienceLevel(e.value)}
                          className={`py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            experienceLevel === e.value
                              ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                              : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                          }`}
                        >
                          {e.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Step 2 of 4</p>
                <h1 className="font-black text-3xl uppercase mb-8">Sleep Baseline</h1>
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2">Current Wake Time</label>
                    <input
                      type="time"
                      value={wakeTime}
                      onChange={(e) => setWakeTime(e.target.value)}
                      className="w-full border border-[#E5E5E5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-2">Current Bedtime</label>
                    <input
                      type="time"
                      value={bedTime}
                      onChange={(e) => setBedTime(e.target.value)}
                      className="w-full border border-[#E5E5E5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider mb-3">How Rested Do You Feel?</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { value: "well", label: "Well Rested" },
                        { value: "sometimes", label: "Sometimes Rested" },
                        { value: "rarely", label: "Rarely Rested" },
                      ].map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setRestedFeeling(r.value)}
                          className={`py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                            restedFeeling === r.value
                              ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                              : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Step 3 of 4</p>
                <h1 className="font-black text-3xl uppercase mb-2">Connect Your Data</h1>
                <p className="text-sm text-[#6B6B6B] mb-8">
                  PRform uses your actual training data to optimise your sleep plan. Connect Strava for automatic tracking, or set a weekly template manually.
                </p>

                {/* Strava card */}
                <div className={`border-2 p-6 mb-4 transition-colors ${stravaConnected ? "border-[#0A0A0A]" : "border-[#E5E5E5]"}`}>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-10 h-10 bg-[#FC4C02] flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-black text-lg">S</span>
                    </div>
                    <div>
                      <p className="font-black text-sm uppercase tracking-wider">Strava</p>
                      <p className="text-xs text-[#6B6B6B] font-mono">Recommended — automatic sync</p>
                    </div>
                    {stravaConnected && (
                      <div className="ml-auto bg-[#E8FF00] px-2 py-1 text-xs font-bold uppercase tracking-wider">
                        Connected
                      </div>
                    )}
                  </div>
                  {stravaConnected ? (
                    <p className="text-xs text-[#6B6B6B] font-mono">
                      {stravaAthleteId ? `Logged in as ${stravaAthleteId}.` : "Strava account linked."} Your runs will sync automatically.
                    </p>
                  ) : (
                    <a
                      href="/api/strava/connect?returnTo=/onboarding"
                      className="inline-block bg-[#E8FF00] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-6 py-2 hover:bg-[#d4e800] transition-colors"
                    >
                      Connect Strava →
                    </a>
                  )}
                </div>

                {/* Manual fallback toggle */}
                <button
                  onClick={() => setShowManualSchedule((v) => !v)}
                  className="w-full text-left border border-[#E5E5E5] p-4 text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors flex items-center justify-between"
                >
                  <span>Set weekly schedule manually {stravaConnected ? "(optional override)" : ""}</span>
                  <span>{showManualSchedule ? "▲" : "▼"}</span>
                </button>

                {showManualSchedule && (
                  <div className="border border-t-0 border-[#E5E5E5] p-4 space-y-3">
                    {DAYS.map((day, i) => (
                      <div key={day} className="border border-[#E5E5E5] p-4">
                        <p className="text-xs font-bold uppercase tracking-wider mb-3">{day}</p>
                        <div className="flex gap-3">
                          <select
                            value={weekTemplate[i]?.type ?? "rest"}
                            onChange={(e) => updateDay(i, "type", e.target.value)}
                            className="flex-1 border border-[#E5E5E5] px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#0A0A0A] bg-white"
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
                              className="w-24 border border-[#E5E5E5] px-3 py-2 text-xs focus:outline-none focus:border-[#0A0A0A]"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {step === 4 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Step 4 of 4</p>
                <h1 className="font-black text-3xl uppercase mb-8">Meet Schedule</h1>
                <div className="space-y-4">
                  {meets.map((meet, i) => (
                    <div key={i} className="border border-[#E5E5E5] p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-bold uppercase tracking-wider">Meet {i + 1}</p>
                        {meets.length > 1 && (
                          <button
                            onClick={() => removeMeet(i)}
                            className="text-xs text-[#6B6B6B] hover:text-red-600 font-bold uppercase tracking-wider"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <input
                          type="text"
                          placeholder="Meet name"
                          value={meet.name}
                          onChange={(e) => updateMeet(i, "name", e.target.value)}
                          className="w-full border border-[#E5E5E5] px-4 py-2 text-sm focus:outline-none focus:border-[#0A0A0A]"
                        />
                        <input
                          type="date"
                          value={meet.date}
                          onChange={(e) => updateMeet(i, "date", e.target.value)}
                          className="w-full border border-[#E5E5E5] px-4 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                        />
                        <div>
                          <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Race Time</label>
                          <input
                            type="time"
                            value={meet.raceTime}
                            onChange={(e) => updateMeet(i, "raceTime", e.target.value)}
                            className="w-full border border-[#E5E5E5] px-4 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                          />
                        </div>
                        <input
                          type="text"
                          placeholder="Distances (e.g. 5K, 10K)"
                          value={meet.distances}
                          onChange={(e) => updateMeet(i, "distances", e.target.value)}
                          className="w-full border border-[#E5E5E5] px-4 py-2 text-sm focus:outline-none focus:border-[#0A0A0A]"
                        />
                        <div className="flex gap-2">
                          {(["A", "B", "C"] as const).map((p) => (
                            <button
                              key={p}
                              onClick={() => updateMeet(i, "priority", p)}
                              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider border transition-colors ${
                                meet.priority === p
                                  ? p === "A"
                                    ? "bg-[#E8FF00] text-[#0A0A0A] border-[#E8FF00]"
                                    : "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                                  : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                              }`}
                            >
                              {p} Race
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addMeet}
                    className="w-full border border-dashed border-[#E5E5E5] py-3 text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors"
                  >
                    + Add Meet
                  </button>
                </div>
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
          {step < 4 ? (
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
