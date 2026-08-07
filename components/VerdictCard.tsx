"use client";

import { motion } from "framer-motion";
import type { Verdict } from "@/lib/verdict";

interface Props {
  verdict: Verdict;
  /** Opens the existing PrPrompt flow from the confidence badge. */
  onAddPr: () => void;
}

/**
 * Splits the verdict on the substrings that must not break, so each becomes an
 * unbreakable span. Tokens are matched longest-first: a pace range contains a
 * pace, and matching the shorter one first would split the range in half.
 */
function segment(text: string, nowrap: string[]): { text: string; nowrap: boolean }[] {
  const tokens = Array.from(new Set(nowrap))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let parts: { text: string; nowrap: boolean }[] = [{ text, nowrap: false }];

  for (const token of tokens) {
    const next: { text: string; nowrap: boolean }[] = [];
    for (const part of parts) {
      if (part.nowrap || !part.text.includes(token)) {
        next.push(part);
        continue;
      }
      const pieces = part.text.split(token);
      pieces.forEach((piece, i) => {
        if (piece) next.push({ text: piece, nowrap: false });
        if (i < pieces.length - 1) next.push({ text: token, nowrap: true });
      });
    }
    parts = next;
  }

  return parts;
}

/**
 * The answer to "what do I do today?", in one sentence, above everything else.
 *
 * The headline carries exactly one instruction — the run — and no bedtime:
 * tonight's target renders once, in its own card. Sized with clamp() rather
 * than breakpoint jumps and capped at 16ch so a wide monitor gets a headline
 * that reads as a headline instead of a banner stretched to the container.
 */
export function VerdictCard({ verdict, onAddPr }: Props) {
  const segments = segment(verdict.verdict, verdict.nowrap);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <p className="text-[10px] md:text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-4">
        Today
      </p>

      {/* 1 — the verdict. Fluid within each range rather than jumping at
          breakpoints; capped at 16ch so it stays a headline on a wide monitor. */}
      <h1 className="font-black uppercase leading-[1.05] text-balance max-w-[16ch] text-[#0A0A0A] dark:text-[#F5F5F5] text-[clamp(24px,7vw,30px)] md:text-[clamp(30px,3.2vw,44px)]">
        {segments.map((s, i) =>
          s.nowrap ? (
            <span key={i} className="whitespace-nowrap">
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </h1>

      {/* 2 — the reason */}
      <p className="mt-4 text-sm font-mono text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed max-w-[52ch]">
        {verdict.reason}
      </p>

      {/* 3 — confidence, only when it is a caveat, and always with a way out */}
      {verdict.confidence !== "high" && (
        <div className="mt-5">
          {verdict.action?.target === "pr" ? (
            <button
              onClick={onAddPr}
              className="inline-flex items-center min-h-[44px] px-4 text-[11px] font-bold uppercase tracking-widest border border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5] hover:bg-[#E8FF00] hover:border-[#E8FF00] hover:text-[#0A0A0A] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8FF00]"
            >
              {verdict.confidence === "low" ? "Low confidence" : "Provisional"}. Add a PR to
              sharpen this →
            </button>
          ) : (
            <a
              href={verdict.action?.target === "strava" ? "/api/strava/connect" : "/sleep"}
              className="inline-flex items-center min-h-[44px] px-4 text-[11px] font-bold uppercase tracking-widest border border-[#0A0A0A] dark:border-[#F5F5F5] text-[#0A0A0A] dark:text-[#F5F5F5] hover:bg-[#E8FF00] hover:border-[#E8FF00] hover:text-[#0A0A0A] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E8FF00]"
            >
              {verdict.confidence === "low" ? "Low confidence" : "Provisional"}.{" "}
              {verdict.action?.target === "strava"
                ? "connect Strava to sharpen this"
                : "log your sleep to sharpen this"}{" "}
              →
            </a>
          )}
        </div>
      )}
    </motion.div>
  );
}
