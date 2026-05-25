import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  ensureLocaleMessages,
  FALLBACK_LOCALE,
  getLoadedMessages,
  SUPPORTED_LOCALES,
  type Locale,
  type TranslationMap,
  type TranslationParams,
} from "./messages";

const LOCALE_STORAGE_KEY = "seclettr.locale.v1";
const LEGACY_LOCALE_STORAGE_KEY = "qm.locale.v1";
const SUPPORTED_LOCALE_SET = new Set<Locale>(SUPPORTED_LOCALES);

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string, params?: TranslationParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY) ?? localStorage.getItem(LEGACY_LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED_LOCALE_SET.has(saved as Locale)) {
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

function translate(
  locale: Locale,
  loadedMessages: Partial<Record<Locale, TranslationMap>>,
  key: string,
  params?: TranslationParams
): string {
  const localeMap = loadedMessages[locale] ?? getLoadedMessages(locale);
  const fallbackMap = loadedMessages[FALLBACK_LOCALE] ?? getLoadedMessages(FALLBACK_LOCALE);
  const template = localeMap?.[key] ?? fallbackMap?.[key] ?? key;
  return interpolate(template, params);
}

interface I18nProviderProps {
  readonly children: ReactNode;
  readonly initialLocale?: Locale;
  readonly initialMessages?: TranslationMap;
}

export function I18nProvider({
  children,
  initialLocale: providedInitialLocale,
  initialMessages: providedInitialMessages,
}: Readonly<I18nProviderProps>) {
  const initialLocale = providedInitialLocale ?? resolveInitialLocale();
  const initialMessages = providedInitialMessages ?? getLoadedMessages(initialLocale) ?? getLoadedMessages(FALLBACK_LOCALE) ?? {};
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [loadedMessages, setLoadedMessages] = useState<Partial<Record<Locale, TranslationMap>>>(() => ({
    [FALLBACK_LOCALE]: getLoadedMessages(FALLBACK_LOCALE) ?? initialMessages,
    [initialLocale]: initialMessages,
  }));

  const applyLocale = useCallback((next: Locale) => {
    if (!SUPPORTED_LOCALE_SET.has(next)) return;
    try { localStorage.setItem(LOCALE_STORAGE_KEY, next); } catch { /* storage not available */ }
    if (next === locale) return;

    const loaded = loadedMessages[next] ?? getLoadedMessages(next);
    if (loaded) {
      setLoadedMessages((current) => current[next] ? current : { ...current, [next]: loaded });
      setLocale(next);
      return;
    }

    void ensureLocaleMessages(next).then((localeMessages) => {
      setLoadedMessages((current) => ({ ...current, [next]: localeMessages }));
      setLocale(next);
    });
  }, [loadedMessages, locale]);

  const t = useCallback((key: string, params?: TranslationParams) => {
    return translate(locale, loadedMessages, key, params);
  }, [locale, loadedMessages]);

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

export { resolveInitialLocale };
