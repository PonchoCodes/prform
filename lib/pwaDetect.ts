// What this browser can do about *installing* PRform, as opposed to what it can
// do about notifications — that question lives in lib/pwa/install.ts and this
// file defers to it rather than sniffing the user agent a second time.
//
// The split is worth stating because the two files look like duplicates:
//
//   lib/pwa/install.ts  — can this browser receive a push, and if not, why not.
//                         Owns platform detection and the Environment snapshot.
//   lib/pwaDetect.ts    — can this person reach an "add to home screen" affordance
//                         at all, and which one. Owns the in-app-browser question.
//
// Every function here is safe to call during SSR and returns the conservative
// answer when there is no window: not standalone, desktop, not an in-app
// browser. Conservative in this context means "show nothing" — a desktop
// platform renders no install steps, so a misdetected server render produces a
// quiet page rather than iPhone instructions on a laptop.

import { detectPlatform } from "@/lib/pwa/install";

export type InstallPlatform = "ios" | "android" | "desktop";

export interface InstallContext {
  platform: InstallPlatform;
  standalone: boolean;
  inAppBrowser: boolean;
  /** True only when a beforeinstallprompt event is sitting in the provider. */
  canPromptNatively: boolean;
}

// ── In-app browsers ─────────────────────────────────────────────────────────
//
// The webviews embedded in social apps render pages fine and then quietly omit
// the one menu item this whole feature depends on. An athlete who taps a PRform
// link in an Instagram DM is in one of these, and showing them "tap Share, then
// Add to Home Screen" describes a menu that is not on their screen — which
// reads as the app being broken rather than the browser being limited.
//
// Case-sensitive on purpose. A case-insensitive /Line/ matches nothing real
// today but is one Android OEM string away from matching "Linux", and a false
// positive here replaces working instructions with a dead end.
const IN_APP_BROWSER_PATTERNS: RegExp[] = [
  /FBAN/, // Facebook, iOS
  /FBAV/, // Facebook, Android
  /Instagram/,
  /Snapchat/,
  /\bLine\//, // LINE ships "Line/11.0.0"; the slash keeps it off "Linux"
  /Twitter/,
  /LinkedInApp/,
  /\bGSA\//, // the Google app's own webview, not Chrome
  /MicroMessenger/, // WeChat
  /TikTok/,
  /musical_ly/, // TikTok's older UA, still in the wild
  /BytedanceWebview/,
];

/** The pure half, so the interesting user agents are a test and not a device. */
export function matchInAppBrowser(userAgent: string): boolean {
  if (!userAgent) return false;
  return IN_APP_BROWSER_PATTERNS.some((re) => re.test(userAgent));
}

/**
 * Safari specifically, not "a browser on iOS".
 *
 * Add to Home Screen is a Safari feature. Chrome and Firefox on iOS are Safari
 * underneath but expose their own menus, and the steps differ enough that
 * naming Safari's Share sheet to a Chrome user sends them looking for a button
 * they do not have.
 */
export function matchIosSafari(userAgent: string): boolean {
  if (!userAgent) return false;
  if (matchInAppBrowser(userAgent)) return false;
  // Every iOS browser carries "Safari" in its UA; the vendor prefixes are what
  // distinguish them. CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge,
  // OPT/OPiOS = Opera.
  if (/CriOS|FxiOS|EdgiOS|OPiOS|\bOPT\//.test(userAgent)) return false;
  return /Safari/.test(userAgent);
}

// ── The captured install event ──────────────────────────────────────────────
//
// getInstallContext() has to answer canPromptNatively, and the event that
// decides it is held by a React provider. Rather than make every caller a hook,
// the provider publishes the fact here and this module holds the one bit.
//
// A module-level mutable is a smell worth justifying: the alternative is
// threading the event through props to every branch of the instructions
// component, and there is exactly one beforeinstallprompt event per page load,
// so the bit is genuinely page-global. It is written only by
// PWAInstallProvider.
let nativePromptAvailable = false;

/** Called by PWAInstallProvider when the event arrives, fires, or goes stale. */
export function setNativePromptAvailable(available: boolean): void {
  nativePromptAvailable = available;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    // Safari's own flag. It predates the media query and is still the only
    // signal iOS sets.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getPlatform(): InstallPlatform {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "desktop";
  const platform = detectPlatform(navigator.userAgent ?? "", navigator.maxTouchPoints ?? 0);
  // detectPlatform can answer "unknown" for a user agent it does not recognize.
  // Folding that into desktop is the safe direction: the desktop branch shows
  // no install steps, so an unrecognized browser is told nothing rather than
  // told something wrong.
  return platform === "unknown" ? "desktop" : platform;
}

export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return matchInAppBrowser(navigator.userAgent ?? "");
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  return matchIosSafari(navigator.userAgent ?? "");
}

export function getInstallContext(): InstallContext {
  return {
    platform: getPlatform(),
    standalone: isStandalone(),
    inAppBrowser: isInAppBrowser(),
    canPromptNatively: nativePromptAvailable,
  };
}
