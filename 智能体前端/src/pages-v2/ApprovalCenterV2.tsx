import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clock, DollarSign, ExternalLink, ImageOff, Loader2, ShieldCheck } from 'lucide-react';
import {
  reviewApi,
  type ConfirmProductLaunchInput,
  type ManualPricingUpdateInput,
  type ReviewStats,
  type ReviewTask,
} from '../api/review';
import {
  approvalItemsApi,
  type ApprovalItem,
} from '../api/approvalItems';
import * as authApi from '../api/auth';
import {
  describeApprovalExecution,
  stepUpAndRetryApprovalOnce,
  type ApprovalExecutionResponse,
} from '../api/approval-execution';
import { ApiRequestError } from '../api/client';
import { agentRunFailureMessage } from '../api/agentRuns';
import ProductResearchLaunchPanel from '../components/review/ProductResearchLaunchPanel';
import ManualPricingReviewForm from '../components/review/ManualPricingReviewForm';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/use-toast';
import { useAuth } from '../auth/AuthContext';
import { ApprovalCenter, type ApprovalCenterItem } from '../figma-exact/ApprovalCenter';
import {
  approvalCenterReducer,
  createInitialApprovalCenterState,
  selectApprovalItem,
  selectReviewTask,
  type ApprovalSelection,
  type LoadResult,
} from '../state/approval-center-state';
import {
  approvalProposalWorkQueue,
  reviewTaskWorkQueue,
} from '../utils/approval-center-workspace';
import { safeExternalHttpsUrl } from '../utils/safe-external-url';

const ENTITY_TYPE_LABELS: Record<ReviewTask['entityType'], string> = {
  AGENT_RUN: '智能体任务',
  IMAGE_GENERATION: '图片生成',
  LISTING_DRAFT: '商品刊登',
  PRODUCT_RESEARCH: '商品选品',
  SUPPLY_PLAN: '补货计划',
};

const REVIEW_STATUS_LABELS: Record<ReviewTask['status'], string> = {
  PENDING: '等待处理',
  APPROVED: '已确认',
  REJECTED: '不采用',
  REWORK: '需要重做',
};

const AGENT_STATUS_LABELS: Record<string, string> = {
  PENDING: '等待执行',
  RUNNING: '正在执行',
  COMPLETED: '执行完成',
  FAILED: '执行失败',
  CANCELLED: '已取消',
  TIMEOUT: '执行超时',
};

function isUnapprovableAgentTask(task: ReviewTask): boolean {
  return task.entityType === 'AGENT_RUN' && task.agentRun?.status !== 'COMPLETED';
}

function isManualPricingReview(task: ReviewTask): boolean {
  return asRecord(task.decisionEvidence).manualPricingRequired === true;
}

function canApproveReviewTask(task: ReviewTask): boolean {
  return task.entityType !== 'PRODUCT_RESEARCH'
    && task.entityAvailable !== false
    && !isUnapprovableAgentTask(task);
}

function getReviewStatusLabel(task: ReviewTask): string {
  if (task.status === 'APPROVED' && isUnapprovableAgentTask(task)) {
    return '历史误标 · 未执行';
  }
  return REVIEW_STATUS_LABELS[task.status];
}

function readableCustomerText(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const text = value?.trim();
    if (!text) continue;
    const replacementCount = (text.match(/[?�]/g) || []).length;
    if (replacementCount >= 3 && replacementCount / text.length >= 0.2) continue;
    return text;
  }
  return null;
}

function getCustomerReviewReason(task: ReviewTask): string {
  if (task.status === 'APPROVED' && isUnapprovableAgentTask(task)) {
    return '该失败任务曾被错误标记为已确认，但没有产生可执行结果。请打开详情核对并重新执行。';
  }
  if (isManualPricingReview(task)) {
    return '该商品已进入人工核价流程，需要补充采购、物流、平台费用和风险证据后才能继续。';
  }
  const run = task.agentRun;
  return readableCustomerText(
    task.productResearchPreview?.summary,
    task.notes,
    run && isUnapprovableAgentTask(task)
      ? agentRunFailureMessage(run, '智能体未能完成任务，未产生可采用结果。')
      : null,
    run?.progress?.message,
    customerFacingResult(task),
  ) || '等待人工查看真实任务内容与证据。';
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  PRODUCT_RESEARCHER: '选品智能体',
  LISTING_OPTIMIZER: '刊登优化智能体',
  ADVERTISING_STRATEGIST: '广告策略智能体',
  PROFIT_ANALYST: '利润分析智能体',
  CUSTOMER_INSIGHT: '客户洞察智能体',
  CONTENT_WRITER: '内容智能体',
  KEYWORD_EXPLORER: '关键词智能体',
  GENERAL_ASSISTANT: '运营智能体',
  IMAGE_CREATIVE: '图片智能体',
  PLANNER: '计划智能体',
};

function getTaskTitle(task: ReviewTask): string {
  const preview = task.productResearchPreview;
  if (preview?.query) return preview.query;
  if (task.imageProject?.title) return task.imageProject.title;
  if (task.supplyPlan?.supplySku.productName) return `${task.supplyPlan.supplySku.productName} 补货建议`;
  if (task.entityType === 'AGENT_RUN') {
    const agentName = AGENT_TYPE_LABELS[task.agentRun?.agentType || ''] || '智能体';
    return `${agentName}需要人工处理`;
  }
  return `${ENTITY_TYPE_LABELS[task.entityType]}需要审核`;
}

