import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Bot, CheckCircle2, Clock, DollarSign, ExternalLink, ImageOff, Loader2, ShieldCheck } from 'lucide-react';
import {
  reviewApi,
  type OzonPublicationInput,
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

const ENTITY_TYPE_LABELS: Record<ReviewTask['entityType'], string> = {
  AGENT_RUN: 'agenttask',
  IMAGE_GENERATION: 'imagegeneration',
  LISTING_DRAFT: 'producttext',
  PRODUCT_RESEARCH: 'productproduct research',
  SUPPLY_PLAN: 'english_text',
};

const REVIEW_STATUS_LABELS: Record<ReviewTask['status'], string> = {
  PENDING: 'textpending',
  APPROVED: 'english_text',
  REJECTED: 'english_text',
  REWORK: 'english_text',
};

const AGENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'english_text',
  RUNNING: 'english_text',
  COMPLETED: 'textcompleted',
  FAILED: 'textfailed',
  CANCELLED: 'english_text',
  TIMEOUT: 'english_text',
};

function isUnapprovableAgentTask(task: ReviewTask): boolean {
  return task.entityType === 'AGENT_RUN' && task.agentRun?.status !== 'COMPLETED';
}

function canApproveReviewTask(task: ReviewTask): boolean {
  return task.entityType !== 'PRODUCT_RESEARCH'
    && task.entityAvailable !== false
    && !isUnapprovableAgentTask(task);
}

function getReviewStatusLabel(task: ReviewTask): string {
  if (task.status === 'APPROVED' && isUnapprovableAgentTask(task)) {
    return 'english_text · english_text';
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
    return 'textfailedtasktexterrorenglish_text，textyesenglish_text。english_text。';
  }
  const run = task.agentRun;
  return readableCustomerText(
    task.productResearchPreview?.summary,
    task.notes,
    run && isUnapprovableAgentTask(task)
      ? agentRunFailureMessage(run, 'agenttextcompletedtask，english_text。')
      : null,
    run?.progress?.message,
    customerFacingResult(task),
  ) || 'texthumantextrealtaskenglish_textevidence。';
}

const AGENT_TYPE_LABELS: Record<string, string> = {
  PRODUCT_RESEARCHER: 'product researchagent',
  LISTING_OPTIMIZER: 'english_textagent',
  ADVERTISING_STRATEGIST: 'english_textagent',
  PROFIT_ANALYST: 'profittextagent',
  CUSTOMER_INSIGHT: 'customertextagent',
  CONTENT_WRITER: 'textagent',
  KEYWORD_EXPLORER: 'keywordsagent',
  GENERAL_ASSISTANT: 'textagent',
  IMAGE_CREATIVE: 'imageagent',
  PLANNER: 'textagent',
};

function getTaskTitle(task: ReviewTask): string {
  const preview = task.productResearchPreview;
  if (preview?.query) return preview.query;
  if (task.imageProject?.title) return task.imageProject.title;
  if (task.supplyPlan?.supplySku.productName) return `${task.supplyPlan.supplySku.productName} english_text`;
  if (task.entityType === 'AGENT_RUN') {
    const agentName = AGENT_TYPE_LABELS[task.agentRun?.agentType || ''] || 'agent';
    return `${agentName}texthumantext`;
  }
  return `${ENTITY_TYPE_LABELS[task.entityType]}textreview`;
}

