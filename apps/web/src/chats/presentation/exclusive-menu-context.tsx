import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";

type ExclusiveMenuListener = (openedId: string) => void;

interface ExclusiveMenuContextValue {
  readonly notifyOpen: (id: string) => void;
  readonly subscribe: (listener: ExclusiveMenuListener) => () => void;
}

const ExclusiveMenuContext = createContext<ExclusiveMenuContextValue | null>(null);

/**
 * Scopes exclusive-menu coordination to the subtree it wraps.
 * Place one instance around each list that renders menus that should
 * auto-close each other (e.g. ConversationList, MessageList).
 */
export function ExclusiveMenuProvider({ children }: { readonly children: ReactNode }) {
  const listenersRef = useRef(new Set<ExclusiveMenuListener>());

  const notifyOpen = useCallback((id: string) => {
    listenersRef.current.forEach((cb) => cb(id));
  }, []);

  const subscribe = useCallback((listener: ExclusiveMenuListener) => {
    listenersRef.current.add(listener);
    return () => { listenersRef.current.delete(listener); };
  }, []);

  const value = useMemo(() => ({ notifyOpen, subscribe }), [notifyOpen, subscribe]);

  return (
    <ExclusiveMenuContext.Provider value={value}>
      {children}
    </ExclusiveMenuContext.Provider>
  );
}

/**
 * Returns stable `notifyOpen` and `subscribe` helpers scoped to the nearest
 * `ExclusiveMenuProvider`. Both are no-ops when there is no provider in the
 * tree (graceful degradation — outside-click handlers still prevent overlap).
 *
 * Usage pattern:
 * ```tsx
 * const { notifyOpen, subscribe } = useExclusiveMenu(myId);
 *
 * // When opening this menu:
 * notifyOpen();  // signals other menus to close
 *
 * // On mount (in a useEffect):
 * return subscribe(closeMenu);  // close when another menu opens
 * ```
 */
export function useExclusiveMenu(id: string): {
  notifyOpen: () => void;
  subscribe: (onOtherOpen: () => void) => () => void;
} {
  const ctx = useContext(ExclusiveMenuContext);

  // Keep a ref so the subscription closure always reads the current id
  // without needing to re-register every time id changes (it never does
  // in practice — all callers use useId()).
  const idRef = useRef(id);
  idRef.current = id;

  const notifyOpen = useCallback(() => {
    ctx?.notifyOpen(idRef.current);
  }, [ctx]);

  const subscribe = useCallback((onOtherOpen: () => void) => {
    if (!ctx) return () => {};
    return ctx.subscribe((openedId) => {
      if (openedId !== idRef.current) onOtherOpen();
    });
  }, [ctx]);

  return { notifyOpen, subscribe };
}
