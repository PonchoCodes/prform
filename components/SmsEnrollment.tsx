"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { SMS_CONSENT_TEXT, SMS_MINOR_NOTICE } from "@/lib/messaging/consent";

// Self-enrolment for the text layer.
//
// Nothing here takes a user identifier. The API reads the athlete from their
// session, so this component cannot be pointed at anyone else even by someone
// editing it in a console — which is the point, given that coaches will ask.

type Status = "UNVERIFIED" | "ACTIVE" | "STOPPED";

interface EnrollmentState {
  maskedPhone: string | null;
  verified: boolean;
  ianaTimezone: string | null;
  smsStatus: Status;
  optedInAt: string | null;
}

const INPUT_CLASS =
  "w-full border border-[#E5E5E5] dark:border-[#444] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]";

const LABEL_CLASS = "block text-xs font-bold uppercase tracking-wider mb-2";

/**
 * The zones our athletes are actually in, plus whatever their browser reports.
 * A complete IANA list is six hundred entries and would bury the answer.
 */
const COMMON_ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Madrid",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
];

export function SmsEnrollment() {
  const [state, setState] = useState<EnrollmentState | null>(null);
  // Which form is showing, kept separate from whether a request is in flight.
  // Folding "saving" into the phase would unmount the code form mid-submit and
  // drop the athlete back to the phone field with their code half-typed.
  const [phase, setPhase] = useState<"idle" | "code">("idle");
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [zone, setZone] = useState("");
  const [consent, setConsent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const detectedZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      return "";
    }
  }, []);

  const zoneOptions = useMemo(() => {
    const all = new Set(COMMON_ZONES);
    if (detectedZone) all.add(detectedZone);
    return Array.from(all).sort();
  }, [detectedZone]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/messaging/enroll")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: EnrollmentState | null) => {
        if (cancelled || !data) return;
        setState(data);
        setZone(data.ianaTimezone || detectedZone);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [detectedZone]);

  async function submitEnroll() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await fetch("/api/messaging/enroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneNumber: phone, ianaTimezone: zone, consent }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong. Try again.");
      setBusy(false);
      return;
    }
    if (data.dryRun) {
      setNotice(
        "Test mode is on, so no text was actually sent. The code is in the server log.",
      );
    }
    setPhase("code");
    setBusy(false);
  }

  async function submitCode() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/messaging/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "That didn't work. Try again.");
      setBusy(false);
      return;
    }
    setState((prev) =>
      prev
        ? { ...prev, verified: true, smsStatus: "ACTIVE" }
        : { maskedPhone: null, verified: true, ianaTimezone: zone, smsStatus: "ACTIVE", optedInAt: null },
    );
    setCode("");
    setPhase("idle");
    setBusy(false);
  }

  async function turnOff() {
    setError(null);
    setBusy(true);
    await fetch("/api/messaging/enroll", { method: "DELETE" });
    setState((prev) => (prev ? { ...prev, smsStatus: "STOPPED" } : prev));
    setBusy(false);
  }

  const active = state?.verified && state.smsStatus === "ACTIVE";

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed">
        Two messages a day: one in the evening asking what time you&rsquo;re up tomorrow, one
        when you wake up with the call on today&rsquo;s run. Reply BED when you get down and
        that timestamp becomes your sleep record.
      </p>

      {active ? (
        <div className="border border-[#E5E5E5] dark:border-[#444] p-4 space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-xs font-bold uppercase tracking-wider">Texts on</span>
            <span className="text-sm font-mono">{state?.maskedPhone}</span>
          </div>
          <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0]">
            Local time: {state?.ianaTimezone}. Reply STOP to any message to end them.
          </p>
          <button
            onClick={turnOff}
            disabled={busy}
            className="text-xs font-bold uppercase tracking-wider border border-[#E5E5E5] dark:border-[#444] px-4 py-2 hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] transition-colors disabled:opacity-50"
          >
            Turn texts off
          </button>
        </div>
      ) : phase === "code" ? (
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="sms-code">
              Enter the 6-digit code
            </label>
            <input
              id="sms-code"
              className={INPUT_CLASS}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
            />
          </div>
          <Button onClick={submitCode} disabled={busy || code.length === 0}>
            Confirm
          </Button>
          <button
            onClick={() => {
              setPhase("idle");
              setError(null);
            }}
            className="block text-xs font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5]"
          >
            Use a different number
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {state?.smsStatus === "STOPPED" && (
            <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] border border-[#E5E5E5] dark:border-[#444] p-3">
              Texts are currently off. Turning them back on sends a new code. If you ended
              them by replying STOP, your carrier may also need you to text START first.
            </p>
          )}

          <div>
            <label className={LABEL_CLASS} htmlFor="sms-phone">
              Mobile number
            </label>
            <input
              id="sms-phone"
              className={INPUT_CLASS}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="sms-zone">
              Your timezone
            </label>
            <select
              id="sms-zone"
              className={INPUT_CLASS}
              value={zone}
              onChange={(e) => setZone(e.target.value)}
            >
              <option value="">Select…</option>
              {zoneOptions.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                  {z === detectedZone ? " (detected)" : ""}
                </option>
              ))}
            </select>
          </div>

          <label className="flex gap-3 items-start cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4 accent-[#0A0A0A] dark:accent-[#F5F5F5]"
            />
            <span className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed">
              {SMS_CONSENT_TEXT}
            </span>
          </label>

          <p className="text-xs text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed">
            {SMS_MINOR_NOTICE}
          </p>

          <Button
            onClick={submitEnroll}
            disabled={busy || !consent || phone.length === 0 || zone.length === 0}
          >
            Send me a code
          </Button>
        </div>
      )}

      {notice && <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0]">{notice}</p>}
      {error && <p className="text-xs font-bold text-[#0A0A0A] dark:text-[#F5F5F5]">{error}</p>}
    </div>
  );
}
