import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { reportError } from "./lib/error-reporter.js";
import { isNativePlatform, getNativeServerUrl } from "./lib/native-platform";
import { NativeServerSetup } from "./pages/NativeServerSetup";
import "./styles/global.css";

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

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

function Root() {
  const needsSetup = isNativePlatform() && !getNativeServerUrl();
  const [configured, setConfigured] = useState(!needsSetup);

  if (!configured) {
    return <NativeServerSetup onConfigured={() => setConfigured(true)} />;
  }

  return <App />;
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </React.StrictMode>
);
