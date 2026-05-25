const localSenderKeyLocks = new Map<string, Promise<void>>();

interface BrowserLockManager {
  request<T>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<T>
  ): Promise<T>;
}

interface GroupSenderKeyLockRuntime {
  withLocalSenderKeyLock: <T>(
    groupId: string,
    senderDeviceId: string,
    fn: () => Promise<T>
  ) => Promise<T>;
}

function localSenderKeyLockKey(groupId: string, senderDeviceId: string): string {
  return `${groupId}:${senderDeviceId}`;
}

function localSenderKeyBrowserLockName(
  localSenderKeyPrefix: string,
  groupId: string,
  senderDeviceId: string
): string {
  return `seclettr:${localSenderKeyPrefix}${localSenderKeyLockKey(groupId, senderDeviceId)}`;
}

function getBrowserLockManager(): BrowserLockManager | null {
  if (globalThis.navigator === undefined) return null;
  const locks = (globalThis.navigator as Navigator & {
    locks?: BrowserLockManager;
  }).locks;
  return locks && typeof locks.request === "function" ? locks : null;
}

/**
 * Owns local sender-key mutual exclusion across async tasks and browser tabs.
 * It preserves the existing in-memory queueing and Web Locks lock naming.
 */
export function createGroupSenderKeyLockRuntime(
  localSenderKeyPrefix: string
): GroupSenderKeyLockRuntime {
  async function withInMemoryLocalSenderKeyLock<T>(
    groupId: string,
    senderDeviceId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const key = localSenderKeyLockKey(groupId, senderDeviceId);
    const previous = localSenderKeyLocks.get(key) ?? Promise.resolve();
    let releaseLock!: () => void;
    const current = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    localSenderKeyLocks.set(key, current);
    await previous.catch(() => {});
    try {
      return await fn();
    } finally {
      releaseLock();
      if (localSenderKeyLocks.get(key) === current) {
        localSenderKeyLocks.delete(key);
      }
    }
  }

  async function withLocalSenderKeyLock<T>(
    groupId: string,
    senderDeviceId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const run = () => withInMemoryLocalSenderKeyLock(groupId, senderDeviceId, fn);
    const browserLocks = getBrowserLockManager();
    if (!browserLocks) return run();
    return browserLocks.request(
      localSenderKeyBrowserLockName(
        localSenderKeyPrefix,
        groupId,
        senderDeviceId
      ),
      { mode: "exclusive" },
      run
    );
  }

  return {
    withLocalSenderKeyLock,
  };
}
