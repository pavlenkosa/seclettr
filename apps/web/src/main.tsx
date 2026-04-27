import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import { reportError } from "./lib/error-reporter.js";
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
      registration.unregister();
    }
  } else {
    navigator.serviceWorker.register("/push-sw.js");
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>
);
