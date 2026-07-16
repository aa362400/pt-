import {
  useCallback,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { I18nContext, type Locale } from './useI18n.ts';

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
