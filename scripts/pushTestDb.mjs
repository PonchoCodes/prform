// Applies the migration history to the integration-test database.
//
//   npm run test:db:push
//
// A script rather than an inline env assignment because `DATABASE_URL=... npm
// run ...` is not portable to PowerShell, and because the name guard below is
// worth having on anything that runs migrations.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) {
  console.error("TEST_DATABASE_URL is not set. Run `npm run test:db:setup` first.");
  process.exit(1);
}

const databaseName = new URL(testUrl).pathname.replace(/^\//, "");
if (!/test/i.test(databaseName)) {
  console.error(
    `Refusing to migrate "${databaseName}": TEST_DATABASE_URL must name a database with "test" in it.`,
  );
  process.exit(1);
}

console.log(`Applying migrations to ${databaseName}…`);
const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: testUrl },
});

process.exit(result.status ?? 1);