function mapTask(task: ReviewTask): ApprovalCenterItem {
  const preview = task.productResearchPreview;
  const evidenceCount = preview?.sourceEvidence.items.length ?? 0;
  const imageEvidenceCount =
    preview?.candidates.filter(
      (candidate) =>
        Boolean(safeExternalHttpsUrl(candidate.imageUrl)) &&
        Boolean(
          safeExternalHttpsUrl(
            candidate.imageEvidenceUrl ?? candidate.productUrl,
          ),
        ),
    ).length ?? 0;
  const risk = task.score === null ? 'medium' : task.score < task.threshold * 0.7 ? 'high' : task.score < task.threshold ? 'medium' : 'low';
  const imageCandidate = preview?.candidates.find(
    (candidate) => safeExternalHttpsUrl(candidate.imageUrl),
  );
  return {
    id: task.id,
    type: task.entityType === 'PRODUCT_RESEARCH' ? '选品审核' : task.entityType === 'LISTING_DRAFT' ? '刊登审核' : task.entityType === 'IMAGE_GENERATION' ? '图片审核' : task.entityType === 'SUPPLY_PLAN' ? '补货审核' : '智能体任务',
    title: getTaskTitle(task),
    platform: preview?.platform || 'Ozon',
    risk,
    agent: AGENT_TYPE_LABELS[task.agentRun?.agentType || ''] || '运营智能体',
    reason: getCustomerReviewReason(task),
    impact: isUnapprovableAgentTask(task)
      ? '本次任务未完成，禁止继续生成、上架或影响店铺。'
      : task.entityType === 'PRODUCT_RESEARCH'
        ? isManualPricingReview(task)
          ? '补齐价格与风险证据前，系统禁止图片生成、刊登和发布。'
          : '确认后仅进入图片生成或本地草稿，仍不会直接发布。'
        : task.entityType === 'SUPPLY_PLAN'
          ? '批准后只更新本地补货计划，不创建采购订单。'
          : '具体影响以审核详情中的真实动作范围为准。',
    details: preview
      ? `${evidenceCount} 条来源证据 · ${imageEvidenceCount} 个图片证据完整 · ${isManualPricingReview(task) ? '核价待补' : `价格 ${preview.priceRange.min ?? '未返回'}-${preview.priceRange.max ?? '未返回'} ${preview.priceRange.currency || ''}`}`
      : task.agentRun
        ? `${task.status === 'APPROVED' && isUnapprovableAgentTask(task) ? '历史误标 · ' : ''}${AGENT_TYPE_LABELS[task.agentRun.agentType] || '智能体'} · ${AGENT_STATUS_LABELS[task.agentRun.status] || task.agentRun.status}`
        : '请在本页查看完整审核详情。',
    estimatedRevenue: '未由后端评估',
    time: new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false }),
    status: task.status.toLowerCase(),
    workQueue: reviewTaskWorkQueue({
      status: task.status,
      entityType: task.entityType,
      agentRunStatus: task.agentRun?.status ?? null,
    }),
    imageUrl: safeExternalHttpsUrl(imageCandidate?.imageUrl),
    imageEvidenceUrl: safeExternalHttpsUrl(
      imageCandidate?.imageEvidenceUrl ?? imageCandidate?.productUrl,
    ),
  };
}

const APPROVAL_STATUS_LABELS: Record<ApprovalItem['status'], string> = {
  PENDING: '等待审批',
  EXECUTING: '正在执行',
  UNKNOWN: '需要人工核对',
  APPROVED: '已批准，等待外部结果',
  EXECUTED: '已执行',
  DISMISSED: '已关闭',
  CHANGES_REQUESTED: '需要修改',
  REJECTED: '已驳回',
  FAILED: '执行失败',
  EXPIRED: '已过期',
};

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  'product-launch.confirm-publish': '发布商品到 Ozon',
  'ozon.listing.publish': '发布商品到 Ozon',
  'ozon.product.update': '更新 Ozon 商品',
  'ozon.price.update': '修改 Ozon 价格',
  'ozon.stock.update': '修改 Ozon 库存',
  'ozon.order.refund': '处理 Ozon 退款',
  'ozon.chat.send_message': '发送客户消息',
  'ozon.question.answer': '回复客户问题',
  'ozon.review.comment': '回复商品评价',
  'operator.prepare_listing_batch': '准备商品刊登资料',
  'automation.recover': '恢复自动化流程',
};

function mapApprovalItem(item: ApprovalItem): ApprovalCenterItem {
  const context = asRecord(item.context);
  const preview = asRecord(context.preview);
  const riskValue = typeof context.riskLevel === 'string'
    ? context.riskLevel.toLowerCase()
    : 'high';
  const risk: ApprovalCenterItem['risk'] = riskValue === 'low'
    ? 'low'
    : riskValue === 'medium'
      ? 'medium'
      : 'high';
  const actionLabel = APPROVAL_ACTION_LABELS[item.action] || '受控业务操作';
  const productTitle = typeof preview.productTitle === 'string'
    ? preview.productTitle
    : item.notification.title;
  return {
    id: `approval:${item.id}`,
    type: item.action.includes('price')
      ? '价格调整'
      : item.action.includes('refund')
        ? '退款处理'
        : item.action.includes('stock')
          ? '库存补货'
          : item.action.includes('publish')
            ? '商品发布'
            : '智能体审核',
    title: productTitle,
    platform: typeof context.provider === 'string' ? context.provider : 'Ozon',
    risk,
    agent: item.source === 'product-launch-worker' ? '商品上架智能体' : '运营智能体',
    reason: item.notification.body || `智能体申请执行：${actionLabel}`,
    impact: `批准后将执行“${actionLabel}”；系统会保留审批人、内容哈希和执行结果。`,
    details: `${APPROVAL_STATUS_LABELS[item.status]} · 内容指纹 ${item.payloadHash.slice(0, 12)}…`,
    estimatedRevenue: '需以利润证据为准',
    time: new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }),
    status: item.status.toLowerCase(),
    workQueue: approvalProposalWorkQueue(item.status),
    imageUrl: safeExternalHttpsUrl(
      preview.imageUrl ?? preview.productImageUrl ?? preview.thumbnailUrl,
    ),
    imageEvidenceUrl: safeExternalHttpsUrl(
      preview.imageEvidenceUrl ?? preview.productUrl ?? context.sourceUrl,
    ),
  };
}

