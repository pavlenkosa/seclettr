import { defineConfig } from "vitest/config";

const integrationTestFiles = [
  "src/test/auth.test.ts",
  "src/test/attachment-access.test.ts",
  "src/test/group-history-contract.test.ts",
  "src/test/direct-call-signing-sync.test.ts",
  "src/test/group-call-sfu-bootstrap.test.ts",
];

const includeIntegrationTests =
  process.env["QM_API_INCLUDE_INTEGRATION_TESTS"] === "1" ||
  process.argv.some((arg) => integrationTestFiles.some((file) => arg.includes(file)));

const sharedTestEnv = {
  QM_API_TEST_USE_IN_MEMORY_SERVICES: "1",
  JWT_SECRET: "test-secret-for-unit-tests-min-32-chars",
} as const;

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    env: includeIntegrationTests
      ? sharedTestEnv
      : {
          ...sharedTestEnv,
          DATABASE_URL: "postgres://test:test@localhost/test",
        },
    include: ["src/test/**/*.test.ts"],
    exclude: includeIntegrationTests ? [] : integrationTestFiles,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globalSetup: includeIntegrationTests ? ["src/test/global-setup.ts"] : [],
    setupFiles: includeIntegrationTests ? ["src/test/setup.ts"] : [],
  },
});
