import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.seclettr.app",
  appName: "Seclettr",
  webDir: "dist",
  android: {
    // Custom server URLs may use self-signed certs — handled via network security config.
    allowMixedContent: false,
  },
  plugins: {
    Camera: {
      resultType: "uri",
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    BackgroundRunner: {
      label: "com.seclettr.app.background",
      src: "runners/background.js",
      event: "checkUnread",
      repeat: true,
      interval: 15,
      autoStart: true,
    },
  },
};

export default config;
