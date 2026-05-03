import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

const require = createRequire(import.meta.url);
const libsodiumWrappersPath = require.resolve(
  "libsodium-wrappers/dist/modules/libsodium-wrappers.js"
);
const mediasoupClientPath = require.resolve("mediasoup-client");
const devApiHost = process.env["VITE_DEV_API_HOST"] ?? "127.0.0.1";
const devApiPort = Number(process.env["VITE_DEV_API_PORT"] ?? "3001");
const devSfuHost = process.env["VITE_DEV_SFU_HOST"] ?? devApiHost;
const devSfuPort = Number(process.env["VITE_DEV_SFU_PORT"] ?? "3002");
const devMinioHost = process.env["VITE_DEV_MINIO_HOST"] ?? "127.0.0.1";
const devMinioPort = Number(process.env["VITE_DEV_MINIO_PORT"] ?? "59000");
const devMinioBucket = process.env["VITE_DEV_MINIO_BUCKET"] ?? "seclettr-attachments";
const devApiOrigin = `http://${devApiHost}:${devApiPort}`;
const devWsOrigin = `ws://${devApiHost}:${devApiPort}`;
const devSfuOrigin = `http://${devSfuHost}:${devSfuPort}`;
const devMinioOrigin = `http://${devMinioHost}:${devMinioPort}`;
const devHost = process.env["VITE_DEV_HOST"] ?? "0.0.0.0";
const devHttpsKeyFile = process.env["VITE_DEV_HTTPS_KEY_FILE"];
const devHttpsCertFile = process.env["VITE_DEV_HTTPS_CERT_FILE"];
const devHttpsCaFile = process.env["VITE_DEV_HTTPS_CA_FILE"];
const devHttpsConfig = devHttpsKeyFile && devHttpsCertFile
  ? {
      key: fs.readFileSync(devHttpsKeyFile),
      cert: fs.readFileSync(devHttpsCertFile),
      ca: devHttpsCaFile ? fs.readFileSync(devHttpsCaFile) : undefined,
    }
  : undefined;
const buildSourcemap = process.env["SECLETTR_BUILD_SOURCEMAP"] === "true";
const JS_CHUNK_BUDGETS = {
  index: 40 * 1024,
  ChatPage: 360 * 1024,
  "feature-direct-calls": 200 * 1024,
  "feature-group-calls": 380 * 1024,
  "vendor-react": 160 * 1024,
  "vendor-router": 8 * 1024,
  "vendor-state": 8 * 1024,
  "vendor-debug": 10 * 1024,
  "vendor-misc": 80 * 1024,
  "vendor-protocol": 100 * 1024,
  "vendor-calls": 200 * 1024,
  // Crypto currently embeds the libsodium WASM payload and is tracked separately
  // until the auth/bootstrap path can load it more lazily.
  "vendor-crypto": 760 * 1024,
} as const;

function bundleBudgetPlugin(): Plugin {
  return {
    name: "seclettr-bundle-budgets",
    apply: "build",
    generateBundle(
      this: { error: (message: string) => never },
      _: unknown,
      bundle: Record<string, unknown>
    ) {
      const violations: string[] = [];

      for (const entry of Object.values(bundle)) {
        if (
          !entry
          || typeof entry !== "object"
          || !("type" in entry)
          || entry.type !== "chunk"
          || !("name" in entry)
          || typeof entry.name !== "string"
          || !entry.name
          || !("code" in entry)
          || typeof entry.code !== "string"
        ) {
          continue;
        }

        const budget = JS_CHUNK_BUDGETS[entry.name as keyof typeof JS_CHUNK_BUDGETS];
        if (budget === undefined) {
          continue;
        }

        const size = Buffer.byteLength(entry.code, "utf8");
        if (size > budget) {
          violations.push(
            `${entry.name}: ${(size / 1024).toFixed(2)} kB > ${(budget / 1024).toFixed(2)} kB`
          );
        }
      }

      if (violations.length > 0) {
        this.error(`Bundle budget exceeded:\n${violations.join("\n")}`);
      }
    },
  };
}

