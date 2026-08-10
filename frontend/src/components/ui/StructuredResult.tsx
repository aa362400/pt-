interface StructuredResultProps {
  data: Record<string, unknown>;
  entityType?: string;
}

/** Renders a listing-style preview when data has title + bulletPoints. */
function ListingPreview({ data }: { data: Record<string, unknown> }) {
  const title = String(data.title ?? '');
  const bullets = Array.isArray(data.bulletPoints) ? data.bulletPoints : [];
  const features = Array.isArray(data.features) ? data.features : [];

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-[#1A1A2E]">{title}</p>
      {bullets.length > 0 && (
        <ul className="space-y-1">
          {bullets.map((bp, i) => (
            <li key={i} className="text-xs text-[#4A5578] flex items-start gap-1.5">
              <span className="text-[#6C63FF] mt-0.5">•</span>
              {String(bp)}
            </li>
          ))}
        </ul>
      )}
      {features.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {features.map((f, i) => (
            <span key={i} className="text-[10px] bg-[#F0EEFF] text-[#6C63FF] px-2 py-0.5 rounded-full">
              {String(f)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Renders a keywords table. */
function KeywordTable({ keywords }: { keywords: unknown[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[#F0F0F8] text-left text-[#8B93B5]">
            <th className="pb-2 font-medium">keywords</th>
            <th className="pb-2 font-medium">searchtext</th>
            <th className="pb-2 font-medium">text</th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((kw: any, i: number) => (
            <tr key={kw.id ?? i} className="border-b border-[#F0F0F8] last:border-0">
              <td className="py-2 text-[#1A1A2E]">{kw.keyword ?? kw.word ?? '-'}</td>
              <td className="py-2 text-[#4A5578]">{kw.searchVolume ?? kw.volume ?? '-'}</td>
              <td className="py-2">
                {kw.difficulty != null && (
                  <span className={`font-medium ${kw.difficulty > 60 ? 'text-red-500' : kw.difficulty > 30 ? 'text-amber-500' : 'text-emerald-500'}`}>
                    {kw.difficulty}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Renders trend data as small info cards. */
function TrendCards({ trends }: { trends: unknown[] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {trends.map((t: any, i: number) => {
        const label = t.label ?? t.name ?? t.keyword ?? `Item ${i + 1}`;
        const value = t.value ?? t.growth ?? t.volume ?? '-';
        const color = t.color ?? 'bg-[#F0EEFF]';
        return (
          <div key={i} className={`rounded-lg p-3 ${color} border border-[#E8E8F0]`}>
            <p className="text-[10px] text-[#8B93B5] truncate">{label}</p>
            <p className="text-sm font-semibold text-[#1A1A2E] mt-0.5">{value}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Fallback: renders any object as a clean key-value table. */
function KeyValueTable({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v !== null && v !== undefined && !Array.isArray(v) && typeof v !== 'object',
  );

  if (entries.length === 0) {
    return <p className="text-xs text-[#8B93B5]">noneenglish_textdata</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key} className="border-b border-[#F0F0F8] last:border-0">
              <td className="py-1.5 pr-4 text-[#8B93B5] font-medium whitespace-nowrap">{key}</td>
              <td className="py-1.5 text-[#1A1A2E]">{String(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * StructuredResult
 *
 * Takes any object and renders it intelligently based on its shape:
 * - title + bulletPoints → listing preview
 * - keywords[] → keyword table
 * - trends[] → trend cards
 * - otherwise → clean key-value table
 */
export function StructuredResult({ data, entityType }: StructuredResultProps) {
  if (entityType === 'LISTING_DRAFT' || (data.title && Array.isArray(data.bulletPoints))) {
    return <ListingPreview data={data} />;
  }

  if (entityType === 'PRODUCT_RESEARCH') {
    // For product research, show trends if available, else key-value
    if (Array.isArray(data.trends) && data.trends.length > 0) {
      return <TrendCards trends={data.trends} />;
    }
    return <KeyValueTable data={data} />;
  }

  if (Array.isArray(data.keywords) && data.keywords.length > 0) {
    return <KeywordTable keywords={data.keywords} />;
  }

  if (Array.isArray(data.trends) && data.trends.length > 0) {
    return <TrendCards trends={data.trends} />;
  }

  return <KeyValueTable data={data} />;
}
