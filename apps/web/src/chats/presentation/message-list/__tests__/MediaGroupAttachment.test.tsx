// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/stores/messages";

interface RuntimeConfig {
  initialPreviewUrl: string | null;
  decryptedPreviewUrl: string | null;
  decryptSpy: ReturnType<typeof vi.fn>;
}

const { runtimeConfigs } = vi.hoisted(() => ({
  runtimeConfigs: new Map<string, RuntimeConfig>(),
}));

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    locale: "en-US",
    t: (key: string) => key,
  }),
}));

vi.mock("@/ui-settings", () => ({
  useUiSettings: () => ({
    autoDecryptMedia: "off",
  }),
  useSecuritySettings: () => ({
    autoDecryptMedia: "off",
  }),
}));

vi.mock("@/chats/runtime/useUploadProgress", () => ({
  useUploadProgress: () => ({
    progress: null,
    cancel: vi.fn(),
  }),
}));

vi.mock("@/chats/runtime/useFileAttachmentRuntime", async () => {
  const React = await import("react");

  return {
    useFileAttachmentRuntime: ({ messageId }: { messageId: string }) => {
      const config = React.useMemo(
        () => runtimeConfigs.get(messageId) ?? {
          initialPreviewUrl: null,
          decryptedPreviewUrl: null,
          decryptSpy: vi.fn(),
        },
        [messageId]
      );
      const [previewUrl, setPreviewUrl] = React.useState<string | null>(config.initialPreviewUrl);

      const decryptAndPreview = React.useCallback(async () => {
        config.decryptSpy();
        if (!config.decryptedPreviewUrl) return null;
        setPreviewUrl(config.decryptedPreviewUrl);
        return config.decryptedPreviewUrl;
      }, [config]);

      return {
        loading: false,
        downloaded: false,
        previewUrl,
        errorCause: null,
        decryptAndPreview,
        decryptAndDownload: vi.fn(),
      };
    },
  };
});

