import { describe, it, expect } from "vitest";
import { matchInAppBrowser, matchIosSafari } from "./pwaDetect";

// Real user agent strings, kept verbatim. A hand-simplified UA proves the regex
// matches the string somebody typed into a test, which is not the question.

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iosFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iosEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 EdgiOS/126.0 Mobile/15E148 Safari/604.1",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.3.28.103 (iPhone14,3; iOS 17_5; en_US)",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,3;FBMD/iPhone]",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/470.0.0.30.109;]",
  googleApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/319.0.641717089 Mobile/15E148 Safari/604.1",
  wechat:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003128)",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/14.9.0",
  tiktok:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_34.5.0 JsSdk/2.0 BytedanceWebview/d8a21c6",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  desktopSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

describe("matchInAppBrowser", () => {
  it("catches the webviews that have no Add to Home Screen", () => {
    expect(matchInAppBrowser(UA.instagram)).toBe(true);
    expect(matchInAppBrowser(UA.facebookIos)).toBe(true);
    expect(matchInAppBrowser(UA.facebookAndroid)).toBe(true);
    expect(matchInAppBrowser(UA.googleApp)).toBe(true);
    expect(matchInAppBrowser(UA.wechat)).toBe(true);
    expect(matchInAppBrowser(UA.line)).toBe(true);
    expect(matchInAppBrowser(UA.tiktok)).toBe(true);
  });

  it("leaves real browsers alone", () => {
    expect(matchInAppBrowser(UA.iosSafari)).toBe(false);
    expect(matchInAppBrowser(UA.iosChrome)).toBe(false);
    expect(matchInAppBrowser(UA.androidChrome)).toBe(false);
    expect(matchInAppBrowser(UA.desktopChrome)).toBe(false);
    expect(matchInAppBrowser(UA.desktopSafari)).toBe(false);
  });

  // The reason /Line/ is anchored to a slash. Every Android UA contains
  // "Linux", and a false positive here replaces working install steps with a
  // dead end telling the athlete to open a different browser.
  it("does not mistake Linux for LINE", () => {
    expect(matchInAppBrowser(UA.androidChrome)).toBe(false);
    expect(matchInAppBrowser("Mozilla/5.0 (X11; Linux x86_64)")).toBe(false);
  });

  it("is safe on an empty user agent", () => {
    expect(matchInAppBrowser("")).toBe(false);
  });
});

describe("matchIosSafari", () => {
  it("is true only for Safari itself", () => {
    expect(matchIosSafari(UA.iosSafari)).toBe(true);
  });

  // Every iOS browser carries "Safari" in its UA, so a naive /Safari/ test
  // would name the Share sheet to a Chrome user who does not have one.
  it("rejects the other iOS browsers despite their Safari token", () => {
    expect(matchIosSafari(UA.iosChrome)).toBe(false);
    expect(matchIosSafari(UA.iosFirefox)).toBe(false);
    expect(matchIosSafari(UA.iosEdge)).toBe(false);
  });

  it("rejects in-app webviews", () => {
    expect(matchIosSafari(UA.instagram)).toBe(false);
    expect(matchIosSafari(UA.facebookIos)).toBe(false);
    expect(matchIosSafari(UA.googleApp)).toBe(false);
  });

  it("is safe on an empty user agent", () => {
    expect(matchIosSafari("")).toBe(false);
  });
});
