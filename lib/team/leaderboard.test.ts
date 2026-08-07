import { describe, it, expect } from "vitest";
import {
  buildLeaderboard,
  weekStartOf,
  windowEndFor,
  type MemberForLeaderboard,
} from "@/lib/team/leaderboard";

// 2026-08-03 is a Monday. Every date below is anchored to that week so the
// arithmetic is checkable by eye:
//   Mon 08-03  Tue 08-04  Wed 08-05  Thu 08-06  Fri 08-07  Sat 08-08  Sun 08-09

describe("weekStartOf", () => {
  it("returns the Monday of the week", () => {
    expect(weekStartOf("2026-08-03")).toBe("2026-08-03"); // Monday itself
    expect(weekStartOf("2026-08-06")).toBe("2026-08-03"); // Thursday
  });

  it("puts Sunday in the week that has just ended, not the one starting tomorrow", () => {
    // The off-by-one that would give every athlete a one-day week every Sunday.
    expect(weekStartOf("2026-08-09")).toBe("2026-08-03");
  });

  it("rolls over on Monday", () => {
    expect(weekStartOf("2026-08-10")).toBe("2026-08-10");
  });

  it("crosses a month boundary", () => {
    // Sunday 2026-09-06 belongs to the week beginning Monday 2026-08-31.
    expect(weekStartOf("2026-09-06")).toBe("2026-08-31");
  });
});

describe("windowEndFor", () => {
  it("ends at yesterday, because tonight has not happened yet", () => {
    // Counting today would mark every athlete late every day of their lives.
    expect(windowEndFor("2026-08-06", "2026-08-03")).toBe("2026-08-05");
  });

  it("is null on Monday — nothing in this week has finished", () => {
    expect(windowEndFor("2026-08-03", "2026-08-03")).toBeNull();
  });

  it("stops at Sunday when the week is being read after it ended", () => {
    expect(windowEndFor("2026-08-12", "2026-08-03")).toBe("2026-08-09");
  });
});

function member(overrides: Partial<MemberForLeaderboard> = {}): MemberForLeaderboard {
  return {
    userId: "u1",
    name: "Wilhelmina Trzaskowski",
    joinedOn: "2026-06-01",
    loggedDates: [],
    ...overrides,
  };
}

