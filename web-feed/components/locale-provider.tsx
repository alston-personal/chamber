"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Locale, normalizeLocale, translate, TranslationKey } from "@/lib/i18n";

const STORAGE_KEY = "chamber_locale";
type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, variables?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children, initialLocale = "zh-TW", autoDetect = true }: { children: React.ReactNode; initialLocale?: Locale; autoDetect?: boolean }) {
  const [locale, updateLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    if (!autoDetect) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const detectedLocale = normalizeLocale(stored || window.navigator.language);
    const timer = window.setTimeout(() => updateLocale(detectedLocale), 0);
    return () => window.clearTimeout(timer);
  }, [autoDetect]);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (nextLocale: Locale) => {
    updateLocale(nextLocale);
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    document.cookie = `chamber_locale=${encodeURIComponent(nextLocale)}; Path=/echo; Max-Age=31536000; SameSite=Lax`;
  };

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    t: (key, variables) => translate(locale, key, variables),
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useI18n must be used inside LocaleProvider");
  return context;
}
