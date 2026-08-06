// Guard against the leak class fixed in 5ef9158: a route fetches a User row
// with no `select` and hands the whole thing — password hash, Strava OAuth
// tokens, Stripe identifiers — to whatever serializes it.
//
// The invariant that actually matters ("no sensitive field reaches a response
// body") is not statically checkable, so this test enforces the discipline
// that makes the leak impossible instead: every `prisma.user.find*` call in
// the codebase must carry an explicit `select`. A full-row read is never
// needed — even the login query only needs five fields — so there is no
// allowlist, and any new unselected read fails here with the file named.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["app", "lib", "components", "hooks", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next"]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Every `prisma.user.find*(` call site, with the argument text up to the
 * call's closing brace at depth zero. Brace-counting rather than a fixed
 * window so a long `where` clause cannot push the `select` out of view.
 */
function userFindCalls(source: string): string[] {
  const calls: string[] = [];
  const re = /prisma\.user\.(findUnique|findFirst|findMany|findUniqueOrThrow|findFirstOrThrow)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    calls.push(source.slice(m.index, i));
  }
  return calls;
}

describe("every prisma.user.find* call selects explicit fields", () => {
  const offenders: string[] = [];

  for (const dir of SCAN_DIRS) {
    for (const file of sourceFiles(join(ROOT, dir))) {
      const source = readFileSync(file, "utf8");
      for (const call of userFindCalls(source)) {
        if (!/select\s*:/.test(call)) {
          offenders.push(`${relative(ROOT, file)}: ${call.slice(0, 120)}…`);
        }
      }
    }
  }

  it("finds no unselected user reads", () => {
    expect(offenders).toEqual([]);
  });

  it("actually scanned the API routes", () => {
    // A refactor that moved the routes would make the test above pass
    // vacuously; require that the scan saw a meaningful number of call sites.
    let count = 0;
    for (const dir of SCAN_DIRS) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        count += userFindCalls(readFileSync(file, "utf8")).length;
      }
    }
    expect(count).toBeGreaterThan(10);
  });
});
