// @vitest-environment jsdom

import { createRef, type Ref } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n";

const {
  composerRuntimeState,
} = vi.hoisted(() => ({
  composerRuntimeState: {
    isGroupComposer: false,
    sendTextMessage: vi.fn(),
    sendFileAttachment: vi.fn(),
    sendVoiceBlob: vi.fn(),
    sendVideoBlob: vi.fn(),
    handleTypingState: vi.fn(),
    stopTyping: vi.fn(),
    cleanupTypingSignal: vi.fn(),
    mediaDialogCaption: undefined as string | undefined,
  },
}));

vi.mock("@/chats/runtime/useChatComposerMessageActions", () => ({
  useChatComposerMessageActions: () => ({
    isGroupComposer: composerRuntimeState.isGroupComposer,
    sendTextMessage: composerRuntimeState.sendTextMessage,
    sendFileAttachment: composerRuntimeState.sendFileAttachment,
  }),
}));

vi.mock("@/chats/runtime/useChatComposerMediaActions", () => ({
  useChatComposerMediaActions: () => ({
    isGroupComposer: composerRuntimeState.isGroupComposer,
    sendVoiceBlob: composerRuntimeState.sendVoiceBlob,
    sendVideoBlob: composerRuntimeState.sendVideoBlob,
  }),
}));

vi.mock("@/chats/runtime/useChatComposerTypingSignal", () => ({
  useChatComposerTypingSignal: () => ({
    handleTypingState: composerRuntimeState.handleTypingState,
    stopTyping: composerRuntimeState.stopTyping,
    cleanupTypingSignal: composerRuntimeState.cleanupTypingSignal,
  }),
}));

// Pass-through: openDialog immediately calls onSendFiles so existing send assertions are preserved.
vi.mock("../../composer/useMediaSendDialog", () => ({
  useMediaSendDialog: ({ onSendFiles }: { onSendFiles: (files: File[], caption?: string) => Promise<void> }) => ({
    isOpen: false,
    pendingFiles: [],
    caption: "",
    quality: "compressed" as const,
    isSending: false,
    totalOriginalSize: 0,
    totalCompressedSize: null,
    hasCompressible: false,
    canConfirmSend: false,
    openDialog: (files: File[]) => {
      void onSendFiles(files, composerRuntimeState.mediaDialogCaption);
    },
    removeFile: vi.fn(),
    setCaption: vi.fn(),
    setQuality: vi.fn(),
    confirmSend: vi.fn(),
    closeDialog: vi.fn(),
  }),
}));

import {
  MessageComposer,
  type MessageComposerHandle,
} from "../MessageComposer";
import {
  COMPOSER_RECENT_EMOJI_STORAGE_KEY,
  filterComposerEmojiEntries,
  getComposerEmojiEntry,
} from "../../composer";

const smileyEmoji = "\u{1F600}";
const heartEmoji = "\u{2764}\u{FE0F}";

if (!getComposerEmojiEntry(smileyEmoji) || !getComposerEmojiEntry(heartEmoji)) {
  throw new Error("Composer emoji fixtures are incomplete");
}

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);

  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? "video/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({
      data: new Blob(["video"], { type: this.mimeType }),
    } as BlobEvent);
    this.onstop?.(new Event("stop"));
  }
}

interface ComposerHarnessProps {
  readonly threadKey?: string;
  readonly recipientUserId?: string;
  readonly groupId?: string;
  readonly composerRef?: Ref<MessageComposerHandle>;
}

function ComposerHarness({
  threadKey = "direct:user-peer",
  recipientUserId = "user-peer",
  groupId,
  composerRef,
}: ComposerHarnessProps) {
  return (
    <I18nProvider>
      <MessageComposer
        key={threadKey}
        ref={composerRef}
        recipientUserId={groupId ? undefined : recipientUserId}
        groupId={groupId}
      />
    </I18nProvider>
  );
}

