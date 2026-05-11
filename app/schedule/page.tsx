"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";

type WorkoutType = "easy" | "moderate" | "tempo" | "long_run" | "track" | "race" | "rest" | "cross_train";
type WorkoutSource = "strava" | "manual" | "assumed";

interface NormalizedWorkout {
  date: string;
  type: WorkoutType;
  distance: number;
  duration: number;
  source: WorkoutSource;
  isTentative: boolean;
  stravaActivityId?: string;
  manualOverride?: boolean;
}

interface WorkoutConflict {
  workoutId: string;
  date: string;
  stravaName: string;
  manualType: string;
  conflictDismissed: boolean;
}

function getWorkoutLabel(type: WorkoutType, sport: string): string {
  if (sport === "swimming") {
    const map: Partial<Record<WorkoutType, string>> = {
      easy: "Easy Swim", moderate: "Moderate Swim", tempo: "Threshold",
      long_run: "Distance Swim", cross_train: "Dryland", race: "Race",
    };
    return map[type] ?? type;
  }
  const map: Partial<Record<WorkoutType, string>> = {
    easy: "Easy Run", moderate: "Moderate", tempo: "Tempo",
    long_run: "Long Run", track: "Track", race: "Race",
    cross_train: "Cross Train", rest: "Rest",
  };
  return map[type] ?? type;
}

function getWorkoutTypes(sport: string): { value: WorkoutType; label: string }[] {
  if (sport === "swimming") return [
    { value: "rest", label: "Rest" }, { value: "easy", label: "Easy Swim" },
    { value: "moderate", label: "Moderate Swim" }, { value: "tempo", label: "Threshold" },
    { value: "long_run", label: "Distance Swim" }, { value: "cross_train", label: "Dryland" },
    { value: "race", label: "Race" },
  ];
  return [
    { value: "rest", label: "Rest" }, { value: "easy", label: "Easy Run" },
    { value: "moderate", label: "Moderate" }, { value: "tempo", label: "Tempo" },
    { value: "long_run", label: "Long Run" }, { value: "track", label: "Track" },
    { value: "race", label: "Race" }, { value: "cross_train", label: "Cross Train" },
  ];
}

const LOAD_COLORS: Record<string, string> = {
  easy: "bg-green-100 text-green-800",
  moderate: "bg-blue-100 text-blue-800",
  tempo: "bg-orange-100 text-orange-800",
  long_run: "bg-purple-100 text-purple-800",
  track: "bg-red-100 text-red-800",
  race: "bg-[#E8FF00] text-[#0A0A0A]",
  cross_train: "bg-teal-100 text-teal-800",
  rest: "bg-gray-100 text-gray-500",
};

