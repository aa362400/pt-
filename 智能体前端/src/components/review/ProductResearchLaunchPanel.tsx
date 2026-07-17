import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  ImageOff,
  Loader2,
  PackageCheck,
  Send,
  ShieldCheck,
  Star,
  Upload,
} from 'lucide-react';
import type {
  ConfirmProductLaunchInput,
  DailyProductResearchSafetyPreview,
  OzonPublicationInput,
  ProductPreparationMode,
  ProductLaunchStatus,
  ProductResearchCandidatePreview,
  ProductResearchPreview,
} from '../../api/review';
import { filesApi } from '../../api/files';
import { workspacesApi, type WorkspaceSummary } from '../../api/workspaces';
import {
  firstSafeExternalEvidenceUrl,
  safeExternalEvidenceUrl,
  safeReviewImageUrl,
} from '../../utils/safe-external-url';
import { buildProductPreparationRequest } from '../../utils/product-preparation';
import { customerApprovalNarrative } from '../../utils/approval-center-workspace';

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
const CREATIVE_ONLY_ALLOWED_GATES = new Set([
  'MANUAL_PRICING_REQUIRED',
  'RISK_EVIDENCE_MISSING',
]);
const CREATIVE_ONLY_ALLOWED_RISKS = new Set([
  'RISK_EVIDENCE_MISSING',
  'RISK_CLEARANCE_ATTESTED',
]);

interface VisualQaCheckPreview {
  id?: string;
  status?: string;
  code?: string;
  message?: string;
}

interface VisualQaPreview {
  outcome?: string;
  score?: number;
  checks?: VisualQaCheckPreview[];
}

function asVisualQa(value: unknown): VisualQaPreview {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as VisualQaPreview)
    : {};
}

function asGeneratedImages(value: unknown): Array<{ url: string; sceneId?: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    const url = safeReviewImageUrl(record.url);
    if (!url) return [];
    return [{
      url,
      sceneId: typeof record.sceneId === 'string' ? record.sceneId : undefined,
    }];
  });
}

function visualQaCheckLabel(code: string | undefined): string {
  switch (code) {
    case 'REFERENCE_ASSET_REQUIRED':
      return '缺少真实产品参考图';
    case 'CONSISTENCY_QA_FAILED':
      return '商品外观一致性检查未通过';
    case 'PLATFORM_COMPLIANCE_FAILED':
      return '平台图片合规检查未通过';
    case 'GENERATED_MEDIA_DUPLICATED':
      return '生成图片存在重复';
    case 'GENERATED_MEDIA_NOT_PUBLIC_HTTPS':
      return '生成图片链接不可安全访问';
    default:
      return '图片质量检查未通过';
  }
}

function chineseQaMessage(message: string | undefined): string | null {
  const text = message?.trim();
  if (!text) return null;
  const chineseCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinCount = (text.match(/[A-Za-z]/g) ?? []).length;
  return chineseCount > 0 && latinCount <= chineseCount * 2 ? text : null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取参考图失败。'));
    reader.readAsDataURL(file);
  });
}

interface PublicationDraft {
  descriptionCategoryId: string;
  attributesJson: string;
  vat: string;
  offerId: string;
  barcode: string;
  currencyCode: string;
  height: string;
  width: string;
  depth: string;
  weight: string;
}

const EMPTY_PUBLICATION_DRAFT: PublicationDraft = {
  descriptionCategoryId: '',
  attributesJson: '',
  vat: '',
  offerId: '',
  barcode: '',
  currencyCode: 'RUB',
  height: '',
  width: '',
  depth: '',
  weight: '',
};

