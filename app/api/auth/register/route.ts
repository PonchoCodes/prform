import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Registration is open. No allowlist, no approval, no waitlist row, and no
// payment: an athlete who signs up here has the whole athlete product.
//
// Two things are required beyond an email and a password, and neither is a
// gate on access:
//
//   signupRole:   "ATHLETE" or "COACH". It decides which screen comes next
//                  and nothing else. A coach gets the same athlete features a
//                  runner does, because plenty of coaches run.
//   ageConfirmed: the 13-or-older box, with the moment it was ticked. Refused
//                  server-side as well as in the form: an age confirmation the
//                  client can skip is not a confirmation.

const SIGNUP_ROLES = new Set(["ATHLETE", "COACH"]);

export async function POST(req: Request) {
  try {
    const { name, email, password, signupRole, ageConfirmed } = await req.json();

    if (!email || !password || password.length < 8) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    if (!SIGNUP_ROLES.has(signupRole)) {
      return NextResponse.json({ error: "Tell us whether you run or coach." }, { status: 400 });
    }

    if (ageConfirmed !== true) {
      return NextResponse.json(
        { error: "You have to confirm you are 13 or older." },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const hash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        signupRole,
        ageConfirmed: true,
        ageConfirmedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true, signupRole });
  } catch (e: any) {
    console.error("[register]", e);
    return NextResponse.json({ error: e?.message ?? "Internal server error" }, { status: 500 });
  }
}
