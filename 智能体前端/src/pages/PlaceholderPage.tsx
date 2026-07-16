import { AlertTriangle, Database, ExternalLink } from 'lucide-react';

interface PlaceholderPageProps {
  pageTitle: string;
  description?: string;
  tags?: string[];
}

function getMissingContract(pageTitle: string) {
  const lower = pageTitle.toLowerCase();
  if (lower.includes('competition') || lower.includes('竞品')) {
    return {
      endpoint: '未发现 /competition 或 /competitors 真实后端接口',
      scope: '竞品价格、评分、份额、上新、销量、趋势',
      nextAction: '先定义竞品分析后端合同，再把页面接入真实数据源和智能体任务。',
    };
  }

  return {
    endpoint: '未发现 /market 或 /market-overview 真实后端接口',
    scope: '市场规模、区域增长、活跃卖家、客单价、品类趋势',
    nextAction: '先定义市场大盘后端合同，再把页面接入真实数据源和智能体任务。',
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
              真实后端未接入
            </div>
            <h2 className="text-xl font-bold text-[#1A1A2E]">{pageTitle}</h2>
            {description ? (
              <p className="mt-2 text-sm leading-6 text-[#5F6B8A]">{description}</p>
            ) : null}
            <p className="mt-3 text-sm leading-6 text-[#5F6B8A]">
              当前页面不展示静态样例数据，也不会用本地竞品、价格、评分、市场规模或区域榜假装接入。
            </p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-[#F8DDA7] bg-white px-3 py-1 text-xs font-semibold text-[#B45309]">
            未接入
          </span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
            <Database size={17} className="text-[#6C63FF]" />
            后端合同
          </div>
          <p className="text-sm leading-6 text-[#5F6B8A]">{missing.endpoint}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
            <AlertTriangle size={17} className="text-[#B45309]" />
            不展示字段
          </div>
          <p className="text-sm leading-6 text-[#5F6B8A]">{missing.scope}</p>
        </div>
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
            <ExternalLink size={17} className="text-[#6C63FF]" />
            下一步
          </div>
          <p className="text-sm leading-6 text-[#5F6B8A]">{missing.nextAction}</p>
        </div>
      </section>

      {tags && tags.length > 0 ? (
        <section className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-semibold text-[#1A1A2E]">页面预期能力</p>
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[#F7F8FF] px-3 py-1 text-xs font-medium text-[#5F6B8A]">
                {tag}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-[#8B93B5]">
            这些只是待接入能力标签，不代表当前已经有智能体或后端数据。
          </p>
        </section>
      ) : null}
    </div>
  );
}

export default PlaceholderPage;
