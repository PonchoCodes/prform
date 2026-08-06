"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { TEAM_CONSENT_TEXT, COACH_VISIBILITY_NOTE } from "@/lib/team/consent";

// One page, both sides of the relationship.
//
// Athlete side: join with a code — past the consent screen — see your teams,
// leave. Coach side: create a team, hand out the code, and read the exception
// list. The exception list is all a coach ever gets: colors, counts and a
// recommendation, never times. That promise is made at consent and kept by
// the API; this page just renders it.

type SessionType =
  | "easy" | "moderate" | "tempo" | "long_run" | "track" | "race" | "rest" | "cross_train";

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: "easy", label: "Easy Run" },
  { value: "moderate", label: "Moderate" },
  { value: "tempo", label: "Tempo" },
  { value: "long_run", label: "Long Run" },
  { value: "track", label: "Track" },
  { value: "race", label: "Race" },
  { value: "rest", label: "Rest" },
  { value: "cross_train", label: "Cross Train" },
];

interface CoachedTeam {
  id: string;
  name: string;
  season: string | null;
  joinCode: string;
  joinCodeExpiresAt: string;
  athleteCount: number;
}

interface Membership {
  id: string;
  joinedAt: string;
  team: { id: string; name: string; season: string | null };
}

interface ExceptionEntry {
  name: string;
  color: "amber" | "red";
  trend: string;
  recommendation: string;
}

interface ExceptionsPayload {
  teamName: string;
  rosterSize: number;
  onTrack: number;
  exceptions: ExceptionEntry[];
}

interface PlannedSessionRow {
  id: string;
  date: string;
  sessionType: SessionType;
  description: string | null;
  targetPaces: string | null;
}

