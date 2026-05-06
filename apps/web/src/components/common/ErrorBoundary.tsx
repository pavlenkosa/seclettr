import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { logger } from "@/lib/logger.js";
import { reportError } from "@/lib/error-reporter.js";

// ── Boundary ──────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /**
   * Component rendered when the boundary has caught an error.
   * Receives `onReset` to clear the error state.
   */
  readonly FallbackComponent: ComponentType<{ readonly onReset: () => void }>;
  /**
   * Optional callback for error reporting / logging.
   * Called once per error with the raw Error and React's ErrorInfo.
   */
  readonly onError?: (error: Error, info: ErrorInfo) => void;
  /**
   * When any value in this array changes identity, the boundary resets automatically.
   * Useful for resetting on route / thread changes.
   */
  readonly resetKeys?: readonly unknown[];
}

interface ErrorBoundaryState {
  error: Error | null;
}

function resolveBoundaryLabel(info: ErrorInfo): string | null {
  const firstFrame = info.componentStack
    ?.split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstFrame) return null;
  return firstFrame.replace(/^at\s+/, "").split(" ")[0]?.slice(0, 80) ?? null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const boundaryLabel = resolveBoundaryLabel(info);
    this.props.onError?.(error, info);
    logger.error("[ErrorBoundary] Caught render error", {
      name: error.name,
      boundary: boundaryLabel ?? "unknown",
    });
    reportError(
      error,
      boundaryLabel ? `ErrorBoundary:${boundaryLabel}` : "ErrorBoundary"
    );
  }

  override componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (this.state.error === null) return;
    if (!this.props.resetKeys) return;

    const changed = this.props.resetKeys.some(
      (key, i) => key !== prevProps.resetKeys?.[i]
    );
    if (changed) this.reset();
  }

  reset(): void {
    this.setState({ error: null });
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      const { FallbackComponent } = this.props;
      return <FallbackComponent onReset={this.reset} />;
    }
    return this.props.children;
  }
}

// ── Fallback UI components ────────────────────────────────────────────────────
// These are functional components so they can use hooks (i18n, etc.).

import { useCallback } from "react";
import { useI18n } from "@/i18n";
import { PillButton, SurfacePanel } from "@/components/ui";
import styles from "./ErrorBoundary.module.css";

/**
 * Full-page fallback rendered by the root ErrorBoundary in App.tsx.
 * Offers a hard page reload as the only recovery path.
 */
export function AppErrorFallback(_: { readonly onReset: () => void }) {
  const { t } = useI18n();
  const handleReload = useCallback(() => globalThis.location.reload(), []);

  return (
    <div className={styles.appFallback} role="alert" aria-live="assertive">
      <SurfacePanel padding="lg" radius="xl" tone="strong" className={styles.appFallbackPanel}>
        <p className={styles.appFallbackTitle}>{t("error.boundary.app.title")}</p>
        <p className={styles.appFallbackBody}>{t("error.boundary.app.body")}</p>
        <PillButton tone="accent" appearance="soft" size="md" onClick={handleReload}>
          {t("error.boundary.app.retry")}
        </PillButton>
      </SurfacePanel>
    </div>
  );
}

/**
 * Compact fallback for call panels (DirectCallPanel, GroupCallPanel).
 * A call crash must not destroy the chat — this keeps it isolated and dismissable.
 */
export function CallErrorFallback({ onDismiss }: { readonly onDismiss: () => void }) {
  const { t } = useI18n();

  return (
    <div className={styles.callFallback} role="alert">
      <SurfacePanel padding="md" radius="xl" tone="strong" className={styles.callFallbackPanel}>
        <p className={styles.callFallbackTitle}>{t("error.boundary.call.title")}</p>
        <p className={styles.callFallbackBody}>{t("error.boundary.call.body")}</p>
        <PillButton tone="neutral" appearance="soft" size="sm" onClick={onDismiss}>
          {t("error.boundary.call.dismiss")}
        </PillButton>
      </SurfacePanel>
    </div>
  );
}

/**
 * Inline fallback for the message thread pane.
 * Shows a centered notice with a reset button to retry rendering.
 */
export function ThreadErrorFallback({ onReset }: { readonly onReset: () => void }) {
  const { t } = useI18n();

  return (
    <div className={styles.threadFallback} role="alert">
      <SurfacePanel padding="md" radius="xl" tone="strong" className={styles.threadFallbackPanel}>
        <p className={styles.threadFallbackTitle}>{t("error.boundary.thread.title")}</p>
        <p className={styles.threadFallbackBody}>{t("error.boundary.thread.body")}</p>
        <PillButton tone="neutral" appearance="soft" size="sm" onClick={onReset}>
          {t("error.boundary.thread.retry")}
        </PillButton>
      </SurfacePanel>
    </div>
  );
}
