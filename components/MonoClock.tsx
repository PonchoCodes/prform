"use client";
import { useEffect, useRef, useState } from "react";
import { formatTime12h } from "@/lib/sleepAlgorithm";

interface MonoClockProps {
  time24: string;
  className?: string;
  accent?: boolean;
  animate?: boolean;
}

export function MonoClock({ time24, className = "", accent = false, animate = false }: MonoClockProps) {
  const [displayed, setDisplayed] = useState(animate ? "0:00 AM" : formatTime12h(time24));
  const ref = useRef<HTMLSpanElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    if (!animate || animatedRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animatedRef.current) {
          animatedRef.current = true;
          const target = formatTime12h(time24);
          const [timePart, period] = target.split(" ");
          const [h, m] = timePart.split(":").map(Number);
          const start = performance.now();
          const duration = 600;

          const frame = (now: number) => {
            const progress = Math.min((now - start) / duration, 1);
            const currentH = Math.round(progress * h);
            const currentM = Math.round(progress * m);
            setDisplayed(
              `${currentH}:${String(currentM).padStart(2, "0")} ${period}`
            );
            if (progress < 1) requestAnimationFrame(frame);
            else setDisplayed(target);
          };

          requestAnimationFrame(frame);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [animate, time24]);

  useEffect(() => {
    if (!animate) setDisplayed(formatTime12h(time24));
  }, [time24, animate]);

  return (
    <span
      ref={ref}
      className={`font-mono ${accent ? "text-[#E8FF00] accent-pulse" : ""} ${className}`}
    >
      {displayed}
    </span>
  );
}
