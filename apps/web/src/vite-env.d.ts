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

interface Window {
  __SECLETTR_RUNTIME_CONFIG__?: {
    apiUrl?: string;
    sfuUrl?: string;
  };
  __scGetCallDebugSnapshot?: () => Promise<Record<string, unknown> | null>;
  __scDumpCallDebug?: () => Promise<void>;
  __scSetCallDebugEnabled?: (enabled: boolean) => void;
  __scIsCallDebugEnabled?: () => boolean;
  __scGetGroupCallDebugSnapshot?: () => Record<string, unknown> | null;
  __scDumpGroupCallDebug?: () => void;
  __scGroupCallDebug?: unknown;
  __scInjectMockParticipants?: (count: number) => void;
  __scClearMockParticipants?: () => void;
  __scCreateRoom?: () => void;
}