function resolveManualChunk(id: string): string | undefined {
  const normalizedId = id.toLowerCase();

  if (id.includes("/src/calls/direct/")) {
    return "feature-direct-calls";
  }

  if (id.includes("/src/calls/group/")) {
    return "feature-group-calls";
  }

  if (
    id.includes("/packages/crypto/")
    || id.includes("libsodium-wrappers")
    || normalizedId.includes("sodium")
  ) {
    return "vendor-crypto";
  }

  if (id.includes("/packages/protocol/") || id.includes("/node_modules/zod/")) {
    return "vendor-protocol";
  }

  if (id.includes("mediasoup-client")) {
    return "vendor-calls";
  }

  if (id.includes("react-router-dom")) {
    return "vendor-router";
  }

  if (
    id.includes("/node_modules/react/")
    || id.includes("/node_modules/react-dom/")
    || id.includes("/node_modules/scheduler/")
  ) {
    return "vendor-react";
  }

  if (id.includes("/node_modules/zustand/") || id.includes("/node_modules/idb/")) {
    return "vendor-state";
  }

  if (id.includes("/node_modules/debug/") || id.includes("/node_modules/ms/")) {
    return "vendor-debug";
  }

  if (id.includes("/node_modules/")) {
    return "vendor-misc";
  }

  return undefined;
}

export default defineConfig({
  plugins: [
    react(),
    ...(devHttpsConfig ? [] : [basicSsl()]),
    bundleBudgetPlugin(),
    VitePWA({
      // The app shell SW is public/push-sw.js which also handles push notifications.
      // Since only one SW can be active per scope, Workbox injection is disabled.
      // Offline fallback caching is implemented directly in push-sw.js.
      registerType: "autoUpdate",
      injectRegister: false,
      devOptions: { enabled: true },
      includeAssets: ["favicon.svg"],
      workbox: {
        inlineWorkboxRuntime: true,
      },
      manifest: {
        name: "Seclettr",
        short_name: "Seclettr",
        description: "End-to-end encrypted messenger and calls",
        theme_color: "#0f1b33",
        background_color: "#0a1326",
        display: "standalone",
        display_override: ["standalone", "minimal-ui"],
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "libsodium-wrappers": libsodiumWrappersPath,
      "mediasoup-client": mediasoupClientPath,
    },
  },
  server: {
    port: 5173,
    host: devHost,
    https: devHttpsConfig,
    // In development Vite / React Fast Refresh inject an inline <script> preamble
    // that the strict CSP meta tag in index.html blocks. Sending a permissive
    // Content-Security-Policy header from the dev server overrides the meta tag
    // so HMR and Fast Refresh work normally. The meta tag still applies in the
    // production build where no inline scripts are injected.
    headers: {
      "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), display-capture=(self)",
      "Content-Security-Policy": [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self' http: https: ws: wss:",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
      ].join("; "),
    },
    proxy: {
      "/api": {
        target: devApiOrigin,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
      "/ws": {
        target: devWsOrigin,
        ws: true,
      },
      "/sfu": {
        target: devSfuOrigin,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/sfu/, ""),
      },
      // MinIO presigned upload proxy — keeps browser requests on the same HTTPS
      // origin (Vite dev server) rather than hitting MinIO over plain HTTP.
      // S3_PUBLIC_URL in the API must be set to the Vite dev server origin so
      // the API rewrites presigned upload URLs to this prefix.
      [`/${devMinioBucket}/`]: {
        target: devMinioOrigin,
        changeOrigin: true,
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    target: "es2022",
    sourcemap: buildSourcemap,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk,
      },
    },
  },
  optimizeDeps: {
    include: ["libsodium-wrappers"],
  },
});
