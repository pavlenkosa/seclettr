import { describe, expect, it } from "vitest";
import { createWorkerPool } from "../src/sfu-worker-pool.js";

describe("createWorkerPool", () => {
  it("returns expected interface", () => {
    const pool = createWorkerPool(
      { rtcMinPort: 40000, rtcMaxPort: 49999 }
    );

    expect(pool.workers).toBeDefined();
    expect(Array.isArray(pool.workers)).toBe(true);
    expect(pool.workers.length).toBe(0);
    expect(typeof pool.spawn).toBe("function");
    expect(typeof pool.spawnAll).toBe("function");
    expect(typeof pool.getNextWorker).toBe("function");
    expect(typeof pool.getAliveCount).toBe("function");
  });

  it("getAliveCount returns 0 when no workers", () => {
    const pool = createWorkerPool(
      { rtcMinPort: 40000, rtcMaxPort: 49999 }
    );

    expect(pool.getAliveCount()).toBe(0);
  });

  it("getNextWorker throws when no workers", () => {
    const pool = createWorkerPool(
      { rtcMinPort: 40000, rtcMaxPort: 49999 }
    );

    expect(() => pool.getNextWorker()).toThrow("No workers available");
  });
});
