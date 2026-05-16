"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { formatTime12h } from "@/lib/sleepAlgorithm";
import {
  parseTimeToSeconds,
  formatSecondsForDisplay,
  formatTimeFromSeconds,
  formatTimeDifference,
  getUnitForEvent,
  getPlaceholderForEvent,
  calculatePerformancePrediction,
} from "@/lib/performancePrediction";
import type { PerformancePrediction } from "@/lib/performancePrediction";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";

const TRACK_EVENTS = [
  "100m", "200m", "400m", "800m", "1500m", "Mile", "3000m", "5000m",
  "10000m", "110m Hurdles", "400m Hurdles", "4x100 Relay", "4x400 Relay",
];

const ROAD_EVENTS = ["5K", "10K", "15K", "Half Marathon", "Marathon"];

const XC_EVENTS = ["3 Mile", "4K", "5K", "6K", "8K"];

function daysUntil(date: Date): number {
  return Math.round((new Date(date).getTime() - Date.now()) / 86400000);
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function buildSleepRamp(meetDate: Date, priority: "A" | "B" | "C", wakeTime: string): { day: string; bedtime: number }[] {
  const [h, m] = wakeTime.split(":").map(Number);
  const wakeMins = h * 60 + m;
  const baseBed = wakeMins - 8 * 60;
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
    return { day: daysOut === 0 ? "Race Day" : `D-${daysOut}`, bedtime: displayH + displayM / 60 };
  });
}

interface Meet {
  id: string;
  name: string;
  date: string;
  distances: string;
  priority: "A" | "B" | "C";
  raceTime: string | null;
  primaryEvent: string | null;
  personalBest: string | null;
  recentBest: string | null;
  personalBestUnit: string | null;
}

interface FormState {
  name: string;
  date: string;
  distances: string;
  priority: "A" | "B" | "C";
  raceTime: string;
  primaryEvent: string;
  personalBest: string;
  recentBest: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  date: "",
  distances: "",
  priority: "A",
  raceTime: "",
  primaryEvent: "",
  personalBest: "",
  recentBest: "",
};

function formatMeetTime(secondsStr: string, unit: string): string {
  const s = parseFloat(secondsStr);
  if (isNaN(s)) return secondsStr;
  if (unit === "seconds") return `${Math.round(s * 10) / 10}s`;
  const mins = Math.floor(s / 60);
  const rem = Math.round((s - mins * 60) * 10) / 10;
  const remInt = Math.floor(rem);
  const remFrac = Math.round((rem - remInt) * 10);
  const remStr = remFrac > 0
    ? `${String(remInt).padStart(2, "0")}.${remFrac}`
    : String(remInt).padStart(2, "0");
  if (mins === 0) return `${rem}s`;
  if (mins < 60) return `${mins}:${remStr}`;
  const h = Math.floor(mins / 60);
  const rm = mins % 60;
  return `${h}:${String(rm).padStart(2, "0")}:${remStr}`;
}

