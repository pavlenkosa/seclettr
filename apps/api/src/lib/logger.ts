/**
 * Minimal structured logger for module-level singletons (pool, redis)
 * where the Fastify app logger is not yet available.
 *
 * Writes newline-delimited JSON to stderr, matching the pino level numbers
 * so log aggregators (e.g. Loki, Datadog) parse it correctly.
 */

type Level = "info" | "warn" | "error";

function emit(level: Level, msg: string, extra?: unknown): void {
  const warnOrInfoNum = level === "warn" ? 40 : 30;
  const levelNum = level === "error" ? 50 : warnOrInfoNum;
  const entry: Record<string, unknown> = { level: levelNum, time: Date.now(), msg };
  if (extra !== undefined) entry["err"] = extra;
  process.stderr.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  info:  (msg: string, extra?: unknown) => emit("info",  msg, extra),
  warn:  (msg: string, extra?: unknown) => emit("warn",  msg, extra),
  error: (msg: string, extra?: unknown) => emit("error", msg, extra),
};
