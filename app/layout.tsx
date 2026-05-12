import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  display: "swap",
});

const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PRform: Sleep Sharp. Race Faster.",
  description: "Performance sleep optimization for competitive runners.",
  themeColor: "#0A0A0A",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "PRform",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistMono.variable} ${geist.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var s=localStorage.getItem('prform-theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(s==='dark'||(s!=='light'&&d))document.documentElement.classList.add('dark');})()` }} />
      </head>
      <body className="font-sans antialiased bg-white dark:bg-[#1a1a1a] text-[#0A0A0A] dark:text-[#F5F5F5]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
