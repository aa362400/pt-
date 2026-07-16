import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';
import { Dropdown, DropdownItem } from '../components/ui/Dropdown.tsx';
import { useI18n } from './useI18n.ts';

export default function LanguageSwitcher() {
  const { t } = useTranslation();
  const { locale, setLocale } = useI18n();

  return (
    <Dropdown
      align="right"
      trigger={
        <div className="flex items-center gap-1.5 rounded-lg px-2 md:px-3 py-2 text-sm text-[#4A5578] hover:bg-[#F8F9FF] transition-colors">
          <Globe size={15} />
          <span className="hidden md:inline">
            {locale === 'zh-CN' ? t('topbar.chinese') : t('topbar.english')}
          </span>
          <ChevronDown size={14} className="hidden md:block" />
        </div>
      }
    >
      <DropdownItem
        onClick={() => setLocale('zh-CN')}
        active={locale === 'zh-CN'}
      >
        {t('topbar.chinese')}
      </DropdownItem>
      <DropdownItem
        onClick={() => setLocale('en-US')}
        active={locale === 'en-US'}
      >
        {t('topbar.english')}
      </DropdownItem>
    </Dropdown>
  );
}