function SourceDot({ source }: { source: WorkoutSource }) {
  const colors: Record<WorkoutSource, string> = {
    strava: "bg-[#FC4C02]",
    manual: "bg-blue-400",
    assumed: "bg-[#6B6B6B]",
  };
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colors[source]}`} />;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

const today = new Date();
today.setHours(0, 0, 0, 0);

export default function SchedulePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<"past" | "planned">("planned");
  const [workouts, setWorkouts] = useState<NormalizedWorkout[]>([]);
  const [conflicts, setConflicts] = useState<WorkoutConflict[]>([]);
  const [sport, setSport] = useState("track");
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ date: "", type: "easy" as WorkoutType, distance: "", duration: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/workouts/planned").then((r) => r.json()),
      fetch("/api/user/profile").then((r) => r.json()),
    ]).then(([planData, profileData]) => {
      setWorkouts(planData.workouts ?? []);
      setConflicts(planData.conflicts ?? []);
      if (profileData?.sport) setSport(profileData.sport);
      setLoading(false);
    });
  }, [status]);

  const pastWorkouts = workouts
    .filter((w) => new Date(w.date) < today)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const plannedWorkouts = workouts
    .filter((w) => new Date(w.date) >= today)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleAddPlanned = async () => {
    if (!addForm.date) return;
    setSaving(true);
    const res = await fetch("/api/workouts/planned", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addForm),
    });
    const newW = await res.json();
    // Optimistically add as a tentative manual workout
    const optimistic: NormalizedWorkout = {
      date: addForm.date,
      type: addForm.type,
      distance: parseFloat(addForm.distance) * 1.60934 || 0,
      duration: parseInt(addForm.duration) || 0,
      source: "manual",
      isTentative: true,
    };
    setWorkouts((prev) => [...prev, optimistic]);
    setShowAddForm(false);
    setAddForm({ date: "", type: "easy", distance: "", duration: "" });
    setSaving(false);
  };

  const handleOverride = async (workoutId: string) => {
    await fetch("/api/workouts/override", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workoutId }),
    });
    setConflicts((prev) => prev.filter((c) => c.workoutId !== workoutId));
  };

  const handleDismissConflict = async (workoutId: string) => {
    await fetch("/api/workouts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: workoutId, conflictDismissed: true }),
    });
    setConflicts((prev) => prev.filter((c) => c.workoutId !== workoutId));
  };

  if (loading) return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <section className="bg-[#0A0A0A] px-6 py-10">
          <div className="max-w-[1200px] mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Training</p>
            <h1 className="font-black text-4xl uppercase text-white">Schedule</h1>
            <p className="text-[#6B6B6B] text-xs font-mono mt-2">
              Strava syncs automatically · Add planned workouts to optimise your sleep targets
            </p>
          </div>
        </section>

        {/* Conflict strips */}
        {conflicts.length > 0 && (
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
            <div className="max-w-[1200px] mx-auto">
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-800 mb-3">
                Workout Conflicts — Strava and manual entries overlap
              </p>
              <div className="space-y-2">
                {conflicts.map((c) => (
                  <div key={c.workoutId} className="bg-white border border-amber-200 p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-mono text-[#6B6B6B]">{formatDate(c.date)}</p>
                      <p className="text-sm font-bold mt-0.5">
                        Strava: <span className="font-mono">{c.stravaName}</span>
                        <span className="text-[#6B6B6B] mx-2">vs</span>
                        Manual: <span className="font-mono uppercase">{c.manualType}</span>
                      </p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleOverride(c.workoutId)}
                        className="text-xs font-bold uppercase tracking-wider border border-[#0A0A0A] px-3 py-1.5 hover:bg-[#0A0A0A] hover:text-white transition-colors"
                      >
                        Use Manual
                      </button>
                      <button
                        onClick={() => handleDismissConflict(c.workoutId)}
                        className="text-xs font-bold uppercase tracking-wider border border-[#E5E5E5] px-3 py-1.5 text-[#6B6B6B] hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors"
                      >
                        Use Strava
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-[#E5E5E5] px-6">
          <div className="max-w-[1200px] mx-auto flex">
            {(["planned", "past"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-6 py-3 text-xs font-black uppercase tracking-widest transition-colors border-b-2 ${
                  tab === t
                    ? "border-[#0A0A0A] text-[#0A0A0A]"
                    : "border-transparent text-[#6B6B6B] hover:text-[#0A0A0A]"
                }`}
              >
                {t === "planned" ? `Planned (${plannedWorkouts.length})` : `Past (${pastWorkouts.length})`}
              </button>
            ))}
          </div>
        </div>

        {/* PLANNED TAB */}
        {tab === "planned" && (
          <section className="px-6 py-10">
            <div className="max-w-[1200px] mx-auto">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Next 14 Days</p>
                  <h2 className="font-black text-2xl uppercase">Planned Workouts</h2>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
                  + Add Planned
                </Button>
              </div>

              {showAddForm && (
                <FadeUp>
                  <div className="border border-[#E5E5E5] p-6 mb-6">
                    <h3 className="font-black text-sm uppercase tracking-wider mb-4">Add Planned Workout</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <input
                        type="date"
                        value={addForm.date}
                        onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                        className="border border-[#E5E5E5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                      />
                      <select
                        value={addForm.type}
                        onChange={(e) => setAddForm({ ...addForm, type: e.target.value as WorkoutType })}
                        className="border border-[#E5E5E5] px-3 py-2 text-xs font-bold uppercase focus:outline-none focus:border-[#0A0A0A] bg-white"
                      >
                        {getWorkoutTypes(sport).map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        placeholder="Distance (mi)"
                        value={addForm.distance}
                        onChange={(e) => setAddForm({ ...addForm, distance: e.target.value })}
                        className="border border-[#E5E5E5] px-3 py-2 text-sm focus:outline-none focus:border-[#0A0A0A]"
                      />
                      <Button variant="secondary" size="sm" onClick={handleAddPlanned} disabled={!addForm.date || saving}>
                        {saving ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>
                </FadeUp>
              )}

              {plannedWorkouts.length === 0 ? (
                <p className="text-[#6B6B6B] text-sm py-8 text-center border border-dashed border-[#E5E5E5]">
                  No planned workouts yet. Add one above or connect Strava to sync upcoming runs.
                </p>
              ) : (
                <div className="space-y-px bg-[#E5E5E5]">
                  {plannedWorkouts.map((w, i) => (
                    <FadeUp key={`${w.date}-${i}`} delay={i * 30}>
                      <div className="bg-white p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                          <p className="font-mono text-sm text-[#6B6B6B] w-28">{formatDate(w.date)}</p>
                          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 ${LOAD_COLORS[w.type]}`}>
                            {getWorkoutLabel(w.type, sport)}
                          </span>
                          {w.distance > 0 && (
                            <span className="text-xs font-mono text-[#6B6B6B]">{(w.distance).toFixed(1)} km</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <SourceDot source={w.source} />
                          <span className="text-[10px] font-mono uppercase text-[#6B6B6B]">
                            {w.isTentative && w.source === "assumed" ? "est. from load" : w.isTentative ? "planned" : w.source}
                          </span>
                        </div>
                      </div>
                    </FadeUp>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* PAST TAB */}
        {tab === "past" && (
          <section className="px-6 py-10">
            <div className="max-w-[1200px] mx-auto">
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Last 7 Days</p>
                <h2 className="font-black text-2xl uppercase">Activity Log</h2>
              </div>

              {pastWorkouts.length === 0 ? (
                <p className="text-[#6B6B6B] text-sm py-8 text-center border border-dashed border-[#E5E5E5]">
                  No past activities found.{" "}
                  <a href="/strava" className="font-bold text-[#0A0A0A]">Sync Strava →</a>
                </p>
              ) : (
                <div className="space-y-px bg-[#E5E5E5]">
                  {pastWorkouts.map((w, i) => (
                    <FadeUp key={`${w.date}-${i}`} delay={i * 30}>
                      <div className="bg-white p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 flex-1">
                          <p className="font-mono text-sm text-[#6B6B6B] w-28">{formatDate(w.date)}</p>
                          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 ${LOAD_COLORS[w.type]}`}>
                            {getWorkoutLabel(w.type, sport)}
                          </span>
                          {w.distance > 0 && (
                            <span className="text-xs font-mono text-[#6B6B6B]">{(w.distance).toFixed(1)} km</span>
                          )}
                          {w.duration > 0 && (
                            <span className="text-xs font-mono text-[#6B6B6B]">{w.duration} min</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <SourceDot source={w.source} />
                          <span className="text-[10px] font-mono uppercase text-[#6B6B6B]">{w.source}</span>
                          {w.manualOverride && (
                            <span className="text-[10px] font-mono uppercase text-blue-500 ml-1">override</span>
                          )}
                        </div>
                      </div>
                    </FadeUp>
                  ))}
                </div>
              )}

              {/* Legend */}
              <div className="mt-6 flex items-center gap-6">
                <p className="text-xs text-[#6B6B6B] uppercase tracking-wider">Source:</p>
                {(["strava", "manual", "assumed"] as WorkoutSource[]).map((s) => (
                  <div key={s} className="flex items-center gap-1.5">
                    <SourceDot source={s} />
                    <span className="text-xs font-mono text-[#6B6B6B] capitalize">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}
      </motion.div>
    </div>
  );
}
