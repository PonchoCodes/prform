// The push send path, end to end, against a real database and a real push
// service — one we stand up ourselves and read the requests from.
//
// This is the test that proves the pilot works. During the month without SMS,
// every athlete has no phone number at all, and the chain that has to hold is:
//
//   a user with a subscription and no phone
//     → resolveChannel picks PUSH
//     → the gate does not ask for a phone number
//     → a future message is HELD in our own ledger, not handed to anyone
//     → the flush pass delivers it when due
//     → a push service receives an encrypted, VAPID-signed POST
//
// Every one of those links was a place the SMS-shaped code would have refused a
// push, and none of them is visible from a unit test of any single piece.
//
// The local HTTPS server plays the push service. It is the real thing from
// web-push's point of view: a URL it POSTs ciphertext to.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import https from "node:https";
import crypto from "node:crypto";

import { prisma } from "@/lib/prisma";
import { sendMessage, cancelScheduled } from "@/lib/messaging/send";
import { flushDuePushMessages } from "@/lib/messaging/pushFlush";

// ── a push service ──────────────────────────────────────────────────────────

interface CapturedRequest {
  path: string;
  authorization: string;
  contentEncoding: string;
  ttl: string;
  body: Buffer;
}

let server: https.Server;
let origin: string;
let captured: CapturedRequest[] = [];
/** Endpoints the fake service should reject as permanently gone. */
let goneEndpoints = new Set<string>();

beforeAll(async () => {
  // web-push refuses a plain-http endpoint, so the fake service speaks TLS.
  // Node cannot mint a certificate at runtime; see the fixture's own comment.
  const { key, cert } = await import("./fixtures/localhostCert");

  // The fake service presents a certificate this process has no reason to
  // trust. Scoped to the suite and removed in afterAll.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  server = https.createServer({ key, cert }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      if (goneEndpoints.has(req.url ?? "")) {
        // What a push service returns for a subscription that is permanently
        // gone — a wiped phone, an uninstalled PWA.
        res.writeHead(410).end();
        return;
      }
      captured.push({
        path: req.url ?? "",
        authorization: req.headers.authorization ?? "",
        contentEncoding: String(req.headers["content-encoding"] ?? ""),
        ttl: String(req.headers.ttl ?? ""),
        body: Buffer.concat(chunks),
      });
      res.writeHead(201).end();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  origin = `https://127.0.0.1:${port}`;
});

afterAll(async () => {
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User" RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();
});

// ── the athlete ─────────────────────────────────────────────────────────────

/** A browser's subscription keys, minted the way a browser mints them. */
function browserKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: crypto.randomBytes(16).toString("base64url"),
  };
}

let userId: string;
let endpoint: string;

const LOCAL_DATE = "2026-08-07";

beforeEach(async () => {
  captured = [];
  goneEndpoints = new Set();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User" RESTART IDENTITY CASCADE`);

  const user = await prisma.user.create({
    data: {
      email: "push.pilot@example.test",
      name: "Ottoline Vasquez-Hardacre",
      password: "not-a-real-hash",
      onboardingDone: true,
      // The pilot athlete, stated explicitly: no number, no verification, and
      // a timezone that came from the browser rather than a form.
      phoneNumber: null,
      phoneVerifiedAt: null,
      ianaTimezone: "America/New_York",
    },
    select: { id: true },
  });
  userId = user.id;

  endpoint = `${origin}/push/${crypto.randomUUID()}`;
  await prisma.pushSubscription.create({
    data: { userId, endpoint, platform: "android", ...browserKeys() },
  });
});

describe("an athlete with a subscription and no phone number", () => {
  it("receives an immediate message by push", async () => {
    const outcome = await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: "Solid night. Full session today.",
      localDate: LOCAL_DATE,
    });

    expect(outcome.status).toBe("sent");
    expect(outcome).toMatchObject({ channel: "PUSH" });
    expect(captured).toHaveLength(1);
  });

  it("is signed with VAPID and encrypted, with the plaintext nowhere in the body", async () => {
    const secret = "Solid night. Full session today.";
    await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: secret,
      localDate: LOCAL_DATE,
    });

    const request = captured[0];
    expect(request.authorization).toMatch(/^vapid t=/);
    expect(request.contentEncoding).toBe("aes128gcm");
    // The push service relays a payload it cannot read. If this ever fails,
    // an athlete's verdict is legible to their browser vendor.
    expect(request.body.includes(Buffer.from(secret))).toBe(false);
    expect(request.body.length).toBeGreaterThan(0);
  });

  it("writes one ledger row, marked PUSH", async () => {
    await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: "Solid night.",
      localDate: LOCAL_DATE,
    });

    const rows = await prisma.sentMessage.findMany({ where: { userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe("PUSH");
    expect(rows[0].status).toBe("SENT");
  });

  it("goes to every device they have, not just the newest", async () => {
    const second = `${origin}/push/${crypto.randomUUID()}`;
    await prisma.pushSubscription.create({
      data: { userId, endpoint: second, platform: "desktop", ...browserKeys() },
    });

    await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: "Solid night.",
      localDate: LOCAL_DATE,
    });

    expect(captured.map((c) => c.path).sort()).toEqual(
      [new URL(endpoint).pathname, new URL(second).pathname].sort(),
    );
  });
});

