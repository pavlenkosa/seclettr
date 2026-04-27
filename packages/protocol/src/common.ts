import { z } from "zod";

export const WS_PROTOCOL_VERSION = 1 as const;
export const MESSAGE_PROTOCOL_VERSION = 1 as const;
export const SFU_PROTOCOL_VERSION = 1 as const;
export const AUTH_PROTOCOL_VERSION = 1 as const;
export const DEVICES_PROTOCOL_VERSION = 1 as const;
export const GROUPS_PROTOCOL_VERSION = 1 as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = Record<string, unknown>;

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);

export const JsonObjectSchema: z.ZodType<JsonObject> =
  z.record(JsonValueSchema);

export type StripVersion<T> = T extends { version: unknown }
  ? Omit<T, "version">
  : T;

export type VersionedWireErrorCode =
  | "INVALID_PAYLOAD"
  | "UNSUPPORTED_PROTOCOL_VERSION";

export interface VersionedWireParseError {
  code: VersionedWireErrorCode;
  supportedVersion: number;
  receivedVersion?: number | null;
  details?: unknown;
}

export type VersionedWireParseResult<T> =
  | {
      success: true;
      data: StripVersion<T>;
      wireData: T;
    }
  | {
      success: false;
      error: VersionedWireParseError;
    };

export function wireObject<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object(shape).strict();
}

export function versionedWireObject<TShape extends z.ZodRawShape>(
  version: number,
  shape: TShape
) {
  return wireObject({
    version: z.literal(version),
    ...shape,
  });
}

export function withWireVersion<T extends object, TVersion extends number>(
  payload: T,
  version: TVersion
): T & { version: TVersion } {
  const normalized =
    "version" in payload
      ? (() => {
          const { version: _ignored, ...rest } = payload as T & {
            version?: unknown;
          };
          return rest;
        })()
      : payload;
  return {
    version,
    ...normalized,
  } as T & { version: TVersion };
}

export function safeParseVersionedWire<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  payload: unknown,
  supportedVersion: number
): VersionedWireParseResult<z.infer<TSchema>> {
  const receivedVersion = extractWireVersion(payload);
  if (
    typeof receivedVersion === "number" &&
    Number.isInteger(receivedVersion) &&
    receivedVersion !== supportedVersion
  ) {
    return {
      success: false,
      error: {
        code: "UNSUPPORTED_PROTOCOL_VERSION",
        supportedVersion,
        receivedVersion,
      },
    };
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "INVALID_PAYLOAD",
        supportedVersion,
        receivedVersion,
        details: parsed.error.flatten(),
      },
    };
  }

  return {
    success: true,
    data: stripWireVersion(parsed.data),
    wireData: parsed.data,
  };
}

function extractWireVersion(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const candidate = (payload as { version?: unknown }).version;
  return typeof candidate === "number" ? candidate : null;
}

function stripWireVersion<T>(value: T): StripVersion<T> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value as StripVersion<T>;
  }

  const { version: _ignored, ...rest } = value as T & {
    version?: unknown;
  };
  return rest as StripVersion<T>;
}
