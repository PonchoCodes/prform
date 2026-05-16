"use client";
import Link from "next/link";

function trialEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function SubscribeSuccessPage() {
  const endDate = trialEndDate();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="border-b border-[#E5E5E5] px-6 h-14 flex items-center">
        <span className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </span>
      </nav>

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg">
          <div className="bg-[#E8FF00] px-3 py-1 inline-block mb-6">
            <p className="text-xs font-black uppercase tracking-widest text-[#0A0A0A]">Trial Active</p>
          </div>

          <h1 className="font-black text-4xl uppercase leading-none mb-4">
            You're in.
          </h1>

          <p className="text-sm text-[#6B6B6B] font-mono mb-8">
            Your 30-day free trial has started. You won't be charged until your trial ends.
          </p>

          <div className="border border-[#E5E5E5] px-6 py-5 mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-1">Trial ends</p>
            <p className="font-mono font-black text-2xl">{endDate}</p>
          </div>

          <Link
            href="/dashboard"
            className="block w-full bg-[#0A0A0A] text-white font-black text-sm uppercase tracking-widest py-4 text-center hover:bg-[#333] transition-colors"
          >
            Go to Dashboard →
          </Link>
        </div>
      </div>
    </div>
  );
}