function mapTask(task: ReviewTask): ApprovalCenterItem {
  const preview = task.productResearchPreview;
  const evidenceCount = preview?.sourceEvidence.items.length ?? 0;
  const readyCandidates = preview?.candidates.filter((candidate) => candidate.evidenceReady).length ?? 0;
  const risk = task.score === null ? 'medium' : task.score < task.threshold * 0.7 ? 'high' : task.score < task.threshold ? 'medium' : 'low';
  return {
    id: task.id,
    type: task.entityType === 'PRODUCT_RESEARCH' ? 'product researchreview' : task.entityType === 'LISTING_DRAFT' ? 'textreview' : task.entityType === 'IMAGE_GENERATION' ? 'imagereview' : task.entityType === 'SUPPLY_PLAN' ? 'textreview' : 'agenttask',
    title: getTaskTitle(task),
    platform: preview?.platform || 'Ozon',
    risk,
    agent: AGENT_TYPE_LABELS[task.agentRun?.agentType || ''] || 'textagent',
    reason: getCustomerReviewReason(task),
    impact: isUnapprovableAgentTask(task)
      ? 'texttasktextcompleted，english_textgeneration、listingenglish_textstore。'
      : task.entityType === 'PRODUCT_RESEARCH'
        ? 'english_textimagegenerationtextlocaltext，english_textpublish。'
        : task.entityType === 'SUPPLY_PLAN'
          ? 'english_textlocalenglish_text，english_textorders。'
          : 'english_textreviewenglish_textrealenglish_text。',
    details: preview
      ? `${evidenceCount} textsourceevidence · ${readyCandidates} english_text · text ${preview.priceRange.min ?? 'english_text'}-${preview.priceRange.max ?? 'english_text'} ${preview.priceRange.currency || ''}`
      : task.agentRun
        ? `${task.status === 'APPROVED' && isUnapprovableAgentTask(task) ? 'english_text · ' : ''}${AGENT_TYPE_LABELS[task.agentRun.agentType] || 'agent'} · ${AGENT_STATUS_LABELS[task.agentRun.status] || task.agentRun.status}`
        : 'english_textreviewtext。',
    estimatedRevenue: 'textbackendtext',
    time: new Date(task.createdAt).toLocaleString('zh-CN', { hour12: false }),
    status: task.status.toLowerCase(),
  };
}

const APPROVAL_STATUS_LABELS: Record<ApprovalItem['status'], string> = {
  PENDING: 'textapproval',
  EXECUTING: 'english_text',
  UNKNOWN: 'texthumantext',
  APPROVED: 'english_text，english_text',
  EXECUTED: 'english_text',
  DISMISSED: 'english_text',
  CHANGES_REQUESTED: 'english_text',
  REJECTED: 'english_text',
  FAILED: 'textfailed',
  EXPIRED: 'english_text',
};

const APPROVAL_ACTION_LABELS: Record<string, string> = {
  'product-launch.confirm-publish': 'publishproducttext Ozon',
  'ozon.listing.publish': 'publishproducttext Ozon',
  'ozon.product.update': 'text Ozon product',
  'ozon.price.update': 'text Ozon text',
  'ozon.stock.update': 'text Ozon text',
  'ozon.order.refund': 'text Ozon text',
  'ozon.chat.send_message': 'textcustomermessage',
  'ozon.question.answer': 'replycustomertext',
  'ozon.review.comment': 'replyproducttext',
  'operator.prepare_listing_batch': 'textproductenglish_text',
  'automation.recover': 'textautomatictextflow',
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
  const actionLabel = APPROVAL_ACTION_LABELS[item.action] || 'english_text';
  const productTitle = typeof preview.productTitle === 'string'
    ? preview.productTitle
    : item.notification.title;
  return {
    id: `approval:${item.id}`,
    type: item.action.includes('price')
      ? 'english_text'
      : item.action.includes('refund')
        ? 'english_text'
        : item.action.includes('stock')
          ? 'english_text'
          : item.action.includes('publish')
            ? 'productpublish'
            : 'Agent review',
    title: productTitle,
    platform: typeof context.provider === 'string' ? context.provider : 'Ozon',
    risk,
    agent: item.source === 'product-launch-worker' ? 'productlistingagent' : 'textagent',
    reason: item.notification.body || `agentenglish_text：${actionLabel}`,
    impact: `english_text“${actionLabel}”；english_textapprovaltext、english_text。`,
    details: `${APPROVAL_STATUS_LABELS[item.status]} · english_text ${item.payloadHash.slice(0, 12)}…`,
    estimatedRevenue: 'textprofitevidencetext',
    time: new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false }),
    status: item.status.toLowerCase(),
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
    const urlRepresentsImage = fallbackTitle.includes('text');
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
    ...evidenceFromRecords(output.candidates, 'textproduct'),
    ...evidenceFromRecords(diagnostics.candidates, 'product researchtext'),
    ...evidenceFromRecords(sourceEvidence.items, 'sourceevidence'),
    ...evidenceFromRecords(output.images, 'agentgenerationtext'),
    ...evidenceFromRecords(task.imageProject?.generatedAssets, 'imagetext'),
    ...evidenceFromRecords(generatedAssets.images, 'imagetext'),
    ...evidenceFromRecords(generatedAssets.assets, 'imagetext'),
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
          <h3 className="text-sm font-semibold text-gray-950">producttextimageevidence</h3>
          <p className="mt-1 text-xs leading-5 text-gray-600">english_textagenttextbackendenglish_textimagetextproducttext；textevidenceenglish_textreviewpassed。</p>
        </div>
        <span className="shrink-0 text-xs text-gray-500">{items.length} text</span>
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
                <div className="flex aspect-square items-center justify-center gap-2 bg-gray-50 text-xs text-gray-500"><ImageOff className="h-4 w-4" />english_textimage</div>
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-sm font-medium text-gray-950">{item.title}</p>
                {item.productUrl ? (
                  <a href={item.productUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                    english_textproduct <ExternalLink className="h-3 w-3" />
                  </a>
                ) : <p className="mt-2 text-xs text-amber-700">english_textproducttext</p>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <ImageOff className="h-4 w-4 shrink-0" />texttasktextyesenglish_textrealimagetextproducttext，english_textproduct。
        </div>
      )}
    </section>
  );
}

