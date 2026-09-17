"use client";
import { useState } from "react";
import { INPUT } from "@/components/team/ui";

// The Monday digest switch and the zone it keeps. One row, saved on change.

const ZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "America/Vancouver",
  "America/Mexico_City",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Auckland",
  "Asia/Tokyo",
];

export function DigestSettings({
  teamId,
  digestEnabled,
  timezone,
  onSaved,
}: {
  teamId: string;
  digestEnabled: boolean;
  timezone: string;
  onSaved: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  const save = async (patch: { digestEnabled?: boolean; timezone?: string }) => {
    setSaving(true);
    await fetch(`/api/teams/${teamId}/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await onSaved();
    setSaving(false);
  };

  return (
    <div className="p-6 border-t border-[#E5E5E5] dark:border-[#333] flex flex-wrap items-center gap-x-8 gap-y-3">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={digestEnabled}
          disabled={saving}
          onChange={(e) => save({ digestEnabled: e.target.checked })}
        />
        <span className="text-xs font-bold uppercase tracking-wider">Monday digest</span>
      </label>
      <label className="flex items-center gap-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0]">
          Time zone
        </span>
        <select
          aria-label="Team time zone"
          value={timezone}
          disabled={saving}
          onChange={(e) => save({ timezone: e.target.value })}
          className={`${INPUT} bg-white text-xs`}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z.replace(/_/g, " ")}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
