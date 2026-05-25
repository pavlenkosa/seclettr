/**
 * native-keyboard.ts — Capacitor Keyboard plugin bridge.
 *
 * Sets --composer-safe-bottom on the root element when the software keyboard
 * shows or hides, so the MessageComposer can pad itself above the keyboard.
 *
 * Works with: capacitor.config.ts `Keyboard.resize: "body"` (adjusts body height)
 * plus AND-01 `android:windowSoftInputMode="adjustResize"` (resizes WebView viewport).
 *
 * The two mechanisms complement each other:
 *   - adjustResize ensures the viewport actually shrinks on Android
 *   - This listener ensures --composer-safe-bottom is always in sync for
 *     additional bottom padding inside the composer shell
 *
 * On web (non-native), the plugin is not available — this is a no-op.
 */

import { isNativePlatform } from "./native-platform";

interface KeyboardInfo {
  keyboardHeight: number;
}

interface PluginListenerHandle {
  remove: () => void;
}

interface KeyboardPlugin {
  addListener: (
    event: "keyboardWillShow" | "keyboardDidShow" | "keyboardWillHide" | "keyboardDidHide",
    handler: (info: KeyboardInfo) => void
  ) => Promise<PluginListenerHandle>;
}

function getPlugin(): KeyboardPlugin | null {
  if (!isNativePlatform()) return null;
  const cap = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor;
  return (cap?.Plugins?.["Keyboard"] as KeyboardPlugin) ?? null;
}

/**
 * Initialise keyboard safe-area injection.
 *
 * Call once from App.tsx or app-client-runtime-bootstrap.ts.
 * Returns a cleanup function to remove the listeners.
 */
export function initKeyboardSafeArea(): () => void {
  const plugin = getPlugin();
  if (!plugin) return () => {};

  let showHandle: PluginListenerHandle | null = null;
  let hideHandle: PluginListenerHandle | null = null;

  void plugin
    .addListener("keyboardWillShow", (info) => {
      document.documentElement.style.setProperty(
        "--composer-safe-bottom",
        `${info.keyboardHeight}px`
      );
    })
    .then((h) => { showHandle = h; });

  void plugin
    .addListener("keyboardWillHide", () => {
      document.documentElement.style.setProperty("--composer-safe-bottom", "0px");
    })
    .then((h) => { hideHandle = h; });

  return () => {
    showHandle?.remove();
    hideHandle?.remove();
  };
}