function dispatchButtonPress(button: HTMLButtonElement) {
  button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

function dispatchTextInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(input),
    "value"
  )?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function findEmojiButton(container: HTMLElement, emoji: string): HTMLButtonElement | null {
  return Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => button.getAttribute("aria-label") === `Insert emoji ${emoji}`) ?? null;
}

describe("MessageComposer emoji picker", () => {
  let container: HTMLDivElement;
  let root: Root;
  let storage: Map<string, string>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    storage = new Map([["seclettr.locale.v1", "en"]]);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => storage.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        storage.delete(key);
      }),
      clear: vi.fn(() => {
        storage.clear();
      }),
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    composerRuntimeState.isGroupComposer = false;
    composerRuntimeState.sendTextMessage.mockReset();
    composerRuntimeState.sendFileAttachment.mockReset();
    composerRuntimeState.sendVoiceBlob.mockReset();
    composerRuntimeState.sendVideoBlob.mockReset();
    composerRuntimeState.handleTypingState.mockReset();
    composerRuntimeState.stopTyping.mockReset();
    composerRuntimeState.cleanupTypingSignal.mockReset();
    composerRuntimeState.mediaDialogCaption = undefined;
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container?.remove();
    vi.clearAllTimers();
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
    vi.unstubAllGlobals();
  });

  it("inserts emoji at the current caret position", async () => {
    act(() => {
      root.render(<ComposerHarness />);
    });

    const textarea = container.querySelector("textarea");
    const emojiToggle = container.querySelector<HTMLButtonElement>("[aria-label='Open emoji picker']");

    expect(textarea).not.toBeNull();
    expect(emojiToggle).not.toBeNull();

    await act(async () => {
      dispatchTextInput(textarea!, "Hi there");
    });

    textarea!.setSelectionRange(2, 2);
    textarea!.dispatchEvent(new Event("select", { bubbles: true }));

    await act(async () => {
      dispatchButtonPress(emojiToggle!);
    });

    expect(container.querySelector("[aria-label='Emoji picker']")).not.toBeNull();

    const emojiButton = container.querySelector<HTMLButtonElement>("[aria-label^='Insert emoji']");
    expect(emojiButton).not.toBeNull();

    await act(async () => {
      dispatchButtonPress(emojiButton!);
    });

    expect(textarea!.value).toBe(`Hi${smileyEmoji} there`);
    expect(storage.get(COMPOSER_RECENT_EMOJI_STORAGE_KEY)).toBe(JSON.stringify([smileyEmoji]));
    expect(container.querySelector("[aria-label='Emoji picker']")).toBeNull();
  });

  it("filters emojis by search query, shows recents, and closes on Escape", async () => {
    act(() => {
      root.render(<ComposerHarness />);
    });

    const emojiToggle = container.querySelector<HTMLButtonElement>("[aria-label='Open emoji picker']");
    expect(emojiToggle).not.toBeNull();

    await act(async () => {
      dispatchButtonPress(emojiToggle!);
    });

    expect(container.querySelector("[aria-label='Emoji picker']")).not.toBeNull();

    const searchInput = container.querySelector<HTMLInputElement>("[aria-label='Search emoji']");
    expect(searchInput).not.toBeNull();

    await act(async () => {
      dispatchTextInput(searchInput!, "heart");
    });

    expect(container.querySelector("[aria-label='Emoji results']")).not.toBeNull();

    const filteredEmojiButtons = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .filter((button) => button.getAttribute("aria-label")?.startsWith("Insert emoji "));

    expect(filteredEmojiButtons.length).toBeGreaterThan(0);
    expect(findEmojiButton(container, smileyEmoji)).toBeNull();

    await act(async () => {
      dispatchButtonPress(filteredEmojiButtons[0]!);
    });

    await act(async () => {
      dispatchButtonPress(emojiToggle!);
    });

    expect(container.textContent).toContain("Recent");

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(container.querySelector("[aria-label='Emoji picker']")).toBeNull();
  });

  it("matches common russian aliases in emoji search", () => {
    const heartResults = filterComposerEmojiEntries("сердце");
    const smileResults = filterComposerEmojiEntries("улыбка");
    const flagResults = filterComposerEmojiEntries("флаг");

    expect(heartResults.some((entry) => entry.emoji === heartEmoji)).toBe(true);
    expect(smileResults.some((entry) => entry.emoji === smileyEmoji)).toBe(true);
    expect(flagResults.length).toBeGreaterThan(0);
  });

  it("sends text on Enter and clears the draft", async () => {
    composerRuntimeState.sendTextMessage.mockResolvedValue(undefined);

    act(() => {
      root.render(<ComposerHarness />);
    });

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      dispatchTextInput(textarea!, "Hello team");
    });

    await act(async () => {
      textarea!.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }));
      await Promise.resolve();
    });

    expect(composerRuntimeState.sendTextMessage).toHaveBeenCalledWith("Hello team", undefined);
    expect(textarea!.value).toBe("");
  });

  it("sends selected file attachments through the runtime action", async () => {
    composerRuntimeState.sendFileAttachment.mockResolvedValue(undefined);

    act(() => {
      root.render(<ComposerHarness />);
    });

    const attachmentInput = container.querySelector<HTMLInputElement>("input[type='file']");
    expect(attachmentInput).not.toBeNull();

    const file = new File(["draft"], "draft.txt", { type: "text/plain" });
    Object.defineProperty(attachmentInput, "files", {
      configurable: true,
      value: [file],
    });

    await act(async () => {
      attachmentInput!.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });

    expect(composerRuntimeState.sendFileAttachment).toHaveBeenCalledWith(
      file,
      undefined,
      undefined
    );
  });

  it("resets the draft when the composer is remounted for another thread key", async () => {
    act(() => {
      root.render(<ComposerHarness threadKey="direct:user-a" recipientUserId="user-a" />);
    });

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      dispatchTextInput(textarea!, "Draft for user A");
    });

    expect(textarea!.value).toBe("Draft for user A");

    act(() => {
      root.render(<ComposerHarness threadKey="direct:user-b" recipientUserId="user-b" />);
    });

    const nextTextarea = container.querySelector("textarea");
    expect(nextTextarea).not.toBeNull();
    expect(nextTextarea!.value).toBe("");
  });

  it("resets the draft when switching from a direct thread key to a group thread key", async () => {
    act(() => {
      root.render(<ComposerHarness threadKey="direct:user-a" recipientUserId="user-a" />);
    });

    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();

    await act(async () => {
      dispatchTextInput(textarea!, "Draft for direct thread");
    });

    act(() => {
      root.render(<ComposerHarness threadKey="group:group-a" groupId="group-a" />);
    });

    const nextTextarea = container.querySelector("textarea");
    expect(nextTextarea).not.toBeNull();
    expect(nextTextarea!.value).toBe("");
  });

  it("routes dropped inline media through the same grouped attachment flow", async () => {
    composerRuntimeState.sendFileAttachment.mockResolvedValue(undefined);

    const composerRef = createRef<MessageComposerHandle>();

    act(() => {
      root.render(<ComposerHarness composerRef={composerRef} />);
    });

    const imageA = new File(["a"], "image-a.png", { type: "image/png" });
    const imageB = new File(["b"], "image-b.png", { type: "image/png" });

    await act(async () => {
      await composerRef.current!.handleDroppedFiles([imageA, imageB]);
    });

    expect(composerRuntimeState.sendFileAttachment).toHaveBeenCalledTimes(2);
    const [[firstFile, firstGroupId], [secondFile, secondGroupId]] =
      composerRuntimeState.sendFileAttachment.mock.calls as [
        [File, string | undefined, string | undefined],
        [File, string | undefined, string | undefined],
      ];

    expect(firstFile).toBe(imageA);
    expect(secondFile).toBe(imageB);
    expect(firstGroupId).toEqual(expect.any(String));
    expect(secondGroupId).toBe(firstGroupId);
  });

  it("keeps media captions inside the first attachment payload", async () => {
    composerRuntimeState.sendFileAttachment.mockResolvedValue(undefined);
    composerRuntimeState.mediaDialogCaption = "  album caption  ";

    const composerRef = createRef<MessageComposerHandle>();

    act(() => {
      root.render(<ComposerHarness composerRef={composerRef} />);
    });

    const imageA = new File(["a"], "image-a.png", { type: "image/png" });
    const imageB = new File(["b"], "image-b.png", { type: "image/png" });

    await act(async () => {
      await composerRef.current!.handleDroppedFiles([imageA, imageB]);
    });

    expect(composerRuntimeState.sendFileAttachment).toHaveBeenCalledTimes(2);
    const [[, firstGroupId, firstCaption], [, secondGroupId, secondCaption]] =
      composerRuntimeState.sendFileAttachment.mock.calls as [
        [File, string | undefined, string | undefined],
        [File, string | undefined, string | undefined],
      ];

    expect(firstCaption).toBe("album caption");
    expect(secondCaption).toBeUndefined();
    expect(secondGroupId).toBe(firstGroupId);
    expect(composerRuntimeState.sendTextMessage).not.toHaveBeenCalled();
  });

  it("starts grouped file uploads as one batch instead of awaiting each file serially", async () => {
    let releaseFirst: (() => void) | null = null;
    const firstUpload = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    composerRuntimeState.sendFileAttachment
      .mockImplementationOnce(() => firstUpload)
      .mockResolvedValueOnce(undefined);

    const composerRef = createRef<MessageComposerHandle>();

    act(() => {
      root.render(<ComposerHarness composerRef={composerRef} />);
    });

    const imageA = new File(["a"], "image-a.png", { type: "image/png" });
    const imageB = new File(["b"], "image-b.png", { type: "image/png" });

    let droppedPromise!: Promise<void>;
    await act(async () => {
      droppedPromise = composerRef.current!.handleDroppedFiles([imageA, imageB]);
      await Promise.resolve();
    });

    expect(composerRuntimeState.sendFileAttachment).toHaveBeenCalledTimes(2);

    await act(async () => {
      releaseFirst?.();
      await droppedPromise;
    });
  });

  it("switches record mode with the chip and records video on tap", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(async () => undefined);
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});

    const stopTrack = vi.fn();
    Object.defineProperty(globalThis.navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [{ stop: stopTrack }],
        })),
      },
    });

    try {
      act(() => {
        root.render(<ComposerHarness />);
      });

      const recordModeSwitch = container.querySelector<HTMLButtonElement>(
        "[aria-label='Switch recording mode to video']"
      );
      expect(recordModeSwitch).not.toBeNull();

      await act(async () => {
        dispatchButtonPress(recordModeSwitch!);
      });

      const videoRecordButton = container.querySelector<HTMLButtonElement>(
        "[aria-label='Start video recording']"
      );
      expect(videoRecordButton).not.toBeNull();

      await act(async () => {
        dispatchButtonPress(videoRecordButton!);
        await Promise.resolve();
      });

      const portalRoot = document.body;
      expect(globalThis.navigator.mediaDevices.getUserMedia).toHaveBeenCalled();
      expect(portalRoot.querySelector("[aria-label='Live video note preview']")).not.toBeNull();
      expect(container.querySelector("textarea")).toBeNull();
      expect(portalRoot.textContent).toContain("Video note");
      expect(portalRoot.textContent).toContain("Tap stop to send");
      expect(
        portalRoot.querySelector<HTMLButtonElement>("[aria-label='Discard recording']")
      ).not.toBeNull();

      const stopRecordingButton = portalRoot.querySelector<HTMLButtonElement>("[aria-label='Stop recording']");
      expect(stopRecordingButton).not.toBeNull();

      await act(async () => {
        dispatchButtonPress(stopRecordingButton!);
        await Promise.resolve();
      });

      expect(composerRuntimeState.sendVideoBlob).toHaveBeenCalledTimes(1);
      expect(stopTrack).toHaveBeenCalled();
    } finally {
      vi.clearAllTimers();
      playSpy.mockRestore();
      loadSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
