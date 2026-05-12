"use client";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

export function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/schedule", label: "Schedule" },
    { href: "/meets", label: "Meets" },
    { href: "/strava", label: "Strava" },
    { href: "/analysis", label: "Analysis" },
    { href: "/profile", label: "Profile" },
  ];

  return (
    <nav className="border-b border-[#E5E5E5] bg-white sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
        <Link href={session ? "/dashboard" : "/"} className="font-black text-xl uppercase tracking-tight">
          PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
        </Link>

        {session ? (
          <div className="overflow-x-auto -mr-6">
            <div className="flex items-center gap-4 md:gap-6 pr-6 min-w-max">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`link-wipe text-xs md:text-sm font-bold uppercase tracking-wider ${
                    pathname === link.href ? "text-[#0A0A0A]" : "text-[#6B6B6B] hover:text-[#0A0A0A]"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="text-xs md:text-sm font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-[#0A0A0A] link-wipe"
              >
                Sign Out
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link href="/login" className="link-wipe text-sm font-bold uppercase tracking-wider text-[#6B6B6B] hover:text-[#0A0A0A]">
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
