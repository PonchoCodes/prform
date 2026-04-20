"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";

type WorkoutType = "easy" | "moderate" | "tempo" | "long_run" | "track" | "race" | "rest" | "cross_train";

const WORKOUT_TYPES: { value: WorkoutType; label: string; color: string }[] = [
  { value: "rest", label: "Rest", color: "bg-gray-200 text-gray-600" },
  { value: "easy", label: "Easy Run", color: "bg-green-100 text-green-800" },
  { value: "moderate", label: "Moderate", color: "bg-blue-100 text-blue-800" },
  { value: "tempo", label: "Tempo", color: "bg-orange-100 text-orange-800" },
  { value: "long_run", label: "Long Run", color: "bg-purple-100 text-purple-800" },
  { value: "track", label: "Track", color: "bg-red-100 text-red-800" },
  { value: "race", label: "Race", color: "bg-[#E8FF00] text-[#0A0A0A]" },
  { value: "cross_train", label: "Cross Train", color: "bg-teal-100 text-teal-800" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const EFFORT_LABELS = ["", "Easy", "Moderate", "Hard", "Very Hard", "Max"];

export default function SchedulePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ date: "", type: "easy" as WorkoutType, distance: "", duration: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/workouts")
      .then((r) => r.json())
      .then((d) => { setWorkouts(d); setLoading(false); });
  }, [status]);

  const templateWorkouts = workouts.filter((w) => w.isTemplate);
  const oneOffWorkouts = workouts.filter((w) => !w.isTemplate).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const getTypeInfo = (type: WorkoutType) =>
    WORKOUT_TYPES.find((t) => t.value === type) ?? WORKOUT_TYPES[0];

  const handleAddWorkout = async () => {
    setSaving(true);
    const res = await fetch("/api/workouts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addForm, isTemplate: false }),
    });
    const newW = await res.json();
    setWorkouts((prev) => [...prev, newW]);
    setShowAddForm(false);
    setAddForm({ date: "", type: "easy", distance: "", duration: "" });
    setSaving(false);
  };

  const handleEffort = async (id: string, effort: number) => {
    await fetch("/api/workouts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, effort }),
    });
    setWorkouts((prev) => prev.map((w) => w.id === id ? { ...w, effort } : w));
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/workouts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setWorkouts((prev) => prev.filter((w) => w.id !== id));
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
          </div>
        </section>

        <section className="px-6 py-10 border-b border-[#E5E5E5]">
          <div className="max-w-[1200px] mx-auto">
            <FadeUp>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Repeating Template</p>
              <h2 className="font-black text-2xl uppercase mb-6">Weekly Schedule</h2>
            </FadeUp>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-px bg-[#E5E5E5]">
              {DAYS.map((day, i) => {
                const w = templateWorkouts.find((t) => t.dayOfWeek === i);
                const typeInfo = w ? getTypeInfo(w.type) : getTypeInfo("rest");
                return (
                  <FadeUp key={day} delay={i * 50}>
                    <div className="bg-white p-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] mb-3">{day.slice(0, 3)}</p>
                      {w ? (
                        <>
                          <span className={`inline-block text-xs font-bold uppercase tracking-wider px-2 py-1 mb-2 ${typeInfo.color}`}>
                            {typeInfo.label}
                          </span>
                          {w.distance && (
                            <p className="text-xs text-[#6B6B6B] font-mono">{w.distance} mi</p>
                          )}
                        </>
                      ) : (
                        <span className="inline-block text-xs font-bold uppercase tracking-wider px-2 py-1 bg-gray-100 text-gray-500">Rest</span>
                      )}
                    </div>
                  </FadeUp>
                );
              })}
            </div>
          </div>
        </section>

        <section className="px-6 py-10">
          <div className="max-w-[1200px] mx-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">One-Off</p>
                <h2 className="font-black text-2xl uppercase">Logged Workouts</h2>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
                + Add Workout
              </Button>
            </div>

            {showAddForm && (
              <FadeUp>
                <div className="border border-[#E5E5E5] p-6 mb-6">
                  <h3 className="font-black text-sm uppercase tracking-wider mb-4">Add Workout</h3>
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
                      {WORKOUT_TYPES.map((t) => (
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
                    <Button variant="secondary" size="sm" onClick={handleAddWorkout} disabled={!addForm.date || saving}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </FadeUp>
            )}

            {oneOffWorkouts.length === 0 ? (
              <p className="text-[#6B6B6B] text-sm py-8 text-center border border-dashed border-[#E5E5E5]">
                No one-off workouts logged yet.
              </p>
            ) : (
              <div className="space-y-px bg-[#E5E5E5]">
                {oneOffWorkouts.map((w) => {
                  const typeInfo = getTypeInfo(w.type);
                  const isEditing = editingId === w.id;
                  return (
                    <div key={w.id} className="bg-white p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <p className="font-mono text-sm text-[#6B6B6B] w-24">
                          {new Date(w.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </p>
                        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 ${typeInfo.color}`}>
                          {typeInfo.label}
                        </span>
                        {w.distance && (
                          <span className="text-xs font-mono text-[#6B6B6B]">{w.distance} mi</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              onClick={() => handleEffort(w.id, n)}
                              className={`w-6 h-6 text-xs font-bold border transition-colors ${
                                w.effort === n
                                  ? "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                                  : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                              }`}
                            >
                              {n}
                            </button>
                          ))}
                        </div>
                        {w.effort && (
                          <span className="text-xs text-[#6B6B6B] uppercase tracking-wider w-20">{EFFORT_LABELS[w.effort]}</span>
                        )}
                        <button
                          onClick={() => handleDelete(w.id)}
                          className="text-xs text-[#6B6B6B] hover:text-red-600 font-bold uppercase tracking-wider"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </motion.div>
    </div>
  );
}
