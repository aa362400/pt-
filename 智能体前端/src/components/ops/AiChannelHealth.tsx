import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import {
  agentHealthApi,
  type AgentChannelHealthSnapshot,
} from '../../api/agentHealth';
import {
  aiChannelLabel,
  aiChannelStatusLabel,
  aiChannelTone,
  channelPreflightWarnings,
  type AiChannelName,
} from '../../utils/channel-health-presentation';

function useChannelHealth() {
  const [snapshot, setSnapshot] = useState<AgentChannelHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await agentHealthApi.getChannels());
      setError('');
    } catch (reason) {
      setSnapshot(null);
      setError(reason instanceof Error ? reason.message : '无法读取 AI 通道状态');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { snapshot, loading, error, refresh };
}

const channels: AiChannelName[] = ['llm', 'image', 'search'];

export function AiChannelHealthCards() {
  const { snapshot, loading, error, refresh } = useChannelHealth();

  return (
    <div className="border-b border-[#E5E7EB] bg-slate-50 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold text-[#344054]">AI 执行通道预检</h3>
          <p className="mt-1 text-xs text-[#667085]">真实轻量探测结果缓存 5 分钟；图片探测不会消耗生图额度。</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          title="刷新 AI 通道状态"
          className="inline-flex size-8 items-center justify-center border border-[#D0D5DD] bg-white text-[#344054] disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      {error ? <p className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {channels.map((channel) => {
          const state = snapshot?.[channel];
          const status = state?.status ?? 'unknown';
          const Icon = status === 'available' ? CheckCircle2 : status === 'degraded' || status === 'unknown' ? AlertTriangle : XCircle;
          return (
            <div key={channel} className={`border px-4 py-3 ${aiChannelTone(status)}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">{aiChannelLabel(channel)}</span>
                <Icon size={15} />
              </div>
              <div className="mt-2 text-sm font-bold">{loading && !snapshot ? '检查中' : aiChannelStatusLabel(status)}</div>
              <div className="mt-1 truncate text-xs opacity-80">
                {state?.message || state?.provider || '尚无可验证结果'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AiChannelPreflightWarning({
  requiredChannels,
}: {
  requiredChannels: AiChannelName[];
}) {
  const { snapshot, loading, error, refresh } = useChannelHealth();
  const warnings = useMemo(
    () => snapshot ? channelPreflightWarnings(snapshot, requiredChannels) : [],
    [requiredChannels, snapshot],
  );
  if (loading && !snapshot) {
    return <div className="mb-4 border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">正在检查 AI 执行通道，不影响您查看或操作当前页面。</div>;
  }
  if (error) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <span>暂时无法读取 AI 通道状态；操作仍可提交，但可能在执行阶段失败。</span>
        <button type="button" onClick={() => void refresh()} className="font-semibold underline">重新检查</button>
      </div>
    );
  }
  if (warnings.length === 0) return null;
  return (
    <div className="mb-4 border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">AI 通道预检提示</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
          <p className="mt-2 text-xs">提示不会禁用按钮；系统会保留真实部分结果并允许后续重试。</p>
        </div>
      </div>
    </div>
  );
}
