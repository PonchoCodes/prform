// Email channel smoke test, through the real send path.
//
// Sends to a real inbox through `sendMessage` — the gate, the ledger and the
// Resend driver — because an API 200 from a toy call proves nothing about the
// path production will take. Run with:
//
//   npx tsx scripts/emailSmoke.ts immediate         # evening question, now
//   npx tsx scripts/emailSmoke.ts scheduled [mins]  # morning message, held by Resend
//
// The scheduled mode defaults to 17 minutes out: the schedule floor is 15, and
// anything inside it is silently promoted to an immediate send, which would
// pass the test without testing the thing.

import "dotenv/config";
import { prisma } from "@/lib/prisma";
import { sendMessage } from "@/lib/messaging/send";
import { eveningWakeQuestion, morningMessage } from "@/lib/messaging/copy";
import { localDateOf } from "@/lib/messaging/time";

const RECIPIENT = "609poncho@gmail.com";

async function main() {
  const mode = process.argv[2];
  if (mode !== "immediate" && mode !== "scheduled") {
    throw new Error("usage: tsx scripts/emailSmoke.ts <immediate|scheduled> [minutesOut]");
  }

  console.log("RESEND_API_KEY set:", Boolean(process.env.RESEND_API_KEY));
  console.log("EMAIL_FROM:", process.env.EMAIL_FROM || "(unset — falls back to onboarding@resend.dev)");

  const user = await prisma.user.findUnique({
    where: { email: RECIPIENT },
    select: { id: true, ianaTimezone: true, smsStatus: true, channelPreference: true },
  });
  if (!user) throw new Error(`no user with email ${RECIPIENT}`);
  console.log("user:", user);
  if (!user.ianaTimezone) {
    throw new Error("user has no ianaTimezone; the gate will refuse. Set one before testing.");
  }

  const now = new Date();
  const localDate = localDateOf(now, user.ianaTimezone);

  const outcome =
    mode === "immediate"
      ? await sendMessage({
          userId: user.id,
          messageType: "EVENING_WAKE_QUESTION",
          body: eveningWakeQuestion(),
          localDate,
          forceChannel: "EMAIL",
        })
      : await sendMessage({
          userId: user.id,
          messageType: "MORNING_VERDICT",
          body: morningMessage({
            headline: "Scheduled email test. If this arrived on time, Resend held it as promised.",
            askForBedtime: false,
          }),
          localDate,
          sendAt: new Date(now.getTime() + Number(process.argv[3] ?? 17) * 60_000),
          forceChannel: "EMAIL",
        });

  console.log("outcome:", outcome);

  if ("sentMessageId" in outcome) {
    const row = await prisma.sentMessage.findUnique({
      where: { id: outcome.sentMessageId },
      select: {
        messageType: true,
        channel: true,
        status: true,
        localDate: true,
        scheduledFor: true,
        sentAt: true,
        providerMessageSid: true,
      },
    });
    console.log("ledger row:", row);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
