import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata: Metadata = {
  title: "PRform: Sleep Sharp. Race Faster.",
  description: "Performance sleep optimization for competitive runners.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-[#0A0A0A]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
