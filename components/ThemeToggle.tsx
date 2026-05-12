"use client";
import { useEffect, useState } from "react";

type Theme = "system" | "light" | "dark";

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/>
    <line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const SystemIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="2" y="3" width="20" height="14" rx="0"/>
    <line x1="8" y1="21" x2="16" y2="21"/>
    <line x1="12" y1="17" x2="12" y2="21"/>
  </svg>
);

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("prform-theme") as Theme) ?? "system";
    setTheme(stored);
  }, []);

  const cycle = () => {
    const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setTheme(next);
    localStorage.setItem("prform-theme", next);
    const prefersDark = window.matchMedia("(prefers-color-scheme:dark)").matches;
    const isDark = next === "dark" || (next === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
  };

  return (
    <button
      onClick={cycle}
      title={theme.toUpperCase()}
      className="w-8 h-8 flex items-center justify-center border border-[#E5E5E5] dark:border-[#333] hover:border-[#0A0A0A] dark:hover:border-[#F5F5F5] transition-colors text-[#6B6B6B] dark:text-[#A0A0A0]"
    >
      {theme === "light" ? <SunIcon /> : theme === "dark" ? <MoonIcon /> : <SystemIcon />}
    </button>
  );
}
