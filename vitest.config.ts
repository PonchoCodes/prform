import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "tests/**/*.test.ts"],
    // Integration tests need a database and a network. They have their own
    // config and their own script — see vitest.integration.config.ts.
    exclude: ["**/node_modules/**", "tests/integration/**"],
  },
});