function GenericReviewSummary({ task }: { task: ReviewTask }) {
  const run = task.agentRun;
  const agentName = AGENT_TYPE_LABELS[run?.agentType || ''] || 'textagent';
  const executionStatus = run ? AGENT_STATUS_LABELS[run.status] || run.status : 'english_textstatus';
  const explanation = getCustomerReviewReason(task);
  const isFailed = isUnapprovableAgentTask(task) || Boolean(run?.errorCode);
  const isEvidenceIssue = /evidence|source|text|RUB|datatext|textgenerationreport/i.test(explanation);

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
          <p className="text-xs text-gray-500">textagent</p>
          <p className="mt-1 font-medium text-gray-950">{agentName}</p>
        </section>
        <section className="rounded-lg border border-gray-200 p-4">
          <p className="text-xs text-gray-500">english_text</p>
          <p className={`mt-1 font-medium ${isFailed ? 'text-red-700' : 'text-gray-950'}`}>{executionStatus}</p>
        </section>
      </div>

      <CustomerEvidencePanel task={task} />

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
        <h3 className="text-sm font-semibold text-amber-950">english_text</h3>
        <ul className="mt-2 space-y-2 text-sm leading-6 text-amber-900">
          {isEvidenceIssue ? <li>1. english_textproductkeywords，english_text Ozon datasourceenglish_text“english_text”。</li> : null}
          {isFailed ? <li>{isEvidenceIssue ? '2' : '1'}. english_text，english_text。</li> : <li>1. texttaskenglish_text，english_textyesnotext。</li>}
          <li>{isEvidenceIssue || isFailed ? '3' : '2'}. english_text，english_text“english_text”。</li>
        </ul>
      </section>

      {isUnapprovableAgentTask(task) ? (
        <section className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">texttaskenglish_textpassed</p>
            <p className="mt-1 leading-6">agenttextyessuccesscompletedtask，english_text，english_textgenerationimage、english_textwrite Ozon。english_text“english_text”text“english_text”。</p>
          </div>
        </section>
      ) : null}

      <section className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">english_textautomatictextstore</p>
          <p className="mt-1 leading-6">tasktexthumanreviewstage，english_textpublishproduct、text、english_textgenerationimage。</p>
        </div>
      </section>

      <details className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
        <summary className="cursor-pointer font-medium text-gray-700">english_text</summary>
        <dl className="mt-3 grid gap-3 text-xs text-gray-600 md:grid-cols-2">
          <div><dt className="text-gray-400">reviewtasktext</dt><dd className="mt-1 break-all font-mono">{task.id}</dd></div>
          <div><dt className="text-gray-400">english_text</dt><dd className="mt-1 break-all font-mono">{task.entityId}</dd></div>
          {run?.id ? <div><dt className="text-gray-400">agentenglish_text</dt><dd className="mt-1 break-all font-mono">{run.id}</dd></div> : null}
          {run?.errorCode ? <div><dt className="text-gray-400">errortext</dt><dd className="mt-1 break-all font-mono">{run.errorCode}</dd></div> : null}
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
  const actionLabel = APPROVAL_ACTION_LABELS[item.action] || 'english_text';
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
            <p className="mt-2 text-sm leading-6 text-gray-700">{item.notification.body || 'english_texthumantext，english_textautomatictext。'}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <section className="rounded-lg border border-gray-200 p-4"><p className="text-xs text-gray-500">textstatus</p><p className="mt-1 font-medium text-gray-950">{APPROVAL_STATUS_LABELS[item.status]}</p></section>
        <section className="rounded-lg border border-gray-200 p-4"><p className="text-xs text-gray-500">textsource</p><p className="mt-1 font-medium text-gray-950">{item.source === 'product-launch-worker' ? 'productlistingagent' : item.source}</p></section>
        <section className="rounded-lg border border-gray-200 p-4"><p className="text-xs text-gray-500">yestext</p><p className="mt-1 font-medium text-gray-950">{new Date(item.expiresAt).toLocaleString('zh-CN', { hour12: false })}</p></section>
      </div>

      <section className="rounded-lg border border-gray-200 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-semibold text-gray-950">textproducttext</h3><p className="mt-1 text-xs leading-5 text-gray-600">english_textagentenglish_textwriteapprovalenglish_textimagetextsourcetext。</p></div>
          <span className="text-xs text-gray-500">{images.length} text</span>
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
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><ImageOff className="h-4 w-4" />agentenglish_textrealproducttext，english_text。</div>
        )}
        {productUrl ? (
          <a href={productUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">textproductsource <ExternalLink className="h-4 w-4" /></a>
        ) : (
          <p className="mt-3 text-sm text-amber-700">english_textproductsourcetext，english_textproduct research。</p>
        )}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-950">approvalevidence</h3>
        <dl className="mt-3 grid gap-3 text-xs text-gray-600 md:grid-cols-2">
          <div><dt className="text-gray-400">english_text</dt><dd className="mt-1 break-all font-mono">{item.payloadHash}</dd></div>
          <div><dt className="text-gray-400">approvalenglish_text</dt><dd className="mt-1 break-all font-mono">{item.id}</dd></div>
        </dl>
        {item.decisions.length > 0 ? (
          <div className="mt-4 space-y-2">
            {item.decisions.map((decision) => (
              <div key={decision.id} className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                <span className="font-medium">{decision.decision === 'APPROVE' ? 'text' : decision.decision === 'REJECT' ? 'text' : decision.decision === 'REQUEST_CHANGES' ? 'english_text' : 'english_text'}</span>
                <span className="ml-2 text-xs text-gray-500">{new Date(decision.createdAt).toLocaleString('zh-CN', { hour12: false })}</span>
                {decision.reason ? <p className="mt-1 text-xs leading-5">{decision.reason}</p> : null}
              </div>
            ))}
          </div>
        ) : <p className="mt-3 text-sm text-gray-500">english_text。</p>}
      </section>

      {pending ? (
        <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
          <button disabled={disabled || images.length === 0 || !productUrl} onClick={onApprove} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">english_textpublish</button>
          <button disabled={disabled} onClick={onRequestChanges} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 disabled:opacity-40">english_text</button>
          <button disabled={disabled} onClick={onReject} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40">text</button>
        </div>
      ) : null}
      {changesRequested ? (
        <div className="space-y-3 border-t border-gray-200 pt-4">
          <p className="text-sm leading-6 text-amber-800">english_textpublish。english_textproductenglish_text；textyesenglish_textriskenglish_text，english_text。</p>
          <button disabled={disabled} onClick={onOverride} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40">english_text</button>
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
  const { tasks, approvalItems, stats: statsSource } = state.server;
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
          error: list.reason instanceof Error ? list.reason.message : 'reviewtaskreadfailed',
        };
    const statsResult: LoadResult<ReviewStats> = stats.status === 'fulfilled'
      ? { ok: true, value: stats.value }
      : {
          ok: false,
          error: stats.reason instanceof Error ? stats.reason.message : 'reviewtextreadfailed',
        };
    const approvalResult: LoadResult<ApprovalItem[]> = proposals.status === 'fulfilled'
      ? { ok: true, value: proposals.value }
      : {
          ok: false,
          error: proposals.reason instanceof Error ? proposals.reason.message : 'publishapprovaltextreadfailed',
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
      const message = error instanceof Error ? error.message : 'reviewenglish_textfailed';
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
        addToast('publishenglish_textinputenglish_text。approvalenglish_text。', 'info');
        return;
      }
      const message = error instanceof Error ? error.message : 'english_textfailed';
      addToast(
        error instanceof ApiRequestError && error.code === 'LISTING_SANDBOX_BLOCKED'
          ? 'publishenglish_text，english_textproduct，english_text。'
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
          ? 'english_textcompleted，textpublishenglish_textpassed。english_textyestextautomatictext。'
          : error instanceof Error
            ? error.message
            : 'english_textfailed';
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
      addToast(action === 'OVERRIDE' ? 'english_text 10 english_text。' : 'english_text 5 english_text。', 'error');
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
            : (() => { throw new Error('english_textapprovalenglish_textreport，english_text。'); })();
      dispatch({ type: 'server-approval-received', item: updated });
      dispatch({ type: 'approval-draft-closed' });
      addToast(action === 'REJECT' ? 'english_text。' : action === 'REQUEST_CHANGES' ? 'english_text。' : 'english_text，english_text。', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'approvaltextfailed', 'error');
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const handleAction = async (status: 'APPROVED' | 'REJECTED' | 'REWORK', notes?: string) => {
    if (!selectedTask) return;
    const task = selectedTask;
    if (status === 'APPROVED' && !canApproveReviewTask(task)) {
      addToast('failed、textcompletedenglish_texttaskenglish_textpassed。', 'error');
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
          ? task.entityType === 'AGENT_RUN' ? 'english_text，texttaskenglish_text' : 'english_text'
          : status === 'REJECTED' ? 'english_text' : 'english_text',
        'success',
      );
      closeSelection();
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'reviewtextfailed', 'error');
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const handleProductLaunch = async (candidateId: string, referenceAssetId: string, ozonPublication?: OzonPublicationInput) => {
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
      await reviewApi.confirmProductLaunch(task.id, {
        candidateId,
        confirmImageGeneration: true,
        referenceAssetId,
        ...(ozonPublication ? { ozonPublication } : {}),
      });
      addToast('english_textcosttextimagetext Listing，english_textwrite Ozon。', 'success');
      const refreshed = await reviewApi.getById(task.id);
      dispatch({ type: 'server-review-received', task: refreshed });
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'textlistingtaskfailed', 'error');
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
        throw new Error('publishapprovalenglish_textgeneration，english_textimagetext Listing textcompletedenglish_text。');
      }
      const item = await approvalItemsApi.getById(proposal.id);
      const selection: Exclude<ApprovalSelection, null> = {
        kind: 'approval',
        id: proposal.id,
      };
      const requestId = ++detailRequestId.current;
      dispatch({ type: 'detail-requested', requestId, selection });
      dispatch({ type: 'detail-succeeded', requestId, selection, detail: item });
      addToast('english_textpublishapproval，english_textproducttext、sourceenglish_textevidenceenglish_text。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'textpublishapprovalfailed', 'error');
      throw error;
    } finally {
      dispatch({ type: 'operation-finished', key: operationKey });
    }
  };

  const exportTasks = () => {
    const rows = [
      ['taskID', 'text', 'status', 'textID/text', 'english_text'],
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
  const pendingProposals = approvalItems.filter((item) => item.status === 'PENDING' || item.status === 'CHANGES_REQUESTED').length;
  const approvedProposals = approvalItems.filter((item) => ['APPROVED', 'EXECUTED'].includes(item.status)).length;
  const rejectedProposals = approvalItems.filter((item) => ['REJECTED', 'FAILED', 'EXPIRED'].includes(item.status)).length;
  const stats = [
    { label: 'textapprovaltask', value: String((statsSource?.pending ?? tasks.filter((task) => task.status === 'PENDING').length) + pendingProposals), icon: Clock, color: 'text-orange-600' },
    { label: 'english_text', value: String((statsSource?.approved ?? 0) + approvedProposals), icon: CheckCircle2, color: 'text-green-600' },
    { label: 'text/text', value: String((statsSource?.rejected ?? 0) + (statsSource?.rework ?? 0) + rejectedProposals), icon: AlertTriangle, color: 'text-red-600' },
    { label: 'textevidence', value: 'english_text', icon: DollarSign, color: 'text-blue-600' },
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
        title={selectedApprovalItem ? 'publishapprovaltextevidence' : 'reviewenglish_textevidence'}
        width="max-w-5xl"
      >
        {detailLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> textreadrealreviewtext...</div>
        ) : state.server.errors.detail ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800">
            <p className="font-semibold">reviewtextreadfailed</p>
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
                textread
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
              <div><span className="text-xs text-gray-500">tasktext</span><p className="font-medium">{ENTITY_TYPE_LABELS[selectedTask.entityType]}</p></div>
               <div><span className="text-xs text-gray-500">textstatus</span><p className="font-medium">{getReviewStatusLabel(selectedTask)}</p></div>
              <div><span className="text-xs text-gray-500">english_text</span><p className="font-medium">{new Date(selectedTask.createdAt).toLocaleString('zh-CN', { hour12: false })}</p></div>
            </div>

            {selectedTask.entityType === 'PRODUCT_RESEARCH' && selectedTask.productResearchPreview ? (
              <ProductResearchLaunchPanel
                key={selectedTask.id}
                preview={selectedTask.productResearchPreview}
                reviewStatus={selectedTask.status}
                disabled={updatingId === selectedTask.id}
                onConfirm={handleProductLaunch}
                onPublish={handleProductPublish}
              />
            ) : (
              <GenericReviewSummary task={selectedTask} />
            )}

            {(selectedTask.status === 'PENDING' || selectedTask.status === 'REWORK') && selectedTask.entityType !== 'PRODUCT_RESEARCH' ? (
              <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
                {canApproveReviewTask(selectedTask) ? (
                  <button disabled={Boolean(updatingId)} onClick={() => void handleAction('APPROVED')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">{selectedTask.entityType === 'AGENT_RUN' ? 'english_text' : 'english_text'}</button>
                ) : null}
                <button disabled={Boolean(updatingId)} onClick={() => dispatch({ type: 'review-draft-opened', action: 'REJECTED' })} className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40">{isUnapprovableAgentTask(selectedTask) ? 'english_text' : 'english_text'}</button>
                <button disabled={Boolean(updatingId)} onClick={() => dispatch({ type: 'review-draft-opened', action: 'REWORK' })} className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 disabled:opacity-40">{isUnapprovableAgentTask(selectedTask) ? 'english_text' : 'english_text'}</button>
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
        title={approvalAction === 'REJECT' ? 'textpublishtext' : approvalAction === 'REQUEST_CHANGES' ? 'english_text' : 'english_textrisktext'}
      >
        <form onSubmit={submitApprovalReason} className="space-y-4">
          {approvalAction === 'OVERRIDE' ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-900">english_textriskenglish_text。text、english_text、textreportenglish_textwriteenglish_textaudit record。</div>
          ) : null}
          <textarea
            required
            minLength={approvalAction === 'OVERRIDE' ? 10 : 5}
            value={approvalReason}
            onChange={(event) => dispatch({ type: 'approval-reason-changed', value: event.target.value })}
            rows={5}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder={approvalAction === 'REJECT' ? 'english_text' : approvalAction === 'REQUEST_CHANGES' ? 'english_textproducttext、source、english_textprofitevidence' : 'english_textriskenglish_text（text 10 english_text）'}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dispatch({ type: 'approval-draft-closed' })} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">text</button>
            <button type="submit" disabled={Boolean(updatingId) || approvalReason.trim().length < (approvalAction === 'OVERRIDE' ? 10 : 5)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">english_text</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(noteAction)} onClose={() => !updatingId && dispatch({ type: 'review-draft-closed' })} title={noteAction === 'REJECTED' ? 'english_text' : 'english_text'}>
        <form onSubmit={submitNotes} className="space-y-4">
          <textarea required value={reviewNotes} onChange={(event) => dispatch({ type: 'review-notes-changed', value: event.target.value })} rows={5} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder={noteAction === 'REJECTED' ? 'text：evidencetext，english_text' : 'text：textsearch Honor 400 english_text，english_textrealimage、english_textyesenglish_text'} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dispatch({ type: 'review-draft-closed' })} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">text</button>
            <button type="submit" disabled={Boolean(updatingId) || !reviewNotes.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">english_text</button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(stepUpApprovalId)}
        onClose={closeStepUp}
        title="publishenglish_text"
      >
        <form onSubmit={submitPublishStepUp} className="space-y-4">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
            publishtext Ozon english_text{user?.email ? `（${user.email}）` : ''}。textsuccesstext，english_textautomaticenglish_textapprovaltext。
          </div>
          <label className="block text-sm font-medium text-gray-800">
            english_text
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
            english_text 6 english_text
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
            english_text？english_text <a href="/team" className="font-medium text-blue-700 hover:underline">teamenglish_text → securitytext</a> completedconfiguration。
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeStepUp} disabled={stepUpBusy} className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50">text</button>
            <button type="submit" disabled={stepUpBusy || !stepUpPassword || stepUpToken.length !== 6} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {stepUpBusy ? 'english_text...' : 'english_text'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
