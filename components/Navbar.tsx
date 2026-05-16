"use client";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/sleep", label: "Sleep" },
    { href: "/schedule", label: "Schedule" },
    { href: "/meets", label: "Meets" },
    { href: "/analysis", label: "Analysis" },
    { href: "/profile", label: "Profile" },
  ];

  return (
    <nav className="border-b border-[#E5E5E5] dark:border-[#333] bg-white dark:bg-[#1a1a1a] sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
        <Link href={session ? "/dashboard" : "/"} className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </Link>

        {session ? (
          <div className="overflow-x-auto -mr-6">
            <div className="flex items-center gap-3 md:gap-5 pr-6 min-w-max">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`link-wipe text-xs md:text-sm font-bold uppercase tracking-wider ${
                    pathname === link.href ? "text-[#0A0A0A] dark:text-[#F5F5F5]" : "text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5]"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <ThemeToggle />
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5] link-wipe"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/login" className="link-wipe text-sm font-bold uppercase tracking-wider text-[#6B6B6B] dark:text-[#A0A0A0] hover:text-[#0A0A0A] dark:hover:text-[#F5F5F5]">
              Log In
            </Link>
            <Link
              href="/signup"
              className="bg-[#0A0A0A] text-white px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-[#E8FF00] hover:text-[#0A0A0A] transition-colors"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
