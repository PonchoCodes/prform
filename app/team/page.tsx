"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/Button";
import { TEAM_CONSENT_TEXT, OWNER_VISIBILITY_NOTE } from "@/lib/team/consent";

// One page, both sides of the relationship.
//
// Athlete side: join with a code — past the consent screen — see your teams,
// leave. Owner side: create a team, hand out the code, and read the exception
// list. The exception list is all an owner ever gets: colors, counts and a
// recommendation, never times. That promise is made at consent and kept by
// the API; this page just renders it.
//
// Both sides are shown to everyone, unconditionally. Anyone can make a team —
// a captain organizing six people needs a roster as much as a coach does — and
// the same person can be on one team and run another, so there is no mode to
// switch between and nothing to unlock.

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

interface OwnedTeam {
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
  /** True when this is a team they also run — it then appears in both lists. */
  ownedByYou: boolean;
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
  durationMinutes: number;
  description: string | null;
  targetPaces: string | null;
}

// Mirrors the bounds enforced by POST /api/teams/[teamId]/sessions.
const MIN_SESSION_MINUTES = 5;
const MAX_SESSION_MINUTES = 600;

const INPUT =
  "border border-[#E5E5E5] dark:border-[#333] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]";

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function TeamPage() {
  const { status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [owned, setOwned] = useState<OwnedTeam[]>([]);
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
    setOwned(data.owned ?? []);
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
              Athletes join themselves with a code.
            </p>
          </div>
        </section>

        <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-14">
          {/* ── Athlete side ─────────────────────────────────────────────── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Athlete</p>
            <h2 className="font-black text-2xl uppercase mb-2">Your Teams</h2>
            <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-6 max-w-2xl">
              You can be on more than one. Cross country and track are separate rosters.
            </p>

            {memberships.length > 0 && (
              <div className="space-y-8 mb-8">
                {memberships.map((m) => (
                  <div key={m.id} className="border border-[#E5E5E5] dark:border-[#333]">
                    <div className="p-4 flex items-center justify-between gap-4 border-b border-[#E5E5E5] dark:border-[#333]">
                      <div>
                        <p className="font-bold text-sm uppercase tracking-wider">
                          {m.team.name}
                          {/* Without this, a captain's own team appears in both
                              lists with nothing to say why. */}
                          {m.ownedByYou && (
                            <span className="ml-2 text-[10px] font-bold uppercase tracking-wider border border-[#E5E5E5] dark:border-[#333] px-1.5 py-0.5 text-[#6B6B6B] dark:text-[#A0A0A0]">
                              You run this
                            </span>
                          )}
                        </p>
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
                    <ConsistencyBoard teamId={m.team.id} />
                  </div>
                ))}
              </div>
            )}

            {!showConsent ? (
              <div className="border border-[#E5E5E5] dark:border-[#333] p-6 max-w-lg">
                <h3 className="font-black text-sm uppercase tracking-wider mb-1">Join a Team</h3>
                <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
                  Whoever runs the team gives you a 6-character code. Only you can add yourself.
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
                    Before you join
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

          {/* ── Owner side ───────────────────────────────────────────────── */}
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Owner</p>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-black text-2xl uppercase">Teams You Run</h2>
              <Button variant="secondary" size="sm" onClick={() => setShowCreate(!showCreate)}>
                + New Team
              </Button>
            </div>
            <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-6 max-w-2xl">{OWNER_VISIBILITY_NOTE}</p>

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
                      placeholder="Season (optional, e.g. Outdoor 2027)"
                      aria-label="Season"
                      value={teamSeason}
                      onChange={(e) => setTeamSeason(e.target.value)}
                      className={`${INPUT} w-full`}
                    />
                    <Button variant="primary" size="sm" onClick={handleCreate} disabled={teamName.trim().length < 2 || createBusy}>
                      {createBusy ? "Creating…" : "Create and get a join code"}
                    </Button>
                  </div>
                </div>
              </FadeUp>
            )}

            {owned.length === 0 && !showCreate ? (
              <p className="text-[#6B6B6B] dark:text-[#A0A0A0] text-sm py-8 text-center border border-dashed border-[#E5E5E5] dark:border-[#333]">
                You don&apos;t run a team yet. Create one, hand out the code, and join it
                yourself if you run too.
              </p>
            ) : (
              <div className="space-y-8">
                {owned.map((team) => (
                  <OwnedTeamPanel key={team.id} team={team} onCodeRotated={refresh} />
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

// ── the consistency board ───────────────────────────────────────────────────
//
// Check-ins, not sleep. The copy says so out loud, every time, because a
// leaderboard on a sleep app will be read as a sleep leaderboard unless it
// tells you otherwise — and an athlete who thinks their teammates can see how
// long they slept behaves differently from one who knows they cannot.
//
// No podium colours, no medals, no trophy for first. The point is a squad
// seeing that everyone shows up, not a competition with a winner; the athlete
// at the bottom of a five-person board is a teenager reading their own name
// last, and the design should not press on that.

interface BoardEntry {
  name: string;
  nightsLogged: number;
  nightsPossible: number;
  rate: number | null;
  position: number;
  isYou: boolean;
}

function ConsistencyBoard({ teamId }: { teamId: string }) {
  const [board, setBoard] = useState<{
    weekStart: string;
    windowEnd: string | null;
    entries: BoardEntry[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teams/${teamId}/leaderboard`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setBoard(data);
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [teamId]);

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">Loading check-ins…</p>
      </div>
    );
  }
  if (!board || board.entries.length === 0) return null;

  return (
    <div className="p-4">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0]">
          This week&apos;s check-ins
        </p>
        <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
          Resets Monday
        </p>
      </div>
      <p className="text-[10px] font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
        Nights logged out of nights possible.
      </p>

      {board.windowEnd === null ? (
        <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] py-2">
          A new week just started. Log tonight and you&apos;re on the board tomorrow.
        </p>
      ) : (
        <div className="space-y-px bg-[#E5E5E5] dark:bg-[#333]">
          {board.entries.map((entry, i) => (
            <div
              key={`${entry.name}-${i}`}
              className={`flex items-center gap-3 px-3 py-2 ${
                entry.isYou
                  ? "bg-[#0A0A0A] text-white dark:bg-[#F5F5F5] dark:text-[#0A0A0A]"
                  : "bg-white dark:bg-[#242424]"
              }`}
            >
              <span className="font-mono text-xs w-6 shrink-0 tabular-nums opacity-60">
                {entry.position}
              </span>
              <span className="font-bold text-xs uppercase tracking-wider truncate flex-1">
                {entry.name}
              </span>
              <span className="font-mono text-xs tabular-nums shrink-0">
                {entry.nightsLogged}/{entry.nightsPossible}
              </span>
              <span className="font-mono text-xs tabular-nums w-12 text-right shrink-0">
                {entry.rate === null ? "–" : `${entry.rate}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── owner panel: join code, exception list, planned sessions ────────────────

function OwnedTeamPanel({ team, onCodeRotated }: { team: OwnedTeam; onCodeRotated: () => Promise<void> }) {
  const [exceptions, setExceptions] = useState<ExceptionsPayload | null>(null);
  const [sessions, setSessions] = useState<PlannedSessionRow[]>([]);
  const [rotating, setRotating] = useState(false);
  // durationMinutes starts empty, not at a default. Prefilling it would put a
  // number the owner never chose onto every athlete's training load.
  const [sessionForm, setSessionForm] = useState({
    date: "",
    sessionType: "easy" as SessionType,
    durationMinutes: "",
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

  const durationValue = Number(sessionForm.durationMinutes);
  const durationValid =
    sessionForm.durationMinutes.trim() !== "" &&
    Number.isInteger(durationValue) &&
    durationValue >= MIN_SESSION_MINUTES &&
    durationValue <= MAX_SESSION_MINUTES;
  const sessionReady = Boolean(sessionForm.date) && durationValid;

  const addSession = async () => {
    if (!sessionReady) return;
    setSavingSession(true);
    const res = await fetch(`/api/teams/${team.id}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...sessionForm, durationMinutes: durationValue }),
    });
    if (res.ok) {
      setSessionForm({
        date: "",
        sessionType: "easy",
        durationMinutes: "",
        description: "",
        targetPaces: "",
      });
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
            No athletes yet. Share the join code above.
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
                  aria-label={e.color === "red" ? "Red, act today" : "Amber, watch"}
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
            {exceptions.onTrack} of {exceptions.rosterSize} on track and not shown. This list is exceptions only.
          </p>
        )}
      </div>

      {/* Planned sessions */}
      <div className="p-6">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Planned Sessions</p>
        <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
          These land on every athlete&apos;s plan and steer their sleep targets.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4">
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
            type="number"
            inputMode="numeric"
            required
            min={MIN_SESSION_MINUTES}
            max={MAX_SESSION_MINUTES}
            step={1}
            placeholder="Minutes"
            aria-label="Session duration in minutes"
            value={sessionForm.durationMinutes}
            onChange={(e) => setSessionForm({ ...sessionForm, durationMinutes: e.target.value })}
            className={INPUT}
          />
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
          <Button variant="secondary" size="sm" onClick={addSession} disabled={!sessionReady || savingSession}>
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
                  <span className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">{s.durationMinutes} min</span>
                  {(s.description || s.targetPaces) && (
                    <span className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">
                      {[s.description, s.targetPaces].filter(Boolean).join(". ")}
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
