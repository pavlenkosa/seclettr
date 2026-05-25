import { create } from "zustand";
import { api } from "@/lib/api";
import { logger } from "@/lib/logger";

export type PlainPinKind = "dm" | "group";

export interface PlainPin {
  peerKind: PlainPinKind;
  peerId: string;
  pinnedAt: number;
}

interface WirePin {
  peerKind: PlainPinKind;
  peerId: string;
  pinnedAt: string;
}

interface WirePinListResponse {
  pins: WirePin[];
}

function pinKey(peerKind: PlainPinKind, peerId: string): string {
  return `${peerKind}:${peerId}`;
}

function wireToPin(wire: WirePin): PlainPin {
  return {
    peerKind: wire.peerKind,
    peerId: wire.peerId,
    pinnedAt: new Date(wire.pinnedAt).getTime(),
  };
}

export interface PlainPinsState {
  /** Map keyed by `${peerKind}:${peerId}` for O(1) lookup. */
  pins: Record<string, PlainPin>;
  /** Hydrate from server. Idempotent — overwrites local state. */
  loadPins: () => Promise<void>;
  /** Optimistically pin; server reconciles via response. */
  pinChat: (peerKind: PlainPinKind, peerId: string) => Promise<void>;
  /** Optimistically unpin. */
  unpinChat: (peerKind: PlainPinKind, peerId: string) => Promise<void>;
  /** Sync helper for selectors / sorting. */
  isPinned: (peerKind: PlainPinKind, peerId: string) => boolean;
  /** Reset on logout. */
  reset: () => void;
}

export const usePlainPinsStore = create<PlainPinsState>((set, get) => ({
  pins: {},

  async loadPins() {
    try {
      const data = await api.get<WirePinListResponse>("/plain/pins");
      const pins: Record<string, PlainPin> = {};
      for (const wire of data.pins) {
        pins[pinKey(wire.peerKind, wire.peerId)] = wireToPin(wire);
      }
      set({ pins });
    } catch (err) {
      logger.error("[PlainPins] loadPins failed", err);
    }
  },

  async pinChat(peerKind, peerId) {
    const key = pinKey(peerKind, peerId);
    // Optimistic insert with current timestamp; server response replaces it
    // with the canonical pinned_at on success.
    const optimistic: PlainPin = { peerKind, peerId, pinnedAt: Date.now() };
    set((state) => ({ pins: { ...state.pins, [key]: optimistic } }));

    try {
      const res = await api.post<WirePin>(
        `/plain/pins/${peerKind}/${encodeURIComponent(peerId)}`
      );
      const confirmed = wireToPin(res);
      set((state) => ({ pins: { ...state.pins, [key]: confirmed } }));
    } catch (err) {
      // Roll back on failure.
      logger.error("[PlainPins] pinChat failed", err);
      set((state) => {
        const next = { ...state.pins };
        delete next[key];
        return { pins: next };
      });
    }
  },

  async unpinChat(peerKind, peerId) {
    const key = pinKey(peerKind, peerId);
    const previous = get().pins[key];
    set((state) => {
      const next = { ...state.pins };
      delete next[key];
      return { pins: next };
    });

    try {
      await api.delete(`/plain/pins/${peerKind}/${encodeURIComponent(peerId)}`);
    } catch (err) {
      logger.error("[PlainPins] unpinChat failed", err);
      // Restore previous state.
      if (previous) {
        set((state) => ({ pins: { ...state.pins, [key]: previous } }));
      }
    }
  },

  isPinned(peerKind, peerId) {
    return Boolean(get().pins[pinKey(peerKind, peerId)]);
  },

  reset() {
    set({ pins: {} });
  },
}));