// Per-meet prediction component shown inside the expanded meet row
function MeetPredictionBlock({ prediction }: { prediction: PerformancePrediction }) {
  const pct = prediction.paceChangePct;
  const dotPct = Math.max(2, Math.min(98, (8 - pct) / 13 * 100));
  const isSlower = prediction.timeDifference > 0.5;
  const isFaster = prediction.timeDifference < -0.5;
  const diffColor = isSlower ? "text-[#FF6B6B]" : isFaster ? "text-[#E8FF00]" : "text-[#6B6B6B]";
  const refLabel = prediction.referenceLabel === "Season Best" ? "SB" : "PR";

  return (
    <div className="mt-6">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">
        Performance Prediction
      </p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Predicted</p>
          <p className="font-mono font-black text-2xl">
            {formatTimeFromSeconds(prediction.predictedTime, prediction.unit)}
          </p>
          <p className={`font-mono text-sm mt-0.5 ${diffColor}`}>
            {isSlower || isFaster
              ? `${formatTimeDifference(prediction.timeDifference)} vs ${refLabel}`
              : `On track for ${refLabel}`}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[#6B6B6B] mb-1">Reference</p>
          <p className="font-mono font-black text-2xl">
            {formatTimeFromSeconds(prediction.referenceTime, prediction.unit)}
          </p>
          <p className="text-[10px] font-mono text-[#6B6B6B] mt-0.5">{prediction.referenceLabel}</p>
        </div>
      </div>

      {/* Range bar */}
      <div className="relative w-full h-1.5 mb-1">
        <div className="absolute inset-0 bg-[#1a1a1a]" />
        <div className="absolute top-0 left-0 bottom-0 bg-[#2a0000]" style={{ width: "61.5%" }} />
        <div className="absolute top-0 right-0 bottom-0 bg-[#1a2400]" style={{ width: "38.5%" }} />
        <div className="absolute top-0 bottom-0 w-px bg-[#444]" style={{ left: "61.5%" }} />
        <div
          className="absolute w-2 h-2 bg-white"
          style={{ left: `${dotPct}%`, top: "50%", transform: "translateX(-50%) translateY(-50%)" }}
        />
      </div>
      <div className="flex justify-between text-[9px] font-mono text-[#444] mb-3">
        <span>8% slower</span>
        <span>On track</span>
        <span>5% faster</span>
      </div>

      {prediction.remainingNights > 0 && prediction.potentialImprovementSeconds > 0.5 && (
        <p className="text-[10px] font-mono text-[#6B6B6B]">
          Following PRform&apos;s plan for the next {prediction.remainingNights} night{prediction.remainingNights !== 1 ? "s" : ""} could
          improve your predicted time by up to {Math.round(prediction.potentialImprovementSeconds * 10) / 10}s.
        </p>
      )}
      <p className="text-[9px] font-mono text-[#444] mt-1">
        Based on {prediction.confidenceNights}/{prediction.totalNights} nights of sleep data
        {prediction.isEstimated ? " (estimated)" : ""}
      </p>
    </div>
  );
}

export default function MeetsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [meets, setMeets] = useState<Meet[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editMeet, setEditMeet] = useState<Meet | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<any>(null);
  const [meetPredictions, setMeetPredictions] = useState<Record<string, PerformancePrediction>>({});
  const [autoEditProcessed, setAutoEditProcessed] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/meets").then((r) => r.json()),
      fetch("/api/user/profile").then((r) => r.json()),
      fetch("/api/sleep-plan", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([m, u, sp]) => {
      setMeets(m);
      setUserData(u);
      if (sp.meetPredictions) setMeetPredictions(sp.meetPredictions);
      setLoading(false);
    });
  }, [status]);

  // Auto-open edit form from URL param ?edit=<meetId>
  useEffect(() => {
    if (autoEditProcessed || meets.length === 0 || loading) return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (editId) {
      const meetToEdit = meets.find((m) => m.id === editId);
      if (meetToEdit) openEdit(meetToEdit);
      setAutoEditProcessed(true);
    }
  }, [meets, loading, autoEditProcessed]);

  const handleSave = async () => {
    setSaving(true);
    const unit = form.primaryEvent ? getUnitForEvent(form.primaryEvent) : null;
    const pbSeconds = form.personalBest ? parseTimeToSeconds(form.personalBest) : null;
    const rbSeconds = form.recentBest ? parseTimeToSeconds(form.recentBest) : null;

    const payload = {
      name: form.name,
      date: form.date,
      distances: form.distances,
      priority: form.priority,
      raceTime: form.raceTime || null,
      primaryEvent: form.primaryEvent || null,
      personalBest: pbSeconds !== null ? String(pbSeconds) : null,
      recentBest: rbSeconds !== null ? String(rbSeconds) : null,
      personalBestUnit: unit || null,
    };

    if (editMeet) {
      const res = await fetch("/api/meets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editMeet.id, ...payload }),
      });
      const updated = await res.json();
      setMeets((prev) => prev.map((m) => m.id === editMeet.id ? updated : m));
    } else {
      const res = await fetch("/api/meets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const newMeet = await res.json();
      setMeets((prev) => [...prev, newMeet]);
    }

    // Refresh predictions
    fetch("/api/sleep-plan", { cache: "no-store" })
      .then((r) => r.json())
      .then((sp) => { if (sp.meetPredictions) setMeetPredictions(sp.meetPredictions); });

    setShowForm(false);
    setEditMeet(null);
    setForm(EMPTY_FORM);
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
    const unit = m.personalBestUnit ?? "mmss";
    setEditMeet(m);
    setForm({
      name: m.name,
      date: new Date(m.date).toISOString().split("T")[0],
      distances: m.distances,
      priority: m.priority,
      raceTime: m.raceTime ?? "",
      primaryEvent: m.primaryEvent ?? "",
      personalBest: m.personalBest ? formatSecondsForDisplay(m.personalBest, unit) : "",
      recentBest: m.recentBest ? formatSecondsForDisplay(m.recentBest, unit) : "",
    });
    setShowForm(true);
  };

  const openAdd = () => {
    setEditMeet(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const sortedMeets = [...meets].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const selectedEventUnit = form.primaryEvent ? getUnitForEvent(form.primaryEvent) : null;
  const pbPlaceholder = form.primaryEvent ? getPlaceholderForEvent(form.primaryEvent) : "Select an event first";

  if (loading) return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <Navbar />
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Loading…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <Navbar />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <section className="bg-[#0A0A0A] px-6 py-10">
          <div className="max-w-[1200px] mx-auto flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Race Calendar</p>
              <h1 className="font-black text-4xl uppercase text-white">Meets</h1>
            </div>
            <Button variant="primary" size="sm" onClick={openAdd}>+ Add Meet</Button>
          </div>
        </section>

        {showForm && (
          <section className="px-6 py-6 border-b border-[#E5E5E5] dark:border-[#333] bg-[#F9F9F9] dark:bg-[#1a1a1a]">
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
                  className="border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] bg-white dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
                />
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] bg-white dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
                />
                <div>
                  <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Race Time</label>
                  <input
                    type="time"
                    value={form.raceTime}
                    onChange={(e) => setForm({ ...form, raceTime: e.target.value })}
                    className="w-full border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] bg-white dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Distances (e.g. 5K, 10K)"
                  value={form.distances}
                  onChange={(e) => setForm({ ...form, distances: e.target.value })}
                  className="border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] bg-white dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
                />
              </div>

              {/* Primary Event */}
              <div className="mt-4">
                <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Primary Event</label>
                <select
                  value={form.primaryEvent}
                  onChange={(e) => setForm({ ...form, primaryEvent: e.target.value, personalBest: "", recentBest: "" })}
                  className="w-full border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] bg-white dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
                >
                  <option value="">Select your event</option>
                  <optgroup label="TRACK">
                    {TRACK_EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </optgroup>
                  <optgroup label="ROAD">
                    {ROAD_EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </optgroup>
                  <optgroup label="CROSS COUNTRY">
                    {XC_EVENTS.map((e) => <option key={e} value={e}>{e}</option>)}
                  </optgroup>
                </select>
              </div>

              {/* Personal Best + Recent Best — shown once event is selected */}
              {form.primaryEvent && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Personal Best</label>
                    <input
                      type="text"
                      placeholder={pbPlaceholder}
                      value={form.personalBest}
                      onChange={(e) => setForm({ ...form, personalBest: e.target.value })}
                      className="w-full border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] bg-white dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
                    />
                    <p className="text-[10px] text-[#6B6B6B] mt-1">Your all-time best</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Recent Best</label>
                    <input
                      type="text"
                      placeholder={pbPlaceholder}
                      value={form.recentBest}
                      onChange={(e) => setForm({ ...form, recentBest: e.target.value })}
                      className="w-full border border-[#E5E5E5] dark:border-[#444] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] bg-white dark:bg-[#2a2a2a] dark:text-[#F5F5F5]"
                    />
                    <p className="text-[10px] text-[#6B6B6B] mt-1">Your best in the last 90 days. Leave blank if same as PR.</p>
                  </div>
                </div>
              )}

              {/* Priority */}
              <div className="mt-4">
                <label className="block text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Priority</label>
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
                          : "bg-white dark:bg-[#2a2a2a] border-[#E5E5E5] dark:border-[#444] hover:border-[#0A0A0A] dark:text-[#F5F5F5]"
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
                <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditMeet(null); setForm(EMPTY_FORM); }}>
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
                <Button variant="secondary" size="sm" onClick={openAdd}>Add Your First Meet</Button>
              </div>
            ) : (
              <div className="space-y-px bg-[#E5E5E5]">
                {sortedMeets.map((m) => {
                  const days = daysUntil(new Date(m.date));
                  const isPast = days < 0;
                  const isExpanded = expandedId === m.id;
                  const rampData = buildSleepRamp(new Date(m.date), m.priority, userData?.currentWakeTime ?? "06:00");
                  const prediction = meetPredictions[m.id] ?? null;
                  const hasPrediction = !!prediction;
                  const hasEventData = !!m.primaryEvent;
                  const hasRefTime = !!(m.recentBest || m.personalBest);
                  const unit = m.personalBestUnit ?? "mmss";

                  return (
                    <FadeUp key={m.id}>
                      <div className="bg-white dark:bg-[#242424]">
                        <div
                          className="p-5 flex items-center justify-between gap-4 cursor-pointer hover:bg-[#F9F9F9] dark:hover:bg-[#2a2a2a] transition-colors"
                          onClick={() => setExpandedId(isExpanded ? null : m.id)}
                        >
                          <div className="flex items-center gap-4 flex-1">
                            <Badge label={m.priority} variant={m.priority as "A" | "B" | "C"} />
                            <div>
                              <p className="font-black text-base">{m.name}</p>
                              <p className="text-xs text-[#6B6B6B]">{formatDate(new Date(m.date))} · {m.distances}</p>
                              {m.primaryEvent && (
                                <p className="text-xs font-mono text-[#6B6B6B] mt-0.5">
                                  {m.primaryEvent}
                                  {m.personalBest && ` · PR: ${formatMeetTime(m.personalBest, unit)}`}
                                  {m.recentBest && ` · SB: ${formatMeetTime(m.recentBest, unit)}`}
                                </p>
                              )}
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
                            className="border-t border-[#E5E5E5] dark:border-[#333] p-6"
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
                                      const mn = Math.round((v - h) * 60);
                                      const period = h >= 12 ? "PM" : "AM";
                                      const h12 = h % 12 || 12;
                                      return `${h12}:${String(mn).padStart(2, "0")}`;
                                    }}
                                  />
                                  <Tooltip
                                    formatter={(value: any) => {
                                      const h = Math.floor(value);
                                      const mn = Math.round((value - h) * 60);
                                      const period = h >= 12 ? "PM" : "AM";
                                      const h12 = h % 12 || 12;
                                      return [`${h12}:${String(mn).padStart(2, "0")} ${period}`, "Bedtime"];
                                    }}
                                    contentStyle={{ border: "1px solid #E5E5E5", borderRadius: 0, fontFamily: "JetBrains Mono", fontSize: 11 }}
                                  />
                                  <ReferenceLine
                                    y={rampData[9].bedtime}
                                    stroke="#6B6B6B"
                                    strokeDasharray="4 4"
                                    strokeOpacity={0.7}
                                    label={{ value: "TARGET", position: "insideTopRight", fontSize: 9, fontFamily: "JetBrains Mono", fill: "#6B6B6B" }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="bedtime"
                                    stroke="#0A0A0A"
                                    strokeWidth={2}
                                    dot={{ fill: "#0A0A0A", stroke: "#FFFFFF", strokeWidth: 1, r: 3 }}
                                    activeDot={{ r: 5, fill: "#FFFFFF", stroke: "#0A0A0A", strokeWidth: 2 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            </div>
                            <p className="text-xs text-[#6B6B6B] mt-3">
                              Bedtime shifts earlier each phase to prime your circadian rhythm for peak output on race day.
                            </p>

                            {/* Performance Prediction */}
                            {hasPrediction ? (
                              <MeetPredictionBlock prediction={prediction} />
                            ) : hasEventData && !hasRefTime ? (
                              <div className="mt-6">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Performance Prediction</p>
                                <p className="text-xs text-[#6B6B6B] font-mono mb-3">Add your PR or season best to unlock your prediction.</p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                                  className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-[#0A0A0A] px-3 py-2 border border-[#E5E5E5] hover:border-[#0A0A0A] transition-colors"
                                >
                                  ADD TIMES →
                                </button>
                              </div>
                            ) : !hasEventData ? (
                              <div className="mt-6">
                                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Performance Prediction</p>
                                <p className="text-xs text-[#6B6B6B] font-mono mb-3">Add your event and PR to unlock your performance prediction.</p>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEdit(m); }}
                                  className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-[#0A0A0A] px-3 py-2 border border-[#E5E5E5] hover:border-[#0A0A0A] transition-colors"
                                >
                                  ADD EVENT + PR →
                                </button>
                              </div>
                            ) : null}
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
      <Footer />
    </div>
  );
}
