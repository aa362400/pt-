import { AlertTriangle, Database, ExternalLink } from 'lucide-react';

interface PlaceholderPageProps {
  pageTitle: string;
  description?: string;
  tags?: string[];
}

function getMissingContract(pageTitle: string) {
  const lower = pageTitle.toLowerCase();
  if (lower.includes('competition') || lower.includes('text')) {
    return {
      endpoint: 'english_text /competition text /competitors realbackendAPI',
      scope: 'competitor price、text、text、text、text、text',
      nextAction: 'english_textbackendtext，english_textrealdatatextagenttask。',
    };
  }

  return {
    endpoint: 'english_text /market text /market-overview realbackendAPI',
    scope: 'english_text、english_text、english_text、english_text、english_text',
    nextAction: 'english_textbackendtext，english_textrealdatatextagenttask。',
  };
}

function PlaceholderPage({ pageTitle, description, tags }: PlaceholderPageProps) {
  const missing = getMissingContract(pageTitle);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-[#F8DDA7] bg-[#FFFDF7] p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#B45309]">
              <AlertTriangle size={18} />
              realbackendenglish_text
            </div>
            <h2 className="text-xl font-bold text-[#1A1A2E]">{pageTitle}</h2>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-[#5F6B8A]">{description}</p>
            ) : null}
            <p className="mt-3 text-sm leading-6 text-[#5F6B8A]">
              english_textdata，english_textlocaltext、text、text、english_text。
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-[#F8DDA7] bg-white px-3 py-1 text-xs font-semibold text-[#B45309]">
            english_text
          </span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
            <Database size={17} className="text-[#6C63FF]" />
            backendtext
          </div>
          <p className="text-sm leading-6 text-[#5F6B8A]">{missing.endpoint}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
            <AlertTriangle size={17} className="text-[#B45309]" />
            english_textfields
          </div>
          <p className="text-sm leading-6 text-[#5F6B8A]">{missing.scope}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
            <ExternalLink size={17} className="text-[#6C63FF]" />
            english_text
          </div>
          <p className="text-sm leading-6 text-[#5F6B8A]">{missing.nextAction}</p>
        </div>
      </section>

      {tags && tags.length > 0 ? (
        <section className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-[#1A1A2E]">english_text</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#F7F8FF] px-3 py-1 text-xs font-medium text-[#5F6B8A]">
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-[#8B93B5]">
            english_textyesenglish_text，english_textyesagenttextbackenddata。
          </p>
        </section>
      ) : null}
    </div>
  );
}

export default PlaceholderPage;
