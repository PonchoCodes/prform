// The only file in the app that imports the Twilio SDK. Everything else goes
// through MessageProvider, so a WhatsApp driver later is a sibling of this file
// rather than a change to any caller.

import twilio from "twilio";
import type { Twilio } from "twilio";
import { twilioConfig, type TwilioConfig } from "@/lib/messaging/config";
import {
  scheduleWindowFor,
  SCHEDULE_FLOOR_MINUTES,
  type CancelResult,
  type MessageProvider,
  type NormalizedInbound,
  type PhoneNumber,
  type SendResult,
} from "@/lib/messaging/provider";

function errorText(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

/**
 * Twilio error codes that mean "this message is not going to be delivered to
 * this number, ever" — as opposed to a transient failure worth retrying.
 * 21610 is the one that matters: the recipient has opted out at the carrier
 * level. Seeing it means our own STOP handling missed something.
 */
const PERMANENT_FAILURE_CODES = new Set([21610, 21211, 21614]);

export class TwilioProvider implements MessageProvider {
  readonly name = "twilio";
  private readonly config: TwilioConfig;
  private client: Twilio | null = null;

  constructor(config: TwilioConfig) {
    this.config = config;
  }

  private getClient(): Twilio {
    if (!this.client) {
      this.client = twilio(this.config.accountSid, this.config.authToken);
    }
    return this.client;
  }

  async schedule(to: PhoneNumber, body: string, sendAt: Date): Promise<SendResult> {
    // Checked here rather than left to the API so a rejection is a decision the
    // caller can act on — send now, or skip — instead of an exception thrown
    // from inside a cron at 03:00.
    const window = scheduleWindowFor(sendAt, new Date());
    if (window !== "ok") {
      return {
        ok: false,
        providerMessageSid: null,
        providerStatus: null,
        error:
          window === "too_soon"
            ? `sendAt is inside the ${SCHEDULE_FLOOR_MINUTES}-minute scheduling floor`
            : "sendAt is beyond the 35-day scheduling ceiling",
      };
    }

    try {
      const message = await this.getClient().messages.create({
        to,
        body,
        messagingServiceSid: this.config.messagingServiceSid,
        scheduleType: "fixed",
        sendAt,
      });
      return {
        ok: true,
        providerMessageSid: message.sid,
        providerStatus: message.status ?? null,
        error: null,
      };
    } catch (e) {
      return this.failure(e);
    }
  }

  async sendNow(to: PhoneNumber, body: string): Promise<SendResult> {
    try {
      const message = await this.getClient().messages.create({
        to,
        body,
        messagingServiceSid: this.config.messagingServiceSid,
      });
      return {
        ok: true,
        providerMessageSid: message.sid,
        providerStatus: message.status ?? null,
        error: null,
      };
    } catch (e) {
      return this.failure(e);
    }
  }

  async cancel(providerMessageSid: string): Promise<CancelResult> {
    try {
      await this.getClient().messages(providerMessageSid).update({ status: "canceled" });
      return { ok: true, alreadyResolved: false, error: null };
    } catch (e) {
      const code = (e as { code?: number }).code;
      const status = (e as { status?: number }).status;
      // A message that already sent, was already canceled, or is unknown cannot
      // be cancelled and never will be. Reported as resolved so the caller
      // stops trying — the row is closed out either way.
      if (status === 404 || code === 20404 || code === 21609) {
        return { ok: false, alreadyResolved: true, error: errorText(e) };
      }
      return { ok: false, alreadyResolved: false, error: errorText(e) };
    }
  }

  verifySignature(input: {
    url: string;
    signature: string | null;
    params: Record<string, string>;
    rawBody: string;
  }): boolean {
    if (!input.signature) return false;
    try {
      return twilio.validateRequest(
        this.config.authToken,
        input.signature,
        input.url,
        input.params,
      );
    } catch {
      return false;
    }
  }

  normalizeInbound(params: Record<string, string>, receivedAt: Date): NormalizedInbound | null {
    const from = params.From;
    const to = params.To;
    if (!from || !to) return null;
    return {
      from,
      to,
      // Body can legitimately be an empty string. `?? ""` rather than `|| ""`
      // would be identical here, but the point is that a blank message is a
      // real inbound to record, not a reason to drop the webhook.
      body: typeof params.Body === "string" ? params.Body : "",
      providerMessageSid: params.MessageSid || params.SmsMessageSid || null,
      receivedAt,
    };
  }

  private failure(e: unknown): SendResult {
    const code = (e as { code?: number }).code;
    const permanent = typeof code === "number" && PERMANENT_FAILURE_CODES.has(code);
    return {
      ok: false,
      providerMessageSid: null,
      providerStatus: permanent ? "permanent_failure" : null,
      error: `${code ?? "unknown"}: ${errorText(e)}`,
    };
  }
}

let cached: TwilioProvider | null = null;

/**
 * The configured provider, or null when credentials are absent. Null is normal
 * under DRY_RUN and in local development — the send path logs and stops rather
 * than throwing, so nothing depends on Twilio being reachable to run the app.
 */
export function getProvider(): MessageProvider | null {
  const config = twilioConfig();
  if (!config) return null;
  if (!cached) cached = new TwilioProvider(config);
  return cached;
}