describe("buildLeaderboard", () => {
  it("counts nights logged out of nights possible", () => {
    // Thursday: Mon, Tue and Wed nights are behind us. Three possible.
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [member({ loggedDates: ["2026-08-03", "2026-08-05"] })],
    });

    expect(board.entries[0].nightsPossible).toBe(3);
    expect(board.entries[0].nightsLogged).toBe(2);
    expect(board.entries[0].rate).toBe(67);
  });

  it("ignores nights logged outside the window", () => {
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [
        member({
          loggedDates: [
            "2026-07-30", // last week
            "2026-08-03",
            "2026-08-06", // today — filed tonight, counts tomorrow
          ],
        }),
      ],
    });

    expect(board.entries[0].nightsLogged).toBe(1);
  });

  it("counts a duplicated date once", () => {
    // Belt and braces against a caller passing the same night twice; a rate
    // above 100% would be a visible absurdity on a public board.
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [member({ loggedDates: ["2026-08-03", "2026-08-03", "2026-08-04"] })],
    });

    expect(board.entries[0].nightsLogged).toBe(2);
    expect(board.entries[0].rate).toBeLessThanOrEqual(100);
  });

  it("does not penalise an athlete for the days before they joined", () => {
    // The newest member of a team starting at the bottom is the opposite of
    // what joining should feel like.
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [member({ joinedOn: "2026-08-05", loggedDates: ["2026-08-05"] })],
    });

    expect(board.entries[0].nightsPossible).toBe(1);
    expect(board.entries[0].rate).toBe(100);
  });

  it("reports null rather than 0% when nothing was possible yet", () => {
    // Monday. Nobody has missed anything, and showing a squad of 0%s would say
    // they had.
    const board = buildLeaderboard({
      today: "2026-08-03",
      viewerUserId: "u1",
      members: [member()],
    });

    expect(board.windowEnd).toBeNull();
    expect(board.entries[0].rate).toBeNull();
    expect(board.entries[0].nightsPossible).toBe(0);
  });

  it("starts everyone over on Monday, so nobody stays buried", () => {
    // The athlete missed every night of the previous week. On the new Monday
    // none of it counts against them any more.
    const lastWeek = ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"];
    const board = buildLeaderboard({
      today: "2026-08-04", // Tuesday of the new week
      viewerUserId: "u1",
      members: [member({ loggedDates: [...lastWeek, "2026-08-03"] })],
    });

    expect(board.entries[0].nightsPossible).toBe(1);
    expect(board.entries[0].nightsLogged).toBe(1);
    expect(board.entries[0].rate).toBe(100);
  });

  it("ranks by rate, highest first", () => {
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u3",
      members: [
        member({ userId: "u1", name: "One", loggedDates: ["2026-08-03"] }),
        member({ userId: "u2", name: "Two", loggedDates: ["2026-08-03", "2026-08-04", "2026-08-05"] }),
        member({ userId: "u3", name: "Three", loggedDates: ["2026-08-03", "2026-08-04"] }),
      ],
    });

    expect(board.entries.map((e) => e.name)).toEqual(["Two", "Three", "One"]);
    expect(board.entries.map((e) => e.position)).toEqual([1, 2, 3]);
  });

  it("gives tied athletes the same position", () => {
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [
        member({ userId: "u1", name: "One", loggedDates: ["2026-08-03", "2026-08-04", "2026-08-05"] }),
        member({ userId: "u2", name: "Two", loggedDates: ["2026-08-03", "2026-08-04", "2026-08-05"] }),
        member({ userId: "u3", name: "Three", loggedDates: ["2026-08-03"] }),
      ],
    });

    // Both perfect weeks are first. Standard competition ranking, so the next
    // athlete is third rather than second.
    expect(board.entries.map((e) => e.position)).toEqual([1, 1, 3]);
  });

  it("breaks a rate tie on the athlete who logged more nights", () => {
    // 3 of 3 and 1 of 1 are both 100%, but one of them is a better week.
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [
        member({ userId: "u1", name: "Newcomer", joinedOn: "2026-08-05", loggedDates: ["2026-08-05"] }),
        member({
          userId: "u2",
          name: "Veteran",
          loggedDates: ["2026-08-03", "2026-08-04", "2026-08-05"],
        }),
      ],
    });

    expect(board.entries.map((e) => e.name)).toEqual(["Veteran", "Newcomer"]);
    expect(board.entries.map((e) => e.position)).toEqual([1, 2]);
  });

  it("puts athletes with nothing possible yet at the bottom, not at zero", () => {
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [
        member({ userId: "u1", name: "Joined today", joinedOn: "2026-08-06" }),
        member({ userId: "u2", name: "Missed everything", loggedDates: [] }),
      ],
    });

    // Someone who has had no chance to check in must not be ranked beneath
    // someone who had three and took none.
    expect(board.entries.map((e) => e.name)).toEqual(["Missed everything", "Joined today"]);
    expect(board.entries[0].rate).toBe(0);
    expect(board.entries[1].rate).toBeNull();
  });

  it("marks the viewer's own row", () => {
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u2",
      members: [
        member({ userId: "u1", name: "One" }),
        member({ userId: "u2", name: "Two" }),
      ],
    });

    expect(board.entries.find((e) => e.name === "Two")!.isYou).toBe(true);
    expect(board.entries.find((e) => e.name === "One")!.isYou).toBe(false);
  });

  it("names an athlete with no name rather than exposing an id", () => {
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [member({ name: null })],
    });

    expect(board.entries[0].name).toBe("Unnamed athlete");
  });

  it("carries no field that could hold a sleep value", () => {
    // The unit-level half of the guarantee. The integration test walks a real
    // response; this pins the shape the builder can even produce.
    const board = buildLeaderboard({
      today: "2026-08-06",
      viewerUserId: "u1",
      members: [member({ loggedDates: ["2026-08-03"] })],
    });

    expect(Object.keys(board.entries[0]).sort()).toEqual(
      ["isYou", "name", "nightsLogged", "nightsPossible", "position", "rate"].sort(),
    );
    expect(Object.keys(board).sort()).toEqual(["entries", "weekStart", "windowEnd"].sort());
  });
});