const LAUNCH_STATUS: Record<ProductLaunchStatus, { label: string; cls: string }> = {
  QUEUED: { label: '已确认，等待执行', cls: 'bg-amber-50 text-amber-700' },
  GENERATING_IMAGES: { label: '正在生成图片', cls: 'bg-sky-50 text-sky-700' },
  AWAITING_ECONOMICS_REVIEW: {
    label: '图片和商品资料已生成 · 等待人工核价',
    cls: 'bg-sky-50 text-sky-800',
  },
  AWAITING_PUBLISH_APPROVAL: {
    label: '等待最终商品资料审核和发布确认',
    cls: 'bg-amber-50 text-amber-800',
  },
  SUBMITTING_TO_OZON: { label: '正在提交 Ozon', cls: 'bg-indigo-50 text-indigo-700' },
  SUBMITTED_TO_OZON: { label: '已提交，等待平台处理', cls: 'bg-violet-50 text-violet-700' },
  ACTIVE_ON_OZON: { label: 'Ozon 已确认可售', cls: 'bg-emerald-50 text-emerald-700' },
  BLOCKED: { label: '任务被安全阻断', cls: 'bg-amber-50 text-amber-700' },
  FAILED: { label: '执行失败', cls: 'bg-red-50 text-red-700' },
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('zh-CN', { hour12: false });
}

function formatPriceRange(preview: ProductResearchPreview): string {
  const { min, max, currency } = preview.priceRange;
  if (min === null && max === null) return '未返回价格区间';
  if (min !== null && max !== null) return `${min} - ${max} ${currency ?? ''}`.trim();
  return `${min ?? max} ${currency ?? ''}`.trim();
}

function customerSummary(summary: string | null | undefined): {
  text: string | null;
  original: string | null;
} {
  if (!summary?.trim()) return { text: null, original: null };
  const narrative = customerApprovalNarrative(
    [summary],
    '智能体返回了非中文摘要。请以下方候选商品、市场来源、价格和抓取时间为准；证据不完整的候选不能继续。',
  );
  return {
    text: narrative.displayText,
    original: narrative.technicalText,
  };
}

function customerPlatformLabel(value: string | null | undefined): string {
  switch (value?.trim().toUpperCase()) {
    case 'MULTI':
      return '全球多平台';
    case 'OZON':
      return 'Ozon';
    case 'AMAZON':
      return '亚马逊';
    case 'ETSY':
      return 'Etsy';
    case 'TEMU':
      return 'Temu';
    default:
      return '已连接市场';
  }
}

function optionalPositiveNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Ozon 尺寸、重量和类目 ID 必须是大于 0 的数字。');
  }
  return parsed;
}

function buildOzonPublication(
  draft: PublicationDraft,
): OzonPublicationInput | undefined {
  const hasInput = Object.entries(draft).some(
    ([field, value]) => field !== 'currencyCode' && value.trim() !== '',
  );
  if (!hasInput) return undefined;

  let attributes: Array<Record<string, unknown>> | undefined;
  if (draft.attributesJson.trim()) {
    try {
      const parsed: unknown = JSON.parse(draft.attributesJson);
      if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw new Error('属性必须是 Ozon 属性对象数组。');
      }
      attributes = parsed as Array<Record<string, unknown>>;
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error('Ozon 属性 JSON 无法解析。');
    }
  }

  const height = optionalPositiveNumber(draft.height);
  const width = optionalPositiveNumber(draft.width);
  const depth = optionalPositiveNumber(draft.depth);
  const weight = optionalPositiveNumber(draft.weight);
  return {
    ...(optionalPositiveNumber(draft.descriptionCategoryId)
      ? { descriptionCategoryId: optionalPositiveNumber(draft.descriptionCategoryId) }
      : {}),
    ...(attributes ? { attributes } : {}),
    ...(draft.vat.trim() ? { vat: draft.vat.trim() } : {}),
    ...(draft.offerId.trim() ? { offerId: draft.offerId.trim() } : {}),
    ...(draft.barcode.trim() ? { barcode: draft.barcode.trim() } : {}),
    ...(draft.currencyCode.trim() ? { currencyCode: draft.currencyCode.trim().toUpperCase() } : {}),
    ...(height || width || depth || weight
      ? {
          dimensions: {
            ...(height ? { height } : {}),
            ...(width ? { width } : {}),
            ...(depth ? { depth } : {}),
            ...(weight ? { weight } : {}),
            dimensionUnit: 'mm',
            weightUnit: 'g',
          },
        }
      : {}),
  };
}

