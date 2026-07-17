import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function MergedFeatureNotice({
  destination,
  destinationLabel,
}: {
  destination: string;
  destinationLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950"
    >
      <span>{t('journeyNavigation.mergedNotice', { destination: destinationLabel })}</span>
      <Link
        to={destination}
        className="inline-flex items-center gap-1.5 font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {t('journeyNavigation.goNow')}
        <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </div>
  );
}