const INPUT =
  "border border-[#E5E5E5] dark:border-[#333] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function TeamPage() {
  const { status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [coached, setCoached] = useState<CoachedTeam[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);

  // Join flow
  const [joinCode, setJoinCode] = useState("");
  const [showConsent, setShowConsent] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Create-team flow
  const [showCreate, setShowCreate] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [teamSeason, setTeamSeason] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/teams");
    if (!res.ok) return;
    const data = await res.json();
    setCoached(data.coached ?? []);
    setMemberships(data.memberships ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (status === "authenticated") refresh();
  }, [status, refresh]);

  const handleJoin = async () => {
    setJoinBusy(true);
    setJoinError(null);
    const res = await fetch("/api/teams/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: joinCode, consent: consentChecked }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setJoinError(data.error ?? "That didn't work. Try again.");
    } else {
      setJoinCode("");
      setShowConsent(false);
      setConsentChecked(false);
      await refresh();
    }
    setJoinBusy(false);
  };

  const handleLeave = async (teamId: string) => {
    await fetch("/api/teams/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId }),
    });
    await refresh();
  };

  const handleCreate = async () => {
    setCreateBusy(true);
    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: teamName, season: teamSeason }),
    });
    if (res.ok) {
      setTeamName("");
      setTeamSeason("");
      setShowCreate(false);
      await refresh();
    }
    setCreateBusy(false);
  };

  if (loading && status !== "unauthenticated") {
    return (
      <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
        <Navbar />
        <div className="flex items-center justify-center h-64">
          <p className="font-mono text-sm uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a]">
      <Navbar />
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
        <section className="bg-[#0A0A0A] px-6 py-10">
          <div className="max-w-[1200px] mx-auto">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-2">Roster</p>
            <h1 className="font-black text-4xl uppercase text-white">Team</h1>
            <p className="text-[#6B6B6B] text-xs font-mono mt-2">
              Athletes join themselves with a code. Coaches see readiness — never sleep data.
            </p>
          </div>
        </section>

        <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-14">
          {/* ── Athlete side ─────────────────────────────────────────────── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Athlete</p>
            <h2 className="font-black text-2xl uppercase mb-6">Your Teams</h2>

            {memberships.length > 0 && (
              <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333] mb-6">
                {memberships.map((m) => (
                  <div key={m.id} className="bg-white dark:bg-[#242424] p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-sm uppercase tracking-wider">{m.team.name}</p>
                      <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
                        {m.team.season ?? "Current season"} · joined {formatDate(m.joinedAt)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleLeave(m.team.id)}
                      className="text-[10px] font-bold uppercase tracking-wider border border-[#E5E5E5] dark:border-[#333] px-2 py-0.5 text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors"
                    >
                      Leave team
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!showConsent ? (
              <div className="border border-[#E5E5E5] dark:border-[#333] p-6 max-w-lg">
                <h3 className="font-black text-sm uppercase tracking-wider mb-1">Join a Team</h3>
                <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
                  Your coach gives you a 6-character code. Only you can add yourself.
                </p>
                <div className="flex gap-3">
                  <input
                    type="text"
                    placeholder="e.g. KM29TR"
                    aria-label="Join code"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    maxLength={8}
                    className={`${INPUT} flex-1 uppercase tracking-[0.2em]`}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => joinCode.trim() && setShowConsent(true)}
                    disabled={!joinCode.trim()}
                  >
                    Continue →
                  </Button>
                </div>
                {joinError && <p className="text-xs font-mono text-[#FF4444] mt-3">{joinError}</p>}
              </div>
            ) : (
              <FadeUp>
                <div className="border-2 border-[#0A0A0A] dark:border-[#F5F5F5] p-6 max-w-lg">
                  <h3 className="font-black text-sm uppercase tracking-wider mb-4">
                    Before you join — what your coach sees
                  </h3>
                  <pre className="whitespace-pre-wrap text-xs font-mono text-[#0A0A0A] dark:text-[#F5F5F5] border border-[#E5E5E5] dark:border-[#333] p-4 mb-4 max-h-72 overflow-y-auto">
                    {TEAM_CONSENT_TEXT}
                  </pre>
                  <label className="flex items-start gap-3 mb-4 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentChecked}
                      onChange={(e) => setConsentChecked(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="text-xs font-mono">I understand and agree.</span>
                  </label>
                  {joinError && <p className="text-xs font-mono text-[#FF4444] mb-3">{joinError}</p>}
                  <div className="flex gap-3">
                    <Button variant="ghost" size="sm" onClick={() => { setShowConsent(false); setJoinError(null); }}>
                      Back
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleJoin} disabled={!consentChecked || joinBusy}>
                      {joinBusy ? "Joining…" : "Join team"}
                    </Button>
                  </div>
                </div>
              </FadeUp>
            )}
          </section>

          {/* ── Coach side ───────────────────────────────────────────────── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Coach</p>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-black text-2xl uppercase">Teams You Coach</h2>
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(!showCreate)}>
                + New Team
              </Button>
            </div>
            <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-6 max-w-2xl">{COACH_VISIBILITY_NOTE}</p>

            {showCreate && (
              <FadeUp>
                <div className="border border-[#E5E5E5] dark:border-[#333] p-6 mb-6 max-w-lg">
                  <h3 className="font-black text-sm uppercase tracking-wider mb-4">Create a Team</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Team name"
                      aria-label="Team name"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      className={`${INPUT} w-full`}
                    />
                    <input
                      type="text"
                      placeholder="Season (optional — e.g. Outdoor 2027)"
                      aria-label="Season"
                      value={teamSeason}
                      onChange={(e) => setTeamSeason(e.target.value)}
                      className={`${INPUT} w-full`}
                    />
                    <Button variant="primary" size="sm" onClick={handleCreate} disabled={teamName.trim().length < 2 || createBusy}>
                      {createBusy ? "Creating…" : "Create — get a join code"}
                    </Button>
                  </div>
                </div>
              </FadeUp>
            )}

            {coached.length === 0 && !showCreate ? (
              <p className="text-[#6B6B6B] dark:text-[#A0A0A0] text-sm py-8 text-center border border-dashed border-[#E5E5E5] dark:border-[#333]">
                You don&apos;t coach a team yet. Create one and hand the code to your athletes.
              </p>
            ) : (
              <div className="space-y-8">
                {coached.map((team) => (
                  <CoachTeamPanel key={team.id} team={team} onCodeRotated={refresh} />
                ))}
              </div>
            )}
          </section>
        </div>
      </motion.div>
      <Footer />
    </div>
  );
}

// ── coach panel: join code, exception list, planned sessions ────────────────

function CoachTeamPanel({ team, onCodeRotated }: { team: CoachedTeam; onCodeRotated: () => Promise<void> }) {
  const [exceptions, setExceptions] = useState<ExceptionsPayload | null>(null);
  const [sessions, setSessions] = useState<PlannedSessionRow[]>([]);
  const [rotating, setRotating] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    date: "",
    sessionType: "easy" as SessionType,
    description: "",
    targetPaces: "",
  });
  const [savingSession, setSavingSession] = useState(false);

  const load = useCallback(async () => {
    const [excRes, sesRes] = await Promise.all([
      fetch(`/api/teams/${team.id}/exceptions`),
      fetch(`/api/teams/${team.id}/sessions`),
    ]);
    if (excRes.ok) setExceptions(await excRes.json());
    if (sesRes.ok) setSessions((await sesRes.json()).sessions ?? []);
  }, [team.id]);

  useEffect(() => {
    load();
  }, [load]);

  const rotateCode = async () => {
    setRotating(true);
    await fetch(`/api/teams/${team.id}/join-code`, { method: "POST" });
    await onCodeRotated();
    setRotating(false);
  };

  const addSession = async () => {
    if (!sessionForm.date) return;
    setSavingSession(true);
    const res = await fetch(`/api/teams/${team.id}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sessionForm),
    });
    if (res.ok) {
      setSessionForm({ date: "", sessionType: "easy", description: "", targetPaces: "" });
      await load();
    }
    setSavingSession(false);
  };

  const removeSession = async (id: string) => {
    await fetch(`/api/teams/${team.id}/sessions`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  };

  const codeExpired = new Date(team.joinCodeExpiresAt) < new Date();

  return (
    <div className="border border-[#E5E5E5] dark:border-[#333]">
      {/* Header: name + join code */}
      <div className="border-b border-[#E5E5E5] dark:border-[#333] p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="font-black text-lg uppercase">{team.name}</h3>
          <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
            {team.season ?? "Current season"} · {team.athleteCount} athlete{team.athleteCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">Join code</p>
            <p className={`font-mono text-xl tracking-[0.3em] ${codeExpired ? "line-through text-[#6B6B6B]" : ""}`}>
              {team.joinCode}
            </p>
            <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
              {codeExpired ? "expired" : `works until ${formatDate(team.joinCodeExpiresAt)}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={rotateCode} disabled={rotating}>
            {rotating ? "…" : "New code"}
          </Button>
        </div>
      </div>

      {/* Exception list */}
      <div className="p-6 border-b border-[#E5E5E5] dark:border-[#333]">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">Needs Attention</p>
        {!exceptions ? (
          <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">Loading…</p>
        ) : exceptions.rosterSize === 0 ? (
          <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
            No athletes yet — share the join code above.
          </p>
        ) : exceptions.exceptions.length === 0 ? (
          <p className="text-sm font-mono">
            All {exceptions.rosterSize} athlete{exceptions.rosterSize === 1 ? "" : "s"} on track. Nothing needs you today.
          </p>
        ) : (
          <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
            {exceptions.exceptions.map((e, i) => (
              <div key={`${e.name}-${i}`} className="bg-white dark:bg-[#242424] p-4 flex items-start gap-4">
                <span
                  aria-label={e.color === "red" ? "Red — act today" : "Amber — watch"}
                  className={`mt-1 inline-block w-3 h-3 flex-shrink-0 ${e.color === "red" ? "bg-[#FF4444]" : "bg-[#E8FF00]"}`}
                />
                <div>
                  <p className="font-bold text-sm uppercase tracking-wider">{e.name}</p>
                  <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-0.5">{e.trend}</p>
                  <p className="text-sm mt-1">{e.recommendation}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        {exceptions && exceptions.rosterSize > 0 && exceptions.exceptions.length > 0 && (
          <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-3">
            {exceptions.onTrack} of {exceptions.rosterSize} on track and not shown — this list is exceptions only.
          </p>
        )}
      </div>

      {/* Planned sessions */}
      <div className="p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Planned Sessions</p>
        <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
          These land on every athlete&apos;s plan and steer their sleep targets — no Strava, no athlete input needed.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
          <input
            type="date"
            aria-label="Session date"
            value={sessionForm.date}
            onChange={(e) => setSessionForm({ ...sessionForm, date: e.target.value })}
            className={INPUT}
          />
          <select
            aria-label="Session type"
            value={sessionForm.sessionType}
            onChange={(e) => setSessionForm({ ...sessionForm, sessionType: e.target.value as SessionType })}
            className={`${INPUT} bg-white`}
          >
            {SESSION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Description"
            aria-label="Description"
            value={sessionForm.description}
            onChange={(e) => setSessionForm({ ...sessionForm, description: e.target.value })}
            className={INPUT}
          />
          <input
            type="text"
            placeholder="Targets (e.g. 5×1k @ goal)"
            aria-label="Target paces"
            value={sessionForm.targetPaces}
            onChange={(e) => setSessionForm({ ...sessionForm, targetPaces: e.target.value })}
            className={INPUT}
          />
          <Button variant="secondary" size="sm" onClick={addSession} disabled={!sessionForm.date || savingSession}>
            {savingSession ? "Saving…" : "Add"}
          </Button>
        </div>

        {sessions.length === 0 ? (
          <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">Nothing planned yet.</p>
        ) : (
          <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
            {sessions.map((s) => (
              <div key={s.id} className="bg-white dark:bg-[#242424] p-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <p className="font-mono text-sm text-[#6B6B6B] dark:text-[#A0A0A0] w-28">{formatDate(s.date)}</p>
                  <span className="text-xs font-bold uppercase tracking-wider">{s.sessionType.replace("_", " ")}</span>
                  {(s.description || s.targetPaces) && (
                    <span className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
                      {[s.description, s.targetPaces].filter(Boolean).join(" — ")}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => removeSession(s.id)}
                  className="text-[10px] font-bold uppercase tracking-wider border border-[#E5E5E5] dark:border-[#333] px-2 py-0.5 text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
