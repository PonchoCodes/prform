import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { email, name, role, weeklyMileage, usesStrava, notes } = await req.json();

    if (!email || !name || (role !== "RUNNER" && role !== "COACH")) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const mileage =
      weeklyMileage === null || weeklyMileage === undefined || weeklyMileage === ""
        ? null
        : parseInt(weeklyMileage, 10);

    const data = {
      name: String(name).trim(),
      role,
      weeklyMileage: Number.isNaN(mileage) ? null : mileage,
      usesStrava: Boolean(usesStrava),
      notes: notes ? String(notes).trim() : null,
    };

    // Re-submitting updates the details but never resets an APPROVED or
    // REJECTED decision back to PENDING.
    await prisma.waitlist.upsert({
      where: { email: normalizedEmail },
      create: { email: normalizedEmail, ...data },
      update: data,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[waitlist]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
