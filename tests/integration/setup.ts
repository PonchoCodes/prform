// Runs before every integration test file, and crucially before any route
// module is imported — lib/prisma.ts reads DATABASE_URL at import time, so the
// swap has to happen first.
//
// The name guard is the whole safety story for these tests: they truncate
// tables. If TEST_DATABASE_URL ever points somewhere real, this throws instead
// of deleting anything.
import { config } from "dotenv";

config();

const testUrl = process.env.TEST_DATABASE_URL;

if (!testUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Create the database with `node scripts/createTestDb.mjs`, " +
      "then add the printed URL to .env.",
  );
}

const databaseName = new URL(testUrl).pathname.replace(/^\//, "");

if (!/test/i.test(databaseName)) {
  throw new Error(
    `Refusing to run: TEST_DATABASE_URL points at "${databaseName}", whose name does not contain ` +
      `"test". These tests truncate tables — they will only run against a database that is ` +
      `obviously disposable.`,
  );
}

process.env.DATABASE_URL = testUrl;
