import { NextRequest, NextResponse } from "next/server";
import type { InboundIntent } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseMessage, type ParseContext, type ParsedMessage } from "@/lib/messageParser";
import { getProvider } from "@/lib/messaging/twilio";
import { inboundWebhookUrl } from "@/lib/messaging/config";
import { cancelAllScheduled, cancelScheduled, sendMessage } from "@/lib/messaging/send";
import { planIndexFor, PLAN_USER_SELECT, type PlanUser } from "@/lib/messaging/plan";
import {
  nightDateFor,
  recordBed,
  recordDeclaredWake,
  recordRecalledDuration,
  recordUp,
} from "@/lib/messaging/night";
import {
  addLocalDays,
  isValidTimeZone,
  localClockOf,
  localDateOf,
  type LocalDate,
} from "@/lib/messaging/time";
import {
  bedAcknowledged,
  clarification,
  friendlyTime,
  helpReply,
  lightsOut,
  morningMessage,
  verdictHeadline,
} from "@/lib/messaging/copy";
import { verdictForUser, VERDICT_USER_SELECT } from "@/lib/messaging/verdictFor";
import type { DailySleepPlan } from "@/lib/sleepAlgorithm";

// Inbound provider webhook.
//
// Replies go through `sendMessage` rather than being returned as TwiML. TwiML
// would save an API call, but it would route around the ledger, the daily cap
// and the send gate — a reply is a message, and every message has to be
// countable and stoppable by the same machinery.
//
// One consequence of scheduling the morning message a night ahead: its text has
// to be fixed at schedule time, before we know whether a BED reply will arrive.
// So it is scheduled when the wake time is declared and then cancelled and
// re-scheduled if BED does arrive, which is how "asks nothing if we already
// have BED" is honoured without a tick that runs at wake-up time.

export const dynamic = "force-dynamic";