function customerFacingResult(task: ReviewTask): string | null {
  const output = task.agentRun?.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return null;
  const record = output as unknown as Record<string, unknown>;
  for (const key of ['summary', 'message', 'result', 'recommendation']) {
    if (typeof record[key] === 'string' && record[key].trim()) return record[key].trim();
  }
  return null;
}

interface CustomerEvidenceItem {
  title: string;
  imageUrl: string | null;
  productUrl: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function evidenceFromRecords(values: unknown, fallbackTitle: string): CustomerEvidenceItem[] {
  return asArray(values).flatMap((value, index) => {
    const item = asRecord(value);
    const directUrl = safeHttpUrl(item.url);
    const urlRepresentsImage = fallbackTitle.includes('图');
    const imageUrl = safeHttpUrl(item.imageUrl ?? item.image_url ?? item.thumbnail)
      ?? (urlRepresentsImage ? directUrl : null);
    const productUrl = safeHttpUrl(item.productUrl ?? item.product_url ?? item.sourceUrl ?? item.source_url);
    const resolvedProductUrl = productUrl ?? (!urlRepresentsImage ? directUrl : null);
    if (!imageUrl && !resolvedProductUrl) return [];
    const titleValue = item.title ?? item.name ?? item.productName ?? item.filename;
    return [{
      title: typeof titleValue === 'string' && titleValue.trim()
        ? titleValue.trim()
        : `${fallbackTitle} ${index + 1}`,
      imageUrl,
      productUrl: resolvedProductUrl,
    }];
  });
}

function taskEvidence(task: ReviewTask): CustomerEvidenceItem[] {
  const output = asRecord(task.agentRun?.output);
  const diagnostics = asRecord(output.diagnostics);
  const sourceEvidence = asRecord(output.sourceEvidence);
  const generatedAssets = asRecord(task.imageProject?.generatedAssets);
  const candidates = [
    ...evidenceFromRecords(output.candidates, '候选商品'),
    ...evidenceFromRecords(diagnostics.candidates, '选品核查'),
    ...evidenceFromRecords(sourceEvidence.items, '来源证据'),
    ...evidenceFromRecords(output.images, '智能体生成图'),
    ...evidenceFromRecords(task.imageProject?.generatedAssets, '图片结果'),
    ...evidenceFromRecords(generatedAssets.images, '图片结果'),
    ...evidenceFromRecords(generatedAssets.assets, '图片结果'),
  ];
  const seen = new Set<string>();
  return candidates.filter((item) => {
    const key = `${item.imageUrl ?? ''}|${item.productUrl ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

function CustomerEvidencePanel({ task }: { task: ReviewTask }) {
  const items = taskEvidence(task);
  const expectsEvidence = task.agentRun?.agentType === 'PRODUCT_RESEARCHER'
    || task.agentRun?.agentType === 'IMAGE_CREATIVE'
    || task.entityType === 'IMAGE_GENERATION';
  if (!expectsEvidence && items.length === 0) return null;

  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-950">商品与图片证据</h3>
          <p className="mt-1 text-xs leading-5 text-gray-600">只展示智能体或后端实际返回的图片和商品链接；这些证据不代表已经审核通过。</p>
        </div>
        <span className="shrink-0 text-xs text-gray-500">{items.length} 项</span>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <article key={`${item.imageUrl ?? ''}-${item.productUrl ?? ''}-${index}`} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              {item.imageUrl ? (
                <a href={item.imageUrl} target="_blank" rel="noreferrer" className="block aspect-square bg-gray-50">
                  <img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain" />
                </a>
              ) : (
                <div className="flex aspect-square items-center justify-center gap-2 bg-gray-50 text-xs text-gray-500"><ImageOff className="h-4 w-4" />未返回图片</div>
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium text-gray-950">{item.title}</p>
                {item.productUrl ? (
                  <a href={item.productUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                    查看原商品 <ExternalLink className="h-3 w-3" />
                  </a>
                ) : <p className="mt-2 text-xs text-amber-700">未返回商品链接</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <ImageOff className="h-4 w-4 shrink-0" />本次任务没有返回可预览的真实图片或商品链接，不能据此选择商品。
        </div>
      )}
    </section>
  );
}

function GenericReviewSummary({ task }: { task: ReviewTask }) {
  const run = task.agentRun;
  const agentName = AGENT_TYPE_LABELS[run?.agentType || ''] || '业务智能体';
  const executionStatus = run ? AGENT_STATUS_LABELS[run.status] || run.status : '未返回执行状态';
  const explanation = getCustomerReviewReason(task);
  const isFailed = isUnapprovableAgentTask(task) || Boolean(run?.errorCode);
  const isEvidenceIssue = /证据|来源|价格|RUB|数据不足|未生成报告/i.test(explanation);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-lg bg-white p-2 text-blue-600 shadow-sm"><Bot className="h-5 w-5" /></span>
          <div>
            <h3 className="font-semibold text-gray-950">{getTaskTitle(task)}</h3>
            <p className="mt-1 text-sm leading-6 text-gray-700">{explanation}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">执行智能体</p>
          <p className="mt-1 font-medium text-gray-950">{agentName}</p>
        </section>
        <section className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">执行结果</p>
          <p className={`mt-1 font-medium ${isFailed ? 'text-red-700' : 'text-gray-950'}`}>{executionStatus}</p>
        </section>
      </div>

      <CustomerEvidencePanel task={task} />

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-semibold text-amber-950">建议怎么处理</h3>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-amber-900">
          {isEvidenceIssue ? <li>1. 补充更具体的商品关键词，或确认 Ozon 数据来源后选择“要求重新执行”。</li> : null}
          {isFailed ? <li>{isEvidenceIssue ? '2' : '1'}. 本次结果不完整，不建议直接采用。</li> : <li>1. 确认任务结果符合业务预期后，再选择是否继续。</li>}
          <li>{isEvidenceIssue || isFailed ? '3' : '2'}. 不需要该结果时，可选择“不采用本次结果”。</li>
        </ul>
      </section>

      {isUnapprovableAgentTask(task) ? (
        <section className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">本任务不能标记为通过</p>
            <p className="mt-1 leading-6">智能体没有成功完成任务，系统不会接受该结果，也不会继续生成图片、创建刊登或写入 Ozon。请选择“确认不可用”或“重新执行”。</p>
          </div>
        </section>
      ) : null}

      <section className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">当前不会自动影响店铺</p>
          <p className="mt-1 leading-6">任务仍在人工审核阶段，系统不会因为打开本页而发布商品、改价、改库存或生成图片。</p>
        </div>
      </section>

      <details className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-gray-700">管理员排查信息</summary>
        <dl className="mt-3 grid gap-3 text-xs text-gray-600 md:grid-cols-2">
          <div><dt className="text-gray-400">审核任务编号</dt><dd className="mt-1 break-all font-mono">{task.id}</dd></div>
          <div><dt className="text-gray-400">业务实体编号</dt><dd className="mt-1 break-all font-mono">{task.entityId}</dd></div>
          {run?.id ? <div><dt className="text-gray-400">智能体运行编号</dt><dd className="mt-1 break-all font-mono">{run.id}</dd></div> : null}
          {run?.errorCode ? <div><dt className="text-gray-400">错误代码</dt><dd className="mt-1 break-all font-mono">{run.errorCode}</dd></div> : null}
        </dl>
      </details>
    </div>
  );
}

function ApprovalItemDetails({
  item,
  disabled,
  onApprove,
  onReject,
  onRequestChanges,
  onOverride,
}: {
  item: ApprovalItem;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRequestChanges: () => void;
  onOverride: () => void;
}) {
  const context = asRecord(item.context);
  const preview = asRecord(context.preview);
  const images = asArray(preview.productImages)
    .map(safeHttpUrl)
    .filter((value): value is string => Boolean(value));
  const productUrl = safeHttpUrl(preview.productUrl);
  const productTitle = typeof preview.productTitle === 'string'
    ? preview.productTitle
    : item.notification.title;
  const actionLabel = APPROVAL_ACTION_LABELS[item.action] || '受控业务操作';
  const pending = item.status === 'PENDING';
  const changesRequested = item.status === 'CHANGES_REQUESTED';

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-blue-100 bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-white p-2 text-blue-600 shadow-sm"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-medium text-blue-700">{actionLabel}</p>
            <h3 className="mt-1 font-semibold text-gray-950">{productTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-700">{item.notification.body || '该操作必须经过人工批准，系统不会自动执行。'}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-lg border border-gray-200 p-4"><p className="text-xs text-gray-500">当前状态</p><p className="mt-1 font-medium text-gray-950">{APPROVAL_STATUS_LABELS[item.status]}</p></section>
        <section className="rounded-lg border border-gray-200 p-4"><p className="text-xs text-gray-500">申请来源</p><p className="mt-1 font-medium text-gray-950">{item.source === 'product-launch-worker' ? '商品上架智能体' : item.source}</p></section>
        <section className="rounded-lg border border-gray-200 p-4"><p className="text-xs text-gray-500">有效期</p><p className="mt-1 font-medium text-gray-950">{new Date(item.expiresAt).toLocaleString('zh-CN', { hour12: false })}</p></section>
      </div>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-gray-950">候选商品预览</h3><p className="mt-1 text-xs leading-5 text-gray-600">只展示智能体实际返回并写入审批快照的图片和来源链接。</p></div>
          <span className="text-xs text-gray-500">{images.length} 张图</span>
        </div>
        {images.length > 0 ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {images.slice(0, 8).map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                <img src={url} alt={productTitle} className="h-full w-full object-contain" />
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><ImageOff className="h-4 w-4" />智能体未返回真实商品图，批准前请先要求补充。</div>
        )}
        {productUrl ? (
          <a href={productUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">查看商品来源 <ExternalLink className="h-4 w-4" /></a>
        ) : (
          <p className="mt-3 text-sm text-amber-700">未返回商品来源链接，不能据此确认选品。</p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-950">审批证据</h3>
        <dl className="mt-3 grid gap-3 text-xs text-gray-600 md:grid-cols-2">
          <div><dt className="text-gray-400">内容指纹</dt><dd className="mt-1 break-all font-mono">{item.payloadHash}</dd></div>
          <div><dt className="text-gray-400">审批项编号</dt><dd className="mt-1 break-all font-mono">{item.id}</dd></div>
        </dl>
        {item.decisions.length > 0 ? (
          <div className="mt-4 space-y-2">
            {item.decisions.map((decision) => (
              <div key={decision.id} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <span className="font-medium">{decision.decision === 'APPROVE' ? '批准' : decision.decision === 'REJECT' ? '驳回' : decision.decision === 'REQUEST_CHANGES' ? '要求修改' : '管理员覆盖'}</span>
                <span className="ml-2 text-xs text-gray-500">{new Date(decision.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                {decision.reason ? <p className="mt-1 text-xs leading-5">{decision.reason}</p> : null}
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-gray-500">尚未作出决定。</p>}
      </section>

      {pending ? (
        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
          <button disabled={disabled || images.length === 0 || !productUrl} onClick={onApprove} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">批准并提交发布</button>
          <button disabled={disabled} onClick={onRequestChanges} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 disabled:opacity-40">要求补充或修改</button>
          <button disabled={disabled} onClick={onReject} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40">驳回</button>
        </div>
      ) : null}
      {changesRequested ? (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <p className="text-sm leading-6 text-amber-800">规则沙箱已阻断本次发布。应优先修改商品资料并重新提交；只有管理员确认风险可接受时，才允许填写原因后覆盖执行。</p>
          <button disabled={disabled} onClick={onOverride} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40">管理员覆盖并执行</button>
        </div>
      ) : null}
    </div>
  );
}

export default function ApprovalCenterV2() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [state, dispatch] = useReducer(
    approvalCenterReducer,
    createInitialApprovalCenterState(),
  );
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const { tasks, approvalItems } = state.server;
  const { listLoading: loading, detailLoading } = state.server;
  const { noteAction, reviewNotes, approvalAction, approvalReason } = state.draft;
  const selectedTask = selectReviewTask(state);
  const selectedApprovalItem = selectApprovalItem(state);
  const updatingId = state.optimistic.pending?.entityId ?? null;
  const [stepUpApprovalId, setStepUpApprovalId] = useState<string | null>(null);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [stepUpToken, setStepUpToken] = useState('');
  const [stepUpBusy, setStepUpBusy] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | null>(null);

  const closeSelection = useCallback(() => {
    const invalidationRequestId = ++detailRequestId.current;
    dispatch({ type: 'selection-closed', invalidationRequestId });
  }, []);

  const load = useCallback(async () => {
    const requestId = ++listRequestId.current;
    dispatch({ type: 'list-requested', requestId });
    const [list, stats, proposals] = await Promise.allSettled([
      reviewApi.list({ limit: 100 }),
      reviewApi.stats(),
      approvalItemsApi.list({ limit: 100 }),
    ]);
    if (requestId !== listRequestId.current) return;

    const taskResult: LoadResult<ReviewTask[]> = list.status === 'fulfilled'
      ? { ok: true, value: list.value.items }
      : {
          ok: false,
          error: list.reason instanceof Error ? list.reason.message : '审核任务读取失败',
        };
    const statsResult: LoadResult<ReviewStats> = stats.status === 'fulfilled'
      ? { ok: true, value: stats.value }
      : {
          ok: false,
          error: stats.reason instanceof Error ? stats.reason.message : '审核统计读取失败',
        };
    const approvalResult: LoadResult<ApprovalItem[]> = proposals.status === 'fulfilled'
      ? { ok: true, value: proposals.value }
      : {
          ok: false,
          error: proposals.reason instanceof Error ? proposals.reason.message : '发布审批项读取失败',
        };

    dispatch({
      type: 'list-settled',
      requestId,
      tasks: taskResult,
      approvals: approvalResult,
      stats: statsResult,
    });
    if (!taskResult.ok) addToast(taskResult.error, 'error');
    if (!approvalResult.ok) addToast(approvalResult.error, 'error');
  }, [addToast]);

  useEffect(() => {
    void load();
    return () => {
      listRequestId.current += 1;
      detailRequestId.current += 1;
    };
  }, [load]);

  const openTask = useCallback(async (taskId: string) => {
    const selection: Exclude<ApprovalSelection, null> = taskId.startsWith('approval:')
      ? { kind: 'approval', id: taskId.slice('approval:'.length) }
      : { kind: 'review', id: taskId };
    const requestId = ++detailRequestId.current;
    dispatch({ type: 'detail-requested', requestId, selection });
    try {
      const detail = selection.kind === 'approval'
        ? await approvalItemsApi.getById(selection.id)
        : await reviewApi.getById(selection.id);
      dispatch({ type: 'detail-succeeded', requestId, selection, detail });
    } catch (error) {
      if (requestId !== detailRequestId.current) return;
      const message = error instanceof Error ? error.message : '审核详情加载失败';
      dispatch({ type: 'detail-failed', requestId, error: message });
      addToast(message, 'error');
    }
  }, [addToast]);

  const applyApprovalExecution = async (
    approvalItemId: string,
    response: ApprovalExecutionResponse,
  ) => {
    const outcome = describeApprovalExecution(response);
    addToast(outcome.message, outcome.tone);
    try {
      const refreshed = await approvalItemsApi.getById(approvalItemId);
      dispatch({ type: 'server-approval-received', item: refreshed });
    } catch {
      // The execution response is an envelope, never an ApprovalItem. A list
      // refresh below is the fallback authoritative reconciliation path.
    }
    await load();
  };

  const openStepUp = (approvalItemId: string) => {
    setStepUpApprovalId(approvalItemId);
    setStepUpPassword('');
    setStepUpToken('');
    setStepUpError(null);
  };

  const closeStepUp = () => {
    if (stepUpBusy) return;
    setStepUpApprovalId(null);
    setStepUpPassword('');
    setStepUpToken('');
    setStepUpError(null);
  };

  const handleApprovalApprove = async () => {
    if (!selectedApprovalItem) return;
    const item = selectedApprovalItem;
    const operationKey = `approval:${item.id}:approve`;
    dispatch({
      type: 'operation-started',
      pending: {
        key: operationKey,
        entityId: item.id,
        operation: 'approve',
        startedAt: Date.now(),
      },
    });
    try {
      const response = await approvalItemsApi.approve(item.id);
      await applyApprovalExecution(item.id, response);
    } catch (error) {
      if (
        error instanceof ApiRequestError
        && error.code === 'PUBLISH_STEP_UP_REQUIRED'
      ) {
        openStepUp(item.id);
        addToast('发布前需要重新输入密码和动态验证码。审批尚未执行。', 'info');
        return;
      }
      const message = error instanceof Error ? error.message : '批准操作失败';
      addToast(
        error instanceof ApiRequestError && error.code === 'LISTING_SANDBOX_BLOCKED'
          ? '发布已被规则沙箱阻断，请查看命中规则后修改商品，或由管理员填写原因覆盖。'
          : message,
        'error',
      );
      try {
        const refreshed = await approvalItemsApi.getById(item.id);
        dispatch({ type: 'server-approval-received', item: refreshed });
      } catch {
        // Keep the last authoritative response visible when reconciliation also fails.
      }
      await load();
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const submitPublishStepUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!stepUpApprovalId || stepUpBusy) return;
    const approvalItemId = stepUpApprovalId;
    const operationKey = `approval:${approvalItemId}:step-up-retry`;
    setStepUpBusy(true);
    setStepUpError(null);
    dispatch({
      type: 'operation-started',
      pending: {
        key: operationKey,
        entityId: approvalItemId,
        operation: 'step-up-retry',
        startedAt: Date.now(),
      },
    });
    try {
      const response = await stepUpAndRetryApprovalOnce({
        stepUp: () => authApi.stepUpTwoFactor(stepUpPassword, stepUpToken),
        retryApproval: () => approvalItemsApi.approve(approvalItemId),
      });
      await applyApprovalExecution(approvalItemId, response);
      setStepUpApprovalId(null);
      setStepUpPassword('');
      setStepUpToken('');
    } catch (error) {
      const message =
        error instanceof ApiRequestError && error.code === 'PUBLISH_STEP_UP_REQUIRED'
          ? '身份验证已完成，但发布门禁仍未通过。系统没有再次自动重试。'
          : error instanceof Error
            ? error.message
            : '身份验证失败';
      setStepUpError(message);
      addToast(message, 'error');
    } finally {
      setStepUpBusy(false);
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const handleApprovalReview = async () => {
    if (!selectedApprovalItem || !approvalAction) return;
    const item = selectedApprovalItem;
    const action = approvalAction;
    const reason = approvalReason.trim();
    if (reason.length < (action === 'OVERRIDE' ? 10 : 5)) {
      addToast(action === 'OVERRIDE' ? '管理员覆盖原因至少需要 10 个字符。' : '请填写至少 5 个字符的具体原因。', 'error');
      return;
    }
    const result = asRecord(item.result);
    const sandboxReportId = typeof result.reportId === 'string' ? result.reportId : undefined;
    const operationKey = `approval:${item.id}:${action.toLowerCase()}`;
    dispatch({
      type: 'operation-started',
      pending: {
        key: operationKey,
        entityId: item.id,
        operation: action.toLowerCase(),
        startedAt: Date.now(),
      },
    });
    try {
      const updated = action === 'REJECT'
        ? await approvalItemsApi.reject(item.id, { reason, ...(sandboxReportId ? { sandboxReportId } : {}) })
        : action === 'REQUEST_CHANGES'
          ? await approvalItemsApi.requestChanges(item.id, { reason, ...(sandboxReportId ? { sandboxReportId } : {}) })
          : sandboxReportId
            ? await approvalItemsApi.override(item.id, { reason, sandboxReportId })
            : (() => { throw new Error('未找到与本审批项绑定的沙箱报告，禁止覆盖。'); })();
      dispatch({ type: 'server-approval-received', item: updated });
      dispatch({ type: 'approval-draft-closed' });
      addToast(action === 'REJECT' ? '已驳回该操作。' : action === 'REQUEST_CHANGES' ? '已要求补充或修改。' : '管理员覆盖已记录，操作已进入受控执行链路。', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '审批操作失败', 'error');
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const handleAction = async (status: 'APPROVED' | 'REJECTED' | 'REWORK', notes?: string) => {
    if (!selectedTask) return;
    const task = selectedTask;
    if (status === 'APPROVED' && !canApproveReviewTask(task)) {
      addToast('失败、未完成或实体已失效的任务不能标记为通过。', 'error');
      return;
    }
    const operationKey = `review:${task.id}:${status.toLowerCase()}`;
    dispatch({
      type: 'operation-started',
      pending: {
        key: operationKey,
        entityId: task.id,
        operation: status.toLowerCase(),
        startedAt: Date.now(),
      },
    });
    try {
      const updated = await reviewApi.update(task.id, { status, ...(notes?.trim() ? { notes: notes.trim() } : {}) });
      dispatch({ type: 'server-review-received', task: updated });
      addToast(
        status === 'APPROVED'
          ? task.entityType === 'AGENT_RUN' ? '已确认，本任务已关闭' : '已确认并继续'
          : status === 'REJECTED' ? '已标记为不采用' : '已提交重新执行要求',
        'success',
      );
      closeSelection();
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '审核操作失败', 'error');
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const handleManualPricing = async (input: ManualPricingUpdateInput) => {
    if (!selectedTask || !isManualPricingReview(selectedTask)) {
      addToast('当前任务没有进入人工核价流程。', 'error');
      return;
    }
    const task = selectedTask;
    const operationKey = `review:${task.id}:manual-pricing:${input.action.toLowerCase()}`;
    dispatch({
      type: 'operation-started',
      pending: {
        key: operationKey,
        entityId: task.id,
        operation: `manual-pricing:${input.action.toLowerCase()}`,
        startedAt: Date.now(),
      },
    });
    try {
      const updated = await reviewApi.updateManualPricing(task.id, input);
      dispatch({ type: 'server-review-received', task: updated });
      addToast(
        input.action === 'SUBMIT_COMPLETE'
          ? '核价资料已提交，任务仍需通过后续风控复核，不会自动上架。'
          : input.action === 'SUBMIT_INCOMPLETE'
            ? '已记录仍需补充的核价项目。'
            : '人工核价草稿已保存。',
        'success',
      );
      await load();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : '人工核价资料保存失败',
        'error',
      );
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const handleProductLaunch = async (
    input: ConfirmProductLaunchInput,
  ) => {
    if (!selectedTask) return;
    const task = selectedTask;
    const operationKey = `review:${task.id}:prepare-launch`;
    dispatch({
      type: 'operation-started',
      pending: {
        key: operationKey,
        entityId: task.id,
        operation: 'prepare-launch',
        startedAt: Date.now(),
      },
    });
    try {
      await reviewApi.confirmProductLaunch(task.id, input);
      addToast(
        input.preparationMode === 'CREATIVE_ONLY'
          ? '已进入本地图片和中文商品资料生成队列；仍待人工核价，不能发布。'
          : '已进入图片和商品资料生成队列；本步骤不会写入 Ozon。',
        'success',
      );
      const refreshed = await reviewApi.getById(task.id);
      dispatch({ type: 'server-review-received', task: refreshed });
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '创建本地图片和商品资料任务失败', 'error');
      throw error;
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const handleProductPublish = async (launchId: string) => {
    if (!selectedTask) return;
    const task = selectedTask;
    const operationKey = `review:${task.id}:open-publish-approval`;
    dispatch({
      type: 'operation-started',
      pending: {
        key: operationKey,
        entityId: task.id,
        operation: 'open-publish-approval',
        startedAt: Date.now(),
      },
    });
    try {
      const items = await approvalItemsApi.list({ limit: 100 });
      const proposal = items.find((item) => {
        const params = asRecord(item.params);
        return item.action === 'product-launch.confirm-publish'
          && params.productLaunchId === launchId
          && ['PENDING', 'CHANGES_REQUESTED'].includes(item.status);
      });
      if (!proposal) {
        throw new Error('发布审批项尚未生成，请等待图片与 Listing 准备完成后刷新。');
      }
      const item = await approvalItemsApi.getById(proposal.id);
      const selection: Exclude<ApprovalSelection, null> = {
        kind: 'approval',
        id: proposal.id,
      };
      const requestId = ++detailRequestId.current;
      dispatch({ type: 'detail-requested', requestId, selection });
      dispatch({ type: 'detail-succeeded', requestId, selection, detail: item });
      addToast('已打开独立发布审批，请核对商品图、来源链接和证据后再执行。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '打开发布审批失败', 'error');
      throw error;
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const exportTasks = () => {
    const rows = [
      ['任务ID', '类型', '状态', '实体ID/动作', '创建时间'],
      ...tasks.map((task) => [task.id, task.entityType, task.status, task.entityId, task.createdAt]),
      ...approvalItems.map((item) => [item.id, 'ACTION_PROPOSAL', item.status, item.action, item.createdAt]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `review-tasks-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const approvalTasks = useMemo(
    () => [...approvalItems.map(mapApprovalItem), ...tasks.map(mapTask)],
    [approvalItems, tasks],
  );
  const actionableCount = approvalTasks.filter((task) => task.workQueue === 'actionable').length;
  const attentionCount = approvalTasks.filter((task) => task.workQueue === 'needs_attention').length;
  const processedCount = approvalTasks.filter((task) => task.workQueue === 'processed').length;
  const stats = [
    { label: '待我处理', value: String(actionableCount), icon: Clock, color: 'text-orange-600' },
    { label: '异常与重做', value: String(attentionCount), icon: AlertTriangle, color: 'text-red-600' },
    { label: '已处理', value: String(processedCount), icon: CheckCircle2, color: 'text-green-600' },
    { label: '收益证据', value: '未评估', icon: DollarSign, color: 'text-blue-600' },
  ];

  const submitNotes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (noteAction) void handleAction(noteAction, reviewNotes);
  };

  const submitApprovalReason = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleApprovalReview();
  };

  return (
    <>
      <ApprovalCenter
        approvalTasks={approvalTasks}
        stats={stats}
        loading={loading}
        onOpenTask={(taskId) => void openTask(taskId)}
        onTaskAction={(taskId) => void openTask(taskId)}
        onExport={exportTasks}
      />

      <Modal
        open={Boolean(state.view.selection) || detailLoading}
        onClose={() => {
          if (!updatingId) {
            closeSelection();
          }
        }}
        title={selectedApprovalItem ? '发布审批与证据' : '审核详情与证据'}
        width="max-w-5xl"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> 正在读取真实审核详情...</div>
        ) : state.server.errors.detail ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">审核详情读取失败</p>
            <p className="mt-2 leading-6">{state.server.errors.detail}</p>
            {state.view.selection ? (
              <button
                type="button"
                onClick={() => void openTask(
                  state.view.selection?.kind === 'approval'
                    ? `approval:${state.view.selection.id}`
                    : state.view.selection?.id ?? '',
                )}
                className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 font-medium"
              >
                重新读取
              </button>
            ) : null}
          </div>
        ) : selectedApprovalItem ? (
          <ApprovalItemDetails
            item={selectedApprovalItem}
            disabled={updatingId === selectedApprovalItem.id}
            onApprove={() => void handleApprovalApprove()}
            onReject={() => dispatch({ type: 'approval-draft-opened', action: 'REJECT' })}
            onRequestChanges={() => dispatch({ type: 'approval-draft-opened', action: 'REQUEST_CHANGES' })}
            onOverride={() => dispatch({ type: 'approval-draft-opened', action: 'OVERRIDE' })}
          />
        ) : selectedTask ? (
          <div className="space-y-5">
            <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm md:grid-cols-3">
              <div><span className="text-xs text-gray-500">任务类型</span><p className="font-medium">{ENTITY_TYPE_LABELS[selectedTask.entityType]}</p></div>
               <div><span className="text-xs text-gray-500">处理状态</span><p className="font-medium">{getReviewStatusLabel(selectedTask)}</p></div>
              <div><span className="text-xs text-gray-500">创建时间</span><p className="font-medium">{new Date(selectedTask.createdAt).toLocaleString('zh-CN', { hour12: false })}</p></div>
            </div>

            {isManualPricingReview(selectedTask) ? (
              <ManualPricingReviewForm
                key={selectedTask.id}
                decisionEvidence={selectedTask.decisionEvidence}
                disabled={updatingId === selectedTask.id}
                onSubmit={handleManualPricing}
              />
            ) : null}

            {selectedTask.entityType === 'PRODUCT_RESEARCH' && selectedTask.productResearchPreview ? (
              <ProductResearchLaunchPanel
                key={selectedTask.id}
                preview={selectedTask.productResearchPreview}
                dailyCandidateSafety={selectedTask.dailyProductResearchPreview}
                reviewStatus={selectedTask.status}
                disabled={updatingId === selectedTask.id}
                onConfirm={handleProductLaunch}
                onPublish={handleProductPublish}
              />
            ) : (
              <GenericReviewSummary task={selectedTask} />
            )}

            {(selectedTask.status === 'PENDING' || selectedTask.status === 'REWORK') && selectedTask.entityType === 'PRODUCT_RESEARCH' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-4">
                <p className="text-sm leading-6 text-gray-600">
                  {isManualPricingReview(selectedTask)
                    ? '当前只能补充核价/风险证据、暂不采用或要求重新研究；证据齐全前不会上架。'
                    : '确认生成资料需在上方完成证据校验；也可以暂不采用或要求重新研究。'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button disabled={Boolean(updatingId)} onClick={() => dispatch({ type: 'review-draft-opened', action: 'REJECTED' })} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40">暂不采用</button>
                  <button disabled={Boolean(updatingId)} onClick={() => dispatch({ type: 'review-draft-opened', action: 'REWORK' })} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 disabled:opacity-40">要求补充证据</button>
                </div>
              </div>
            ) : null}

            {(selectedTask.status === 'PENDING' || selectedTask.status === 'REWORK') && selectedTask.entityType !== 'PRODUCT_RESEARCH' ? (
              <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                {canApproveReviewTask(selectedTask) ? (
                  <button disabled={Boolean(updatingId)} onClick={() => void handleAction('APPROVED')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{selectedTask.entityType === 'AGENT_RUN' ? '确认结果' : '确认并继续'}</button>
                ) : null}
                <button disabled={Boolean(updatingId)} onClick={() => dispatch({ type: 'review-draft-opened', action: 'REJECTED' })} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40">{isUnapprovableAgentTask(selectedTask) ? '确认不可用' : '不采用本次结果'}</button>
                <button disabled={Boolean(updatingId)} onClick={() => dispatch({ type: 'review-draft-opened', action: 'REWORK' })} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 disabled:opacity-40">{isUnapprovableAgentTask(selectedTask) ? '重新执行' : '要求重新执行'}</button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(approvalAction)}
        onClose={() => {
          if (!updatingId) {
            dispatch({ type: 'approval-draft-closed' });
          }
        }}
        title={approvalAction === 'REJECT' ? '驳回发布申请' : approvalAction === 'REQUEST_CHANGES' ? '要求补充或修改' : '管理员风险覆盖'}
      >
        <form onSubmit={submitApprovalReason} className="space-y-4">
          {approvalAction === 'OVERRIDE' ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">覆盖只适用于已确认规则风险可接受的特殊情况。原因、操作者、沙箱报告与内容指纹都会写入不可变审计记录。</div>
          ) : null}
          <textarea
            required
            minLength={approvalAction === 'OVERRIDE' ? 10 : 5}
            value={approvalReason}
            onChange={(event) => dispatch({ type: 'approval-reason-changed', value: event.target.value })}
            rows={5}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder={approvalAction === 'REJECT' ? '说明不能执行的具体原因' : approvalAction === 'REQUEST_CHANGES' ? '说明需要补充的商品图、来源、价格或利润证据' : '说明为什么本次可以承担风险并覆盖规则阻断（至少 10 个字符）'}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dispatch({ type: 'approval-draft-closed' })} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
            <button type="submit" disabled={Boolean(updatingId) || approvalReason.trim().length < (approvalAction === 'OVERRIDE' ? 10 : 5)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">确认提交</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(noteAction)} onClose={() => !updatingId && dispatch({ type: 'review-draft-closed' })} title={noteAction === 'REJECTED' ? '说明为什么不采用' : '填写重新执行要求'}>
        <form onSubmit={submitNotes} className="space-y-4">
          <textarea required value={reviewNotes} onChange={(event) => dispatch({ type: 'review-notes-changed', value: event.target.value })} rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder={noteAction === 'REJECTED' ? '例如：证据不足，本次结果不采用' : '例如：只搜索 Honor 400 手机壳，并返回真实图片、链接和两条有效价格'} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dispatch({ type: 'review-draft-closed' })} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
            <button type="submit" disabled={Boolean(updatingId) || !reviewNotes.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">确认提交</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(stepUpApprovalId)}
        onClose={closeStepUp}
        title="发布前身份确认"
      >
        <form onSubmit={submitPublishStepUp} className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            发布到 Ozon 前必须重新验证当前账户{user?.email ? `（${user.email}）` : ''}。验证成功后，系统只会自动重试本次审批一次。
          </div>
          <label className="block text-sm font-medium text-gray-800">
            当前登录密码
            <input
              autoFocus
              required
              type="password"
              autoComplete="current-password"
              value={stepUpPassword}
              onChange={(event) => setStepUpPassword(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium text-gray-800">
            验证器中的 6 位动态验证码
            <input
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={stepUpToken}
              onChange={(event) => setStepUpToken(event.target.value.replace(/\D/g, ''))}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          {stepUpError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {stepUpError}
            </div>
          ) : null}
          <p className="text-xs leading-5 text-gray-500">
            尚未启用双重验证？请先到 <a href="/team" className="font-medium text-blue-700 hover:underline">团队与设置 → 安全设置</a> 完成配置。
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeStepUp} disabled={stepUpBusy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">取消</button>
            <button type="submit" disabled={stepUpBusy || !stepUpPassword || stepUpToken.length !== 6} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {stepUpBusy ? '正在验证并重试...' : '验证并重试一次'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
