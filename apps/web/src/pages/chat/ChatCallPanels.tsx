import { lazy, memo, Suspense, useMemo, type ComponentType, type MutableRefObject } from "react";
import type { DirectCallPanelHandle } from "@/calls/direct/model/direct-call-types";
import { CallErrorFallback, ErrorBoundary } from "@/components/common/ErrorBoundary";
import type { WorkspaceEntryState } from "./chat-page-types";
import styles from "../ChatPage.module.css";

const DirectCallPanel = lazy(() =>
  import("@/calls/direct/presentation/DirectCallPanel").then(({ DirectCallPanel: Component }) => ({
    default: Component,
  }))
);
const GroupCallPanel = lazy(() =>
  import("@/calls/group/presentation/GroupCallPanel").then(({ GroupCallPanel: Component }) => ({
    default: Component,
  }))
);

function DirectCallFallback({ onReset }: { readonly onReset: () => void }) {
  return <CallErrorFallback onDismiss={onReset} />;
}

function makeGroupCallFallback(onClose: () => void): ComponentType<{ readonly onReset: () => void }> {
  return function GroupCallFallback({ onReset }: { readonly onReset: () => void }) {
    return <CallErrorFallback onDismiss={() => { onClose(); onReset(); }} />;
  };
}

export const ChatCallPanels = memo(function ChatCallPanels({
  directCallPanelRef,
  groupCallSession,
  handleCloseGroupCallPanel,
}: {
  directCallPanelRef: MutableRefObject<DirectCallPanelHandle | null>;
  groupCallSession: WorkspaceEntryState["groupCallSession"];
  handleCloseGroupCallPanel: WorkspaceEntryState["handleCloseGroupCallPanel"];
}) {
  const GroupCallFallback = useMemo(
    () => makeGroupCallFallback(handleCloseGroupCallPanel),
    [handleCloseGroupCallPanel]
  );

  return (
    <>
      <ErrorBoundary FallbackComponent={DirectCallFallback}>
        <Suspense fallback={null}>
          <DirectCallPanel ref={directCallPanelRef} />
        </Suspense>
      </ErrorBoundary>
      {groupCallSession ? (
        <ErrorBoundary
          FallbackComponent={GroupCallFallback}
          resetKeys={[groupCallSession.groupId]}
        >
          <Suspense fallback={<div className={styles.modalLazyFallback} aria-hidden="true" />}>
            <GroupCallPanel session={groupCallSession} onClose={handleCloseGroupCallPanel} />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </>
  );
});
