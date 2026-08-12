"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Primary navigation under 768px. The top bar's links plus two controls
 * overflowed into a horizontal scroll strip with no affordance, so the last
 * items were effectively invisible.
 *
 * Six items at 320px is 53px each, still clear of the 44px target minimum, but
 * only if the labels fit — "SCHEDULE" and "ANALYSIS" at the old size ran past
 * their cell. The three long ones are shortened here and here only; the top bar
 * keeps the full words, where there is room for them.
 *
 * Meets is deliberately not a tab. It folds into Schedule, which already owns
 * the calendar, and the dashboard's next-meet card links straight into it.
 */
const TABS = [
  { href: "/dashboard", label: "Today" },
  { href: "/sleep", label: "Sleep" },
  { href: "/schedule", label: "Plan" },
  { href: "/team", label: "Team" },
  { href: "/analysis", label: "Data" },
  { href: "/profile", label: "You" },
];

export function BottomTabBar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;

  return (
    <>
      {/* Spacer so the footer and last section clear the fixed bar. Lives here
          rather than as body padding so logged-out pages are unaffected. */}
      <div
        aria-hidden
        className="md:hidden"
        style={{ height: "calc(52px + env(safe-area-inset-bottom))" }}
      />
      <nav
        aria-label="Primary"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white dark:bg-[#1a1a1a] border-t border-[#E5E5E5] dark:border-[#333]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <ul className="flex">
          {TABS.map((tab) => {
            // /meets folds into Schedule, so it should light Schedule up.
            // /schedule/history belongs to it too.
            const active =
              pathname === tab.href ||
              (tab.href === "/schedule" &&
                (pathname.startsWith("/meets") || pathname.startsWith("/schedule/")));
            return (
              <li key={tab.href} className="flex-1">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center justify-center min-h-[52px] px-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap border-t-2 -mt-px transition-colors ${
                    active
                      ? "border-[#0A0A0A] dark:border-[#E8FF00] text-[#0A0A0A] dark:text-[#E8FF00]"
                      : "border-transparent text-[#6B6B6B] dark:text-[#A0A0A0]"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
