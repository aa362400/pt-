import { useState, useEffect, useCallback } from 'react';
import { ScrollText, RefreshCw, Search } from 'lucide-react';
import { auditLogsApi } from '../api/audit-logs';
import type { AuditLog } from '../api/audit-logs';

function actionBadgeClass(action: string): string {
  if (action.includes('DELETE') || action.includes('REJECT')) return 'bg-red-50 text-red-500';
  if (action.includes('CREATE') || action.includes('APPROVE')) return 'bg-emerald-50 text-emerald-600';
  if (action.includes('UPDATE') || action.includes('REWORK')) return 'bg-amber-50 text-amber-600';
  return 'bg-indigo-50 text-indigo-600';
}

export default function AuditLogViewer() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [resourceType, setResourceType] = useState('');
  const [action, setAction] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 25;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await auditLogsApi.list({
        page,
        limit,
        ...(resourceType ? { resourceType } : {}),
        ...(action ? { action } : {}),
      });
      setLogs(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载审计日志失败');
    } finally {
      setLoading(false);
    }
  }, [page, resourceType, action]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="min-h-screen bg-[#f5f0ff] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100">
            <ScrollText className="h-5 w-5 text-[#6C63FF]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1A1A2E]">审计日志</h1>
            <p className="text-xs text-[#8B8B9A]">组织内全部写操作的完整追踪记录</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2 text-sm text-[#4A5578] hover:bg-[#F8F9FF]"
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2">
          <Search size={14} className="text-[#9CA3AF]" />
          <input
            value={resourceType}
            onChange={(e) => { setResourceType(e.target.value.toUpperCase()); setPage(1); }}
            placeholder="资源类型（如 PRODUCT）"
            className="w-44 bg-transparent text-sm text-[#1A1A2E] placeholder:text-[#B0B0BE] focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2">
          <Search size={14} className="text-[#9CA3AF]" />
          <input
            value={action}
            onChange={(e) => { setAction(e.target.value.toUpperCase()); setPage(1); }}
            placeholder="操作（如 CREATE / DELETE）"
            className="w-48 bg-transparent text-sm text-[#1A1A2E] placeholder:text-[#B0B0BE] focus:outline-none"
          />
        </div>
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
        ) : logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#8B8B9A]">暂无审计记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F8] text-left text-xs text-[#8B8B9A]">
                <th className="px-5 py-3 font-medium">时间</th>
                <th className="px-5 py-3 font-medium">操作</th>
                <th className="px-5 py-3 font-medium">资源类型</th>
                <th className="px-5 py-3 font-medium">资源 ID</th>
                <th className="px-5 py-3 font-medium">操作人</th>
                <th className="px-5 py-3 text-right font-medium">变更详情</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <>
                  <tr key={log.id} className="border-b border-[#F0F0F8] last:border-0 hover:bg-[#FAFAFF]">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-[#8B8B9A]">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${actionBadgeClass(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#1A1A2E]">{log.resourceType}</td>
                    <td className="px-5 py-3 font-mono text-xs text-[#8B8B9A]">
                      {log.resourceId ? `${log.resourceId.slice(0, 8)}…` : '-'}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[#8B8B9A]">
                      {log.actorId ? `${log.actorId.slice(0, 8)}…` : '系统'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {(log.before || log.after) ? (
                        <button
                          onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                          className="text-xs text-[#6C63FF] hover:underline"
                        >
                          {expandedId === log.id ? '收起' : '查看'}
                        </button>
                      ) : (
                        <span className="text-xs text-[#B0B0BE]">-</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === log.id && (
                    <tr key={`${log.id}-detail`} className="border-b border-[#F0F0F8] bg-[#FAFAFF]">
                      <td colSpan={6} className="px-5 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          <div>
                            <p className="mb-1 font-medium text-[#8B8B9A]">变更前</p>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-white p-3 text-[11px] text-[#4A5578]">
                              {log.before ? JSON.stringify(log.before, null, 2) : '—'}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1 font-medium text-[#8B8B9A]">变更后</p>
                            <pre className="max-h-48 overflow-auto rounded-lg bg-white p-3 text-[11px] text-[#4A5578]">
                              {log.after ? JSON.stringify(log.after, null, 2) : '—'}
                            </pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
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
