import { useEffect, useState } from "react";
import styles from "./StorageInspector.module.css";

interface StorageRow {
  db: string;
  key: string;
  type: string;
  protection: string;
  sizeBytes: number | null;
}

const IDB_NAME_CRYPTO = "seclettr-crypto";
const IDB_NAME_AUTH_META = "seclettr-auth-meta";
const IDB_NAME_LOCK_PIN = "seclettr-lock-pin";
const IDB_NAME_LEGACY = "seclettr-keystore";

function classifyKey(key: string): { type: string; protection: string } {
  if (key.startsWith("device:") && key.endsWith(":keys")) {
    return { type: "E2EE device keys (identity, signed prekeys, OTKs)", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("session:")) {
    return { type: "Double Ratchet session state", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("tofu:")) {
    return { type: "TOFU identity cache", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("group:sender-key:local:")) {
    return { type: "Local sender key (outbound group)", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("group:sender-key:remote:")) {
    return { type: "Remote sender key (inbound group)", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("conversations:v1:")) {
    return { type: "Conversation list + messages", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("outbound-queue:v1:")) {
    return { type: "DM outbound queue", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("group-outbound-queue:v1:")) {
    return { type: "Group outbound queue", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("group-pending-decrypt-queue:v1:")) {
    return { type: "Group pending-decrypt queue", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("processed-message-ids:v1:")) {
    return { type: "Processed message ID dedup set", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("pending-ack-message-ids:v1:")) {
    return { type: "Pending ACK message IDs", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("quarantined-message-ids:v1:")) {
    return { type: "Quarantined message IDs", protection: "AES-256-GCM (storage key)" };
  }
  if (key.startsWith("pending-read-receipt-message-ids:v1:")) {
    return { type: "Pending read-receipt message IDs", protection: "AES-256-GCM (storage key)" };
  }
  return { type: key, protection: "AES-256-GCM (storage key)" };
}

async function openIdb(name: string, version: number, storeName: string): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) {
          req.result.createObjectStore(storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function listIdbStore(
  db: IDBDatabase,
  storeName: string
): Promise<Array<{ key: string; sizeBytes: number }>> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const results: Array<{ key: string; sizeBytes: number }> = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          resolve(results);
          return;
        }
        const key = String(cursor.key);
        let size = 0;
        const val = cursor.value;
        if (val instanceof Uint8Array || val instanceof ArrayBuffer) {
          size = val instanceof Uint8Array ? val.byteLength : val.byteLength;
        } else if (val !== null && val !== undefined) {
          try { size = JSON.stringify(val).length; } catch { size = 0; }
        }
        results.push({ key, sizeBytes: size });
        cursor.continue();
      };
      req.onerror = () => resolve(results);
      tx.onerror = () => resolve(results);
    } catch {
      resolve([]);
    }
  });
}

async function loadStorageRows(): Promise<StorageRow[]> {
  const rows: StorageRow[] = [];

  const cryptoDb = await openIdb(IDB_NAME_CRYPTO, 1, "keystore");
  if (cryptoDb) {
    const entries = await listIdbStore(cryptoDb, "keystore");
    for (const { key, sizeBytes } of entries) {
      const { type, protection } = classifyKey(key);
      rows.push({ db: IDB_NAME_CRYPTO, key, type, protection, sizeBytes });
    }
    cryptoDb.close();
  }

  const authMetaDb = await openIdb(IDB_NAME_AUTH_META, 1, "secrets");
  if (authMetaDb) {
    const entries = await listIdbStore(authMetaDb, "secrets");
    for (const { key, sizeBytes } of entries) {
      rows.push({
        db: IDB_NAME_AUTH_META,
        key,
        type: "AES-256-GCM storage key (master wrapping key)",
        protection: "CryptoKey (non-extractable) or PBKDF2-AES-GCM (PIN wrap, 600k iter)",
        sizeBytes,
      });
    }
    authMetaDb.close();
  }

  const lockPinDb = await openIdb(IDB_NAME_LOCK_PIN, 1, "pin");
  if (lockPinDb) {
    const entries = await listIdbStore(lockPinDb, "pin");
    for (const { key, sizeBytes } of entries) {
      rows.push({
        db: IDB_NAME_LOCK_PIN,
        key,
        type: "App-lock PIN verifier",
        protection: "PBKDF2-SHA-256 (600k iter, 16B salt) — PIN never stored",
        sizeBytes,
      });
    }
    lockPinDb.close();
  }

  const legacyDb = await openIdb(IDB_NAME_LEGACY, 1, "keystore");
  if (legacyDb) {
    const entries = await listIdbStore(legacyDb, "keystore");
    for (const { key, sizeBytes } of entries) {
      rows.push({
        db: IDB_NAME_LEGACY + " (legacy)",
        key,
        type: "Legacy encrypted blob",
        protection: "AES-256-GCM (storage key)",
        sizeBytes,
      });
    }
    legacyDb.close();
  }

  return rows;
}

function fmtSize(n: number | null): string {
  if (n === null) return "—";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

const LOCAL_STORAGE_ENTRIES: Array<{ key: string; label: string; sensitive: boolean }> = [
  { key: "seclettr.registrationId.v1", label: "Signal registration ID", sensitive: false },
  { key: "seclettr.peerIdentity.v1:*", label: "Peer identity cache (per-device)", sensitive: false },
  { key: "seclettr.appLock.snapshot.v1", label: "App-lock snapshot (legacy)", sensitive: false },
  { key: "seclettr.storageKey.v1", label: "Storage key raw (legacy — should be absent)", sensitive: true },
  { key: "seclettr.dev.call-media-debug.enabled.v1", label: "Call media debug flag", sensitive: false },
  { key: "sidebar-width", label: "UI sidebar width", sensitive: false },
];

function LocalStorageTable() {
  const rows = LOCAL_STORAGE_ENTRIES.map(({ key, label, sensitive }) => {
    const value = localStorage.getItem(key) ?? "—";
    const present = localStorage.getItem(key) !== null;
    return { key, label, sensitive, present, value };
  });

  const dynamicKeys = Object.keys(localStorage).filter(
    k => !LOCAL_STORAGE_ENTRIES.some(e => k.startsWith(e.key.replace(":*", ":")))
  );

  function valueClass(r: { sensitive: boolean; present: boolean }) {
    if (r.sensitive && r.present) return styles.lsValueWarn;
    if (r.present) return styles.lsValueOk;
    return styles.lsValueAbsent;
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th} style={{ width: "35%" }}>Key</th>
            <th className={styles.th} style={{ width: "40%" }}>Description</th>
            <th className={styles.th} style={{ width: "25%" }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key}>
              <td className={`${styles.td} ${styles.cellKey}`}>{r.key}</td>
              <td className={styles.td}>{r.label}</td>
              <td className={`${styles.td} ${valueClass(r)}`}>
                {r.sensitive && r.present
                  ? "⚠ PRESENT (legacy!)"
                  : r.present
                    ? r.value.slice(0, 40)
                    : "absent"}
              </td>
            </tr>
          ))}
          {dynamicKeys.map(k => (
            <tr key={k}>
              <td className={`${styles.td} ${styles.cellKey}`}>{k}</td>
              <td className={`${styles.td} ${styles.cellDb}`}>unknown</td>
              <td className={styles.td}>{(localStorage.getItem(k) ?? "").slice(0, 40)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StorageInspector() {
  const [idbRows, setIdbRows] = useState<StorageRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"idb" | "ls">("idb");

  async function refresh() {
    setLoading(true);
    try {
      setIdbRows(await loadStorageRows());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  return (
    <div className={styles.root}>
      <div className={styles.tabBar}>
        <button
          onClick={() => setTab("idb")}
          className={`${styles.tab} ${tab === "idb" ? styles.tabActive : ""}`}
        >
          IndexedDB
        </button>
        <button
          onClick={() => setTab("ls")}
          className={`${styles.tab} ${tab === "ls" ? styles.tabActive : ""}`}
        >
          localStorage
        </button>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          className={styles.refreshBtn}
        >
          {loading ? "…" : "↺"}
        </button>
      </div>

      {tab === "idb" && (
        idbRows === null ? (
          <div className={styles.empty}>Loading…</div>
        ) : idbRows.length === 0 ? (
          <div className={styles.empty}>No IndexedDB entries found.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th} style={{ width: "18%" }}>Database</th>
                  <th className={styles.th} style={{ width: "24%" }}>Key</th>
                  <th className={styles.th} style={{ width: "34%" }}>Type / Contents</th>
                  <th className={styles.th} style={{ width: "17%" }}>Protection</th>
                  <th className={styles.th} style={{ width: "7%" }}>Size</th>
                </tr>
              </thead>
              <tbody>
                {idbRows.map((r, i) => (
                  <tr key={i} className={i % 2 !== 0 ? styles.rowAlt : undefined}>
                    <td className={`${styles.td} ${styles.cellDb}`}>{r.db}</td>
                    <td className={`${styles.td} ${styles.cellKey}`}>{r.key}</td>
                    <td className={`${styles.td} ${styles.cellType}`}>{r.type}</td>
                    <td className={`${styles.td} ${styles.cellProtection}`}>{r.protection}</td>
                    <td className={`${styles.td} ${styles.cellSize}`}>{fmtSize(r.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {tab === "ls" && <LocalStorageTable />}
    </div>
  );
}
