import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInboundTrackingCoordinator,
  type InboundTrackingStateShape,
} from "@/stores/messages/inbound-tracking";

interface TestState extends InboundTrackingStateShape {
  otherValue: number;
}

function createState(): TestState {
  return {
    processedMessageIds: new Set(),
    pendingAckMessageIds: new Set(),
    quarantinedMessageIds: new Set(),
    otherValue: 1,
  };
}

describe("createInboundTrackingCoordinator", () => {
  const persistProcessedMessageIdsMock = vi.fn();
  const persistPendingAckMessageIdsMock = vi.fn();
  const persistQuarantinedMessageIdsMock = vi.fn();
  const postMessageAckMock = vi.fn();

  beforeEach(() => {
    persistProcessedMessageIdsMock.mockReset();
    persistPendingAckMessageIdsMock.mockReset();
    persistQuarantinedMessageIdsMock.mockReset();
    postMessageAckMock.mockReset().mockResolvedValue("acked");
  });

  it("commits terminal inbound state and persists quarantine decisions", async () => {
    const coordinator = createInboundTrackingCoordinator<TestState>({
      persistence: {
        persistProcessedMessageIds: async (processedMessageIds) => {
          persistProcessedMessageIdsMock(processedMessageIds);
        },
        persistPendingAckMessageIds: async (pendingAckMessageIds) => {
          persistPendingAckMessageIdsMock(pendingAckMessageIds);
        },
        persistQuarantinedMessageIds: async (quarantinedMessageIds) => {
          persistQuarantinedMessageIdsMock(quarantinedMessageIds);
        },
      },
      postMessageAck: async (messageId) => postMessageAckMock(messageId),
    });
    let state = createState();
    const setState = (
      partial:
        | Partial<TestState>
        | ((current: TestState) => Partial<TestState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = {
        ...state,
        ...update,
      };
    };

    await coordinator.commitTerminalMessageState(
      setState,
      () => state,
      "msg-1",
      { quarantined: true }
    );

    expect(state.processedMessageIds.has("msg-1")).toBe(true);
    expect(state.pendingAckMessageIds.has("msg-1")).toBe(true);
    expect(state.quarantinedMessageIds.has("msg-1")).toBe(true);
    expect(persistProcessedMessageIdsMock).toHaveBeenCalledWith(new Set(["msg-1"]));
  });

  it("clears pending acknowledgements only after terminal ack outcomes", async () => {
    const coordinator = createInboundTrackingCoordinator<TestState>({
      persistence: {
        persistProcessedMessageIds: async (processedMessageIds) => {
          persistProcessedMessageIdsMock(processedMessageIds);
        },
        persistPendingAckMessageIds: async (pendingAckMessageIds) => {
          persistPendingAckMessageIdsMock(pendingAckMessageIds);
        },
        persistQuarantinedMessageIds: async (quarantinedMessageIds) => {
          persistQuarantinedMessageIdsMock(quarantinedMessageIds);
        },
      },
      postMessageAck: async (messageId) => postMessageAckMock(messageId),
    });
    let state: TestState = {
      ...createState(),
      pendingAckMessageIds: new Set(["msg-1"]),
      processedMessageIds: new Set(["msg-1"]),
    };
    const setState = (
      partial:
        | Partial<TestState>
        | ((current: TestState) => Partial<TestState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = {
        ...state,
        ...update,
      };
    };

    postMessageAckMock.mockResolvedValueOnce("temporary_failure");
    await expect(
      coordinator.flushPendingAckForMessage(setState, () => state, "msg-1")
    ).resolves.toBe("temporary_failure");
    expect(state.pendingAckMessageIds.has("msg-1")).toBe(true);

    postMessageAckMock.mockResolvedValueOnce("acked");
    await expect(
      coordinator.flushPendingAckForMessage(setState, () => state, "msg-1")
    ).resolves.toBe("acked");
    expect(state.pendingAckMessageIds.has("msg-1")).toBe(false);
  });

  it("flushes the full pending ack queue sequentially", async () => {
    const coordinator = createInboundTrackingCoordinator<TestState>({
      persistence: {
        persistProcessedMessageIds: async (processedMessageIds) => {
          persistProcessedMessageIdsMock(processedMessageIds);
        },
        persistPendingAckMessageIds: async (pendingAckMessageIds) => {
          persistPendingAckMessageIdsMock(pendingAckMessageIds);
        },
        persistQuarantinedMessageIds: async (quarantinedMessageIds) => {
          persistQuarantinedMessageIdsMock(quarantinedMessageIds);
        },
      },
      postMessageAck: async (messageId) => postMessageAckMock(messageId),
    });
    let state: TestState = {
      ...createState(),
      processedMessageIds: new Set(["msg-1", "msg-2"]),
      pendingAckMessageIds: new Set(["msg-1", "msg-2"]),
    };
    const setState = (
      partial:
        | Partial<TestState>
        | ((current: TestState) => Partial<TestState>)
    ) => {
      const update = typeof partial === "function" ? partial(state) : partial;
      state = {
        ...state,
        ...update,
      };
    };

    postMessageAckMock
      .mockResolvedValueOnce("already_acked")
      .mockResolvedValueOnce("terminal_error");

    await coordinator.flushPendingAcknowledgements(setState, () => state);

    expect(postMessageAckMock).toHaveBeenNthCalledWith(1, "msg-1");
    expect(postMessageAckMock).toHaveBeenNthCalledWith(2, "msg-2");
    expect(state.pendingAckMessageIds.size).toBe(0);
  });
});
