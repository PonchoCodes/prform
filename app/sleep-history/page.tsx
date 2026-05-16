"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SleepHistoryRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/sleep"); }, [router]);
  return null;
}
