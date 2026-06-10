"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/Button";

const inputClass =
  "w-full border border-[#E5E5E5] dark:border-[#444444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] transition-colors dark:bg-[#2a2a2a] dark:text-[#F5F5F5] dark:placeholder-[#666666]";

const labelClass = "block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]";

function toggleClass(selected: boolean) {
  return `flex-1 border px-4 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${
    selected
      ? "bg-[#0A0A0A] text-white border-[#0A0A0A] dark:bg-[#F5F5F5] dark:text-[#0A0A0A] dark:border-[#F5F5F5]"
      : "border-[#E5E5E5] hover:border-[#0A0A0A] dark:border-[#444444] dark:text-[#A0A0A0] dark:hover:border-[#F5F5F5]"
  }`;
}

function RequestAccessForm() {
  const searchParams = useSearchParams();
  const waitlisted = searchParams.get("status") === "waitlist";

  const [form, setForm] = useState({
    name: "",
    email: "",
    role: "RUNNER",
    weeklyMileage: "",
    usesStrava: false,
    notes: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    setSubmitted(true);
  };

  if (submitted || waitlisted) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md mx-auto px-6 py-16"
      >
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
          Early Access
        </p>
        <h1 className="font-black text-4xl uppercase mb-6 dark:text-[#F5F5F5]">
          {submitted ? "Request Received" : "You're on the Waitlist"}
        </h1>
        <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] leading-relaxed mb-8">
          PRform is in invite-only early access with a small first cohort.
          {submitted
            ? " We'll email you as soon as a spot opens up."
            : " Your email isn't approved yet — we'll email you as soon as a spot opens up."}
        </p>
        <Link href="/" className="font-bold text-sm text-[#0A0A0A] dark:text-[#F5F5F5] link-wipe uppercase tracking-wider">
          ← Back to home
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-md mx-auto px-6 py-16"
    >
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-3">
        Early Access
      </p>
      <h1 className="font-black text-4xl uppercase mb-3 dark:text-[#F5F5F5]">Request Access</h1>
      <p className="text-sm text-[#6B6B6B] dark:text-[#A0A0A0] mb-8 leading-relaxed">
        PRform is in invite-only early access. Tell us about your training and we'll reach out when a spot opens.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className={labelClass}>Full Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            placeholder="Your name"
            required
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
            placeholder="you@example.com"
            required
          />
        </div>
        <div>
          <label className={labelClass}>I am a</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, role: "RUNNER" })} className={toggleClass(form.role === "RUNNER")}>
              Runner
            </button>
            <button type="button" onClick={() => setForm({ ...form, role: "COACH" })} className={toggleClass(form.role === "COACH")}>
              Coach
            </button>
          </div>
        </div>
        <div>
          <label className={labelClass}>Weekly Mileage (optional)</label>
          <input
            type="number"
            min={0}
            value={form.weeklyMileage}
            onChange={(e) => setForm({ ...form, weeklyMileage: e.target.value })}
            className={inputClass}
            placeholder="e.g. 40"
          />
        </div>
        <div>
          <label className={labelClass}>Do you use Strava?</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setForm({ ...form, usesStrava: true })} className={toggleClass(form.usesStrava)}>
              Yes
            </button>
            <button type="button" onClick={() => setForm({ ...form, usesStrava: false })} className={toggleClass(!form.usesStrava)}>
              No
            </button>
          </div>
        </div>
        <div>
          <label className={labelClass}>Anything else? (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={`${inputClass} resize-none`}
            rows={3}
            placeholder="Goal race, current PRs, why you want in early..."
          />
        </div>
        {error && (
          <p className="text-xs font-bold text-[#FF4444] uppercase tracking-wider">{error}</p>
        )}
        <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={loading}>
          {loading ? "Submitting..." : "Request Access"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
        Already approved?{" "}
        <Link href="/signup" className="font-bold text-[#0A0A0A] dark:text-[#F5F5F5] link-wipe">
          Create your account
        </Link>
      </p>
    </motion.div>
  );
}

export default function RequestAccessPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex flex-col">
      <nav className="border-b border-[#E5E5E5] dark:border-[#333] px-6 h-14 flex items-center">
        <Link href="/" className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </Link>
      </nav>
      <div className="flex-1 flex">
        <Suspense fallback={null}>
          <RequestAccessForm />
        </Suspense>
      </div>
    </div>
  );
}
