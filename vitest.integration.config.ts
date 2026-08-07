import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Integration tests run against a real Postgres database and are kept out of
// `npm test` on purpose: the unit suite has to stay fast and runnable offline.
// Run these with `npm run test:integration`.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    // setup.ts points DATABASE_URL at the test database before any test file —
    // and therefore any route module — is imported.
    setupFiles: ["tests/integration/setup.ts"],
    // One database, truncated between tests: files must not overlap.
    fileParallelism: false,
    // Neon is a network round trip per query.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
