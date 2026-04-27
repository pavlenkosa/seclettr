import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { messages, type Locale, type TranslationParams } from "./messages";

const LOCALE_STORAGE_KEY = "seclettr.locale.v1";
const LEGACY_LOCALE_STORAGE_KEY = "qm.locale.v1";
const FALLBACK_LOCALE: Locale = "en";
const SUPPORTED_LOCALES = new Set<Locale>(["en", "ru"]);

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALES.has(saved as Locale)) {
      return saved as Locale;
    }
  } catch { /* storage not available */ }

  const browserLocale = navigator.language.toLowerCase();
  if (browserLocale.startsWith("ru")) return "ru";
  return FALLBACK_LOCALE;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replaceAll(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = params[key];
    return value === undefined ? "" : String(value);
  });
}

function translate(locale: Locale, key: string, params?: TranslationParams): string {
  const localeMap = messages[locale];
  const fallbackMap = messages[FALLBACK_LOCALE];
  const template = localeMap[key] ?? fallbackMap[key] ?? key;
  return interpolate(template, params);
}

export function I18nProvider({ children }: { readonly children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale());

  const applyLocale = useCallback((next: Locale) => {
    if (!SUPPORTED_LOCALES.has(next)) return;
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* storage not available */ }
    setLocale(next);
  }, [setLocale]);

  const t = useCallback((key: string, params?: TranslationParams) => {
    return translate(locale, key, params);
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: applyLocale,
    t,
  }), [locale, applyLocale, t]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
}
