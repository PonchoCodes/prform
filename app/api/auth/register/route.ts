import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { isEarlyAccessEnabled, isEmailApproved } from "@/lib/earlyAccess";

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();

    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const approved = await isEmailApproved(email);

    if (isEarlyAccessEnabled() && !approved) {
      return NextResponse.json(
        { error: "PRform is in early access. Request access to join the waitlist.", code: "WAITLIST" },
        { status: 403 }
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);
    // Approved waitlist members are grandfathered into free access permanently,
    // even if they register after EARLY_ACCESS is flipped off.
    await prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        ...(approved ? { approved: true, earlyAccessUser: true } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[register]", e);
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}
