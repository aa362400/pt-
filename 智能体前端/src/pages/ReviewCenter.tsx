import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, CheckCircle2, XCircle, RotateCcw, RefreshCw, Clock,
} from 'lucide-react';
import { useToast } from '../components/ui/use-toast.ts';
import { reviewApi } from '../api/review';
import type { ReviewTask, ReviewStats, ReviewStatus } from '../api/review';

const STATUS_TABS: Array<{ key: ReviewStatus | 'ALL'; label: string }> = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' },
  { key: 'REWORK', label: '待重做' },
];

const STATUS_BADGE: Record<ReviewStatus, { label: string; cls: string }> = {
  PENDING: { label: '待审核', cls: 'bg-amber-50 text-amber-600' },
  APPROVED: { label: '已通过', cls: 'bg-emerald-50 text-emerald-600' },
  REJECTED: { label: '已驳回', cls: 'bg-red-50 text-red-500' },
  REWORK: { label: '待重做', cls: 'bg-indigo-50 text-indigo-600' },
};

const ENTITY_LABEL: Record<string, string> = {
  AGENT_RUN: '智能体任务',
  IMAGE_GENERATION: '图像生成',
  LISTING_DRAFT: 'Listing 草稿',
  PRODUCT_RESEARCH: '产品调研',
};

export default function ReviewCenter() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'ALL'>('PENDING');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载审核数据失败');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAction = async (task: ReviewTask, status: 'APPROVED' | 'REJECTED' | 'REWORK') => {
    let notes: string | undefined;
    if (status !== 'APPROVED') {
      const input = window.prompt(status === 'REJECTED' ? '驳回原因（可选）：' : '重做说明（可选）：');
      if (input === null) return;
      notes = input || undefined;
    }
    setUpdatingId(task.id);
    try {
      await reviewApi.update(task.id, { status, notes });
      addToast(
        status === 'APPROVED' ? '已通过审核' : status === 'REJECTED' ? '已驳回' : '已要求重做',
        'success',
      );
      await fetchData();
    } catch (err) {
      addToast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-[#f5f0ff] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100">
            <ClipboardCheck className="h-5 w-5 text-[#6C63FF]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1A1A2E]">人工审核中心</h1>
            <p className="text-xs text-[#8B8B9A]">AI 生成内容的质量审核队列</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2 text-sm text-[#4A5578] hover:bg-[#F8F9FF]"
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-6">
          {[
            { label: '待审核', value: stats.pending, color: 'text-amber-500' },
            { label: '已通过', value: stats.approved, color: 'text-emerald-500' },
            { label: '已驳回', value: stats.rejected, color: 'text-red-500' },
            { label: '待重做', value: stats.rework, color: 'text-indigo-500' },
            { label: '通过率', value: `${stats.approvalRate}%`, color: 'text-[#6C63FF]' },
            {
              label: '平均分',
              value: stats.avgScore !== null ? Math.round(stats.avgScore) : '-',
              color: 'text-[#1A1A2E]',
            },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
              <p className="text-xs text-[#8B8B9A]">{s.label}</p>
              <p className={`mt-1 text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Status tabs */}
      <div className="mb-4 flex gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setStatusFilter(tab.key); setPage(1); }}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              statusFilter === tab.key
                ? 'bg-[#6C63FF] text-white'
                : 'bg-white text-[#4A5578] border border-[#E8E8F0] hover:bg-[#F8F9FF]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-[#6C63FF]">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6C63FF] border-t-transparent" />
            <span className="text-sm">加载中…</span>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-500">{error}</p>
            <button onClick={fetchData} className="mt-3 text-sm text-[#6C63FF] underline">重试</button>
          </div>
        ) : tasks.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8B8B9A]">
            <Clock className="mx-auto mb-2 h-8 w-8 text-[#D1D5DB]" />
            当前没有{statusFilter !== 'ALL' ? STATUS_BADGE[statusFilter as ReviewStatus]?.label : ''}任务
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F8] text-left text-xs text-[#8B8B9A]">
                <th className="px-5 py-3 font-medium">类型</th>
                <th className="px-5 py-3 font-medium">实体 ID</th>
                <th className="px-5 py-3 font-medium">一致性分</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">创建时间</th>
                <th className="px-5 py-3 font-medium">备注</th>
                <th className="px-5 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-b border-[#F0F0F8] last:border-0 hover:bg-[#FAFAFF]">
                  <td className="px-5 py-3 text-[#1A1A2E]">{ENTITY_LABEL[task.entityType] ?? task.entityType}</td>
                  <td className="px-5 py-3 font-mono text-xs text-[#8B8B9A]">{task.entityId.slice(0, 8)}…</td>
                  <td className="px-5 py-3">
                    {task.score !== null ? (
                      <span className={task.score >= task.threshold ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'}>
                        {task.score}
                      </span>
                    ) : (
                      <span className="text-[#8B8B9A]">-</span>
                    )}
                    <span className="ml-1 text-xs text-[#B0B0BE]">/ {task.threshold}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[task.status].cls}`}>
                      {STATUS_BADGE[task.status].label}
                      {task.autoApproved && ' · 自动'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-xs text-[#8B8B9A]">
                    {new Date(task.createdAt).toLocaleString()}
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-3 text-xs text-[#8B8B9A]">{task.notes || '-'}</td>
                  <td className="px-5 py-3 text-right">
                    {task.status === 'PENDING' || task.status === 'REWORK' ? (
                      <div className="flex justify-end gap-1.5">
                        <button
                          disabled={updatingId === task.id}
                          onClick={() => handleAction(task, 'APPROVED')}
                          title="通过"
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                        >
                          <CheckCircle2 size={16} />
                        </button>
                        <button
                          disabled={updatingId === task.id}
                          onClick={() => handleAction(task, 'REJECTED')}
                          title="驳回"
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-40"
                        >
                          <XCircle size={16} />
                        </button>
                        <button
                          disabled={updatingId === task.id}
                          onClick={() => handleAction(task, 'REWORK')}
                          title="要求重做"
                          className="rounded-lg p-1.5 text-indigo-500 hover:bg-indigo-50 disabled:opacity-40"
                        >
                          <RotateCcw size={16} />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[#B0B0BE]">已处理</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && !error && total > limit && (
          <div className="flex items-center justify-between border-t border-[#F0F0F8] px-5 py-3 text-sm">
            <span className="text-xs text-[#8B8B9A]">共 {total} 条 · 第 {page}/{totalPages} 页</span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-[#E8E8F0] px-3 py-1 text-xs text-[#4A5578] disabled:opacity-40"
              >
                上一页
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[#E8E8F0] px-3 py-1 text-xs text-[#4A5578] disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
