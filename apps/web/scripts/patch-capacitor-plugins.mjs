import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pluginsJson = resolve(__dirname, "..", "android", "app", "src", "main", "assets", "capacitor.plugins.json");

if (!existsSync(pluginsJson)) {
  process.exit(0);
}

const raw = readFileSync(pluginsJson, "utf8");
const plugins = JSON.parse(raw);

const hasNativePush = plugins.some(
  (p) => p.pkg === "@seclettr/native-push" || p.classpath === "com.seclettr.app.NativePushPlugin"
);

if (!hasNativePush) {
  plugins.push({
    pkg: "@seclettr/native-push",
    classpath: "com.seclettr.app.NativePushPlugin",
  });
  writeFileSync(pluginsJson, JSON.stringify(plugins, null, "\t") + "\n");
  console.log("[patch-capacitor-plugins] Added NativePushPlugin to capacitor.plugins.json");
}
