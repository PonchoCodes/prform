"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatTime12h } from "@/lib/sleepAlgorithm";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";

function daysUntil(date: Date): number {
  return Math.round((new Date(date).getTime() - Date.now()) / 86400000);
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function buildSleepRamp(meetDate: Date, priority: "A" | "B" | "C", wakeTime: string): { day: string; bedtime: number }[] {
  const [h, m] = wakeTime.split(":").map(Number);
  const wakeMins = h * 60 + m;
  const baseBed = wakeMins - 8 * 60; // approximate base

  const mult = priority === "A" ? 1 : priority === "B" ? 0.75 : 0.5;

  return Array.from({ length: 11 }, (_, i) => {
    const daysOut = 10 - i;
    let shift = 0;
    if (daysOut >= 8 && daysOut <= 10) shift = 15 * mult;
    else if (daysOut >= 5 && daysOut <= 7) shift = 30 * mult;
    else if (daysOut >= 2 && daysOut <= 4) shift = 45 * mult;
    else if (daysOut === 1) shift = 60 * mult;

    const bedMins = baseBed - shift;
    const displayH = Math.floor(((bedMins % 1440) + 1440) % 1440 / 60);
    const displayM = ((bedMins % 1440) + 1440) % 1440 % 60;

    return {
      day: daysOut === 0 ? "Race Day" : `D-${daysOut}`,
      bedtime: displayH + displayM / 60,
    };
  });
}

interface Meet {
  id: string;
  name: string;
  date: string;
  distances: string;
  priority: "A" | "B" | "C";
  raceTime: string | null;
}

export default function MeetsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editMeet, setEditMeet] = useState<Meet | null>(null);
  const [form, setForm] = useState({ name: "", date: "", distances: "", priority: "A" as "A" | "B" | "C", raceTime: "" });
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<any>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/meets").then((r) => r.json()),
      fetch("/api/user/profile").then((r) => r.json()),
    ]).then(([m, u]) => {
      setMeets(m);
      setUserData(u);
      setLoading(false);
    });
  }, [status]);

  const handleSave = async () => {
    setSaving(true);
    if (editMeet) {
      const res = await fetch("/api/meets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editMeet.id, ...form }),
      });
      const updated = await res.json();
      setMeets((prev) => prev.map((m) => m.id === editMeet.id ? updated : m));
    } else {
      const res = await fetch("/api/meets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const newMeet = await res.json();
      setMeets((prev) => [...prev, newMeet]);
    }
    setShowForm(false);
    setEditMeet(null);
    setForm({ name: "", date: "", distances: "", priority: "A", raceTime: "" });
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/meets", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setMeets((prev) => prev.filter((m) => m.id !== id));
  };

  const openEdit = (m: Meet) => {
    setEditMeet(m);
    setForm({
      name: m.name,
      date: new Date(m.date).toISOString().split("T")[0],
      distances: m.distances,
      priority: m.priority,
      raceTime: m.raceTime ?? "",
    });
    setShowForm(true);
  };

  const sortedMeets = [...meets].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
          <div className="max-w-[1200px] mx-auto flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Race Calendar</p>
              <h1 className="font-black text-4xl uppercase text-white">Meets</h1>
            </div>
            <Button variant="primary" size="sm" onClick={() => { setShowForm(!showForm); setEditMeet(null); setForm({ name: "", date: "", distances: "", priority: "A", raceTime: "" }); }}>
              + Add Meet
            </Button>
          </div>
        </section>

        {showForm && (
          <section className="px-6 py-6 border-b border-[#E5E5E5] bg-[#F9F9F9]">
            <div className="max-w-[1200px] mx-auto">
              <h3 className="font-black text-sm uppercase tracking-wider mb-4">
                {editMeet ? "Edit Meet" : "New Meet"}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Meet name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="border border-[#E5E5E5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] bg-white"
                />
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="border border-[#E5E5E5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] bg-white"
                />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Race Time</label>
                  <input
                    type="time"
                    value={form.raceTime}
                    onChange={(e) => setForm({ ...form, raceTime: e.target.value })}
                    className="w-full border border-[#E5E5E5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] bg-white"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Distances (e.g. 5K, 10K)"
                  value={form.distances}
                  onChange={(e) => setForm({ ...form, distances: e.target.value })}
                  className="border border-[#E5E5E5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] bg-white"
                />
                <div className="flex gap-3">
                  {(["A", "B", "C"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setForm({ ...form, priority: p })}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                        form.priority === p
                          ? p === "A"
                            ? "bg-[#E8FF00] text-[#0A0A0A] border-[#E8FF00]"
                            : "bg-[#0A0A0A] text-white border-[#0A0A0A]"
                          : "bg-white border-[#E5E5E5] hover:border-[#0A0A0A]"
                      }`}
                    >
                      {p} Race
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-4">
                <Button variant="secondary" size="sm" onClick={handleSave} disabled={!form.name || !form.date || saving}>
                  {saving ? "Saving..." : editMeet ? "Update" : "Add Meet"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditMeet(null); setForm({ name: "", date: "", distances: "", priority: "A", raceTime: "" }); }}>
                  Cancel
                </Button>
              </div>
            </div>
          </section>
        )}

        <section className="px-6 py-10">
          <div className="max-w-[1200px] mx-auto">
            {sortedMeets.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-[#E5E5E5]">
                <p className="text-[#6B6B6B] text-sm mb-4">No meets scheduled yet.</p>
                <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>Add Your First Meet</Button>
              </div>
            ) : (
              <div className="space-y-px bg-[#E5E5E5]">
                {sortedMeets.map((m) => {
                  const days = daysUntil(new Date(m.date));
                  const isPast = days < 0;
                  const isExpanded = expandedId === m.id;
                  const rampData = buildSleepRamp(new Date(m.date), m.priority, userData?.currentWakeTime ?? "06:00");

                  return (
                    <FadeUp key={m.id}>
                      <div className="bg-white">
                        <div
                          className="p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F9F9F9] transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <Badge label={m.priority} variant={m.priority as "A" | "B" | "C"} />
                            <div>
                              <p className="font-black text-base">{m.name}</p>
                              <p className="text-xs text-[#6B6B6B]">{formatDate(new Date(m.date))} · {m.distances}</p>
                              {m.raceTime ? (
                                <p className="text-xs font-mono text-[#6B6B6B] mt-0.5">RACE TIME: {formatTime12h(m.raceTime)}</p>
                              ) : (
                                <p className="text-xs font-mono text-[#AAAAAA] mt-0.5">RACE TIME: NOT SET</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {isPast ? (
                              <span className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B]">Past</span>
                            ) : (
                              <div className="text-right">
                                <span className="font-mono font-black text-2xl">{days}</span>
                                <span className="text-xs text-[#6B6B6B] uppercase ml-1">days</span>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                                className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-[#0A0A0A] px-2 py-1 border border-[#E5E5E5] hover:border-[#0A0A0A] transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                                className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-red-600 px-2 py-1 border border-[#E5E5E5] hover:border-red-300 transition-colors"
                              >
                                ×
                              </button>
                            </div>
                            <span className="text-[#6B6B6B] text-sm">{isExpanded ? "▲" : "▼"}</span>
                          </div>
                        </div>

                        {isExpanded && !isPast && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="border-t border-[#E5E5E5] p-6"
                          >
                            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">
                              Sleep Ramp: 10 Days to Race Day
                            </p>
                            <div className="h-48">
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={rampData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E5E5" />
                                  <XAxis dataKey="day" tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
                                  <YAxis
                                    domain={["auto", "auto"]}
                                    tick={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
                                    tickFormatter={(v) => {
                                      const h = Math.floor(v);
                                      const m = Math.round((v - h) * 60);
                                      const period = h >= 12 ? "PM" : "AM";
                                      const h12 = h % 12 || 12;
                                      return `${h12}:${String(m).padStart(2, "0")}`;
                                    }}
                                  />
                                  <Tooltip
                                    formatter={(value: any) => {
                                      const h = Math.floor(value);
                                      const m = Math.round((value - h) * 60);
                                      const period = h >= 12 ? "PM" : "AM";
                                      const h12 = h % 12 || 12;
                                      return [`${h12}:${String(m).padStart(2, "0")} ${period}`, "Bedtime"];
                                    }}
                                    contentStyle={{ border: "1px solid #E5E5E5", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 11 }}
                                  />
                                  <ReferenceLine
                                    y={rampData[9].bedtime}
                                    stroke="#E8FF00"
                                    strokeDasharray="4 4"
                                    strokeOpacity={0.5}
                                    label={{ value: "TARGET", position: "insideTopRight", fontSize: 9, fontFamily: "JetBrains Mono", fill: "#E8FF00" }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="bedtime"
                                    stroke="#E8FF00"
                                    strokeWidth={2}
                                    dot={{ fill: "#0A0A0A", r: 3 }}
                                    activeDot={{ r: 5, fill: "#E8FF00" }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-[#6B6B6B] mt-3">
                              Bedtime shifts earlier each phase to prime your circadian rhythm for peak output on race day.
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </FadeUp>
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