function candidateHasSafeEvidence(
  candidate: ProductResearchCandidatePreview,
): boolean {
  return Boolean(
    safeReviewImageUrl(candidate.imageUrl) &&
      firstSafeExternalEvidenceUrl(
        candidate.imageEvidenceUrl,
        candidate.productUrl,
      ),
  );
}

function isRetryableLaunch(candidate: ProductResearchCandidatePreview): boolean {
  return candidate.launch?.status === 'FAILED' || candidate.launch?.status === 'BLOCKED';
}

function creativeOnlySafetyReady(
  candidate: ProductResearchCandidatePreview,
  safety: DailyProductResearchSafetyPreview | null | undefined,
): boolean {
  if (!safety || safety.candidateId !== candidate.id || !safety.latestScore) {
    return false;
  }
  const signalSources = new Set(
    (safety.signalSources ?? []).map((source) => source.trim()).filter(Boolean),
  );
  const unsupportedGates = (safety.latestScore.hardGateReasons ?? []).filter(
    (reason) => !CREATIVE_ONLY_ALLOWED_GATES.has(reason),
  );
  const unsafeRisks = (safety.riskSummary ?? []).filter(
    (risk) => !risk.riskType || !CREATIVE_ONLY_ALLOWED_RISKS.has(risk.riskType),
  );
  return (
    ['HOLD', 'RECOMMENDED'].includes(safety.status ?? '') &&
    signalSources.size >= 2 &&
    unsupportedGates.length === 0 &&
    unsafeRisks.length === 0
  );
}

function candidateCanPrepare(
  candidate: ProductResearchCandidatePreview,
  safety: DailyProductResearchSafetyPreview | null | undefined,
): boolean {
  const hasOpenCandidate = candidate.status === 'pending' || isRetryableLaunch(candidate);
  return Boolean(
    hasOpenCandidate &&
      candidateHasSafeEvidence(candidate) &&
      (candidate.evidenceReady === true || creativeOnlySafetyReady(candidate, safety)),
  );
}

