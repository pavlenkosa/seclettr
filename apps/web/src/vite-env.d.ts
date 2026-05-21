/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GIPHY_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.module.css";
declare module "*.css";

declare const __APP_VERSION__: string;

declare var __SECLETTR_RUNTIME_CONFIG__: {
  apiUrl?: string;
  sfuUrl?: string;
} | undefined;

declare var __scGetCallDebugSnapshot: ((...args: unknown[]) => unknown) | undefined;
declare var __scDumpCallDebug: ((...args: unknown[]) => unknown) | undefined;
declare var __scSetCallDebugEnabled: ((enabled: boolean) => void) | undefined;
declare var __scIsCallDebugEnabled: ((...args: unknown[]) => unknown) | undefined;
declare var __scGetGroupCallDebugSnapshot: ((...args: unknown[]) => unknown) | undefined;
declare var __scDumpGroupCallDebug: ((...args: unknown[]) => unknown) | undefined;
declare var __scGroupCallDebug: unknown;

interface Window {
  __SECLETTR_RUNTIME_CONFIG__?: {
    apiUrl?: string;
    sfuUrl?: string;
  };
}
