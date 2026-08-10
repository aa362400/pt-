import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImageOff,
  Loader2,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  marketObservationsApi,
  type MarketObservationBatch,
  type ProductOpportunity,
} from "../api/marketObservations";
import { useToast } from "../components/ui/use-toast";

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function confidence(value: number) {
  return `${Math.round(value * 100)}%`;
}

function decisionLabel(status: string) {
  const labels: Record<string, string> = {
    CANDIDATE: "待人工判断",
    APPROVED: "已采纳",
    REJECTED: "已拒绝",
    RESEARCHING: "继续调研",
    MANUAL_REVIEW_RECOMMENDED: "建议人工审核",
  };
  return labels[status] ?? status;
}

function statusTone(status: string) {
  if (status === "APPROVED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export default function OzonObservations() {
  const { addToast } = useToast();
  const [batches, setBatches] = useState<MarketObservationBatch[]>([]);
  const [opportunities, setOpportunities] = useState<ProductOpportunity[]>([]);
  const [selected, setSelected] = useState<MarketObservationBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [batchResult, opportunityResult] = await Promise.all([
        marketObservationsApi.list(),
        marketObservationsApi.opportunities(),
      ]);
      setBatches(batchResult.items);
      setOpportunities(opportunityResult.items);
      const targetId = selected?.id ?? batchResult.items[0]?.id;
      if (targetId) setSelected(await marketObservationsApi.get(targetId));
      else setSelected(null);
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Ozon 证据加载失败", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast, selected?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => ({
      batches: batches.length,
      products: batches.reduce((sum, item) => sum + (item._count?.items ?? 0), 0),
      review: batches.filter((item) => item.requiresReview).length,
      approved: opportunities.filter((item) => item.status === "APPROVED").length,
    }),
    [batches, opportunities],
  );
  const summaryCards: Array<{
    label: string;
    value: number;
    icon: LucideIcon;
  }> = [
    { label: "采集批次", value: summary.batches, icon: ScanSearch },
    { label: "公开商品", value: summary.products, icon: CheckCircle2 },
    { label: "待复核批次", value: summary.review, icon: AlertTriangle },
    { label: "已采纳候选", value: summary.approved, icon: ShieldCheck },
  ];

  const selectBatch = async (id: string) => {
    setBusy(`batch:${id}`);
    try {
      setSelected(await marketObservationsApi.get(id));
    } catch (error) {
      addToast(error instanceof Error ? error.message : "证据详情加载失败", "error");
    } finally {
      setBusy(null);
    }
  };

  const score = async () => {
    if (!selected) return;
    setBusy(`score:${selected.id}`);
    try {
      const result = await marketObservationsApi.score(selected.id);
      setOpportunities((current) => {
        const ids = new Set(result.items.map((item) => item.id));
        return [...result.items, ...current.filter((item) => !ids.has(item.id))];
      });
      addToast(`已生成 ${result.items.length} 个带证据候选`, "success");
    } catch (error) {
      addToast(error instanceof Error ? error.message : "评分失败", "error");
    } finally {
      setBusy(null);
    }
  };

  const decide = async (
    item: ProductOpportunity,
    status: "APPROVED" | "REJECTED" | "RESEARCHING",
  ) => {
    setBusy(`decision:${item.id}`);
    try {
      const updated = await marketObservationsApi.decide(item.id, status);
      setOpportunities((current) => current.map((candidate) => candidate.id === item.id ? updated : candidate));
      addToast(status === "APPROVED" ? "候选已采纳，仅记录本地决策" : status === "REJECTED" ? "候选已拒绝" : "候选已标记继续调研", "success");
    } catch (error) {
      addToast(error instanceof Error ? error.message : "决策保存失败", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-full bg-[#F5F7FB] px-5 py-6 xl:px-8">
      <div className="mx-auto max-w-[1540px]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Ozon 公开选品证据</h1>
            <p className="mt-1 text-sm text-slate-500">用户主动采集、人工确认上传；无成本证据时不计算利润。</p>
          </div>
          <button type="button" onClick={() => void load()} className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm hover:border-blue-500">
            <RefreshCw size={16} /> 刷新证据
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map(({ label, value, icon: Icon }) => (
            <div key={label} className="border border-slate-200 bg-white p-4">
              <Icon size={18} className="text-blue-600" />
              <strong className="mt-3 block text-2xl text-slate-950">{value}</strong>
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="font-semibold text-slate-900">采集记录</h2>
            </div>
            <div className="max-h-[640px] divide-y divide-slate-100 overflow-auto">
              {batches.map((batch) => (
                <button key={batch.id} type="button" onClick={() => void selectBatch(batch.id)} className={`w-full p-4 text-left ${selected?.id === batch.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <div className="flex items-start gap-2">
                    <strong className="min-w-0 flex-1 truncate text-sm text-slate-900">{batch.pageTitle || batch.query || "Ozon 页面"}</strong>
                    <span className={`border px-2 py-0.5 text-[11px] ${batch.requiresReview ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{batch.requiresReview ? "需复核" : "证据可用"}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{formatTime(batch.capturedAt)} · {batch._count?.items ?? 0} 件 · 置信度 {confidence(batch.confidence)}</p>
                </button>
              ))}
              {!loading && batches.length === 0 ? <div className="p-8 text-center text-sm text-slate-500">尚无采集记录。请安装扩展并在 Ozon 页面主动提交。</div> : null}
            </div>
          </section>

          <section className="min-w-0 border border-slate-200 bg-white">
            {selected ? (
              <>
                <div className="border-b border-slate-200 p-5">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-slate-950">{selected.pageTitle || selected.query || "Ozon 公开页面"}</h2>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span><Clock3 size={13} className="mr-1 inline" />{formatTime(selected.capturedAt)}</span>
                        <span>解析器 {selected.parserVersion}</span>
                        <span>置信度 {confidence(selected.confidence)}</span>
                      </div>
                    </div>
                    <a href={selected.pageUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1 border border-slate-300 px-3 text-xs text-slate-700 hover:border-blue-500"><ExternalLink size={14} />查看原页面</a>
                    <button type="button" disabled={selected.requiresReview || busy === `score:${selected.id}`} onClick={() => void score()} className="inline-flex h-9 items-center gap-2 bg-blue-600 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300">{busy === `score:${selected.id}` ? <Loader2 size={14} className="animate-spin" /> : <ScanSearch size={14} />}生成候选</button>
                  </div>
                  {selected.requiresReview ? <p className="mt-4 flex gap-2 border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" />证据置信度低于 65%，已阻断评分。请重新采集更完整的可见商品信息。</p> : null}
                </div>
                <div className="max-h-[560px] divide-y divide-slate-100 overflow-auto">
                  {(selected.items ?? []).map((item) => (
                    <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-4 p-4">
                      {item.imageUrl ? <img src={item.imageUrl} alt={item.title} className="h-[72px] w-[72px] border border-slate-200 object-contain" /> : <div className="grid h-[72px] w-[72px] place-items-center border border-slate-200 bg-slate-50 text-slate-400"><ImageOff size={20} /></div>}
                      <div className="min-w-0">
                        <a href={item.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-sm font-medium text-slate-900 hover:text-blue-600">{item.title} <ExternalLink size={12} className="inline" /></a>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>{item.currentPrice ? `${item.currentPrice} ${item.currency || "RUB"}` : "无可验证价格"}</span>
                          <span>{item.rating ? `评分 ${item.rating}` : "无评分"}</span>
                          <span>{item.reviewCount !== null ? `${item.reviewCount} 条评价` : "无评价数"}</span>
                          <span>位置 {item.position ?? "未知"}</span>
                        </div>
                        <p className="mt-2 truncate font-mono text-[10px] text-slate-400">证据 {item.evidenceHash}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="grid min-h-[420px] place-items-center text-sm text-slate-500">选择左侧采集记录查看证据。</div>}
          </section>
        </div>

        <section className="mt-5 border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-950">选品候选与人工决策</h2>
            <p className="mt-1 text-xs text-slate-500">采纳只记录本地决策，不自动出图、不创建草稿、不写入 Ozon。</p>
          </div>
          <div className="divide-y divide-slate-100">
            {opportunities.map((item) => {
              const source = item.sources[0];
              return (
                <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[96px_minmax(0,1fr)_230px]">
                  {source?.imageUrl ? <img src={source.imageUrl} alt={item.title} className="h-24 w-24 border border-slate-200 object-contain" /> : <div className="grid h-24 w-24 place-items-center border border-slate-200 bg-slate-50 text-slate-400"><ImageOff /></div>}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-slate-950 hover:text-blue-600">{item.title} <ExternalLink size={13} className="inline" /></a>
                      <span className={`border px-2 py-0.5 text-xs ${statusTone(item.status)}`}>{decisionLabel(item.status)}</span>
                    </div>
                    <div className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                      <div><span className="text-slate-500">证据评分</span><strong className="mt-1 block text-lg text-slate-900">{item.score?.toFixed(1) ?? "未评分"}</strong></div>
                      <div><span className="text-slate-500">证据置信度</span><strong className="mt-1 block text-lg text-slate-900">{confidence(item.evidenceConfidence)}</strong></div>
                      <div><span className="text-slate-500">评分版本</span><strong className="mt-1 block text-sm text-slate-900">{item.scoringVersion}</strong></div>
                    </div>
                    <p className="mt-3 text-xs text-slate-600">{item.reasons[0]}</p>
                    <div className="mt-3 flex flex-wrap gap-2">{item.missingEvidence.map((evidence) => <span key={evidence} className="border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">缺少：{evidence}</span>)}</div>
                  </div>
                  <div className="border-l border-slate-100 pl-4">
                    <p className="text-xs font-medium text-slate-700">人工决定</p>
                    <div className="mt-3 grid gap-2">
                      <button type="button" disabled={Boolean(busy)} onClick={() => void decide(item, "APPROVED")} className="inline-flex h-9 items-center justify-center gap-2 bg-emerald-600 text-xs font-medium text-white disabled:opacity-50"><CheckCircle2 size={14} />采纳候选</button>
                      <button type="button" disabled={Boolean(busy)} onClick={() => void decide(item, "RESEARCHING")} className="inline-flex h-9 items-center justify-center gap-2 border border-slate-300 text-xs text-slate-700 disabled:opacity-50"><ScanSearch size={14} />继续调研</button>
                      <button type="button" disabled={Boolean(busy)} onClick={() => void decide(item, "REJECTED")} className="inline-flex h-9 items-center justify-center gap-2 border border-red-200 text-xs text-red-700 disabled:opacity-50"><XCircle size={14} />拒绝</button>
                    </div>
                  </div>
                </article>
              );
            })}
            {!loading && opportunities.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">还没有通过证据门禁的选品候选。</div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