vi.mock("@/components/common/MediaLightbox", () => ({
  MediaLightbox: ({
    currentIndex,
    onClose,
    onNavigate,
    totalCount,
    url,
  }: {
    currentIndex?: number;
    onClose: () => void;
    onNavigate?: (delta: -1 | 1) => void | Promise<void>;
    totalCount?: number;
    url: string;
  }) => (
    <div
      data-testid="lightbox"
      data-current-index={currentIndex ?? -1}
      data-total-count={totalCount ?? 0}
      data-url={url}
    >
      {onNavigate ? (
        <button
          type="button"
          data-testid="lightbox-next"
          onClick={() => { onNavigate(1); }}
        >
          next
        </button>
      ) : null}
      <button type="button" data-testid="lightbox-close" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

import { MediaGroupAttachment, resolveMediaGroupLayout } from "../MediaGroupAttachment";

function createGroupedMediaMessages(count: number): Message[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `media-${index + 1}`,
    senderId: "peer",
    senderDeviceId: "device-1",
    content: "[attachment]",
    type: "attachment" as const,
    attachment: {
      attachmentId: `att-${index + 1}`,
      key: "key",
      digest: "digest",
      mimeType: "image/jpeg",
      size: 64_000,
      fileName: `photo-${index + 1}.jpg`,
      mediaGroupId: "group-1",
    },
    timestamp: Date.UTC(2026, 2, 10, 13, 58) + index * 500,
    status: "sent" as const,
    isOwn: false,
  }));
}

function configureRuntime(messageId: string, config: Partial<RuntimeConfig>) {
  runtimeConfigs.set(messageId, {
    initialPreviewUrl: config.initialPreviewUrl ?? null,
    decryptedPreviewUrl: config.decryptedPreviewUrl ?? null,
    decryptSpy: config.decryptSpy ?? vi.fn(),
  });
}

describe("MediaGroupAttachment", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    runtimeConfigs.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT;
  });

  it("uses focused telegram-like layouts for small grouped media counts", () => {
    expect(resolveMediaGroupLayout(1)).toBe("single");
    expect(resolveMediaGroupLayout(2)).toBe("pair");
    expect(resolveMediaGroupLayout(3)).toBe("triple");
    expect(resolveMediaGroupLayout(4)).toBe("quad");
    expect(resolveMediaGroupLayout(5)).toBe("quint");
  });

  it("falls back to a dense grid for larger albums", () => {
    expect(resolveMediaGroupLayout(6)).toBe("grid");
    expect(resolveMediaGroupLayout(7)).toBe("grid");
  });

  it("keeps collapsed lightbox navigation scoped to visible album cells", async () => {
    const messages = createGroupedMediaMessages(6);
    messages.forEach((message, index) => {
      configureRuntime(message.id, {
        initialPreviewUrl: `blob:preview-${index + 1}`,
        decryptedPreviewUrl: `blob:preview-${index + 1}`,
      });
    });

    act(() => {
      root.render(<MediaGroupAttachment messages={messages} isOwn={false} timeLabel="2:12" />);
    });

    const cells = container.querySelectorAll<HTMLElement>('button[aria-label="message.media.tapToViewImage"]');
    expect(cells).toHaveLength(5);

    await act(async () => {
      cells[4]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    const lightbox = container.querySelector<HTMLElement>('[data-testid="lightbox"]');
    expect(lightbox).not.toBeNull();
    expect(lightbox?.dataset.totalCount).toBe("5");
    expect(lightbox?.dataset.currentIndex).toBe("4");
    expect(lightbox?.dataset.url).toBe("blob:preview-5");
  });

  it("does not open the lightbox when preview decryption returns no media", async () => {
    const messages = createGroupedMediaMessages(1);
    const decryptSpy = vi.fn();
    configureRuntime(messages[0]!.id, {
      initialPreviewUrl: null,
      decryptedPreviewUrl: null,
      decryptSpy,
    });

    act(() => {
      root.render(<MediaGroupAttachment messages={messages} isOwn={false} timeLabel="2:12" />);
    });

    const cell = container.querySelector<HTMLElement>('button[aria-label="message.media.tapToViewImage"]');
    expect(cell).not.toBeNull();

    await act(async () => {
      cell?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(decryptSpy).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="lightbox"]')).toBeNull();
  });

  it("decrypts the next mounted item before moving lightbox navigation after expand", async () => {
    const messages = createGroupedMediaMessages(6);
    messages.forEach((message, index) => {
      configureRuntime(message.id, {
        initialPreviewUrl: index === 5 ? null : `blob:preview-${index + 1}`,
        decryptedPreviewUrl: `blob:preview-${index + 1}`,
        decryptSpy: vi.fn(),
      });
    });

    act(() => {
      root.render(<MediaGroupAttachment messages={messages} isOwn={false} timeLabel="2:12" />);
    });

    await act(async () => {
      container.querySelector<HTMLElement>('button[aria-label="message.media.showMore"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    const expandedCells = container.querySelectorAll<HTMLElement>('button[aria-label="message.media.tapToViewImage"]');
    expect(expandedCells).toHaveLength(6);

    await act(async () => {
      expandedCells[4]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(container.querySelector<HTMLElement>('[data-testid="lightbox"]')?.dataset.url).toBe("blob:preview-5");

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="lightbox-next"]')?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector<HTMLElement>('[data-testid="lightbox"]')?.dataset.totalCount).toBe("6");
    expect(container.querySelector<HTMLElement>('[data-testid="lightbox"]')?.dataset.currentIndex).toBe("5");
    expect(container.querySelector<HTMLElement>('[data-testid="lightbox"]')?.dataset.url).toBe("blob:preview-6");
    expect(runtimeConfigs.get("media-6")?.decryptSpy).toHaveBeenCalledTimes(1);
  });
});
