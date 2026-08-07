// What this browser can actually do about notifications, decided as pure
// functions over a snapshot of the environment.
//
// Pure because the interesting cases are the ones that are miserable to
// reproduce by hand: an iPhone in Safari (push impossible), the same iPhone
// after the app is installed (push fine), an iPad that reports itself as a Mac,
// a desktop Chrome where installation is optional and push works either way.
// Passing an `Environment` in means all of those are a test rather than a
// device on a desk.
//
// The rule that drives most of this: on iOS, web push exists only inside an
// installed PWA. Safari on iOS will not even expose PushManager in a normal
// tab, so asking for permission there does not fail — there is nothing to ask.
// An athlete who taps "turn on notifications" and sees nothing happen is owed
// an explanation, and this is where the explanation comes from.

export type Platform = "ios" | "android" | "desktop" | "unknown";

export interface Environment {
  userAgent: string;
  /** iPadOS 13+ reports a Mac user agent; touch points are what give it away. */
  maxTouchPoints: number;
  /** Running from the home screen rather than in a browser tab. */
  standalone: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}

export function detectPlatform(userAgent: string, maxTouchPoints: number): Platform {
  if (!userAgent) return "unknown";

  // Android must be tested before the generic mobile checks: an Android device
  // running Chrome carries "Linux" and, on some builds, "Mac OS X" fragments.
  if (/Android/i.test(userAgent)) return "android";

  if (/iPhone|iPod/i.test(userAgent)) return "ios";
  // An iPad on iPadOS 13+ sends a desktop Safari user agent by default. A real
  // Mac reports maxTouchPoints of 0 even with a trackpad, so a "Macintosh" that
  // claims touch points is an iPad.
  if (/iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    return "ios";
  }

  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) return "desktop";
  return "unknown";
}

export type PushAvailability =
  /** Permission can be requested right now. */
  | { state: "ready" }
  /**
   * Everything works, but only once the app is on the home screen. iOS only,
   * and the single most common reason push "doesn't work" for an athlete.
   */
  | { state: "needs_install" }
  /** This browser cannot do web push at all, however it is installed. */
  | { state: "unsupported"; reason: "no_service_worker" | "no_push_manager" | "no_notification" };

/**
 * Whether notifications can be turned on here, and if not, why not.
 *
 * The iOS branch is checked before the capability checks on purpose. In a
 * normal iOS tab `hasPushManager` is false, which would otherwise be reported
 * as "your browser doesn't support notifications" — true in the narrowest sense
 * and useless as advice, since installing the app fixes it.
 */
export function pushAvailability(env: Environment): PushAvailability {
  const platform = detectPlatform(env.userAgent, env.maxTouchPoints);

  if (platform === "ios" && !env.standalone) {
    return { state: "needs_install" };
  }

  if (!env.hasServiceWorker) return { state: "unsupported", reason: "no_service_worker" };
  if (!env.hasNotification) return { state: "unsupported", reason: "no_notification" };
  if (!env.hasPushManager) return { state: "unsupported", reason: "no_push_manager" };

  return { state: "ready" };
}

/**
 * Whether to show the "add PRform to your home screen" notice.
 *
 * Four conditions, each of which has cost somebody a prompt somewhere:
 *
 *   Already installed — nothing to ask for.
 *   Already subscribed — they are reachable; the notice has no job left.
 *   Already dismissed — asked and answered, on any of their devices.
 *   Nothing logged yet — the prompt arrives after PRform has done something
 *     for them, not on the first screen. Onboarding is the deliberate
 *     exception: there the ask is part of setting the thing up, and the caller
 *     passes `duringOnboarding`.
 */
export function shouldShowInstallNotice(input: {
  standalone: boolean;
  subscribed: boolean;
  dismissed: boolean;
  hasLoggedNight: boolean;
  duringOnboarding?: boolean;
}): boolean {
  if (input.standalone) return false;
  if (input.subscribed) return false;
  if (input.duringOnboarding) return true;
  if (input.dismissed) return false;
  return input.hasLoggedNight;
}

/**
 * How this particular person installs the app.
 *
 * iOS gets literal menu wording because there is no install prompt to trigger:
 * Safari's Share sheet is the only route, and "install the app" means nothing
 * to someone looking at a page with no install button on it.
 */
export function installInstructions(platform: Platform): {
  headline: string;
  steps: string[];
} | null {
  switch (platform) {
    case "ios":
      return {
        headline: "Add PRform to your home screen",
        steps: [
          "Tap the Share button at the bottom of Safari (the square with an arrow).",
          "Scroll down and tap “Add to Home Screen”.",
          "Tap “Add”, then open PRform from your home screen.",
        ],
      };
    case "android":
      return {
        headline: "Install PRform",
        steps: [
          "Tap Install below, or open Chrome’s menu (⋮) and tap “Add to Home screen”.",
          "Confirm, then open PRform from your home screen.",
        ],
      };
    case "desktop":
      return {
        headline: "Install PRform",
        steps: [
          "Click Install below, or use the install icon in your browser’s address bar.",
        ],
      };
    default:
      return null;
  }
}

/**
 * Why iOS needs the install, in one sentence an athlete can act on. Kept here
 * rather than in the component so the wording is testable and appears once.
 */
export const IOS_PUSH_EXPLANATION =
  "On iPhone and iPad, Apple only allows notifications once an app is on your home screen. Add PRform there first and you'll be able to turn them on.";

/** Reads the live browser environment. The only impure function in this file. */
export function readEnvironment(): Environment | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") return null;

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // Safari's own flag, which predates the standard media query and is still
    // the only reliable signal on iOS.
    (navigator as unknown as { standalone?: boolean }).standalone === true;

  return {
    userAgent: navigator.userAgent ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standalone,
    hasServiceWorker: "serviceWorker" in navigator,
    hasPushManager: "PushManager" in window,
    hasNotification: "Notification" in window,
  };
}

/**
 * VAPID keys travel as base64url; PushManager wants raw bytes.
 *
 * Backed by an explicitly constructed ArrayBuffer rather than the shorthand
 * `new Uint8Array(length)`. Both produce the same bytes, but the shorthand is
 * typed over `ArrayBufferLike`, which includes SharedArrayBuffer and so is not
 * assignable to the `BufferSource` that `applicationServerKey` requires.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}
