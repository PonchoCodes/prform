"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/Button";

// Two questions beyond the account itself, and neither one gates anything.
//
// The role decides which screen comes next: a runner goes to onboarding, a
// coach makes a team first. It is stored so the routing is repeatable, not so
// that anything can be withheld from either of them.
//
// The age box is required because a 12-year-old should not be creating an
// account here. Blocking submit is the visible half; the server refuses it too.

type SignupRole = "ATHLETE" | "COACH";

const ROLES: { value: SignupRole; label: string; detail: string }[] = [
  { value: "ATHLETE", label: "I am a runner", detail: "Build my own sleep plan" },
  { value: "COACH", label: "I coach a team", detail: "Set up a roster first" },
];

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [role, setRole] = useState<SignupRole | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = role !== null && ageConfirmed && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, signupRole: role, ageConfirmed }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Registration failed");
      setLoading(false);
      return;
    }

    const signInRes = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (signInRes?.ok) {
      router.push(role === "COACH" ? "/team/new" : "/onboarding");
    } else {
      setError("Account created but login failed. Please log in.");
      router.push("/login");
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#1a1a1a] flex flex-col">
      <nav className="border-b border-[#E5E5E5] dark:border-[#333] px-6 h-14 flex items-center">
        <Link href="/" className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </Link>
      </nav>

      <div className="flex-1 flex">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md mx-auto px-6 py-16"
        >
          <h1 className="font-black text-4xl uppercase mb-8 dark:text-[#F5F5F5]">Create Account</h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]">Full Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[#E5E5E5] dark:border-[#444444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] transition-colors dark:bg-[#2a2a2a] dark:text-[#F5F5F5] dark:placeholder-[#666666]"
                placeholder="Your name"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-[#E5E5E5] dark:border-[#444444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] transition-colors dark:bg-[#2a2a2a] dark:text-[#F5F5F5] dark:placeholder-[#666666]"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-[#E5E5E5] dark:border-[#444444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] transition-colors dark:bg-[#2a2a2a] dark:text-[#F5F5F5] dark:placeholder-[#666666]"
                placeholder="Min 8 characters"
                required
                minLength={8}
              />
            </div>

            <fieldset>
              <legend className="block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]">
                Which are you?
              </legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ROLES.map((r) => {
                  const selected = role === r.value;
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setRole(r.value)}
                      aria-pressed={selected}
                      className={`border px-4 py-3 text-left transition-colors ${
                        selected
                          ? "bg-[#0A0A0A] text-white border-[#0A0A0A] dark:bg-[#F5F5F5] dark:text-[#0A0A0A] dark:border-[#F5F5F5]"
                          : "border-[#E5E5E5] dark:border-[#444444] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] dark:text-[#F5F5F5]"
                      }`}
                    >
                      <span className="block text-sm font-bold">{r.label}</span>
                      <span
                        className={`block font-mono text-[10px] mt-1 ${
                          selected ? "text-[#A0A0A0] dark:text-[#6B6B6B]" : "text-[#6B6B6B] dark:text-[#A0A0A0]"
                        }`}
                      >
                        {r.detail}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="flex items-start gap-3 border border-[#E5E5E5] dark:border-[#444444] px-4 py-3 cursor-pointer">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#E8FF00] shrink-0"
                required
              />
              <span className="text-sm dark:text-[#F5F5F5]">I am 13 or older</span>
            </label>

            {error && (
              <p className="text-xs font-bold text-[#FF4444] uppercase tracking-wider">{error}</p>
            )}
            <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={!canSubmit}>
              {loading ? "Creating..." : "Create Account"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-[#6B6B6B] dark:text-[#A0A0A0]">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-[#0A0A0A] dark:text-[#F5F5F5] link-wipe">
              Log in
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
