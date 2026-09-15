"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { Button } from "@/components/Button";

// Where a coach lands straight after signup.
//
// The team comes first because it is the thing they came for, and their own
// sleep plan is offered second because a coach who does not run should never
// be made to answer questions about their own weekly mileage to reach a
// roster. Skipping goes to the team page, and nothing about the team is
// withheld from someone who skipped.

export default function NewTeamPage() {
  const router = useRouter();
  const { status } = useSession();
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [created, setCreated] = useState<{ id: string; name: string; joinCode: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, season: season || null }),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setError(data.error || "Could not create the team.");
      setSaving(false);
      return;
    }

    setCreated({ id: data.id, name: data.name, joinCode: data.joinCode });
    setSaving(false);
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
          {!created ? (
            <>
              <h1 className="font-black text-4xl uppercase mb-8 dark:text-[#F5F5F5]">Name Your Team</h1>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-[#E5E5E5] dark:border-[#444444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] transition-colors dark:bg-[#2a2a2a] dark:text-[#F5F5F5] dark:placeholder-[#666666]"
                    placeholder="Andover XC"
                    required
                    minLength={2}
                    maxLength={80}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 dark:text-[#A0A0A0]">
                    Season (optional)
                  </label>
                  <input
                    type="text"
                    value={season}
                    onChange={(e) => setSeason(e.target.value)}
                    className="w-full border border-[#E5E5E5] dark:border-[#444444] px-4 py-3 text-sm focus:outline-none focus:border-[#0A0A0A] dark:focus:border-[#F5F5F5] transition-colors dark:bg-[#2a2a2a] dark:text-[#F5F5F5] dark:placeholder-[#666666]"
                    placeholder="Fall 2026"
                    maxLength={40}
                  />
                </div>

                {error && (
                  <p className="text-xs font-bold text-[#FF4444] uppercase tracking-wider">{error}</p>
                )}

                <Button type="submit" variant="secondary" size="lg" className="w-full" disabled={saving}>
                  {saving ? "Creating..." : "Create Team"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="font-black text-4xl uppercase mb-8 dark:text-[#F5F5F5]">{created.name}</h1>

              <div className="border border-[#E5E5E5] dark:border-[#333] p-6 mb-8">
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] dark:text-[#A0A0A0] mb-2">
                  Join Code
                </p>
                <p className="font-mono font-black text-4xl tracking-[0.2em] dark:text-[#F5F5F5]">
                  {created.joinCode}
                </p>
              </div>

              <h2 className="font-black text-xl uppercase mb-6 dark:text-[#F5F5F5]">Do you run too?</h2>
              <div className="space-y-3">
                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={() => router.push("/onboarding")}
                >
                  Set Up My Sleep Plan
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full"
                  onClick={() => router.push("/team")}
                >
                  Skip, Take Me To My Team
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}
