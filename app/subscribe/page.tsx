"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SubscribePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/create-checkout", { method: "POST" });
      let data: any = {};
      try { data = await res.json(); } catch {}
      if (!res.ok || !data.url) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }
      router.push(data.url);
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0A] flex flex-col">
      {/* Nav */}
      <nav className="border-b border-[#E5E5E5] dark:border-[#2A2A2A] px-6 h-14 flex items-center">
        <span className="font-black text-xl uppercase tracking-tight dark:text-white">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] dark:bg-white dark:text-[#0A0A0A] px-1">form</span>
        </span>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          {/* Label */}
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">
            PRform Premium
          </p>

          {/* Price */}
          <p className="font-mono font-black text-7xl leading-none mb-1 dark:text-white">$5</p>
          <p className="font-mono text-sm text-[#6B6B6B] mb-8">per month · billed monthly</p>

          {/* Trial callout */}
          <div className="bg-[#0A0A0A] dark:bg-white px-6 py-5 mb-8">
            <p className="font-black text-xl uppercase tracking-tight mb-1 text-white dark:text-[#0A0A0A]">
              30 days free
            </p>
            <p className="text-sm text-[#A0A0A0] dark:text-[#6B6B6B] font-mono">
              Your card is required to start, but you won't be charged until your trial ends.
              Cancel anytime before day 30 and pay nothing.
            </p>
          </div>

          {/* Feature list */}
          <div className="border border-[#E5E5E5] dark:border-[#2A2A2A] divide-y divide-[#E5E5E5] dark:divide-[#2A2A2A] mb-8">
            {[
              "14-day adaptive sleep plan updated after every workout",
              "Circadian timing aligned to your race schedule",
              "VDOT · PMC · polarized intensity analysis",
              "Sleep–pace correlation tracking",
              "Strava auto-sync",
            ].map((f) => (
              <div key={f} className="flex items-start gap-3 px-4 py-3">
                <span className="font-mono font-black text-[#E8FF00] bg-[#0A0A0A] dark:bg-white dark:text-[#0A0A0A] px-1 text-xs mt-0.5 shrink-0">✓</span>
                <span className="text-sm text-[#0A0A0A] dark:text-[#F5F5F5]">{f}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          {error && (
            <p className="text-sm text-red-500 font-mono mb-4">{error}</p>
          )}
          <button
            onClick={handleStart}
            disabled={loading}
            className="w-full bg-[#E8FF00] text-[#0A0A0A] font-black text-sm uppercase tracking-widest py-4 hover:bg-[#d4e800] transition-colors disabled:opacity-50"
          >
            {loading ? "Redirecting…" : "Start Free Trial — No charge for 30 days"}
          </button>

          <p className="text-[10px] font-mono text-[#6B6B6B] text-center mt-4">
            Secure checkout by Stripe. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
