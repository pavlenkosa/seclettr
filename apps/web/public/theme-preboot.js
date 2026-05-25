/* Applies saved theme/accent/fontSize before React mounts to eliminate first-paint flash. */
(function () {
  var THEME_KEY = "seclettr.ui.theme.v1";
  var ACCENT_KEY = "seclettr.ui.accent.v1";
  var FONT_SIZE_KEY = "seclettr.ui.fontSize.v1";
  var CUSTOM_BG_KEY = "seclettr.ui.custom.bg.v1";
  var CUSTOM_COLOR_SCHEME_KEY = "seclettr.ui.custom.colorScheme.v1";
  var THEME_VALUES = { light: 1, dark: 1, custom: 1 };
  var ACCENT_VALUES = { blue: 1, emerald: 1, rose: 1, violet: 1, amber: 1, teal: 1, indigo: 1, slate: 1 };
  var FONT_SIZE_VALUES = { sm: 1, md: 1, lg: 1 };

  try {
    var theme = localStorage.getItem(THEME_KEY);
    if (!theme || !THEME_VALUES[theme]) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }
    document.documentElement.dataset.theme = theme;

    var accent = localStorage.getItem(ACCENT_KEY);
    if (accent && ACCENT_VALUES[accent]) {
      document.documentElement.dataset.accent = accent;
    }

    var fontSize = localStorage.getItem(FONT_SIZE_KEY);
    if (fontSize && FONT_SIZE_VALUES[fontSize]) {
      document.documentElement.dataset.fontSize = fontSize;
    }

    if (theme === "custom") {
      var colorScheme = localStorage.getItem(CUSTOM_COLOR_SCHEME_KEY) || "dark";
      document.documentElement.style.colorScheme = colorScheme;

      var customBg = localStorage.getItem(CUSTOM_BG_KEY);
      if (customBg && /^#[0-9a-f]{6}$/i.test(customBg)) {
        document.documentElement.style.setProperty("--bg-primary", customBg);
      }
      // Set accent inline so the boot spinner shows the correct custom color
      // before applyCustomThemeVars() runs as a ui-settings side-effect.
      var customAccent = localStorage.getItem("seclettr.ui.custom.accent.v1");
      if (customAccent && /^#[0-9a-f]{6}$/i.test(customAccent)) {
        document.documentElement.style.setProperty("--accent", customAccent);
      }
    }
  } catch (e) {
    /* ignore — storage may be unavailable in private mode */
  }
})();