/** Twilio expects a TwiML document; an empty one means "no inline reply". */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function twiml() {
  return new NextResponse(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function intentOf(parsed: ParsedMessage): InboundIntent {
  return parsed.intent;
}

function valueOf(parsed: ParsedMessage): string | null {
  if (parsed.intent === "WAKE_TIME") return parsed.clock;
  if (parsed.intent === "DURATION") return String(parsed.minutes);
  return null;
}

type InboundUser = PlanUser & {
  ianaTimezone: string | null;
  smsStatus: "UNVERIFIED" | "ACTIVE" | "STOPPED";
};

/**
 * What we last asked this athlete, which decides whether a bare "11" reads as
 * 11:00 or 23:00.
 *
 * Keyed on the last message actually delivered, not the last one created: the
 * morning message is written to the ledger the evening before, so ordering by
 * creation would flip the reading of every reply sent between declaring a wake
 * time and going to bed.
 */
async function contextFor(userId: string): Promise<ParseContext> {
  const last = await prisma.sentMessage.findFirst({
    where: {
      userId,
      messageType: { in: ["EVENING_WAKE_QUESTION", "MORNING_VERDICT"] },
      sentAt: { not: null },
      status: { notIn: ["CANCELED", "FAILED"] },
    },
    orderBy: { sentAt: "desc" },
    select: { messageType: true },
  });
  // The morning message is the one that asks what time they got down.
  return last?.messageType === "MORNING_VERDICT" ? "bed_time" : "wake_time";
}

export async function POST(req: NextRequest) {
  const provider = getProvider();
  const url = inboundWebhookUrl();

  // Without credentials there is no way to authenticate the request, and an
  // unauthenticated inbound endpoint would let anyone write a sleep onset time
  // into another athlete's record by spoofing their number. Deliberately not
  // relaxed under DRY_RUN, which governs outbound only.
  if (!provider || !url) {
    console.error("[messaging] inbound received but provider or webhook URL is not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const signature = req.headers.get("x-twilio-signature");

  if (!provider.verifySignature({ url, signature, params, rawBody })) {
    console.warn("[messaging] rejected inbound with an invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const receivedAt = new Date();
  const inbound = provider.normalizeInbound(params, receivedAt);
  if (!inbound) {
    console.warn("[messaging] inbound payload had no From/To");
    return twiml();
  }

  // Providers retry on timeout or a 5xx, so the same message can arrive twice.
  // Without this, a redelivered BED would look like a second BED and be filed
  // as a split night — a retry inventing a data-quality problem that never
  // happened.
  if (inbound.providerMessageSid) {
    const seen = await prisma.inboundMessage.findFirst({
      where: { providerMessageSid: inbound.providerMessageSid },
      select: { id: true },
    });
    if (seen) {
      console.info(`[messaging] ignoring redelivery of ${inbound.providerMessageSid}`);
      return twiml();
    }
  }

  const user = (await prisma.user.findUnique({
    where: { phoneNumber: inbound.from },
    select: { ...PLAN_USER_SELECT, ianaTimezone: true, smsStatus: true },
  })) as InboundUser | null;

  const context = user ? await contextFor(user.id) : "wake_time";
  const parsed = parseMessage(inbound.body, { expecting: context });

  // Stored before anything is acted on, and stored even when the number matches
  // no user. When the parser is wrong about a real message — and it will be —
  // this column is the only way to find out what people actually wrote.
  await prisma.inboundMessage.create({
    data: {
      userId: user?.id ?? null,
      fromNumber: inbound.from,
      rawBody: inbound.body,
      intent: intentOf(parsed),
      parsedValue: valueOf(parsed),
      receivedAt,
      providerMessageSid: inbound.providerMessageSid,
    },
  });

  if (!user) {
    console.warn(`[messaging] inbound from unrecognized number ${inbound.from}`);
    return twiml();
  }

  const tz = user.ianaTimezone;
  if (!isValidTimeZone(tz)) {
    console.error(`[messaging] user=${user.id} has unusable timezone ${JSON.stringify(tz)}`);
    return twiml();
  }

  // Handled first, and regardless of current status, so a second STOP from
  // someone already stopped is still a success rather than falling through to a
  // clarification reply.
  if (parsed.intent === "STOP") {
    await prisma.user.update({ where: { id: user.id }, data: { smsStatus: "STOPPED" } });
    const cancelled = await cancelAllScheduled(user.id);
    console.info(
      `[messaging] user=${user.id} opted out; ${cancelled} scheduled message(s) cancelled`,
    );
    // No acknowledgment from us. The status above now blocks every send, and
    // Twilio's Advanced Opt-Out has already replied at the Messaging Service.
    return twiml();
  }

  if (user.smsStatus === "STOPPED") {
    // Recorded and ignored. Re-enrolling happens on the website, by the
    // athlete — not by texting back.
    return twiml();
  }

  const nightDate = nightDateFor(receivedAt, tz);
  const localDate = localDateOf(receivedAt, tz);
  const fallbackBedtime = user.currentBedTime ?? "22:00";

  switch (parsed.intent) {
    case "HELP":
      await sendMessage({
        userId: user.id,
        messageType: "HELP_REPLY",
        body: helpReply(),
        localDate,
      });
      return twiml();

    case "BED": {
      const row = await recordBed({
        userId: user.id,
        nightDate,
        receivedAt,
        fallbackBedtime,
      });
      await sendMessage({
        userId: user.id,
        messageType: "BED_ACK",
        body: bedAcknowledged(friendlyTime(localClockOf(receivedAt, tz))),
        localDate,
      });
      // Now that onset is known, the morning message no longer needs to ask for
      // it. Re-scheduling is the only way to change text already queued.
      //
      // The plan is rebuilt with the declared wake still applied. Without it
      // the verdict would fall back to the athlete's default wake time and
      // quietly lose the short-night branch — the message would go out cheerful
      // about a session they will not have slept for.
      if (row.declaredWakeAt) {
        await scheduleMorning({
          user,
          nightDate,
          wakeInstant: row.declaredWakeAt,
          askForBedtime: false,
          plans: await planIndexFor(user, {
            localDate: nightDate,
            clock: localClockOf(row.declaredWakeAt, tz),
          }),
        });
      }
      return twiml();
    }

    case "UP":
      await recordUp({ userId: user.id, nightDate, receivedAt, fallbackBedtime });
      // No reply. The morning message is already scheduled for the declared
      // wake time; acknowledging as well would be two texts inside a minute.
      return twiml();

    case "DURATION":
      await recordRecalledDuration({
        userId: user.id,
        nightDate,
        minutes: parsed.minutes,
        fallbackBedtime,
      });
      return twiml();

    case "WAKE_TIME": {
      const { wakeInstant } = await recordDeclaredWake({
        userId: user.id,
        nightDate,
        clock: parsed.clock,
        timeZone: tz,
        fallbackBedtime,
      });

      const plans = await planIndexFor(user, { localDate: nightDate, clock: parsed.clock });
      const plan = plans.get(nightDate);

      await sendMessage({
        userId: user.id,
        messageType: "LIGHTS_OUT",
        body: lightsOut(friendlyTime(plan?.recommendedBedtime ?? fallbackBedtime)),
        localDate,
      });

      await scheduleMorning({
        user,
        nightDate,
        wakeInstant,
        askForBedtime: true,
        plans,
      });
      return twiml();
    }

    default:
      await sendMessage({
        userId: user.id,
        messageType: "CLARIFICATION",
        body: clarification(),
        localDate,
      });
      return twiml();
  }
}

/**
 * Queues (or re-queues) the morning message for the declared wake time.
 *
 * Always cancels first. A wake time revised at 22:00 and a BED reply at 21:30
 * both invalidate text already sitting in the provider's schedule, and both
 * route through the same cancellation the STOP path uses.
 */
async function scheduleMorning(input: {
  user: InboundUser;
  nightDate: LocalDate;
  wakeInstant: Date;
  askForBedtime: boolean;
  /** Reuses the caller's plan when it already built one. */
  plans?: Map<string, DailySleepPlan>;
}) {
  const morningDate = addLocalDays(input.nightDate, 1);
  await cancelScheduled({
    userId: input.user.id,
    localDate: morningDate,
    messageType: "MORNING_VERDICT",
  });

  const plans = input.plans ?? (await planIndexFor(input.user));
  const todayPlan = plans.get(input.nightDate);
  if (!todayPlan) {
    console.error(
      `[messaging] no plan day for ${input.nightDate}; morning message not scheduled for user=${input.user.id}`,
    );
    return;
  }

  const verdictUser = await prisma.user.findUnique({
    where: { id: input.user.id },
    select: VERDICT_USER_SELECT,
  });
  if (!verdictUser) return;

  const verdict = await verdictForUser(
    verdictUser,
    todayPlan,
    plans.get(addLocalDays(input.nightDate, 1)),
  );

  await sendMessage({
    userId: input.user.id,
    messageType: "MORNING_VERDICT",
    body: morningMessage({
      headline: verdictHeadline(verdict),
      askForBedtime: input.askForBedtime,
    }),
    localDate: morningDate,
    sendAt: input.wakeInstant,
  });
}
