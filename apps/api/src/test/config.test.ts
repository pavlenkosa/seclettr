import { beforeEach, describe, expect, it, vi } from "vitest";

function applyRequiredBaseEnv(): void {
  process.env["DATABASE_URL"] = "postgresql://seclettr:pass@localhost:5432/seclettr";
  process.env["JWT_SECRET"] = "12345678901234567890123456789012";
}

function buildConfigEnv(
  overrides: Partial<NodeJS.ProcessEnv> = {}
): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://seclettr:pass@localhost:5432/seclettr",
    JWT_SECRET: "12345678901234567890123456789012",
    // NODE_ENV now defaults to "production" fail-closed, so tests must state
    // their intended runtime mode explicitly instead of relying on absence.
    NODE_ENV: "test",
    ...overrides,
  };
}

describe("config S3 env aliasing", () => {
  beforeEach(() => {
    vi.resetModules();
    applyRequiredBaseEnv();
    delete process.env["S3_ACCESS_KEY"];
    delete process.env["S3_SECRET_KEY"];
    delete process.env["MINIO_ACCESS_KEY"];
    delete process.env["MINIO_SECRET_KEY"];
  });

  it("falls back to MINIO_* when S3_* is missing", async () => {
    process.env["MINIO_ACCESS_KEY"] = "minio-access";
    process.env["MINIO_SECRET_KEY"] = "minio-secret";

    const { config } = await import("../config.js");

    expect(config.S3_ACCESS_KEY).toBe("minio-access");
    expect(config.S3_SECRET_KEY).toBe("minio-secret");
  });

  it("prefers explicit S3_* over MINIO_*", async () => {
    process.env["MINIO_ACCESS_KEY"] = "minio-access";
    process.env["MINIO_SECRET_KEY"] = "minio-secret";
    process.env["S3_ACCESS_KEY"] = "s3-access";
    process.env["S3_SECRET_KEY"] = "s3-secret";

    const { config } = await import("../config.js");

    expect(config.S3_ACCESS_KEY).toBe("s3-access");
    expect(config.S3_SECRET_KEY).toBe("s3-secret");
  });

  it("treats empty S3_PUBLIC_URL as unset (fail closed)", async () => {
    // Release templates ship `S3_PUBLIC_URL=`; an empty string must not be
    // treated as a configured origin, or presigned URLs fall back to the
    // requester-controlled browser origin and can leak the internal MinIO
    // endpoint.
    process.env["S3_PUBLIC_URL"] = "";

    const { config } = await import("../config.js");

    expect(config.S3_PUBLIC_URL).toBeUndefined();
  });
});

describe("config ALLOW_PUBLIC_REGISTRATION parsing", () => {
  beforeEach(() => {
    vi.resetModules();
    applyRequiredBaseEnv();
    delete process.env["ALLOW_PUBLIC_REGISTRATION"];
  });

  it("defaults to false when env var is missing (fail closed)", async () => {
    const { config } = await import("../config.js");
    expect(config.ALLOW_PUBLIC_REGISTRATION).toBe(false);
  });

  it.each(["false", "0", "no", "off"])(
    "parses %s as false",
    async (rawValue) => {
      process.env["ALLOW_PUBLIC_REGISTRATION"] = rawValue;
      const { config } = await import("../config.js");
      expect(config.ALLOW_PUBLIC_REGISTRATION).toBe(false);
    }
  );

  it.each(["true", "1", "yes", "on"])(
    "parses %s as true",
    async (rawValue) => {
      process.env["ALLOW_PUBLIC_REGISTRATION"] = rawValue;
      const { config } = await import("../config.js");
      expect(config.ALLOW_PUBLIC_REGISTRATION).toBe(true);
    }
  );
});

describe("config production safety guards", () => {
  beforeEach(() => {
    vi.resetModules();
    applyRequiredBaseEnv();
  });

  it("rejects the default TURN secret in production", async () => {
    const { resolveConfig } = await import("../config.js");

    expect(() =>
      resolveConfig(
        buildConfigEnv({
          NODE_ENV: "production",
          TURN_SECRET: "changeme-turn-secret",
          S3_ACCESS_KEY: "custom-access",
          S3_SECRET_KEY: "custom-secret",
        })
      )
    ).toThrow(/TURN_SECRET must be overridden in production/);
  });

  it("rejects default S3 credentials in production", async () => {
    const { resolveConfig } = await import("../config.js");

    expect(() =>
      resolveConfig(
        buildConfigEnv({
          NODE_ENV: "production",
          TURN_SECRET: "very-secret-turn-value",
          S3_ACCESS_KEY: "minioadmin",
          S3_SECRET_KEY: "custom-secret",
        })
      )
    ).toThrow(/default S3 credentials are not allowed in production/);

    expect(() =>
      resolveConfig(
        buildConfigEnv({
          NODE_ENV: "production",
          TURN_SECRET: "very-secret-turn-value",
          S3_ACCESS_KEY: "custom-access",
          S3_SECRET_KEY: "minioadmin",
        })
      )
    ).toThrow(/default S3 credentials are not allowed in production/);
  });
});

