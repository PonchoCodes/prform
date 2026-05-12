"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { FadeUp } from "@/components/FadeUp";
import { Ticker } from "@/components/Ticker";
import { Button } from "@/components/Button";
import { WebGLShader } from "@/components/ui/web-gl-shader";

const meets = [
  "Penn Relays",
  "Boston Marathon",
  "New York Road Runners",
  "USATF Outdoor Championships",
  "Drake Relays",
  "Prefontaine Classic",
  "NYC Half Marathon",
  "Chicago Marathon",
  "Millrose Games",
  "Mt. SAC Relays",
];

const features = [
  {
    tag: "Sleep Science",
    title: "Circadian Optimization",
    body: "PRform calculates your precise bedtime by working backward from race day, shifting your sleep phase earlier so your body peaks at the start line and you cross the finish line with a PR.",
  },
  {
    tag: "Behavioral Coaching",
    title: "Wind-Down Protocol",
    body: "A time-stamped 3-hour countdown before bed. Light dimming, screen removal, final cool-down. Behavioral consistency is what actually shifts your circadian rhythm and makes meet day performance possible.",
  },
  {
    tag: "Race Readiness",
    title: "Meet-Day Precision",
    body: "Every A, B, and C race gets its own taper curve. PRform knows whether tomorrow is a tempo day or peak race week and adjusts your nightly sleep target to maximize your PR potential.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b border-[#E5E5E5] bg-white sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between">
          <span className="font-black text-xl uppercase tracking-tight">
            PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
          </span>
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
        </div>
      </nav>

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-[#0A0A0A] text-white relative overflow-hidden"
        style={{ minHeight: "100vh" }}
      >
        {/* WebGL chromatic-aberration shader background */}
        <WebGLShader />

        {/* Gradient overlay — keeps text legible over the shader */}
        <div className="absolute inset-0 z-10 bg-gradient-to-r from-[#0A0A0A] via-[#0A0A0A]/70 to-transparent pointer-events-none" />

        {/* Content */}
        <div className="relative z-20 max-w-[1200px] mx-auto px-6 py-24 md:py-36 flex flex-col justify-center min-h-screen">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#E8FF00] mb-6">Performance Sleep Optimization</p>
          <h1 className="font-black uppercase leading-none mb-8 text-5xl md:text-8xl xl:text-[96px]">
            Sleep Sharp.<br />Race Faster.
          </h1>
          <p className="text-[#AAAAAA] text-lg md:text-xl max-w-2xl mb-10 leading-relaxed">
            PRform uses sport science to calculate the exact bedtime you need every night of your training cycle, then coaches you through a wind-down protocol that actually shifts your circadian rhythm before meet day. More PRs start the night before than at the start line.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <Link href="/signup">
              <Button size="lg" variant="primary">
                Get Started Free →
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="ghost" className="!border-[#444] !text-white hover:!border-white">
                Demo Login
              </Button>
            </Link>
          </div>
          <p className="mt-6 text-xs text-[#6B6B6B] font-mono">demo@prform.com / demo1234</p>
        </div>
      </motion.section>

      <Ticker items={meets} />

      <section className="py-24 px-6">
        <div className="max-w-[1200px] mx-auto">
          <FadeUp>
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-[#6B6B6B] mb-3">How It Works</p>
            <h2 className="font-black text-4xl md:text-5xl uppercase mb-16">Built on Sleep Science</h2>
          </FadeUp>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-[#E5E5E5]">
            {features.map((f, i) => (
              <FadeUp key={f.tag} delay={i * 80}>
                <div className="bg-white p-8 h-full border border-[#E5E5E5] group hover:border-[#0A0A0A] transition-colors">
                  <p className="text-xs font-bold uppercase tracking-widest text-[#E8FF00] bg-[#0A0A0A] inline-block px-2 py-0.5 mb-6">
                    {f.tag}
                  </p>
                  <h3 className="font-black text-xl uppercase mb-4">{f.title}</h3>
                  <p className="text-[#6B6B6B] text-sm leading-relaxed">{f.body}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#0A0A0A] py-24 px-6">
        <div className="max-w-[1200px] mx-auto text-center text-white">
          <FadeUp>
            <h2 className="font-black text-4xl md:text-6xl uppercase mb-6">Your Next PR Starts Tonight</h2>
            <p className="text-[#AAAAAA] text-lg max-w-xl mx-auto mb-10">
              Elite runners do not sleep more than you. They sleep at the right time. That is the difference between a PR and a missed window.
            </p>
            <Link href="/signup">
              <Button size="lg" variant="primary">Create Free Account</Button>
            </Link>
          </FadeUp>
        </div>
      </section>

      <footer className="border-t border-[#E5E5E5] py-8 px-6">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between">
          <span className="font-black text-sm uppercase tracking-tight">
            PR<span className="text-[#E8FF00] bg-[#0A0A0A] px-1">form</span>
          </span>
          <div className="flex items-center gap-6">
            <p className="text-xs text-[#6B6B6B] uppercase tracking-wider">Sleep Sharp. Race Faster.</p>
            <a href="/privacy" className="font-mono text-[10px] text-[#6B6B6B] no-underline hover:text-[#0A0A0A]">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
