/**
 * App version — single source of truth from root package.json.
 * In production SECLETTR_VERSION env var takes precedence (set via Docker build-arg).
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

function resolveAppVersion(): string {
  const envVersion = process.env["SECLETTR_VERSION"];
  if (envVersion) return envVersion;

  try {
    const pkgPath = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../../../../package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const APP_VERSION = resolveAppVersion();
