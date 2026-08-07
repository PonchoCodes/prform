// Creates the integration-test database on the Neon project that DATABASE_URL
// points at, then prints the TEST_DATABASE_URL to put in .env.
//
// Run once per machine (and once per CI environment):
//   node scripts/createTestDb.mjs
//
// Uses the Neon HTTP driver rather than `prisma db execute` because CREATE
// DATABASE cannot run inside a transaction. The test database is a sibling of
// the production one on the same project — separate data, shared compute.
// Schema comes from `prisma migrate deploy` against TEST_DATABASE_URL.
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const TEST_DB = "prform_test";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set — is .env present?");

const sql = neon(url);

const existing = await sql`SELECT datname FROM pg_database WHERE datname = ${TEST_DB}`;
if (existing.length > 0) {
  console.log(`${TEST_DB} already exists`);
} else {
  // Neon's HTTP driver sends this as a single unwrapped statement.
  await sql.query(`CREATE DATABASE ${TEST_DB}`);
  console.log(`created ${TEST_DB}`);
}

const testUrl = new URL(url);
testUrl.pathname = `/${TEST_DB}`;
console.log(`\nAdd this to .env:\n\nTEST_DATABASE_URL="${testUrl.toString()}"\n`);
console.log("Then apply the schema:\n  npm run test:db:push\n");
