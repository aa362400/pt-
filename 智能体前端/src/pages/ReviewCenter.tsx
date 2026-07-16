import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Eye,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useToast } from '../components/ui/use-toast.ts';
import Modal from '../components/ui/Modal.tsx';
import { reviewApi } from '../api/review';
import type { ReviewTask, ReviewStats, ReviewStatus } from '../api/review';
import { agentRunFailureMessage } from '../api/agentRuns';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import ProductResearchLaunchPanel from '../components/review/ProductResearchLaunchPanel.tsx';
import { StructuredResult } from '../components/ui/StructuredResult.tsx';
import type { OzonPublicationInput } from '../api/review';

const STATUS_TABS: Array<{ key: ReviewStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' },
  { key: 'REWORK', label: '待重做' },
];

const STATUS_BADGE: Record<ReviewStatus, { label: string; cls: string }> = {
  PENDING: { label: '待审核', cls: 'bg-amber-50 text-amber-700' },
  APPROVED: { label: '已通过', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: '已驳回', cls: 'bg-red-50 text-red-600' },
  REWORK: { label: '待重做', cls: 'bg-indigo-50 text-indigo-700' },
};

const ENTITY_LABEL: Record<string, string> = {
  AGENT_RUN: '智能体任务',
  IMAGE_GENERATION: '图像生成',
  LISTING_DRAFT: 'Listing 草稿',
  PRODUCT_RESEARCH: '产品调研',
  SUPPLY_PLAN: '补货计划',
};

const AGENT_RUN_STATUS_LABEL: Record<string, string> = {
  PENDING: '等待执行',
  ENQUEUING: '正在入队',
  QUEUED: '已进入队列',
  RUNNING: '正在执行',
  RETRYING: '正在重试',
  COMPLETED: '执行完成',
  FAILED: '执行失败',
  CANCELLED: '已取消',
  TIMEOUT: '执行超时',
  DEAD_LETTERED: '已进入异常队列',
};

interface PreviewImage {
  url: string;
  label: string;
}

type ReviewNoteAction = 'REJECTED' | 'REWORK';