describe("config TURN port overrides", () => {
  beforeEach(() => {
    vi.resetModules();
    applyRequiredBaseEnv();
  });

  it("parses custom TURN and TURNS ports", async () => {
    const { resolveConfig } = await import("../config.js");

    const config = resolveConfig(
      buildConfigEnv({
        TURN_PORT: "54478",
        TURNS_PORT: "56349",
      })
    );

    expect(config.TURN_PORT).toBe(54478);
    expect(config.TURNS_PORT).toBe(56349);
  });
});

describe("config NODE_ENV fail-closed default", () => {
  beforeEach(() => {
    vi.resetModules();
    applyRequiredBaseEnv();
  });

  // NODE_ENV: undefined in buildConfigEnv overrides represents an unset
  // variable; the Zod default then applies (config.ts defaults to
  // "production" fail-closed, AUDIT.md F6).

  it("resolves unset NODE_ENV to production with guards applied", async () => {
    const { resolveConfig } = await import("../config.js");

    const config = resolveConfig(
      buildConfigEnv({
        NODE_ENV: undefined,
        TURN_SECRET: "custom-strong-turn-secret",
        S3_ACCESS_KEY: "custom-access",
        S3_SECRET_KEY: "custom-secret",
        METRICS_BEARER_TOKEN: "custom-metrics-token-1234",
      })
    );

    expect(config.NODE_ENV).toBe("production");
  });

  it("explicit development accepts the default TURN secret", async () => {
    const { resolveConfig } = await import("../config.js");

    const config = resolveConfig(
      buildConfigEnv({
        NODE_ENV: "development",
      })
    );

    expect(config.NODE_ENV).toBe("development");
    expect(config.TURN_SECRET).toBe("changeme-turn-secret");
  });

  it("unset NODE_ENV rejects the default TURN secret (guard fires on default path)", async () => {
    const { resolveConfig } = await import("../config.js");

    expect(() =>
      resolveConfig(
        buildConfigEnv({
          NODE_ENV: undefined,
          S3_ACCESS_KEY: "custom-access",
          S3_SECRET_KEY: "custom-secret",
          METRICS_BEARER_TOKEN: "custom-metrics-token-1234",
        })
      )
    ).toThrow(/TURN_SECRET must be overridden in production/);
  });

  it.each(["test", "production"] as const)(
    "explicit NODE_ENV=%s behaves as before",
    async (envValue) => {
      const { resolveConfig } = await import("../config.js");

      if (envValue === "production") {
        expect(() =>
          resolveConfig(
            buildConfigEnv({
              NODE_ENV: envValue,
              TURN_SECRET: "changeme-turn-secret",
              S3_ACCESS_KEY: "custom-access",
              S3_SECRET_KEY: "custom-secret",
            })
          )
        ).toThrow(/TURN_SECRET must be overridden in production/);
        return;
      }

      const config = resolveConfig(
        buildConfigEnv({
          NODE_ENV: envValue,
        })
      );
      expect(config.NODE_ENV).toBe("test");
      expect(config.TURN_SECRET).toBe("changeme-turn-secret");
    }
  );
});

describe("config retention day defaults", () => {
  beforeEach(() => {
    vi.resetModules();
    applyRequiredBaseEnv();
    delete process.env["DELIVERED_MESSAGE_RETENTION_DAYS"];
    delete process.env["UNDELIVERED_MESSAGE_RETENTION_DAYS"];
    delete process.env["GROUP_MESSAGE_RETENTION_DAYS"];
    delete process.env["ENDED_CALL_SESSION_RETENTION_DAYS"];
  });

  it("uses sensible defaults when no retention env vars are set", async () => {
    const { config } = await import("../config.js");

    expect(config.DELIVERED_MESSAGE_RETENTION_DAYS).toBe(30);
    expect(config.UNDELIVERED_MESSAGE_RETENTION_DAYS).toBe(90);
    expect(config.GROUP_MESSAGE_RETENTION_DAYS).toBe(30);
    expect(config.ENDED_CALL_SESSION_RETENTION_DAYS).toBe(30);
  });

  it("parses custom retention values from environment", async () => {
    process.env["DELIVERED_MESSAGE_RETENTION_DAYS"] = "7";
    process.env["UNDELIVERED_MESSAGE_RETENTION_DAYS"] = "14";
    process.env["GROUP_MESSAGE_RETENTION_DAYS"] = "21";
    process.env["ENDED_CALL_SESSION_RETENTION_DAYS"] = "60";

    const { config } = await import("../config.js");

    expect(config.DELIVERED_MESSAGE_RETENTION_DAYS).toBe(7);
    expect(config.UNDELIVERED_MESSAGE_RETENTION_DAYS).toBe(14);
    expect(config.GROUP_MESSAGE_RETENTION_DAYS).toBe(21);
    expect(config.ENDED_CALL_SESSION_RETENTION_DAYS).toBe(60);
  });

  it("rejects zero or negative retention values", async () => {
    const { resolveConfig } = await import("../config.js");

    expect(() =>
      resolveConfig(buildConfigEnv({ DELIVERED_MESSAGE_RETENTION_DAYS: "0" }))
    ).toThrow();

    expect(() =>
      resolveConfig(buildConfigEnv({ GROUP_MESSAGE_RETENTION_DAYS: "-5" }))
    ).toThrow();
  });
});
