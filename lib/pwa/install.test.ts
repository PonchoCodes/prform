import { describe, it, expect } from "vitest";
import {
  detectPlatform,
  pushAvailability,
  shouldShowInstallNotice,
  installInstructions,
  type Environment,
} from "@/lib/pwa/install";

// Real user agent strings. Written out rather than approximated because every
// bug this file exists to prevent came from a string that looked like something
// it wasn't.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  // iPadOS 13+ default: indistinguishable from a Mac except for touch points.
  ipadDesktopMode:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

describe("detectPlatform", () => {
  it("recognises an iPhone", () => {
    expect(detectPlatform(UA.iphoneSafari, 5)).toBe("ios");
  });

  it("recognises an iPad pretending to be a Mac", () => {
    // The whole reason maxTouchPoints is an input. Get this wrong and every
    // iPad is told notifications work in a tab, where they do not.
    expect(detectPlatform(UA.ipadDesktopMode, 5)).toBe("ios");
  });

  it("does not mistake a real Mac for an iPad", () => {
    expect(detectPlatform(UA.ipadDesktopMode, 0)).toBe("desktop");
    expect(detectPlatform(UA.macChrome, 0)).toBe("desktop");
  });

  it("recognises Android before the desktop fragments in its user agent", () => {
    // Android Chrome's UA contains "Linux". Order of checks is the fix.
    expect(detectPlatform(UA.androidChrome, 5)).toBe("android");
  });

  it("recognises Windows", () => {
    expect(detectPlatform(UA.windowsChrome, 0)).toBe("desktop");
  });

  it("says unknown rather than guessing", () => {
    expect(detectPlatform("", 0)).toBe("unknown");
    expect(detectPlatform("SomeCrawler/1.0", 0)).toBe("unknown");
  });
});

function env(overrides: Partial<Environment> = {}): Environment {
  return {
    userAgent: UA.androidChrome,
    maxTouchPoints: 5,
    standalone: false,
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    ...overrides,
  };
}

describe("pushAvailability", () => {
  it("is ready in Android Chrome, installed or not", () => {
    expect(pushAvailability(env())).toEqual({ state: "ready" });
    expect(pushAvailability(env({ standalone: true }))).toEqual({ state: "ready" });
  });

  it("tells an iPhone in Safari to install first, rather than that push is broken", () => {
    // In a normal iOS tab PushManager genuinely is absent. Reporting that as
    // "your browser doesn't support notifications" would be true and useless:
    // installing the app fixes it, and the athlete needs to be told so.
    const iosTab = env({
      userAgent: UA.iphoneSafari,
      standalone: false,
      hasPushManager: false,
    });
    expect(pushAvailability(iosTab)).toEqual({ state: "needs_install" });
  });

  it("is ready on an iPhone once the app is on the home screen", () => {
    const iosInstalled = env({
      userAgent: UA.iphoneSafari,
      standalone: true,
      hasPushManager: true,
    });
    expect(pushAvailability(iosInstalled)).toEqual({ state: "ready" });
  });

  it("reports a genuinely unsupported browser with the missing piece named", () => {
    expect(pushAvailability(env({ hasServiceWorker: false }))).toEqual({
      state: "unsupported",
      reason: "no_service_worker",
    });
    expect(pushAvailability(env({ hasNotification: false }))).toEqual({
      state: "unsupported",
      reason: "no_notification",
    });
    expect(pushAvailability(env({ hasPushManager: false }))).toEqual({
      state: "unsupported",
      reason: "no_push_manager",
    });
  });

  it("does not tell an installed iOS app to install itself", () => {
    // A genuinely broken installed iOS app should say what is missing, not
    // send the athlete round the install loop again.
    const brokenInstalled = env({
      userAgent: UA.iphoneSafari,
      standalone: true,
      hasPushManager: false,
    });
    expect(pushAvailability(brokenInstalled)).toEqual({
      state: "unsupported",
      reason: "no_push_manager",
    });
  });
});

describe("shouldShowInstallNotice", () => {
  const base = {
    standalone: false,
    subscribed: false,
    dismissed: false,
    hasLoggedNight: true,
  };

  it("shows to an existing user who has logged a night and never dismissed it", () => {
    expect(shouldShowInstallNotice(base)).toBe(true);
  });

  it("stays hidden until PRform has done something for them", () => {
    expect(shouldShowInstallNotice({ ...base, hasLoggedNight: false })).toBe(false);
  });

  it("never shows inside the installed app", () => {
    expect(shouldShowInstallNotice({ ...base, standalone: true })).toBe(false);
    // Even mid-onboarding: there is nothing left to ask for.
    expect(
      shouldShowInstallNotice({ ...base, standalone: true, duringOnboarding: true }),
    ).toBe(false);
  });

  it("stops once they are reachable, however they got there", () => {
    expect(shouldShowInstallNotice({ ...base, subscribed: true })).toBe(false);
  });

  it("stays dismissed", () => {
    expect(shouldShowInstallNotice({ ...base, dismissed: true })).toBe(false);
  });

  it("shows during onboarding before any night is logged", () => {
    // The deliberate exception: a new account has logged nothing by definition,
    // and the ask belongs in setup rather than a week later.
    expect(
      shouldShowInstallNotice({ ...base, hasLoggedNight: false, duringOnboarding: true }),
    ).toBe(true);
  });

  it("respects an installed-or-subscribed device over the onboarding exception", () => {
    expect(
      shouldShowInstallNotice({
        ...base,
        subscribed: true,
        hasLoggedNight: false,
        duringOnboarding: true,
      }),
    ).toBe(false);
  });
});

describe("installInstructions", () => {
  it("gives iOS the literal Share-sheet wording", () => {
    // "Install the app" is not actionable on iOS: there is no install button,
    // and the only route is a menu item most people have never opened.
    const ios = installInstructions("ios");
    expect(ios).not.toBeNull();
    expect(ios!.steps.join(" ")).toContain("Add to Home Screen");
    expect(ios!.steps.join(" ")).toContain("Share");
  });

  it("gives Android and desktop something to click", () => {
    expect(installInstructions("android")!.steps.join(" ")).toMatch(/Install/);
    expect(installInstructions("desktop")!.steps.join(" ")).toMatch(/Install/);
  });

  it("says nothing rather than something wrong on an unrecognised platform", () => {
    expect(installInstructions("unknown")).toBeNull();
  });
});