function ProductEvidenceImage({
  candidate,
}: {
  candidate: ProductResearchCandidatePreview;
}) {
  const [failed, setFailed] = useState(false);
  const imageUrl = safeReviewImageUrl(candidate.imageUrl);
  const evidenceUrl = firstSafeExternalEvidenceUrl(
    candidate.imageEvidenceUrl,
    candidate.productUrl,
  );
  const content = imageUrl && !failed ? (
    <img
      src={imageUrl}
      alt={candidate.name}
      className="h-full w-full object-cover"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="flex h-full items-center justify-center px-2 text-center text-[10px] leading-4 text-[#8B93B5]">
      {failed ? '图片加载失败' : '缺少安全证据图'}
    </div>
  );

  return evidenceUrl ? (
    <a
      href={evidenceUrl}
      target="_blank"
      rel="noreferrer"
      title="打开图片证据页"
      className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[#E8E8F0] bg-[#F3F4F8] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]"
    >
      {content}
    </a>
  ) : (
    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-[#E8E8F0] bg-[#F3F4F8]">
      {content}
    </div>
  );
}

interface ProductResearchLaunchPanelProps {
  preview: ProductResearchPreview;
  dailyCandidateSafety?: DailyProductResearchSafetyPreview | null;
  reviewStatus: string;
  disabled?: boolean;
  onConfirm: (input: ConfirmProductLaunchInput) => Promise<void>;
  onPublish: (launchId: string) => Promise<void>;
}

export default function ProductResearchLaunchPanel({
  preview,
  dailyCandidateSafety,
  reviewStatus,
  disabled = false,
  onConfirm,
  onPublish,
}: ProductResearchLaunchPanelProps) {
  const summary = customerSummary(preview.summary);
  const eligibleCandidates = useMemo(
    () => preview.candidates.filter((candidate) =>
      candidateCanPrepare(candidate, dailyCandidateSafety),
    ),
    [dailyCandidateSafety, preview.candidates],
  );
  const [candidateId, setCandidateId] = useState(eligibleCandidates[0]?.id ?? '');
  const [confirmed, setConfirmed] = useState(false);
  const [draft, setDraft] = useState<PublicationDraft>(EMPTY_PUBLICATION_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referenceAssetId, setReferenceAssetId] = useState<string | null>(null);
  const [ozonWorkspaces, setOzonWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  useEffect(() => {
    if (eligibleCandidates.some((candidate) => candidate.id === candidateId)) {
      return;
    }
    setCandidateId(eligibleCandidates[0]?.id ?? '');
    setConfirmed(false);
    setDraft({ ...EMPTY_PUBLICATION_DRAFT });
    setFormError(null);
    setReferenceFile(null);
    setReferenceAssetId(null);
  }, [candidateId, eligibleCandidates]);

  useEffect(() => {
    let cancelled = false;
    setWorkspaceLoading(true);
    setWorkspaceError(null);
    void workspacesApi.list({ limit: 100 }).then(
      (result) => {
        if (cancelled) return;
        const activeOzonWorkspaces = result.items.filter(
          (workspace) => workspace.channelType === 'OZON' && workspace.status === 'ACTIVE',
        );
        setOzonWorkspaces(activeOzonWorkspaces);
        setWorkspaceId((current) =>
          activeOzonWorkspaces.some((workspace) => workspace.id === current)
            ? current
            : activeOzonWorkspaces[0]?.id ?? '',
        );
      },
      (error: unknown) => {
        if (cancelled) return;
        setOzonWorkspaces([]);
        setWorkspaceId('');
        void error;
        setWorkspaceError('读取已启用的 Ozon 工作区失败，请稍后重试。');
      },
    ).finally(() => {
      if (!cancelled) setWorkspaceLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedCandidate = preview.candidates.find(
    (candidate) => candidate.id === candidateId,
  );
  const preparationMode: ProductPreparationMode = selectedCandidate?.evidenceReady === true
    ? 'PUBLISH_READY'
    : 'CREATIVE_ONLY';

  const canLaunch =
    (reviewStatus === 'PENDING' || reviewStatus === 'REWORK') &&
    Boolean(candidateId) &&
    Boolean(selectedCandidate && candidateCanPrepare(selectedCandidate, dailyCandidateSafety)) &&
    Boolean(workspaceId) &&
    Boolean(referenceFile) &&
    confirmed &&
    !disabled &&
    !submitting;

  const updateDraft = (field: keyof PublicationDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setFormError(null);
  };

  const handleConfirm = async () => {
    if (!candidateId || !workspaceId || !confirmed || !referenceFile) return;
    setSubmitting(true);
    setFormError(null);
    try {
      let assetId = referenceAssetId;
      if (!assetId) {
        const uploaded = await filesApi.upload({
          filename: referenceFile.name,
          mimeType: referenceFile.type,
          dataBase64: await fileToDataUrl(referenceFile),
          purpose: 'PRODUCT_IMAGE',
          workspaceId,
        });
        assetId = uploaded.id;
        setReferenceAssetId(uploaded.id);
      }
      const evaluationId = selectedCandidate?.economicsEvaluationId ?? null;
      const contentHash = selectedCandidate?.economicsEvaluationHash ?? null;
      const ozonPublication = preparationMode === 'PUBLISH_READY'
        ? buildOzonPublication(draft)
        : undefined;
      await onConfirm(buildProductPreparationRequest({
        candidateId,
        referenceAssetId: assetId,
        workspaceId,
        preparationMode,
        economicsEvaluationId: evaluationId,
        economicsEvaluationHash: contentHash,
        ozonPublication,
      }));
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '创建本地图片和商品资料任务失败。');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublish = async (launchId: string) => {
    setPublishingId(launchId);
    setFormError(null);
    try {
      await onPublish(launchId);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '确认发布失败。');
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <section className="space-y-4" aria-label="智能体选品预览">
      <div className="flex flex-col gap-2 border-b border-[#E8E8F0] pb-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-[#6C63FF]" />
            <h3 className="text-base font-semibold text-[#1A1A2E]">智能体选品预览</h3>
          </div>
          <p className="mt-1 text-sm text-[#4A5578]">{preview.query}</p>
          {summary.text ? <p className="mt-2 text-xs leading-5 text-[#6B7280]">{summary.text}</p> : null}
          {summary.original ? (
            <details className="mt-2 text-xs text-[#6B7280]">
              <summary className="cursor-pointer font-medium text-[#5B55D6]">管理员查看智能体原始摘要</summary>
              <p className="mt-2 whitespace-pre-wrap border-l-2 border-[#E8E8F0] pl-3 leading-5">
                {summary.original}
              </p>
            </details>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-xs text-[#6B7280]">
          <span>平台：{customerPlatformLabel(preview.platform)}</span>
          <span>价格：{formatPriceRange(preview)}</span>
          <span className="inline-flex items-center gap-1">
            <Star size={12} className="text-amber-500" /> 评分：{preview.rating ?? '-'}
          </span>
          <span>证据抓取：{formatDate(preview.sourceEvidence.fetchedAt)}</span>
        </div>
      </div>

      {preview.sourceEvidence.searchQuery || preview.sourceEvidence.relevance.matchTerms.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border border-[#E8E8F0] bg-[#FAFBFF] px-3 py-2 text-xs text-[#4A5578]">
          {preview.sourceEvidence.searchQuery ? (
            <span>实际市场检索：{preview.sourceEvidence.searchQuery}</span>
          ) : null}
          {preview.sourceEvidence.relevance.matchTerms.length > 0 ? (
            <span>逐条硬匹配：{preview.sourceEvidence.relevance.matchTerms.join('、')}</span>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {preview.candidates.map((candidate) => {
          const launchState = candidate.launch ? LAUNCH_STATUS[candidate.launch.status] : null;
          const hasSafeEvidence = candidateHasSafeEvidence(candidate);
          const creativeOnlyReady = creativeOnlySafetyReady(
            candidate,
            dailyCandidateSafety,
          );
          const selectable = candidateCanPrepare(candidate, dailyCandidateSafety);
          const productUrl = safeExternalEvidenceUrl(candidate.productUrl);
          const imageProject = candidate.launch?.imageProject;
          const visualQa = asVisualQa(imageProject?.qaResult);
          const generatedImages = asGeneratedImages(imageProject?.generatedAssets);
          const failedChecks = (visualQa.checks ?? []).filter(
            (check) => check.status === 'FAIL',
          );
          return (
            <div
              key={candidate.id}
              className={`block border p-4 transition-colors ${
                candidateId === candidate.id
                  ? 'border-[#6C63FF] bg-[#F7F5FF]'
                  : 'border-[#E8E8F0] bg-white'
              } ${selectable ? 'cursor-pointer hover:border-[#A9A4FF]' : 'cursor-default opacity-80'}`}
            >
              <div className="flex gap-3">
                <input
                  type="radio"
                  name="research-candidate"
                  checked={candidateId === candidate.id}
                  disabled={!selectable || disabled || submitting}
                  onChange={() => {
                    setCandidateId(candidate.id);
                    setConfirmed(false);
                    setDraft({ ...EMPTY_PUBLICATION_DRAFT });
                    setFormError(null);
                    setReferenceFile(null);
                    setReferenceAssetId(null);
                  }}
                  className="mt-1 h-4 w-4 shrink-0 accent-[#6C63FF]"
                  aria-label={`选择 ${candidate.name}`}
                />
                <ProductEvidenceImage candidate={candidate} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#1A1A2E]">{candidate.name}</p>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    候选 #{candidate.candidateIndex + 1}
                    {candidate.priceRub !== null && candidate.priceRub !== undefined ? ` · ${candidate.priceRub} RUB` : ''}
                  </p>
                  {productUrl ? (
                    <a
                      href={productUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#5B55D6] hover:underline"
                    >
                      打开商品或市场证据页 <ExternalLink size={12} />
                    </a>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-red-600">缺少真实商品链接</p>
                  )}
                  {!hasSafeEvidence ? (
                    <p className="mt-2 text-xs leading-5 text-amber-700">图片或市场证据链接不完整，当前候选不可继续。</p>
                  ) : !candidate.evidenceReady && creativeOnlyReady ? (
                    <p className="mt-2 text-xs leading-5 text-sky-700">核价与利润证据尚未通过，可先生成本地图片和中文商品资料；资料不可发布，完成核价与风控后才能继续。</p>
                  ) : !candidate.evidenceReady ? (
                    <p className="mt-2 text-xs leading-5 text-amber-700">候选尚未取得两类独立需求信号或基础风控未通过，不能消耗图片生成额度。</p>
                  ) : null}
                  {isRetryableLaunch(candidate) && selectable ? (
                    <p className="mt-2 text-xs leading-5 text-sky-700">上次本地准备失败或被安全阻断，可以更换参考图后重新执行；系统仍会重新校验全部门禁。</p>
                  ) : null}
                  {launchState ? (
                    <div className="mt-3 space-y-1">
                      <span className={`inline-flex rounded-md px-2 py-1 text-[11px] font-medium ${launchState.cls}`}>
                        {launchState.label}
                      </span>
                      {candidate.launch?.failureMessage ? (
                        <p className="text-xs leading-5 text-red-700">{candidate.launch.failureMessage}</p>
                      ) : null}
                      {imageProject ? (
                        <div className="mt-3 border-t border-[#E8E8F0] pt-3">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-medium text-[#1A1A2E]">图片质量检查</span>
                            <span
                              className={
                                imageProject.qaStatus === 'PASSED'
                                  ? 'text-emerald-700'
                                  : 'text-red-700'
                              }
                            >
                              {imageProject.qaStatus === 'PASSED' ? '通过' : '未通过'}
                              {typeof visualQa.score === 'number' ? ` · ${visualQa.score} 分` : ''}
                            </span>
                            <span className="text-[#8B93B5]">检查规则已记录</span>
                          </div>
                          {generatedImages.length > 0 ? (
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              {generatedImages.map((image) => (
                                <a
                                  key={`${image.sceneId ?? 'scene'}-${image.url}`}
                                  href={image.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block aspect-square overflow-hidden bg-[#F3F4F8]"
                                >
                                  <img
                                    src={image.url}
                                    alt={image.sceneId ? `生成图 ${image.sceneId}` : '智能体生成图'}
                                    className="h-full w-full object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}
                          {failedChecks.length > 0 ? (
                            <ul className="mt-2 space-y-1 text-xs text-red-700">
                              {failedChecks.map((check, index) => (
                                <li key={`${check.id ?? check.code ?? 'qa'}-${index}`}>
                                  {visualQaCheckLabel(check.code)}
                                  {chineseQaMessage(check.message)
                                    ? `：${chineseQaMessage(check.message)}`
                                    : ''}
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                      {candidate.launch?.status === 'AWAITING_PUBLISH_APPROVAL' ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {candidate.launch.publishReviewTaskId ? (
                            <a
                              href={`/review?task=${candidate.launch.publishReviewTaskId}`}
                              onClick={(event) => event.stopPropagation()}
                              className="text-xs font-medium text-[#6C63FF] underline"
                            >
                              审核最终商品资料
                            </a>
                          ) : null}
                          <button
                            type="button"
                            disabled={publishingId === candidate.launch.id || disabled}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              void handlePublish(candidate.launch!.id);
                            }}
                            className="inline-flex h-8 items-center gap-1.5 bg-[#1F7A4D] px-3 text-xs font-medium text-white disabled:opacity-40"
                          >
                            {publishingId === candidate.launch.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Send size={13} />
                            )}
                            单独确认发布到 Ozon
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : candidate.status === 'rejected' ? (
                    <p className="mt-3 text-xs leading-5 text-red-700">
                      已驳回：{candidate.rejectionReason ?? '未填写原因'}
                    </p>
                  ) : (
                    <div className="mt-3 flex items-center gap-2 text-xs text-[#8B93B5]">
                      <ImageOff size={14} />
                      图片尚未生成
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-y border-[#E8E8F0] py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[#1A1A2E]">
          <ShieldCheck size={16} className="text-[#0F8A55]" />
          真实市场证据
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {preview.sourceEvidence.items.length > 0 ? preview.sourceEvidence.items.map((item, index) => {
            const evidenceUrl = safeExternalEvidenceUrl(item.url);
            const content = (
              <>
                <span className="truncate">{item.title ?? `证据 ${index + 1}`}</span>
                <span className="shrink-0 text-[#8B93B5]">
                  {item.priceRub !== null ? `${item.priceRub} RUB` : evidenceUrl ? '查看' : '链接不可用'}
                  {evidenceUrl ? <ExternalLink size={12} className="ml-1 inline" /> : null}
                </span>
              </>
            );
            return evidenceUrl ? (
              <a
                key={`${evidenceUrl}-${index}`}
                href={evidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 items-center justify-between gap-3 border border-[#E8E8F0] px-3 py-2 text-xs text-[#4A5578] hover:border-[#6C63FF]"
              >
                {content}
              </a>
            ) : (
              <div
                key={`invalid-evidence-${index}`}
                className="flex min-w-0 items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
              >
                {content}
              </div>
            );
          }) : (
            <p className="text-xs text-amber-700">后端未返回可点击的市场证据，不能确认上架。</p>
          )}
        </div>
      </div>

      {(reviewStatus === 'PENDING' || reviewStatus === 'REWORK') ? (
        <div className="space-y-3">
          <label className="block border border-[#DDE1F2] bg-white p-3 text-sm text-[#1A1A2E]">
            <span className="font-medium">用于生成资料的 Ozon 工作区</span>
            <span className="mt-1 block text-xs leading-5 text-[#6B7280]">
              参考图和本地草稿会绑定到该工作区。本步骤只生成本地资料，不会向 Ozon 提交商品。
            </span>
            <select
              value={workspaceId}
              disabled={workspaceLoading || ozonWorkspaces.length === 0 || disabled || submitting}
              onChange={(event) => {
                setWorkspaceId(event.target.value);
                setReferenceAssetId(null);
                setFormError(null);
              }}
              className="mt-3 h-10 w-full border border-[#DDE1F2] bg-white px-3 text-sm text-[#1A1A2E] disabled:bg-[#F3F4F8]"
            >
              <option value="">
                {workspaceLoading ? '正在读取 Ozon 工作区...' : '请选择 Ozon 工作区'}
              </option>
              {ozonWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}（{workspace.marketplace ?? 'Ozon'}）
                </option>
              ))}
            </select>
            {workspaceError ? (
              <span className="mt-2 block text-xs text-red-700">Ozon 工作区读取失败：{workspaceError}</span>
            ) : !workspaceLoading && ozonWorkspaces.length === 0 ? (
              <span className="mt-2 block text-xs text-amber-700">没有已启用的 Ozon 工作区，请先到“平台连接”完成配置。</span>
            ) : null}
          </label>
          <label className="block border border-[#DDE1F2] bg-white p-3 text-sm text-[#1A1A2E]">
            <span className="flex items-center gap-2 font-medium">
              <Upload size={16} className="text-[#6C63FF]" />
              上传真实产品参考图
            </span>
            <span className="mt-1 block text-xs leading-5 text-[#6B7280]">
              该图片用于锁定外形、材质、品牌标识和结构。没有参考图不会启动生成，也不会消耗出图额度。
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-3 block w-full text-xs text-[#4A5578]"
              disabled={!candidateId || !workspaceId || disabled || submitting}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                if (
                  file &&
                  (!file.type.startsWith('image/') || file.size > MAX_REFERENCE_BYTES)
                ) {
                  setFormError('参考图必须是 10MB 以内的 PNG、JPEG 或 WebP 图片。');
                  setReferenceFile(null);
                  setReferenceAssetId(null);
                  return;
                }
                setReferenceFile(file);
                setReferenceAssetId(null);
                setFormError(null);
              }}
            />
            {referenceFile ? (
              <span className="mt-2 block text-xs text-emerald-700">
                已选择：{referenceFile.name}
              </span>
            ) : null}
          </label>
          {preparationMode === 'PUBLISH_READY' ? (
          <details className="border border-[#E8E8F0] bg-[#FAFBFF] p-3">
            <summary className="cursor-pointer text-sm font-medium text-[#1A1A2E]">Ozon 上架资料</summary>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-xs text-[#6B7280]">
                类目 ID
                <input value={draft.descriptionCategoryId} onChange={(event) => updateDraft('descriptionCategoryId', event.target.value)} inputMode="numeric" className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="text-xs text-[#6B7280]">
                VAT
                <input value={draft.vat} onChange={(event) => updateDraft('vat', event.target.value)} placeholder="例如 0.2" className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="text-xs text-[#6B7280]">
                offer_id（留空使用 SKU）
                <input value={draft.offerId} onChange={(event) => updateDraft('offerId', event.target.value)} className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="text-xs text-[#6B7280]">
                条码
                <input value={draft.barcode} onChange={(event) => updateDraft('barcode', event.target.value)} className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="text-xs text-[#6B7280]">
                高（mm）
                <input value={draft.height} onChange={(event) => updateDraft('height', event.target.value)} inputMode="decimal" className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="text-xs text-[#6B7280]">
                宽（mm）
                <input value={draft.width} onChange={(event) => updateDraft('width', event.target.value)} inputMode="decimal" className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="text-xs text-[#6B7280]">
                深（mm）
                <input value={draft.depth} onChange={(event) => updateDraft('depth', event.target.value)} inputMode="decimal" className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="text-xs text-[#6B7280]">
                重量（g）
                <input value={draft.weight} onChange={(event) => updateDraft('weight', event.target.value)} inputMode="decimal" className="mt-1 h-9 w-full border border-[#DDE1F2] bg-white px-2 text-sm text-[#1A1A2E]" />
              </label>
              <label className="md:col-span-2 text-xs text-[#6B7280]">
                Ozon 属性 JSON 数组
                <textarea value={draft.attributesJson} onChange={(event) => updateDraft('attributesJson', event.target.value)} rows={4} placeholder='[{"id": 85, "complex_id": 0, "values": [{"value": "品牌"}]}]' className="mt-1 w-full resize-y border border-[#DDE1F2] bg-white p-2 font-mono text-xs text-[#1A1A2E]" />
              </label>
            </div>
          </details>
          ) : (
            <div className="border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
              当前选择“仅本地创意准备”：系统会生成图片、俄语商品内容和中文可读资料，定价状态保持“数据不足”。不会生成发布审批、不会创建发布快照，也不会调用 Ozon 上架接口。
            </div>
          )}

          <label className="flex items-start gap-2 border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={!candidateId || !workspaceId || disabled || submitting} className="mt-0.5 h-4 w-4 accent-[#6C63FF]" />
            <span>我确认生成本地图片和中文商品资料可能消耗额度；本步骤不会向 Ozon 写入。未核价商品只保存为不可发布草稿。</span>
          </label>
          {formError ? (
            <p className="flex items-start gap-2 text-xs leading-5 text-red-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{formError}</p>
          ) : null}
          <button
            type="button"
            disabled={!canLaunch}
            onClick={() => void handleConfirm()}
            className="inline-flex h-10 items-center justify-center gap-2 bg-[#6C63FF] px-4 text-sm font-medium text-white hover:bg-[#5B52EE] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {preparationMode === 'CREATIVE_ONLY'
              ? '确认生成本地图片和中文商品资料（不发布）'
              : '确认生成图片和商品资料（不发布）'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
