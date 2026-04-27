import { assertRequiredEnv, loadInfraEnvIfPresent } from "./env.js";

// Integration test setup: load infra/.env fallback and fail fast if required keys are still missing.
loadInfraEnvIfPresent();
if (!process.env["API_URL"]) {
  assertRequiredEnv(["DATABASE_URL", "JWT_SECRET"]);
}
