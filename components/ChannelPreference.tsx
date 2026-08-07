"use client";

import { useCallback, useEffect, useState } from "react";

// Choosing how PRform reaches you.
//
// Four options, and only the ones that can actually deliver are selectable.
// Offering a channel that is not set up would let an athlete choose silence and
// then wonder why the app went quiet, which is the failure this whole component
// exists to prevent.

type Preference = "AUTO" | "SMS" | "PUSH" | "EMAIL";

interface ChannelState {
  preference: Preference;
  available: { sms: boolean; push: boolean; email: boolean };
  resolved: "SMS" | "PUSH" | "EMAIL" | null;
  reason: string | null;
  email: string;
  hasTimeZone: boolean;
}

const LABELS: Record<Preference, string> = {
  AUTO: "Automatic",
  SMS: "Text message",
  PUSH: "Notification",
  EMAIL: "Email",
};

const RESOLVED_LABEL: Record<string, string> = {
  SMS: "a text message",
  PUSH: "a notification",
  EMAIL: "an email",
};

export function ChannelPreference() {
  const [state, setState] = useState<ChannelState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/messaging/channel");
    if (res.ok) setState(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) return null;

  const choose = async (preference: Preference) => {
    setSaving(true);
    setState((prev) => (prev ? { ...prev, preference } : prev));
    await fetch("/api/messaging/channel", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preference,
        // Every channel needs a timezone to work out the athlete's evening, and
        // email is the one they can reach without an enrolment step that would
        // otherwise have collected it.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }).catch(() => {});
    await load();
    setSaving(false);
  };

  const options: { value: Preference; enabled: boolean; note: string }[] = [
    {
      value: "AUTO",
      enabled: true,
      note: state.resolved
        ? `Currently ${RESOLVED_LABEL[state.resolved]}`
        : "Nothing set up yet",
    },
    {
      value: "SMS",
      enabled: state.available.sms,
      note: state.available.sms ? "Your verified number" : "Add a number below first",
    },
    {
      value: "PUSH",
      enabled: state.available.push,
      note: state.available.push ? "Your installed app" : "Turn on notifications above first",
    },
    {
      value: "EMAIL",
      enabled: state.available.email,
      note: state.available.email ? state.email : "Not available right now",
    },
  ];

  return (
    <div className="border border-[#E5E5E5] dark:border-[#333] p-5">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
        How PRform reaches you
      </p>
      <p className="text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mb-5">
        Your evening check-in and morning verdict. Automatic picks whichever you have set up.
      </p>

      <div className="grid grid-cols-2 gap-px bg-[#E5E5E5] dark:bg-[#333] border border-[#E5E5E5] dark:border-[#333]">
        {options.map((option) => {
          const selected = state.preference === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={!option.enabled || saving}
              aria-pressed={selected}
              onClick={() => choose(option.value)}
              className={`text-left p-3 transition-colors ${
                selected
                  ? "bg-[#0A0A0A] text-white dark:bg-[#F5F5F5] dark:text-[#0A0A0A]"
                  : "bg-white dark:bg-[#242424]"
              } ${
                option.enabled
                  ? "hover:bg-[#F5F5F5] dark:hover:bg-[#2a2a2a] aria-pressed:hover:bg-[#0A0A0A] dark:aria-pressed:hover:bg-[#F5F5F5]"
                  : "opacity-40 cursor-not-allowed"
              }`}
            >
              <span className="block text-xs font-bold uppercase tracking-wider">
                {LABELS[option.value]}
              </span>
              <span className="block text-[10px] font-mono mt-1 truncate opacity-70">
                {option.note}
              </span>
            </button>
          );
        })}
      </div>

      {state.resolved === null && (
        <p className="text-xs font-mono text-[#6B6B6B] dark:text-[#A0A0A0] mt-4">
          Nothing can reach you yet. Turn on notifications, or add a phone number.
        </p>
      )}
    </div>
  );
}
