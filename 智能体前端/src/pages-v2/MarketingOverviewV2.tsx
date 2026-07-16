import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Megaphone,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import {
  channelsApi,
  type ChannelConnection,
  type OzonPerformanceOverview,
} from '../api/channels';

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function money(value: number | null | undefined) {
  return value === null || value === undefined
    ? '未返回'
    : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ₽`;
}

export default function MarketingOverviewV2() {
  const [overview, setOverview] = useState<OzonPerformanceOverview | null>(null);
  const [sellerChannels, setSellerChannels] = useState<ChannelConnection[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [performance, channels] = await Promise.all([
        channelsApi.ozonPerformanceOverview(),
        channelsApi.list({ provider: 'OZON', limit: 100 }),
      ]);
      setOverview(performance);
      setSellerChannels(channels.items);
      setWorkspaceId((current) =>
        current || performance.channel?.workspaceId || channels.items[0]?.workspaceId || '',
      );
    } catch (error) {
      setMessage(`广告数据读取失败：${errorMessage(error)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    if (!workspaceId || !clientId.trim() || !clientSecret.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      await channelsApi.connectOzonPerformance({
        workspaceId,
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      setClientSecret('');
      setMessage('Ozon Performance API 已通过真实令牌校验并连接。');
      await load();
    } catch (error) {
      setMessage(`连接失败：${errorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const requestAction = async (
    campaignId: string,
    action: 'ACTIVATE' | 'DEACTIVATE' | 'UPDATE_WEEKLY_BUDGET',
    weeklyBudgetRub?: number,
  ) => {
    const channelId = overview?.channel?.id;
    if (!channelId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const result = await channelsApi.requestOzonCampaignAction(campaignId, {
        channelId,
        action,
        ...(weeklyBudgetRub !== undefined ? { weeklyBudgetRub } : {}),
      });
      setMessage(
        `广告变更已进入通知中心人工确认，审批单 ${result.notificationId}；尚未写入 Ozon。`,
      );
    } catch (error) {
      setMessage(`提交失败：${errorMessage(error)}`);
    } finally {
      setSubmitting(false);
    }
  };

  const cards = useMemo(
    () => [
      {
        label: '广告计划',
        value: String(overview?.summary.campaigns ?? 0),
        icon: Megaphone,
      },
      {
        label: '运行中',
        value: String(overview?.summary.running ?? 0),
        icon: BarChart3,
      },
      { label: '统计消耗', value: money(overview?.summary.spend), icon: Wallet },
      { label: '写入门禁', value: '人工确认', icon: ShieldCheck },
    ],
    [overview],
  );

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">营销广告</h1>
          <p className="mt-1 text-gray-500">
            Ozon Performance API 实时计划、统计与人工确认变更
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" />刷新
        </button>
      </div>

      {message && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {message}
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <card.icon className="mb-3 h-5 w-5 text-blue-600" />
            <div className="text-2xl font-bold text-gray-900">{card.value}</div>
            <div className="mt-1 text-sm text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>

      {!overview?.connected ? (
        <section className="border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="font-bold text-gray-900">连接 Ozon Performance API</h2>
          </div>
          <div className="grid gap-6 p-6 lg:grid-cols-2">
            <div className="space-y-3 text-sm leading-6 text-gray-600">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-orange-600" />
                <p>
                  广告 API 使用独立的服务账号 client_id/client_secret。Seller API
                  的 Client-Id / Api-Key 不能替代广告凭证。
                </p>
              </div>
              <p>{overview?.reason}</p>
              <a
                href="https://docs.ozon.ru/api/performance/"
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline"
              >
                打开 Ozon Performance API 官方文档
              </a>
            </div>
            <div className="space-y-3">
              <label className="block text-sm text-gray-700">
                Ozon 工作区
                <select
                  value={workspaceId}
                  onChange={(event) => setWorkspaceId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="">请选择</option>
                  {sellerChannels.map((channel) => (
                    <option key={channel.id} value={channel.workspaceId}>
                      {channel.externalShopId || channel.workspaceId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-gray-700">
                Performance client_id
                <input
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  autoComplete="off"
                />
              </label>
              <label className="block text-sm text-gray-700">
                Performance client_secret
                <input
                  type="password"
                  value={clientSecret}
                  onChange={(event) => setClientSecret(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  autoComplete="new-password"
                />
              </label>
              <button
                onClick={() => void connect()}
                disabled={
                  submitting || !workspaceId || !clientId.trim() || !clientSecret.trim()
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? '正在真实校验...' : '校验并连接'}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="font-bold text-gray-900">实时广告计划</h2>
              <p className="mt-1 text-xs text-gray-500">
                来源：{overview.source} · 抓取：{new Date(overview.fetchedAt).toLocaleString('zh-CN')}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" />已连接
            </span>
          </div>
          {overview.statisticsError && (
            <div className="border-b border-orange-200 bg-orange-50 px-6 py-3 text-sm text-orange-800">
              计划读取成功，但统计报表失败：{overview.statisticsError}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-3">计划</th>
                  <th className="px-6 py-3">状态</th>
                  <th className="px-6 py-3">计费</th>
                  <th className="px-6 py-3">周预算</th>
                  <th className="px-6 py-3">受控操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {overview.campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{campaign.title}</div>
                      <div className="text-xs text-gray-500">ID {campaign.id}</div>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{campaign.state}</td>
                    <td className="px-6 py-4 text-gray-700">{campaign.paymentType || '未返回'}</td>
                    <td className="px-6 py-4 text-gray-700">
                      <div>{money(campaign.weeklyBudget)}</div>
                      <div className="mt-2 flex w-48 items-center gap-2">
                        <label className="sr-only" htmlFor={`budget-${campaign.id}`}>
                          新周预算（卢布）
                        </label>
                        <input
                          id={`budget-${campaign.id}`}
                          type="number"
                          min="1"
                          step="0.01"
                          value={budgetDrafts[campaign.id] ?? ''}
                          onChange={(event) =>
                            setBudgetDrafts((current) => ({
                              ...current,
                              [campaign.id]: event.target.value,
                            }))
                          }
                          placeholder="新预算"
                          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                        />
                        <button
                          disabled={
                            submitting ||
                            !Number.isFinite(Number(budgetDrafts[campaign.id])) ||
                            Number(budgetDrafts[campaign.id]) <= 0
                          }
                          onClick={() =>
                            void requestAction(
                              campaign.id,
                              'UPDATE_WEEKLY_BUDGET',
                              Number(budgetDrafts[campaign.id]),
                            )
                          }
                          title="提交周预算修改审批"
                          className="rounded border border-blue-200 p-2 text-blue-700 disabled:opacity-40"
                        >
                          <Wallet className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={submitting}
                          onClick={() => void requestAction(campaign.id, 'ACTIVATE')}
                          title="提交启用审批"
                          className="rounded border border-green-200 p-2 text-green-700"
                        >
                          <Play className="h-4 w-4" />
                        </button>
                        <button
                          disabled={submitting}
                          onClick={() => void requestAction(campaign.id, 'DEACTIVATE')}
                          title="提交停用审批"
                          className="rounded border border-orange-200 p-2 text-orange-700"
                        >
                          <Pause className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {overview.campaigns.length === 0 && (
              <div className="p-12 text-center text-sm text-gray-500">
                Ozon 已返回空广告计划列表。
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
