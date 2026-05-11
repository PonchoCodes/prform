"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Navbar } from "@/components/Navbar";
import { FadeUp } from "@/components/FadeUp";

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatPace(speedMs: number): string {
  if (!speedMs || speedMs <= 0) return "--";
  const secPerKm = 1000 / speedMs;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function formatDist(m: number): string {
  return (m / 1000).toFixed(2) + " km";
}

export default function StravaPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [justConnected, setJustConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [statusData, setStatusData] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setJustConnected(params.get("connected") === "1");
    setConnectionError(params.get("error") ?? null);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const loadStatus = () => {
    if (status !== "authenticated") return;
    fetch("/api/strava/status")
      .then((r) => r.json())
      .then(setStatusData);
  };

  useEffect(loadStatus, [status]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    const res = await fetch("/api/strava/sync", { method: "POST" });
    const data = await res.json();
    setSyncResult(data.synced != null ? `Synced ${data.synced} new runs.` : "Sync failed.");
    setSyncing(false);
    loadStatus();
  };

  const handleDisconnect = async () => {
    setDisconnecting(true);
    await fetch("/api/strava/status", { method: "DELETE" });
    setDisconnecting(false);
    loadStatus();
  };

  if (status === "loading" || !statusData) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B]">Loading...</p>
      </div>
    );
  }

  const connected = statusData.connected;

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <section className="bg-[#0A0A0A] text-white px-6 py-10 border-b border-[#222]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Integrations</p>
          <h1 className="font-black text-4xl md:text-5xl uppercase leading-none">Strava Connection</h1>
          <p className="text-[#6B6B6B] text-sm mt-3 font-mono">Sync your runs to unlock performance analysis.</p>
        </div>
      </section>

      {justConnected && (
        <div className="bg-[#E8FF00] px-6 py-3">
          <p className="max-w-[1200px] mx-auto text-xs font-bold uppercase tracking-wider text-[#0A0A0A]">
            Strava connected. Sync your activities below.
          </p>
        </div>
      )}

      {connectionError && (
        <div className="bg-red-100 px-6 py-3">
          <p className="max-w-[1200px] mx-auto text-xs font-bold uppercase tracking-wider text-red-700">
            Connection failed ({connectionError}). Please try again.
          </p>
        </div>
      )}

      <div className="max-w-[1200px] mx-auto px-6 py-10">
        {!connected ? (
          <FadeUp>
            <div className="border border-[#E5E5E5] p-10 flex flex-col items-center text-center max-w-lg mx-auto">
              <div className="w-12 h-12 bg-[#FC4C02] mb-6 flex items-center justify-center">
                <span className="text-white font-black text-xl">S</span>
              </div>
              <h2 className="font-black text-2xl uppercase mb-3">Connect Strava</h2>
              <p className="text-sm text-[#6B6B6B] mb-8">
                Link your Strava account to sync your runs and unlock the performance analysis engine.
              </p>
              <a
                href="/api/strava/connect"
                className="inline-block bg-[#E8FF00] text-[#0A0A0A] font-black text-sm uppercase tracking-widest px-8 py-3 hover:bg-[#d4e800] transition-colors"
              >
                Connect Strava
              </a>
            </div>
          </FadeUp>
        ) : (
          <>
            <FadeUp>
              <div className="border border-[#E5E5E5] p-6 mb-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Connected Account</p>
                    <p className="font-black text-xl">{statusData.athleteName ?? "Strava Athlete"}</p>
                    <p className="font-mono text-sm text-[#6B6B6B] mt-1">
                      {statusData.totalRuns} runs synced
                    </p>
                    {statusData.lastSyncedAt && (
                      <p className="font-mono text-xs text-[#6B6B6B] mt-0.5">
                        Last sync: {new Date(statusData.lastSyncedAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleSync}
                      disabled={syncing}
                      className="bg-[#E8FF00] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-6 py-2 hover:bg-[#d4e800] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {syncing ? (
                        <>
                          <span className="inline-block w-3 h-3 border-2 border-[#0A0A0A] border-t-transparent rounded-full animate-spin" />
                          Syncing…
                        </>
                      ) : "Sync Now"}
                    </button>
                    <button
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                      className="border border-[#E5E5E5] text-[#6B6B6B] font-bold text-xs uppercase tracking-widest px-6 py-2 hover:border-[#0A0A0A] hover:text-[#0A0A0A] transition-colors disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  </div>
                </div>
                {syncResult && (
                  <p className="mt-4 font-mono text-xs text-[#6B6B6B] border-l-2 border-[#E8FF00] pl-3">{syncResult}</p>
                )}
              </div>
            </FadeUp>

            <FadeUp delay={80}>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-4">Recent Activities</p>
              <div className="border border-[#E5E5E5]">
                <div className="grid grid-cols-6 gap-px bg-[#E5E5E5] text-xs font-bold uppercase tracking-wider text-[#6B6B6B]">
                  <div className="bg-white px-4 py-2">Date</div>
                  <div className="bg-white px-4 py-2 col-span-2">Name</div>
                  <div className="bg-white px-4 py-2">Distance</div>
                  <div className="bg-white px-4 py-2">Pace</div>
                  <div className="bg-white px-4 py-2">Avg HR</div>
                </div>
                {statusData.recentActivities?.length ? (
                  statusData.recentActivities.map((act: any) => (
                    <div key={act.stravaId} className="grid grid-cols-6 gap-px bg-[#E5E5E5] border-t border-[#E5E5E5]">
                      <div className="bg-white px-4 py-3 font-mono text-xs text-[#6B6B6B]">{formatDate(act.startDate)}</div>
                      <div className="bg-white px-4 py-3 font-mono text-xs col-span-2 truncate">{act.name}</div>
                      <div className="bg-white px-4 py-3 font-mono text-xs">{formatDist(act.distance)}</div>
                      <div className="bg-white px-4 py-3 font-mono text-xs">{formatPace(act.averageSpeed)}</div>
                      <div className="bg-white px-4 py-3 font-mono text-xs">{act.averageHeartrate ? `${Math.round(act.averageHeartrate)} bpm` : "—"}</div>
                    </div>
                  ))
                ) : (
                  <div className="bg-white px-4 py-6 text-center text-xs text-[#6B6B6B] font-mono">
                    No activities yet. Click &ldquo;Sync Now&rdquo; to import your runs.
                  </div>
                )}
              </div>
            </FadeUp>

            <FadeUp delay={160} className="mt-8">
              <a
                href="/analysis"
                className="inline-block border border-[#0A0A0A] text-[#0A0A0A] font-black text-xs uppercase tracking-widest px-8 py-3 hover:bg-[#0A0A0A] hover:text-white transition-colors"
              >
                View Performance Analysis →
              </a>
            </FadeUp>
          </>
        )}
      </div>
    </div>
  );
}
