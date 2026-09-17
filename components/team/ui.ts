// The two things every panel on the team page shares. Pulled out so the
// owner-side panels can live in their own files without each carrying a copy
// of the input class string.

export const INPUT =
  "border border-[#E5E5E5] dark:border-[#333] dark:bg-[#2a2a2a] dark:text-[#F5F5F5] px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5]";

export const REMOVE_BUTTON =
  "text-[10px] font-bold uppercase tracking-wider border border-[#E5E5E5] dark:border-[#333] px-2 py-0.5 text-[#6B6B6B] dark:text-[#A0A0A0] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] transition-colors";

export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export type ReadinessColor = "green" | "amber" | "red";

export const READINESS_DOT: Record<ReadinessColor, string> = {
  red: "bg-[#FF4444]",
  amber: "bg-[#E8FF00]",
  green: "bg-[#0A0A0A] dark:bg-[#F5F5F5]",
};
