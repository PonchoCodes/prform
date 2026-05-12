"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { formatTime12h } from "@/lib/sleepAlgorithm";

function parseTimeMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(min: number): string {
  const total = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// Live preview: night before an A race (shift bedtime 30 min earlier at 100%)
function previewRaceBedtime(currentBedTime: string, currentWakeTime: string, agg: number): string {
  const bedMin = parseTimeMin(currentBedTime ?? "22:30");
  const wakeMin = parseTimeMin(currentWakeTime ?? "06:00");
  const baseShift = 30; // full 30-min advance for A race at 100%
  const scaledShift = Math.round(baseShift * agg / 100);
  const wakeShi = wakeMin - scaledShift;
  const sleepNeed = 8 * 60; // base 8h
  return minutesToTime(wakeShi - sleepNeed);
}

// Live preview: after a tempo run (20 min extra at 100%)
function previewTempoExtra(agg: number): number {
  return Math.round(20 * agg / 100);
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stravaStatus, setStravaStatus] = useState<any>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [onboardingAgg, setOnboardingAgg] = useState<number>(85); // original value from onboarding

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([
      fetch("/api/user/profile").then((r) => r.json()),
      fetch("/api/strava/status").then((r) => r.json()),
    ]).then(([profileData, stravaData]) => {
      setProfile(profileData);
      setOnboardingAgg(profileData.planAggressiveness ?? 85);
      setStravaStatus(stravaData);
      setLoading(false);
    });
  }, [status]);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/user/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const update = (key: string, val: any) => setProfile((p: any) => ({ ...p, [key]: val }));

  const handleDisconnectStrava = async () => {
    setDisconnecting(true);
    await fetch("/api/strava/disconnect", { method: "DELETE" });
    setStravaStatus((s: any) => ({ ...s, connected: false }));
    setDisconnecting(false);
  };

  if (loading || !profile) return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="flex items-center justify-center h-64">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading…</p>
      </div>
    </div>
  );

  const agg: number = profile.planAggressiveness ?? 85;
  const raceBedtime100 = previewRaceBedtime(profile.currentBedTime, profile.currentWakeTime, 100);
  const raceBedtimeCurrent = previewRaceBedtime(profile.currentBedTime, profile.currentWakeTime, agg);
  const tempoExtra100 = 20;
  const tempoExtraCurrent = previewTempoExtra(agg);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <section className="bg-[#0A0A0A] px-6 py-10">
          <div className="max-w-[1200px] mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Settings</p>
            <h1 className="font-black text-4xl uppercase text-white">Profile</h1>
          </div>
        </section>

        <div className="max-w-[1200px] mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-2 gap-10">
          {/* Basic Info */}
          <FadeUp>
            <h2 className="font-black text-xl uppercase mb-6 border-b border-[#E5E5E5] pb-3">Athlete Info</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2">Name</label>
                <input
                  type="text"
                  value={profile.name ?? ""}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full border border-[#E5E5E5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2">Age</label>
                <input
                  type="number"
                  value={profile.age ?? ""}
                  onChange={(e) => update("age", parseInt(e.target.value))}
                  className="w-full border border-[#E5E5E5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-3">Biological Sex</label>
                <div className="flex gap-3">
                  {["male", "female", "other"].map((s) => (
                    <button
                      key={s}
                      onClick={() => update("biologicalSex", s)}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                        profile.biologicalSex === s ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-3">Sport</label>
                <div className="flex gap-3">
                  {[{ value: "track", label: "Track & Field" }, { value: "swimming", label: "Swimming" }].map((s) => (
                    <button
                      key={s.value}
                      onClick={() => update("sport", s.value)}
                      className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                        profile.sport === s.value
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
                <label className="block text-xs font-bold uppercase tracking-wider mb-3">Weekly Mileage</label>
                <div className="grid grid-cols-2 gap-3">
                  {["0-30", "30-50", "50-70", "70+"].map((m) => (
                    <button
                      key={m}
                      onClick={() => update("weeklyMileage", m)}
                      className={`py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                        profile.weeklyMileage === m ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                      }`}
                    >
                      {m} mi/wk
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>

          {/* Sleep Settings */}
          <FadeUp delay={80}>
            <h2 className="font-black text-xl uppercase mb-6 border-b border-[#E5E5E5] pb-3">Sleep Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2">Wake Time</label>
                <input
                  type="time"
                  value={profile.currentWakeTime ?? "06:00"}
                  onChange={(e) => update("currentWakeTime", e.target.value)}
                  className="w-full border border-[#E5E5E5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2">Current Bedtime</label>
                <input
                  type="time"
                  value={profile.currentBedTime ?? "22:00"}
                  onChange={(e) => update("currentBedTime", e.target.value)}
                  className="w-full border border-[#E5E5E5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-3">Rest Quality</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "well", label: "Well" },
                    { value: "sometimes", label: "Sometimes" },
                    { value: "rarely", label: "Rarely" },
                  ].map((r) => (
                    <button
                      key={r.value}
                      onClick={() => update("restedFeeling", r.value)}
                      className={`py-3 text-xs font-bold uppercase tracking-wider border transition-colors ${
                        profile.restedFeeling === r.value ? "bg-[#0A0A0A] text-white border-[#0A0A0A]" : "border-[#E5E5E5] hover:border-[#0A0A0A]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Notification Toggles */}
            <h2 className="font-black text-xl uppercase mt-10 mb-6 border-b border-[#E5E5E5] pb-3">Wind-Down Notifications</h2>
            <div className="space-y-3">
              {[
                { key: "notifPhase1", label: "2 hrs before: Dim Lights" },
                { key: "notifPhase2", label: "90 min before: Night Mode" },
                { key: "notifPhase3", label: "30 min before: No Screens" },
                { key: "notifPhase4", label: "15 min before: Lights Off" },
              ].map((phase) => (
                <div key={phase.key} className="flex items-center justify-between border border-[#E5E5E5] p-4">
                  <p className="text-sm font-bold">{phase.label}</p>
                  <button
                    onClick={() => update(phase.key, !profile[phase.key])}
                    className={`w-12 h-6 relative transition-colors ${
                      profile[phase.key] ? "bg-[#0A0A0A]" : "bg-[#E5E5E5]"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 bg-white transition-transform ${
                        profile[phase.key] ? "translate-x-7" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </FadeUp>
        </div>

        {/* Plan Aggressiveness */}
        <div className="max-w-[1200px] mx-auto px-6 pb-10">
          <FadeUp delay={120}>
            <h2 className="font-black text-xl uppercase mb-3 border-b border-[#E5E5E5] pb-3">Plan Aggressiveness</h2>
            <p className="text-xs text-[#6B6B6B] font-mono mb-6 max-w-xl">
              Controls how much PRform shifts your bedtime before races and after hard workouts.
              Higher = closer to the scientific optimum. Lower = more compatible with a busy schedule.
            </p>

            <div className="flex items-center justify-center gap-4 mb-8">
              <button
                onClick={() => update("planAggressiveness", Math.max(50, agg - 5))}
                className="w-12 h-12 border border-[#E5E5E5] text-2xl font-black hover:border-[#0A0A0A] transition-colors"
              >
                −
              </button>
              <div className="text-center min-w-[100px]">
                <p className="font-mono font-black text-6xl leading-none">{agg}<span className="text-3xl">%</span></p>
              </div>
              <button
                onClick={() => update("planAggressiveness", Math.min(100, agg + 5))}
                className="w-12 h-12 border border-[#E5E5E5] text-2xl font-black hover:border-[#0A0A0A] transition-colors"
              >
                +
              </button>
            </div>

            {/* Live preview */}
            <div className="border border-[#E5E5E5] mb-6">
              <div className="border-b border-[#E5E5E5] p-4">
                <p className="text-xs font-bold uppercase tracking-wider mb-2">Night Before an A Race</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-[#6B6B6B] uppercase tracking-wider mb-1">At {agg}%</p>
                    <p className="font-mono font-black text-2xl">{formatTime12h(raceBedtimeCurrent)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#6B6B6B] uppercase tracking-wider mb-1">At 100%</p>
                    <p className="font-mono text-2xl text-[#6B6B6B]">{formatTime12h(raceBedtime100)}</p>
                  </div>
                </div>
              </div>
              <div className="p-4">
                <p className="text-xs font-bold uppercase tracking-wider mb-2">After a Tempo Run</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-[#6B6B6B] uppercase tracking-wider mb-1">At {agg}%</p>
                    <p className="font-mono font-black text-2xl">+{tempoExtraCurrent} min</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[#6B6B6B] uppercase tracking-wider mb-1">At 100%</p>
                    <p className="font-mono text-2xl text-[#6B6B6B]">+{tempoExtra100} min</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full py-3 bg-[#0A0A0A] text-white font-black text-xs uppercase tracking-widest hover:bg-[#333] transition-colors disabled:opacity-50 mb-3"
            >
              {saved ? "✓ Saved" : saving ? "Saving…" : "Save Changes"}
            </button>
            <p className="text-[10px] font-mono text-[#6B6B6B]">
              PRform set this to {onboardingAgg}% based on your experience level.
              The scientific optimum is always 100%.
            </p>
          </FadeUp>
        </div>

        {/* Data Source */}
        <div className="max-w-[1200px] mx-auto px-6 pb-10">
          <FadeUp delay={160}>
            <h2 className="font-black text-xl uppercase mb-6 border-b border-[#E5E5E5] pb-3">Data Source</h2>
            <div className="border border-[#E5E5E5] p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="font-black text-sm uppercase tracking-wider">Strava</p>
                    {stravaStatus?.connected ? (
                      <>
                        <p className="text-xs text-[#6B6B6B] font-mono">{stravaStatus.athleteName ?? "Connected"} · {stravaStatus.totalRuns ?? 0} runs synced</p>
                        {stravaStatus.lastSyncedAt && (
                          <p className="text-xs text-[#6B6B6B] font-mono">Last sync: {new Date(stravaStatus.lastSyncedAt).toLocaleDateString()}</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-[#6B6B6B] font-mono">Not connected — using manual schedule</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {stravaStatus?.connected ? (
                    <>
                      <a href="/strava" className="text-xs font-bold uppercase tracking-wider border border-[#E5E5E5] px-4 py-2 hover:border-[#0A0A0A] transition-colors">
                        Manage →
                      </a>
                      <button
                        onClick={handleDisconnectStrava}
                        disabled={disconnecting}
                        className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] px-4 py-2 border border-[#E5E5E5] hover:border-red-300 hover:text-red-600 transition-colors disabled:opacity-50"
                      >
                        {disconnecting ? "Disconnecting…" : "Disconnect"}
                      </button>
                    </>
                  ) : (
                    <a href="/api/strava/connect">
                      <img
                        src="/strava/btn_strava_connect.png"
                        alt="Connect with Strava"
                        style={{ height: "48px", width: "auto", cursor: "pointer" }}
                      />
                    </a>
                  )}
                </div>
              </div>
              {!stravaStatus?.connected && (
                <p className="mt-4 text-xs text-[#6B6B6B] font-mono bg-[#F5F5F5] px-3 py-2">
                  Without Strava, PRform uses your weekly template + manually logged workouts. Connect Strava to unlock automatic activity sync and performance analysis.
                </p>
              )}
            </div>
          </FadeUp>
        </div>

        {/* Sleep history link */}
        <div className="max-w-[1200px] mx-auto px-6 pb-10">
          <FadeUp delay={180}>
            <div className="border border-[#E5E5E5] p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Sleep Confirmation</p>
                <p className="font-black text-lg uppercase">Sleep History</p>
                <p className="text-xs font-mono text-[#6B6B6B] mt-1">Review and log past nights. Track your consistency streak.</p>
              </div>
              <a href="/sleep-history" className="flex-shrink-0 inline-block border border-[#0A0A0A] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-6 py-2 hover:bg-[#0A0A0A] hover:text-white transition-colors">
                View History →
              </a>
            </div>
          </FadeUp>
        </div>

        <div className="max-w-[1200px] mx-auto px-6 pb-10">
          <Button
            variant="secondary"
            size="lg"
            onClick={handleSave}
            disabled={saving}
            className="min-w-48"
          >
            {saved ? "✓ Saved" : saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </motion.div>
      <Footer />
    </div>
  );
}
