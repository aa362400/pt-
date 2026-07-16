import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Copy, KeyRound, Loader2, ShieldX } from 'lucide-react';
import {
  mcpToolsApi,
  type AgentCapabilityToken,
  type AgentProxyAction,
  type IssuedAgentCapabilityToken,
} from '../../api/mcpTools';
import { useToast } from '../ui/use-toast';

export function CapabilityTokensPanel({
  actions,
}: {
  actions: AgentProxyAction[];
}) {
  const { addToast } = useToast();
  const [items, setItems] = useState<AgentCapabilityToken[]>([]);
  const [action, setAction] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [description, setDescription] = useState('本地智能体临时调用');
  const [ttlMinutes, setTtlMinutes] = useState(5);
  const [issued, setIssued] = useState<IssuedAgentCapabilityToken | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const allowedActions = useMemo(
    () => actions.filter((item) => item.permission.allowed),
    [actions],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await mcpToolsApi.listCapabilityTokens());
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : '能力令牌加载失败',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!action && allowedActions[0]) setAction(allowedActions[0].name);
  }, [action, allowedActions]);

  const issue = async () => {
    if (!action) return;
    setSubmitting(true);
    try {
      const result = await mcpToolsApi.issueCapabilityToken({
        actions: [action],
        ttlSeconds: Math.max(1, Math.min(60, ttlMinutes)) * 60,
        workspaceId: workspaceId.trim() || undefined,
        description: description.trim() || undefined,
      });
      setIssued(result);
      await refresh();
      addToast('能力令牌已签发，原始值只显示这一次', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '令牌签发失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await mcpToolsApi.revokeCapabilityToken(id);
      await refresh();
      addToast('能力令牌已撤销', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '令牌撤销失败', 'error');
    }
  };

  const copyToken = async () => {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.token);
    addToast('一次性令牌已复制', 'success');
  };

  return (
    <section className="border-y border-[#DDE1F2] bg-white">
      <div className="grid gap-5 px-5 py-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
        <div>
          <div className="mb-4 flex items-center gap-2">
            <KeyRound size={17} className="text-[#6C63FF]" />
            <div>
              <h2 className="text-sm font-semibold text-[#1A1A2E]">智能体能力令牌</h2>
              <p className="mt-0.5 text-xs text-[#8B93B5]">
                按组织、工作区、动作和有效期限制公开 Agent 调用
              </p>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs text-[#4A5578]">允许动作</span>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value)}
                className="h-9 w-full rounded-md border border-[#DDE1F2] bg-white px-2.5 text-sm"
              >
                {allowedActions.map((item) => (
                  <option key={item.name} value={item.name}>{item.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[#4A5578]">有效期（分钟）</span>
              <input
                type="number"
                min={1}
                max={60}
                value={ttlMinutes}
                onChange={(event) => setTtlMinutes(Number(event.target.value))}
                className="h-9 w-full rounded-md border border-[#DDE1F2] px-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[#4A5578]">工作区 ID（可选）</span>
              <input
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                className="h-9 w-full rounded-md border border-[#DDE1F2] px-2.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[#4A5578]">用途</span>
              <input
                value={description}
                maxLength={200}
                onChange={(event) => setDescription(event.target.value)}
                className="h-9 w-full rounded-md border border-[#DDE1F2] px-2.5 text-sm"
              />
            </label>
          </div>
          <button
            onClick={() => void issue()}
            disabled={submitting || !action}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-[#6C63FF] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            签发临时令牌
          </button>
          {issued ? (
            <div className="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3">
              <p className="text-xs font-semibold text-amber-900">只显示一次，请立即复制</p>
              <div className="mt-2 flex gap-2">
                <code className="min-w-0 flex-1 break-all rounded bg-white px-2 py-2 text-xs text-[#1A1A2E]">
                  {issued.token}
                </code>
                <button
                  onClick={() => void copyToken()}
                  title="复制令牌"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-white text-amber-800"
                >
                  <Copy size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#4A5578]">最近令牌</h3>
            <button onClick={() => void refresh()} className="text-xs text-[#6C63FF]">刷新</button>
          </div>
          {loading ? (
            <div className="flex h-28 items-center justify-center"><Loader2 size={16} className="animate-spin text-[#6C63FF]" /></div>
          ) : items.length === 0 ? (
            <div className="flex h-28 items-center justify-center border border-dashed border-[#DDE1F2] text-xs text-[#8B93B5]">尚未签发能力令牌</div>
          ) : (
            <div className="max-h-72 space-y-2 overflow-auto pr-1">
              {items.map((item) => {
                const inactive = Boolean(item.revokedAt) || new Date(item.expiresAt).getTime() <= Date.now();
                return (
                  <div key={item.id} className="flex items-start gap-3 border-b border-[#EEF0F7] px-1 py-2.5 last:border-0">
                    <Clock3 size={15} className="mt-0.5 shrink-0 text-[#8B93B5]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-[#1A1A2E]">{item.actions.join(', ')}</p>
                      <p className="mt-1 text-[11px] text-[#8B93B5]">
                        {inactive ? (item.revokedAt ? '已撤销' : '已过期') : `到期 ${new Date(item.expiresAt).toLocaleString('zh-CN', { hour12: false })}`}
                      </p>
                    </div>
                    {!inactive ? (
                      <button
                        onClick={() => void revoke(item.id)}
                        title="撤销令牌"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-red-200 text-red-600"
                      >
                        <ShieldX size={14} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
