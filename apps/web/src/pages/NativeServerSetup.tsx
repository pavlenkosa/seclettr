import { useState, type FormEvent } from "react";
import { setNativeServerUrl } from "@/lib/native-platform";
import styles from "./NativeServerSetup.module.css";

interface Props {
  onConfigured: () => void;
}

function normalizeServerUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function testConnection(serverUrl: string): Promise<"ok" | "unreachable" | "invalid"> {
  try {
    const res = await fetch(`${serverUrl}/api/users/me`, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
    });
    // 401 = server is live, user just isn't authenticated
    // 200/403 = also fine
    return res.status < 500 ? "ok" : "unreachable";
  } catch {
    return "unreachable";
  }
}

export function NativeServerSetup({ onConfigured }: Props) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const url = normalizeServerUrl(value);
    if (!url) {
      setError("Введите корректный URL сервера (например: https://my-server.com)");
      return;
    }

    setLoading(true);
    const status = await testConnection(url);
    setLoading(false);

    if (status === "unreachable") {
      setError("Сервер недоступен. Проверьте URL и подключение к интернету.");
      return;
    }

    setNativeServerUrl(url);
    onConfigured();
  };

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.logo} aria-hidden="true">
          <img src="/favicon.svg" width="64" height="64" alt="" />
        </div>

        <h1 className={styles.title}>Seclettr</h1>
        <p className={styles.subtitle}>Укажите адрес вашего сервера</p>

        <form onSubmit={(e) => { void handleSubmit(e); }} className={styles.form}>
          <input
            className={styles.input}
            type="url"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="https://my-server.com"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(null); }}
            disabled={loading}
            required
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          <button className={styles.btn} type="submit" disabled={loading || !value.trim()}>
            {loading ? "Проверка…" : "Продолжить"}
          </button>
        </form>
      </div>
    </div>
  );
}
