"use client";

import { localeLabels, supportedLocales } from "@/lib/i18n";
import { useI18n } from "./locale-provider";
import { usePathname, useRouter } from "next/navigation";

export function LanguageSwitcher({ compact = false, routeAware = false }: { compact?: boolean; routeAware?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const changeLocale = (nextLocale: typeof locale) => {
    setLocale(nextLocale);
    if (!routeAware) return;
    const withoutEnglishPrefix = pathname.replace(/^\/en(?=\/|$)/, "") || "/";
    router.push(nextLocale === "en" ? `/en${withoutEnglishPrefix === "/" ? "" : withoutEnglishPrefix}` : withoutEnglishPrefix);
  };
  return (
    <label className="inline-flex items-center gap-2 text-[10px] text-slate-400">
      {!compact && <span>{t("language.label")}</span>}
      <select
        aria-label={t("language.label")}
        value={locale}
        onChange={(event) => changeLocale(event.target.value as typeof locale)}
        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
      >
        {supportedLocales.map((item) => <option key={item} value={item}>{localeLabels[item]}</option>)}
      </select>
    </label>
  );
}
