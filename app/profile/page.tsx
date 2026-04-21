"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/Button";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/user/profile")
      .then((r) => r.json())
      .then((d) => { setProfile(d); setLoading(false); });
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

  if (loading || !profile) return (
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
    </div>
  );
}