interface ReviewNoteDialog {
  task: ReviewTask;
  status: ReviewNoteAction;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function extractImages(task: ReviewTask): PreviewImage[] {
  const output = asRecord(task.agentRun?.output);
  const agentImages = Array.isArray(output.images) ? output.images : [];
  const projectAssets = Array.isArray(task.imageProject?.generatedAssets)
    ? task.imageProject?.generatedAssets
    : [];
  return [...agentImages, ...projectAssets]
    .map((item, index) => {
      const record = asRecord(item);
      const url = typeof record.url === 'string' ? record.url : null;
      if (!url) return null;
      const label =
        typeof record.sceneId === 'string'
          ? record.sceneId
          : typeof record.filename === 'string'
            ? record.filename
            : `图片 ${index + 1}`;
      return { url, label };
    })
    .filter((item): item is PreviewImage => Boolean(item));
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function isFailedOrIncompleteAgentReview(task: ReviewTask): boolean {
  return (
    task.entityType === 'AGENT_RUN' &&
    Boolean(task.agentRun) &&
    task.agentRun?.status !== 'COMPLETED'
  );
}

function canApproveTask(task: ReviewTask): boolean {
  return (
    task.entityType !== 'PRODUCT_RESEARCH' &&
    task.entityAvailable !== false &&
    !isFailedOrIncompleteAgentReview(task)
  );
}

function statusBadgeFor(task: ReviewTask) {
  if (task.status === 'APPROVED' && isFailedOrIncompleteAgentReview(task)) {
    return { label: '无效通过 · 未执行', cls: 'bg-red-50 text-red-700' };
  }
  return STATUS_BADGE[task.status];
}

export default function ReviewCenter() {
  const { addToast } = useToast();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'ALL'>('PENDING');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<ReviewTask | null>(null);
  const [noteDialog, setNoteDialog] = useState<ReviewNoteDialog | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const limit = 20;

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [statsRes, listRes] = await Promise.all([
        reviewApi.stats(),
        reviewApi.list({
          page,
          limit,
          ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
        }),
      ]);
      setStats(statsRes);
      setTasks(listRes.items);
      setTotal(listRes.total);
      setSelectedTask((current) =>
        current
          ? listRes.items.find((item) => item.id === current.id) ?? current
          : current,
      );
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : '审核数据加载失败';
      if (!silent) {
        setError(message);
        addToast(message, 'error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [addToast, page, statusFilter]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  useEffect(() => {
    const reviewTaskId = new URLSearchParams(location.search).get('task');
    if (!reviewTaskId) return;
    let active = true;
    void reviewApi.getById(reviewTaskId)
      .then((task) => {
        if (active) setSelectedTask(task);
      })
      .catch((err) => {
        if (active) {
          addToast(err instanceof Error ? err.message : '审核详情加载失败', 'error');
        }
      });
    return () => {
      active = false;
    };
  }, [addToast, location.search]);

  const refreshReviewSilently = useCallback(() => fetchData(true), [fetchData]);
  useAutoRefresh(refreshReviewSilently, 8000);

  const handleAction = async (
    task: ReviewTask,
    status: 'APPROVED' | 'REJECTED' | 'REWORK',
    notes?: string,
  ) => {
    setUpdatingId(task.id);
    try {
      await reviewApi.update(task.id, {
        status,
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
      });
      addToast(
        status === 'APPROVED'
          ? '已通过审核'
          : status === 'REJECTED'
            ? '已驳回'
            : '已要求重做',
        'success',
      );
      setNoteDialog(null);
      setReviewNotes('');
      if (selectedTask?.id === task.id) setSelectedTask(null);
      await fetchData(true);
    } catch (err) {
      addToast(err instanceof Error ? err.message : '审核操作失败', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const requestAction = (task: ReviewTask, status: 'APPROVED' | ReviewNoteAction) => {
    if (status === 'APPROVED') {
      void handleAction(task, status);
      return;
    }
    setReviewNotes('');
    setNoteDialog({ task, status });
  };

  const submitNotes = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!noteDialog) return;
    void handleAction(noteDialog.task, noteDialog.status, reviewNotes);
  };

  const closeNoteDialog = () => {
    if (updatingId) return;
    setNoteDialog(null);
    setReviewNotes('');
  };

  const handleProductLaunch = async (
    task: ReviewTask,
    candidateId: string,
    referenceAssetId: string,
    ozonPublication?: OzonPublicationInput,
  ) => {
    setUpdatingId(task.id);
    try {
      await reviewApi.confirmProductLaunch(task.id, {
        candidateId,
        confirmImageGeneration: true,
        referenceAssetId,
        ...(ozonPublication ? { ozonPublication } : {}),
      });
      addToast('已确认生成本地图片和 Listing，本步骤不会写入 Ozon。', 'success');
      const updatedTask = await reviewApi.getById(task.id);
      setSelectedTask(updatedTask);
      await fetchData(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '创建上架任务失败';
      addToast(message, 'error');
      throw error;
    } finally {
      setUpdatingId(null);
    }
  };

  const handleProductPublish = async (task: ReviewTask, launchId: string) => {
    setUpdatingId(task.id);
    try {
      await reviewApi.confirmProductPublish(launchId);
      addToast('已单独确认发布，正在提交 Ozon。', 'success');
      const updatedTask = await reviewApi.getById(task.id);
      setSelectedTask(updatedTask);
      await fetchData(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : '确认发布失败';
      addToast(message, 'error');
      throw error;
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const previewImages = useMemo(
    () => (selectedTask ? extractImages(selectedTask) : []),
    [selectedTask],
  );
  const consistencyScore = asRecord(selectedTask?.agentRun?.output).consistencyScore;

  return (
    <div className="min-h-screen bg-[#F7F8FC] p-5 lg:p-6">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A2E]">人工审核中心</h1>
            <p className="mt-1 text-sm text-[#6B7280]">
              所有详情来自 `/review` 返回的真实实体；缺失时显示后端原因，不做本地假加载。
            </p>
          </div>
        </div>
        <button
          onClick={() => void fetchData()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm font-medium text-[#4A5578] hover:bg-[#F8F9FF]"
        >
          <RefreshCw size={15} />
          刷新
        </button>
      </div>

      {stats ? (
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
          {[
            { label: '待审核', value: stats.pending, color: 'text-amber-600' },
            { label: '已通过', value: stats.approved, color: 'text-emerald-600' },
            { label: '已驳回', value: stats.rejected, color: 'text-red-600' },
            { label: '待重做', value: stats.rework, color: 'text-indigo-600' },
            { label: '通过率', value: `${stats.approvalRate}%`, color: 'text-[#6C63FF]' },
            {
              label: '平均分',
              value: stats.avgScore !== null ? Math.round(stats.avgScore) : '-',
              color: 'text-[#1A1A2E]',
            },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[#E8E8F0] bg-white p-4 shadow-sm">
              <p className="text-xs text-[#8B93B5]">{item.label}</p>
              <p className={`mt-1 text-xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setStatusFilter(tab.key);
              setPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-[#6C63FF] text-white'
                : 'border border-[#E8E8F0] bg-white text-[#4A5578] hover:bg-[#F8F9FF]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-lg border border-[#E8E8F0] bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[#6C63FF]">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在加载审核数据...
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={() => void fetchData()} className="mt-3 text-sm text-[#6C63FF] underline">
              重试
            </button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8B93B5]">
            <Clock className="mx-auto mb-2 h-8 w-8 text-[#C6CCDA]" />
            当前没有{statusFilter !== 'ALL' ? STATUS_BADGE[statusFilter].label : ''}任务
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F8] bg-[#FAFBFF] text-left text-xs text-[#8B93B5]">
                  <th className="px-5 py-3 font-medium">类型</th>
                  <th className="px-5 py-3 font-medium">实体 ID</th>
                  <th className="px-5 py-3 font-medium">实体状态</th>
                  <th className="px-5 py-3 font-medium">一致性分</th>
                  <th className="px-5 py-3 font-medium">审核状态</th>
                  <th className="px-5 py-3 font-medium">创建时间</th>
                  <th className="px-5 py-3 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="cursor-pointer border-b border-[#F0F0F8] last:border-0 hover:bg-[#FAFAFF]"
                    onClick={() => setSelectedTask(task)}
                  >
                    <td className="px-5 py-3 font-medium text-[#1A1A2E]">
                      {ENTITY_LABEL[task.entityType] ?? task.entityType}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[#6B7280]">
                      {task.entityId.slice(0, 12)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                        task.entityAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                      }`}>
                        {task.entityAvailable ? '已关联' : '缺失'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {task.score !== null ? (
                        <span className={task.score >= task.threshold ? 'font-semibold text-emerald-600' : 'font-semibold text-red-600'}>
                          {task.score}
                        </span>
                      ) : (
                        <span className="text-[#8B93B5]">-</span>
                      )}
                      <span className="ml-1 text-xs text-[#B0B7C8]">/ {task.threshold}</span>
                    </td>
                    <td className="px-5 py-3">
                        <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${statusBadgeFor(task).cls}`}>
                          {statusBadgeFor(task).label}
                          {task.autoApproved ? ' · 自动' : ''}
                        </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-[#6B7280]">{formatDate(task.createdAt)}</td>
                    <td className="px-5 py-3 text-right">
                      {task.status === 'PENDING' || task.status === 'REWORK' ? (
                        <div className="flex justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                          {!canApproveTask(task) ? (
                            <button
                              onClick={() => setSelectedTask(task)}
                              title={task.entityType === 'PRODUCT_RESEARCH' ? '预览选品' : '查看失败原因'}
                              className="rounded-lg p-1.5 text-[#6C63FF] hover:bg-[#F0EEFF]"
                            >
                              <Eye size={16} />
                            </button>
                          ) : (
                            <button
                              disabled={updatingId === task.id}
                              onClick={() => requestAction(task, 'APPROVED')}
                              title="通过"
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                            >
                              <CheckCircle2 size={16} />
                            </button>
                          )}
                          <button
                            disabled={updatingId === task.id}
                            onClick={() => requestAction(task, 'REJECTED')}
                            title="驳回"
                            className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                          >
                            <XCircle size={16} />
                          </button>
                          <button
                            disabled={updatingId === task.id}
                            onClick={() => requestAction(task, 'REWORK')}
                            title="要求重做"
                            className="rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                          >
                            <RotateCcw size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-[#B0B7C8]">已处理</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && total > limit ? (
          <div className="flex items-center justify-between border-t border-[#F0F0F8] px-5 py-3 text-sm">
            <span className="text-xs text-[#8B93B5]">
              共 {total} 条 · 第 {page}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
                className="rounded-lg border border-[#E8E8F0] px-3 py-1 text-xs text-[#4A5578] disabled:opacity-40"
              >
                上一页
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                className="rounded-lg border border-[#E8E8F0] px-3 py-1 text-xs text-[#4A5578] disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <Modal
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title="审核详情"
        width={selectedTask?.entityType === 'PRODUCT_RESEARCH' ? 'max-w-5xl' : 'max-w-3xl'}
      >
        {selectedTask ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
              <div>
                <span className="text-xs text-[#8B93B5]">类型</span>
                <p className="font-medium text-[#1A1A2E]">{ENTITY_LABEL[selectedTask.entityType] ?? selectedTask.entityType}</p>
              </div>
              <div>
                <span className="text-xs text-[#8B93B5]">状态</span>
                <p>
                  <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${statusBadgeFor(selectedTask).cls}`}>
                    {statusBadgeFor(selectedTask).label}
                  </span>
                </p>
              </div>
              <div>
                <span className="text-xs text-[#8B93B5]">一致性分</span>
                <p className="font-medium text-[#1A1A2E]">
                  {selectedTask.score !== null ? selectedTask.score : '-'}
                  <span className="ml-1 text-xs text-[#B0B7C8]">/ {selectedTask.threshold}</span>
                </p>
              </div>
              <div>
                <span className="text-xs text-[#8B93B5]">创建时间</span>
                <p className="font-medium text-[#1A1A2E]">{formatDate(selectedTask.createdAt)}</p>
              </div>
              <div className="md:col-span-2">
                <span className="text-xs text-[#8B93B5]">实体 ID</span>
                <p className="break-all font-mono text-xs text-[#1A1A2E]">{selectedTask.entityId}</p>
              </div>
              {selectedTask.notes ? (
                <div className="md:col-span-2">
                  <span className="text-xs text-[#8B93B5]">备注</span>
                  <p className="text-sm text-[#1A1A2E]">{selectedTask.notes}</p>
                </div>
              ) : null}
            </div>

            {selectedTask.entityType === 'PRODUCT_RESEARCH' && selectedTask.productResearchPreview ? (
              <ProductResearchLaunchPanel
                key={selectedTask.id}
                preview={selectedTask.productResearchPreview}
                reviewStatus={selectedTask.status}
                disabled={updatingId === selectedTask.id}
                onConfirm={(candidateId, referenceAssetId, ozonPublication) =>
                  handleProductLaunch(
                    selectedTask,
                    candidateId,
                    referenceAssetId,
                    ozonPublication,
                  )
                }
                onPublish={(launchId) =>
                  handleProductPublish(selectedTask, launchId)
                }
              />
            ) : (
            <div className="rounded-lg border border-[#E8E8F0] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#1A1A2E]">真实实体详情</h3>
                  <p className="mt-1 text-xs text-[#8B93B5]">
                    数据来自后端 `/review` 的实体补全字段。
                  </p>
                </div>
                <span className={`rounded-md px-2 py-1 text-[11px] font-medium ${
                  selectedTask.entityAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}>
                  {selectedTask.entityAvailable ? '可加载' : '不可加载'}
                </span>
              </div>

              {!selectedTask.entityAvailable ? (
                <div className="rounded-lg border border-dashed border-[#FFD6D6] bg-[#FFF5F5] p-4 text-xs leading-5 text-red-600">
                  {selectedTask.entityLoadError ?? '后端没有返回该审核任务的关联实体。'}
                </div>
              ) : previewImages.length > 0 ? (
                <div>
                  <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {previewImages.map((image) => (
                      <div key={`${image.url}-${image.label}`} className="overflow-hidden rounded-lg border border-[#E8E8F0]">
                        <img src={image.url} alt={image.label} className="aspect-square w-full bg-[#F8F9FF] object-cover" />
                        <p className="truncate px-2 py-1 text-[10px] text-[#8B93B5]">{image.label}</p>
                      </div>
                    ))}
                  </div>
                  {typeof consistencyScore === 'number' ? (
                    <div className="text-xs text-[#6B7280]">
                      全局一致性分：
                      <span className={`ml-1 font-semibold ${
                        consistencyScore >= selectedTask.threshold ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {consistencyScore}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : selectedTask.agentRun ? (
                <div className="space-y-3">
                  <div className={`border p-4 ${
                    selectedTask.agentRun.status === 'COMPLETED'
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-red-200 bg-red-50'
                  }`}>
                    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                      <div>
                        <span className="text-[#8B93B5]">任务状态</span>
                        <p className="mt-1 font-semibold text-[#1A1A2E]">
                          {AGENT_RUN_STATUS_LABEL[selectedTask.agentRun.status] ?? selectedTask.agentRun.status}
                        </p>
                      </div>
                      <div>
                        <span className="text-[#8B93B5]">智能体类型</span>
                        <p className="mt-1 font-semibold text-[#1A1A2E]">{selectedTask.agentRun.agentType}</p>
                      </div>
                    </div>
                    {selectedTask.agentRun.status !== 'COMPLETED' ? (
                      <div className="mt-3 border-t border-red-200 pt-3">
                        <p className="text-xs font-semibold text-red-700">不能通过本次任务</p>
                        <p className="mt-1 text-sm leading-6 text-red-700">
                          {agentRunFailureMessage(selectedTask.agentRun, '智能体没有返回可审核的结果。')}
                        </p>
                        {selectedTask.agentRun.errorCode ? (
                          <p className="mt-2 text-[11px] text-red-500">
                            诊断代码：{selectedTask.agentRun.errorCode}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs leading-5 text-[#6B7280]">
                          请修正数据源、关键词或模型配置后选择“重新执行”。系统不会生成报告、商品或上架任务。
                        </p>
                      </div>
                    ) : null}
                  </div>
                  {selectedTask.agentRun.output && Object.keys(asRecord(selectedTask.agentRun.output)).length > 0 ? (
                    <div className="border border-[#E8E8F0] bg-white p-3">
                      <p className="mb-2 text-xs font-semibold text-[#1A1A2E]">任务结果</p>
                      <StructuredResult data={asRecord(selectedTask.agentRun.output)} entityType={selectedTask.entityType} />
                    </div>
                  ) : (
                    <div className="border border-dashed border-[#E8E8F0] bg-[#F8F9FF] p-4 text-xs text-[#6B7280]">
                      本次任务没有可供客户审批的结果。
                    </div>
                  )}
                </div>
              ) : selectedTask.imageProject ? (
                <div className="rounded-lg bg-[#F8F9FF] p-3 text-sm text-[#4A5578]">
                  <p className="font-medium text-[#1A1A2E]">{selectedTask.imageProject.title}</p>
                  <p className="mt-1 text-xs text-[#8B93B5]">
                    状态：{selectedTask.imageProject.status}
                  </p>
                  {selectedTask.imageProject.prompt ? (
                    <p className="mt-2 text-xs leading-5">{selectedTask.imageProject.prompt}</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] p-4 text-xs text-[#8B93B5]">
                  实体存在，但该类型没有可视化预览字段。
                </div>
              )}
            </div>
            )}

            {selectedTask.entityType === 'SUPPLY_PLAN' && selectedTask.supplyPlan ? (
              <div className="border border-[#E8E8F0] bg-[#FAFAFF] p-4 text-sm">
                <h3 className="font-semibold text-[#1A1A2E]">补货计划预览</h3>
                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div><span className="text-xs text-[#8B93B5]">SKU</span><p className="font-medium">{selectedTask.supplyPlan.supplySku.sku}</p></div>
                  <div><span className="text-xs text-[#8B93B5]">供应商</span><p className="font-medium">{selectedTask.supplyPlan.supplySku.supplier.name}</p></div>
                  <div><span className="text-xs text-[#8B93B5]">建议数量</span><p className="font-medium">{selectedTask.supplyPlan.recommendedQty}</p></div>
                  <div><span className="text-xs text-[#8B93B5]">申请数量</span><p className="font-medium">{selectedTask.supplyPlan.requestedQty}</p></div>
                </div>
                <p className="mt-3 text-xs leading-5 text-amber-700">批准只更新本地补货计划，不创建采购订单，也不写入 Ozon。</p>
              </div>
            ) : null}

            {(selectedTask.status === 'PENDING' || selectedTask.status === 'REWORK') && selectedTask.entityType !== 'PRODUCT_RESEARCH' ? (
              <div className="flex flex-col gap-2 border-t border-[#F0F0F8] pt-4 sm:flex-row">
                {canApproveTask(selectedTask) ? (
                  <button
                    disabled={updatingId === selectedTask.id}
                    onClick={() => requestAction(selectedTask, 'APPROVED')}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                  >
                    <CheckCircle2 size={15} />
                    通过
                  </button>
                ) : null}
                <button
                  disabled={updatingId === selectedTask.id}
                  onClick={() => requestAction(selectedTask, 'REJECTED')}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <XCircle size={15} />
                  {isFailedOrIncompleteAgentReview(selectedTask) ? '确认不可用' : '驳回'}
                </button>
                <button
                  disabled={updatingId === selectedTask.id}
                  onClick={() => requestAction(selectedTask, 'REWORK')}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 px-4 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                >
                  <RotateCcw size={15} />
                  {isFailedOrIncompleteAgentReview(selectedTask) ? '重新执行' : '要求重做'}
                </button>
              </div>
            ) : null}
            {(selectedTask.status === 'PENDING' || selectedTask.status === 'REWORK') && selectedTask.entityType === 'PRODUCT_RESEARCH' ? (
              <div className="flex flex-col gap-2 border-t border-[#F0F0F8] pt-4 sm:flex-row">
                <button
                  disabled={updatingId === selectedTask.id}
                  onClick={() => requestAction(selectedTask, 'REJECTED')}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-red-200 px-4 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <XCircle size={15} />
                  驳回本次选品
                </button>
                <button
                  disabled={updatingId === selectedTask.id}
                  onClick={() => requestAction(selectedTask, 'REWORK')}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 px-4 text-sm font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                >
                  <RotateCcw size={15} />
                  要求重新选品
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(noteDialog)}
        onClose={closeNoteDialog}
        title={noteDialog?.status === 'REJECTED' ? '驳回原因' : '重新选品说明'}
        width="max-w-lg"
      >
        <form className="space-y-4" onSubmit={submitNotes}>
          <p className="text-sm leading-6 text-[#4A5578]">
            {noteDialog?.status === 'REJECTED'
              ? '请说明本次选品不能通过的原因。该反馈会写入店铺记忆，供后续选品避开相同问题。'
              : '请说明需要重新选品的条件。该反馈会写入店铺记忆，供智能体重新检索。'}
          </p>
          <label className="block text-sm font-medium text-[#334155]">
            审核意见（可选）
            <textarea
              autoFocus
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              rows={5}
              maxLength={500}
              placeholder={noteDialog?.status === 'REJECTED' ? '例如：不符合目标类目、利润空间不足、存在禁售风险' : '例如：限定目标类目、补充可核验价格证据、排除特定功能'}
              className="mt-1.5 w-full resize-y border border-[#D8DCEB] px-3 py-2 text-sm outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15"
            />
            <span className="mt-1 block text-right text-xs font-normal text-[#8B93B5]">{reviewNotes.length}/500</span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeNoteDialog}
              disabled={Boolean(updatingId)}
              className="h-9 rounded-lg border border-[#DDE1F2] px-4 text-sm font-medium text-[#4A5578] hover:bg-[#F8F9FF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={Boolean(updatingId)}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#6C63FF] px-4 text-sm font-medium text-white hover:bg-[#5B52EE] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updatingId ? <Loader2 size={15} className="animate-spin" /> : null}
              确认提交
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
