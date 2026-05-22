import React, { lazy, Suspense, useState } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { I18nProvider, resolveInitialLocale } from "./i18n";
import { ensureLocaleMessages } from "./i18n/messages";
import { reportError } from "./lib/error-reporter.js";
import { isNativePlatform, getNativeServerUrl } from "./lib/native-platform";
import { AppBootSkeleton } from "./components/common/AppBootSkeleton";
import "./styles/global.css";

const NativeServerSetup = lazy(() =>
  import("./pages/NativeServerSetup").then(({ NativeServerSetup: Component }) => ({ default: Component }))
);

globalThis.addEventListener("error", (event) => {
  reportError(event.error ?? event.message, "globalThis.onerror");
});

globalThis.addEventListener("unhandledrejection", (event) => {
  reportError(event.reason, "unhandledrejection");
});

if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV && import.meta.env["VITE_DISABLE_SW_DEV"] === "true") {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      void registration.unregister();
    }
  } else {
    void navigator.serviceWorker.register("/push-sw.js");
  }
}

// Patch React internals before the first render so wdyr can trace re-renders.
// When the package is absent the import resolves to a no-op stub (see vite.config.ts).
if (import.meta.env.DEV) {
  await import("./lib/why-did-you-render");
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

const initialLocale = resolveInitialLocale();
const initialMessages = await ensureLocaleMessages(initialLocale);

function Root() {
  const needsSetup = isNativePlatform() && !getNativeServerUrl();
  const [configured, setConfigured] = useState(!needsSetup);

  if (!configured) {
    return (
      <Suspense fallback={<AppBootSkeleton />}>
        <NativeServerSetup onConfigured={() => setConfigured(true)} />
      </Suspense>
    );
  }

  return <App />;
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider initialLocale={initialLocale} initialMessages={initialMessages}>
      <Root />
    </I18nProvider>
  </React.StrictMode>
);
