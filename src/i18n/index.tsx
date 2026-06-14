/**
 * Internationalisation (Phase 10, Slice 10.3).
 *
 * A tiny, dependency-free i18n layer:
 *   - `LanguageProvider` holds the active language and persists it to
 *     localStorage (per browser/profile, survives reloads).
 *   - `useT()` returns a `t(key, vars?)` function with `{var}` interpolation.
 *   - `useLang()` returns the current language + a setter + the language list.
 *
 * English is the canonical catalogue and the universal fallback: any key
 * missing from the active locale resolves to the English string, so the app is
 * never left with blank or broken labels.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en } from './locales/en';
import { es } from './locales/es';

export type Lang = 'en' | 'es';
export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;

/** Per-language (possibly partial) catalogues. English is complete. */
const CATALOG: Record<Lang, Partial<Messages>> = { en, es };

/** Languages offered in the UI switch, in display order. */
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
];

const STORAGE_KEY = 'codename-lang';

function loadLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'es') return v;
  } catch {
    /* localStorage unavailable — fall through to default */
  }
  return 'en';
}

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(loadLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore persistence failure */
    }
  }, []);

  // Reflect the language on <html lang> for assistive tech (ties into 10.2).
  useEffect(() => {
    try {
      document.documentElement.lang = lang;
    } catch {
      /* non-DOM env */
    }
  }, [lang]);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>): string => {
      const table = CATALOG[lang];
      const raw = table[key] ?? en[key] ?? key; // active → English → raw key
      return interpolate(raw, vars);
    },
    [lang],
  );

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error('useI18n must be used within a LanguageProvider');
  return v;
}

/** Convenience: just the translate function. */
export function useT() {
  return useI18n().t;
}

/** Convenience: language state + setter + the offered language list. */
export function useLang() {
  const { lang, setLang } = useI18n();
  return { lang, setLang, languages: LANGUAGES };
}
