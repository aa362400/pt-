import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <span className="text-5xl font-bold text-[#6C63FF]">404</span>
      <p className="text-sm text-[#8B93B5]">{t('error.pageNotFoundDesc')}</p>
      <Link
        to="/assistant"
        className="rounded-lg bg-[#6C63FF] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#5B52EE]"
      >
        {t('error.backToHome')}
      </Link>
    </div>
  );
}
