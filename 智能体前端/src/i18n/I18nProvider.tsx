import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';

type Locale = 'zh-CN' | 'en-US';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();

  const setLocale = useCallback(
    (locale: Locale) => {
      void i18n.changeLanguage(locale);
    },
    [i18n],
  );

  const locale = (i18n.language as Locale) || 'zh-CN';

  return (
    <I18nContext.Provider value={{ locale, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