describe("a scheduled push is held by us, and flushed when due", () => {
  const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

  it("hands nothing to a push service at schedule time", async () => {
    const outcome = await sendMessage({
      userId,
      messageType: "EVENING_WAKE_QUESTION",
      body: "What time are you up tomorrow?",
      localDate: LOCAL_DATE,
      sendAt: inAnHour(),
    });

    expect(outcome.status).toBe("held");
    // The whole point of holding: nothing has left the building yet.
    expect(captured).toHaveLength(0);

    const row = await prisma.sentMessage.findFirstOrThrow({ where: { userId } });
    expect(row.status).toBe("SCHEDULED");
    expect(row.scheduledFor).not.toBeNull();
  });

  it("does not flush a message that is not due yet", async () => {
    await sendMessage({
      userId,
      messageType: "EVENING_WAKE_QUESTION",
      body: "What time are you up tomorrow?",
      localDate: LOCAL_DATE,
      sendAt: inAnHour(),
    });

    const result = await flushDuePushMessages(new Date());
    expect(result).toMatchObject({ sent: 0, failed: 0, stale: 0 });
    expect(captured).toHaveLength(0);
  });

  it("delivers it once it comes due", async () => {
    const sendAt = inAnHour();
    await sendMessage({
      userId,
      messageType: "EVENING_WAKE_QUESTION",
      body: "What time are you up tomorrow?",
      localDate: LOCAL_DATE,
      sendAt,
    });

    // One minute after it was due.
    const result = await flushDuePushMessages(new Date(sendAt.getTime() + 60_000));
    expect(result.sent).toBe(1);
    expect(captured).toHaveLength(1);

    const row = await prisma.sentMessage.findFirstOrThrow({ where: { userId } });
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();
  });

  it("never sends the same held message twice, even if the flush runs twice", async () => {
    const sendAt = inAnHour();
    await sendMessage({
      userId,
      messageType: "EVENING_WAKE_QUESTION",
      body: "What time are you up tomorrow?",
      localDate: LOCAL_DATE,
      sendAt,
    });

    const due = new Date(sendAt.getTime() + 60_000);
    const first = await flushDuePushMessages(due);
    const second = await flushDuePushMessages(due);

    expect(first.sent).toBe(1);
    expect(second.sent).toBe(0);
    // The property that matters at 06:00: one notification, not two.
    expect(captured).toHaveLength(1);
  });

  it("abandons a message that is too late to mean anything", async () => {
    const sendAt = inAnHour();
    await sendMessage({
      userId,
      messageType: "EVENING_WAKE_QUESTION",
      body: "What time are you up tomorrow?",
      localDate: LOCAL_DATE,
      sendAt,
    });

    // Three hours past due, beyond the two-hour staleness window. "What time
    // are you up tomorrow?" arriving now is not late, it is wrong.
    const result = await flushDuePushMessages(new Date(sendAt.getTime() + 3 * 60 * 60 * 1000));
    expect(result).toMatchObject({ sent: 0, stale: 1 });
    expect(captured).toHaveLength(0);

    const row = await prisma.sentMessage.findFirstOrThrow({ where: { userId } });
    expect(row.status).toBe("FAILED");
  });

  it("can be cancelled before it goes out, which is the STOP path", async () => {
    const sendAt = inAnHour();
    await sendMessage({
      userId,
      messageType: "EVENING_WAKE_QUESTION",
      body: "What time are you up tomorrow?",
      localDate: LOCAL_DATE,
      sendAt,
    });

    const closed = await cancelScheduled({ userId });
    expect(closed).toBe(1);

    const result = await flushDuePushMessages(new Date(sendAt.getTime() + 60_000));
    expect(result.sent).toBe(0);
    expect(captured).toHaveLength(0);
  });
});

describe("subscriptions that have died", () => {
  it("deletes a subscription the push service reports as gone", async () => {
    goneEndpoints.add(new URL(endpoint).pathname);

    const outcome = await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: "Solid night.",
      localDate: LOCAL_DATE,
    });

    expect(outcome.status).toBe("failed");
    // A 410 is permanent. Keeping the row would mean retrying this endpoint
    // every evening for the rest of the account's life.
    const remaining = await prisma.pushSubscription.count({ where: { userId } });
    expect(remaining).toBe(0);
  });

  it("still reaches the live device when one of two is gone", async () => {
    const live = `${origin}/push/${crypto.randomUUID()}`;
    await prisma.pushSubscription.create({
      data: { userId, endpoint: live, platform: "ios", ...browserKeys() },
    });
    goneEndpoints.add(new URL(endpoint).pathname);

    const outcome = await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: "Solid night.",
      localDate: LOCAL_DATE,
    });

    expect(outcome.status).toBe("sent");
    expect(captured.map((c) => c.path)).toEqual([new URL(live).pathname]);
    const remaining = await prisma.pushSubscription.findMany({ where: { userId } });
    expect(remaining.map((r) => r.endpoint)).toEqual([live]);
  });
});

describe("no channel at all", () => {
  it("reports no_channel rather than blocked when nothing is set up", async () => {
    await prisma.pushSubscription.deleteMany({ where: { userId } });

    const outcome = await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: "Solid night.",
      localDate: LOCAL_DATE,
    });

    // Distinct from "blocked": nothing refused this message. There is simply
    // nowhere to send it, which is a different fact about the athlete and one
    // the retention view needs to be able to tell apart.
    expect(outcome).toEqual({ status: "no_channel", reason: "nothing_configured" });
    expect(await prisma.sentMessage.count({ where: { userId } })).toBe(0);
  });

  it("refuses push for an athlete who texted STOP", async () => {
    await prisma.user.update({ where: { id: userId }, data: { smsStatus: "STOPPED" } });

    const outcome = await sendMessage({
      userId,
      messageType: "MORNING_VERDICT",
      body: "Solid night.",
      localDate: LOCAL_DATE,
    });

    // Telling us to stop means stop, on every channel. Delivering this by push
    // because STOP is an SMS word is the behaviour this pins shut.
    expect(outcome).toEqual({ status: "blocked", reason: "stopped" });
    expect(captured).toHaveLength(0);
  });
});
