import { describe, expect, it } from "vitest";
import { createOrderedTaskRunner } from "../services/ordered-task-runner.js";

describe("ordered task runner", () => {
  it("runs queued tasks strictly in submission order", async () => {
    const runner = createOrderedTaskRunner();
    const events: string[] = [];

    const first = runner.enqueue(async () => {
      events.push("first:start");
      await new Promise((resolve) => setTimeout(resolve, 25));
      events.push("first:end");
    });

    const second = runner.enqueue(async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await Promise.all([first, second]);

    expect(events).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  it("continues processing later tasks after a rejection", async () => {
    const runner = createOrderedTaskRunner();
    const events: string[] = [];

    await expect(
      runner.enqueue(async () => {
        events.push("first:start");
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    await runner.enqueue(async () => {
      events.push("second:start");
      events.push("second:end");
    });

    expect(events).toEqual(["first:start", "second:start", "second:end"]);
  });
});
