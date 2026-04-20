import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          black: "#0A0A0A",
          white: "#FFFFFF",
          accent: "#E8FF00",
          secondary: "#6B6B6B",
          border: "#E5E5E5",
        },
      },
      fontFamily: {
        sans: ["DM Sans", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        hero: ["88px", { lineHeight: "1", fontWeight: "900" }],
        "hero-sm": ["52px", { lineHeight: "1.05", fontWeight: "900" }],
        "section": ["42px", { lineHeight: "1.1", fontWeight: "800" }],
      },
      maxWidth: {
        content: "1200px",
      },
      borderRadius: {
        DEFAULT: "0",
        sm: "0",
        md: "0",
        lg: "0",
        xl: "0",
        "2xl": "0",
        "3xl": "0",
        full: "0",
      },
      animation: {
        "ticker": "ticker 30s linear infinite",
        "accent-pulse": "accentPulse 2s ease-in-out infinite",
        "fade-up": "fadeUp 400ms ease-out forwards",
        "count-up": "countUp 600ms ease-out forwards",
      },
      keyframes: {
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        accentPulse: {
          "0%, 100%": { opacity: "0.85" },
          "50%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        countUp: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
