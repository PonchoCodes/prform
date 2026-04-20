"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/Button";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (res?.ok) {
      router.push("/dashboard");
    } else {
      setError("Invalid email or password");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="border-b border-[#E5E5E5] px-6 h-14 flex items-center">
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
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">Welcome Back</p>
          <h1 className="font-black text-4xl uppercase mb-8">Log In</h1>

          <div className="border border-[#E5E5E5] p-4 mb-6 bg-[#F9F9F9]">
            <p className="text-xs font-bold uppercase tracking-wider text-[#6B6B6B] mb-1">Demo Account</p>
            <p className="font-mono text-sm">demo@prform.com / demo1234</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full border border-[#E5E5E5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] transition-colors"
                placeholder="you@example.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full border border-[#E5E5E5] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] transition-colors"
                placeholder="Password"
                required
              />
            </div>
            {error && (
              <p className="text-xs font-bold text-red-600 uppercase tracking-wider">{error}</p>
            )}
            <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={loading}>
              {loading ? "Logging in..." : "Log In"}
            </Button>
          </form>

          <p className="mt-6 text-sm text-[#6B6B6B]">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="font-bold text-[#0A0A0A] link-wipe">
              Sign up free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
