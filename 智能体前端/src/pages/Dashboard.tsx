import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Package,
  RefreshCw,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dashboardApi, type DashboardCounts, type DashboardHotProducts, type DashboardPipeline, type DashboardProfitSummary, type DashboardRecentActivity, type DashboardTrendSummaries } from '../api/dashboard';
import { agentHealthApi, type AgentHealthSnapshot } from '../api/agentHealth';
import { channelsApi, type ChannelConnection } from '../api/channels';
import { api } from '../api/client';
import { reviewApi, type ReviewTask } from '../api/review';
import AssistantPanel from '../components/ui/AssistantPanel';
import { useToast } from '../components/ui/use-toast';
import { useAutoRefresh } from '../hooks/useAutoRefresh';
import { agentTypeLabel, executionStatusLabel } from '../utils/customer-facing-language';

interface Message { role: 'user' | 'assistant'; content: string }
interface DashboardAgentRun { id: string; status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'; output?: { reply?: string; response?: string } | null; errorMessage?: string | null }
type PendingReviewsState = 'loading' | 'ready' | 'error';

const emptyCounts: DashboardCounts = { products: 0, listings: 0, agentRuns: 0, activeTasks: 0, unreadNotifications: 0, openAlerts: 0 };
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

async function waitForRun(id: string): Promise<DashboardAgentRun> {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const run = await api.get<DashboardAgentRun>(`/agent-runs/${id}`);
    if (run.status === 'COMPLETED') return run;
    if (run.status === 'FAILED') throw new Error(run.errorMessage || '智能体任务执行失败');
    await sleep(1000);
  }
  throw new Error('智能体任务等待超时');
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

const REVIEW_ENTITY_LABELS: Record<ReviewTask['entityType'], string> = {
  AGENT_RUN: '智能体任务',
  IMAGE_GENERATION: '商品图片',
  LISTING_DRAFT: '商品刊登',
  PRODUCT_RESEARCH: '选品结果',
  SUPPLY_PLAN: '补货计划',
};

function pendingReviewTitle(task: ReviewTask): string {
  const entityLabel = REVIEW_ENTITY_LABELS[task.entityType];
  const subject = task.entityType === 'IMAGE_GENERATION'
    ? task.imageProject?.title
    : task.entityType === 'PRODUCT_RESEARCH'
      ? task.productResearchPreview?.query
      : task.entityType === 'SUPPLY_PLAN'
        ? task.supplyPlan?.supplySku.productName
        : null;

  return subject ? `${entityLabel}：${subject}` : `${entityLabel}待确认`;
}

function Dashboard({ tab }: { tab?: string }) {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [counts, setCounts] = useState(emptyCounts);
  const [activity, setActivity] = useState<DashboardRecentActivity | null>(null);
  const [trends, setTrends] = useState<DashboardTrendSummaries | null>(null);
  const [hotProducts, setHotProducts] = useState<DashboardHotProducts | null>(null);
  const [profit, setProfit] = useState<DashboardProfitSummary | null>(null);
  const [pipeline, setPipeline] = useState<DashboardPipeline | null>(null);
  const [health, setHealth] = useState<AgentHealthSnapshot | null>(null);
  const [channels, setChannels] = useState<ChannelConnection[]>([]);
  const [pendingReviewTasks, setPendingReviewTasks] = useState<ReviewTask[]>([]);
  const [pendingReviewsTotal, setPendingReviewsTotal] = useState(0);
  const [pendingReviewsState, setPendingReviewsState] = useState<PendingReviewsState>('loading');
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7' | '30' | '90'>('7');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const [
      countsResult,
      activityResult,
      trendsResult,
      hotProductsResult,
      profitResult,
      healthResult,
      channelsResult,
      pendingReviewsResult,
      pipelineResult,
    ] = await Promise.allSettled([
      dashboardApi.getCounts(), dashboardApi.getRecentActivity(), dashboardApi.getTrendSummaries(),
      dashboardApi.getHotProducts(), dashboardApi.getProfitSummary(), agentHealthApi.get(),
      channelsApi.list({ limit: 20 }), reviewApi.list({ status: 'PENDING', limit: 4 }),
      dashboardApi.getPipeline(),
    ]);
    if (countsResult.status === 'fulfilled') setCounts(countsResult.value);
    if (activityResult.status === 'fulfilled') setActivity(activityResult.value);
    if (trendsResult.status === 'fulfilled') setTrends(trendsResult.value);
    if (hotProductsResult.status === 'fulfilled') setHotProducts(hotProductsResult.value);
    if (profitResult.status === 'fulfilled') setProfit(profitResult.value);
    if (healthResult.status === 'fulfilled') setHealth(healthResult.value);
    if (channelsResult.status === 'fulfilled') setChannels(channelsResult.value.items);
    if (pendingReviewsResult.status === 'fulfilled') {
      setPendingReviewTasks(pendingReviewsResult.value.items);
      setPendingReviewsTotal(pendingReviewsResult.value.total);
      setPendingReviewsState('ready');
    } else {
      setPendingReviewTasks([]);
      setPendingReviewsTotal(0);
      setPendingReviewsState('error');
    }
    if (pipelineResult.status === 'fulfilled') setPipeline(pipelineResult.value);
    const results = [countsResult, activityResult, trendsResult, hotProductsResult, profitResult, healthResult, channelsResult, pendingReviewsResult, pipelineResult];
    if (!silent && results.some((result) => result.status === 'rejected')) addToast('部分真实数据接口暂时不可用，未使用模拟数据填充。', 'warning');
    setLoading(false);
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(() => load(true), 15000);

  useEffect(() => {
    if (tab === 'opportunity') document.getElementById('dashboard-opportunities')?.scrollIntoView({ behavior: 'smooth' });
    if (tab === 'hot-products') document.getElementById('dashboard-products')?.scrollIntoView({ behavior: 'smooth' });
  }, [tab]);

  const chartData = useMemo(() => {
    const source = trends?.recentTrends ?? [];
    const limit = Number(period);
    return source.slice(0, limit).reverse().map((item) => ({ date: formatTime(item.observedAt).slice(0, 5), score: item.score, keyword: item.keyword }));
  }, [trends, period]);

  const ozon = channels.find((channel) => channel.provider === 'OZON');
  const modelAvailable = health?.connection === 'connected' && health.llm.status === 'available';
  const pendingReviewsDetail = pendingReviewsState === 'loading'
    ? '正在读取待审批任务'
    : pendingReviewsState === 'error'
      ? '审批数据暂时不可用'
      : pendingReviewsTotal === 0
        ? '0 个动作等待确认'
        : `${pendingReviewsTotal} 个动作等待确认`;
  const metrics = [
    { label: '待你处理', value: pipeline?.summary.needsAttention ?? 0, delta: pipeline ? `${pipeline.summary.blocked} 件阻塞` : '流水线', icon: Clock3, tone: 'bg-amber-50 text-amber-600' },
    { label: '商品总数', value: counts.products, delta: hotProducts?.sourceLabel || '商品目录', icon: Package, tone: 'bg-blue-50 text-blue-600' },
    { label: '刊登草稿', value: counts.listings, delta: '本地记录', icon: FileText, tone: 'bg-violet-50 text-violet-600' },
    { label: '智能体运行', value: counts.agentRuns, delta: '真实任务', icon: Bot, tone: 'bg-cyan-50 text-cyan-600' },
    { label: '进行中任务', value: counts.activeTasks, delta: '实时状态', icon: Activity, tone: 'bg-green-50 text-green-600' },
    { label: '未读通知', value: counts.unreadNotifications, delta: '通知中心', icon: Bell, tone: 'bg-orange-50 text-orange-600' },
    { label: '待处理异常', value: counts.openAlerts, delta: '需检查', icon: AlertTriangle, tone: 'bg-red-50 text-red-600' },
    { label: '利润测算', value: profit?.calculationCount ?? 0, delta: profit?.sampleState === 'real_samples' ? '真实测算' : '暂无样本', icon: TrendingUp, tone: 'bg-emerald-50 text-emerald-600' },
  ];

  const sendMessage = async (message: string) => {
    setMessages((items) => [...items, { role: 'user', content: message }]);
    try {
      const created = await api.post<DashboardAgentRun>('/agent-runs', { agentType: 'GENERAL_ASSISTANT', input: { assistantId: 'dashboard-assistant', prompt: message } });
      const run = created.status === 'COMPLETED' ? created : await waitForRun(created.id);
      const reply = run.output?.reply || run.output?.response || '智能体已完成任务，但未返回文本结果。';
      setMessages((items) => [...items, { role: 'assistant', content: reply }]);
      void load(true);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : '智能体调用失败';
      setMessages((items) => [...items, { role: 'assistant', content: `执行失败：${messageText}` }]);
    }
  };

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8" aria-label="真实业务指标">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="min-h-[118px] min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2"><span className={`grid h-8 w-8 place-items-center rounded-md ${metric.tone}`}><Icon size={17} /></span><span className="text-[10px] font-medium text-emerald-600">真实接口</span></div>
              <p className="mt-3 text-2xl font-bold text-slate-900">{loading ? '—' : metric.value.toLocaleString('zh-CN')}</p>
              <div className="mt-1 flex min-w-0 items-center justify-between gap-2"><span className="shrink-0 text-[11px] text-slate-500">{metric.label}</span><span className="min-w-0 truncate text-[9px] text-slate-400">{metric.delta}</span></div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.75fr)]">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start gap-3"><div><h2 className="text-base font-bold text-slate-900">Ozon 趋势证据得分</h2><p className="mt-1 text-xs text-slate-500">仅显示后端返回的真实趋势观察，不生成模拟销售额</p></div><div className="ml-auto flex rounded-md bg-slate-100 p-1">{(['7', '30', '90'] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={`h-8 rounded px-3 text-xs ${period === value ? 'bg-blue-600 font-semibold text-white' : 'text-slate-500'}`}>{value}天</button>)}</div></div>
          <div className="mt-5 h-[280px]">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={0.28}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e8edf5" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}/><YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}/><Area type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2.5} fill="url(#trendFill)" name="趋势得分"/></AreaChart></ResponsiveContainer>
            ) : <EmptyState icon={BarChart3} title="暂无真实趋势样本" detail="完成 Ozon 真实调研并通过证据门禁后，这里才会显示趋势。" />}
          </div>
        </article>

        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-bold text-slate-900">智能体运行中心</h2><p className="mt-1 text-xs text-slate-500">模型、任务与权限真实状态</p></div><button type="button" onClick={() => void load()} aria-label="刷新" className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"><RefreshCw size={15} /></button></div>
          <div className="mt-4 space-y-3">
            <AgentStatus name="主运营智能体" detail={health?.llm.model || '尚未返回模型名称'} active={modelAvailable} statusLabel={modelAvailable ? '已连接' : '未连接'} />
            <AgentStatus name="任务执行器" detail={`${counts.activeTasks} 个任务运行中`} active={counts.activeTasks > 0} statusLabel={counts.activeTasks > 0 ? '运行中' : '待命'} />
            <AgentStatus name="Ozon 数据通道" detail={ozon ? `同步状态：${executionStatusLabel(ozon.syncStatus)}` : '尚未连接真实卖家接口（Seller API）'} active={Boolean(ozon && ozon.syncStatus !== 'DISCONNECTED')} statusLabel={ozon && ozon.syncStatus !== 'DISCONNECTED' ? '已连接' : '未连接'} />
            <AgentStatus name="人工审核门禁" detail={pendingReviewsDetail} active={pendingReviewsState === 'ready' && pendingReviewsTotal > 0} statusLabel={pendingReviewsState === 'error' ? '未知' : pendingReviewsTotal > 0 ? '待处理' : '已清空'} />
          </div>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">智能体最近活动</h2><p className="mt-1 text-xs text-slate-500">真实运行与审计记录</p></div><Activity size={18} className="text-blue-600" /></div>
          <div className="mt-4 divide-y divide-slate-100">
            {activity?.recentAgentRuns.length ? activity.recentAgentRuns.slice(0, 5).map((item) => <ActivityRow key={item.id} title={agentTypeLabel(item.agentType)} time={formatTime(item.createdAt)} status={item.status} />) : <EmptyState icon={Clock3} title="暂无智能体活动" detail="运行真实任务后自动记录。" compact />}
          </div>
        </article>

        <article id="dashboard-opportunities" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">等待你的确认</h2><p className="mt-1 text-xs text-slate-500">关键操作不会自动写入平台</p></div><button type="button" onClick={() => navigate('/review')} className="text-xs font-semibold text-blue-600">查看全部</button></div>
          <div className="mt-4 divide-y divide-slate-100">
            {pendingReviewsState === 'error' ? (
              <EmptyState icon={AlertTriangle} title="审批数据暂时不可用" detail="真实审批接口读取失败，请刷新后重试。" compact />
            ) : pendingReviewTasks.length ? pendingReviewTasks.map((task) => (
              <button key={task.id} type="button" onClick={() => navigate(`/review?task=${encodeURIComponent(task.id)}`)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-amber-50 text-amber-600"><CheckCircle2 size={16}/></span>
                <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-800">{pendingReviewTitle(task)}</strong><span className="mt-1 block truncate text-[10px] text-slate-500">真实审批任务 · {formatTime(task.createdAt)}</span></span>
              </button>
            )) : <EmptyState icon={CheckCircle2} title="暂无待确认任务" detail="当前真实审批任务为 0。" compact />}
          </div>
        </article>

        <article id="dashboard-products" className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="text-base font-bold text-slate-900">平台与商品数据</h2><p className="mt-1 text-xs text-slate-500">真实连接和目录同步状态</p></div><button type="button" onClick={() => navigate('/store-monitor')} className="text-xs font-semibold text-blue-600">管理连接</button></div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-slate-200 p-3"><span className="grid h-9 w-9 place-items-center rounded-md bg-[#005BFF] text-xs font-bold text-white">O</span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">Ozon</strong><span className="mt-1 block truncate text-[10px] text-slate-500">{ozon ? `同步：${executionStatusLabel(ozon.syncStatus)}` : '未连接真实接口（API）'}</span></span><span className={`text-[10px] font-semibold ${ozon ? 'text-emerald-600' : 'text-amber-600'}`}>{ozon ? '已配置' : '待连接'}</span></div>
            <div className="grid grid-cols-3 divide-x divide-slate-100 rounded-md border border-slate-200 py-3 text-center"><Stat value={counts.products} label="商品"/><Stat value={hotProducts?.items.length ?? 0} label="已同步样本"/><Stat value={counts.openAlerts} label="异常"/></div>
            <p className="text-[10px] leading-5 text-slate-500">数据源：{hotProducts?.sourceLabel || '后端未返回商品目录来源'}。没有数据时保持空状态，不使用模型常识补全。</p>
          </div>
        </article>
      </section>

      <button type="button" aria-label="打开智能体助手" onClick={() => setAssistantOpen(true)} className="ml-auto grid h-13 w-13 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-xl shadow-blue-900/25 md:fixed md:bottom-5 md:right-5 md:z-40"><Sparkles size={22}/></button>
      {assistantOpen ? <div className="fixed inset-y-0 right-0 z-50 w-full max-w-[420px] border-l border-slate-200 bg-white p-3 shadow-2xl"><button type="button" aria-label="关闭智能体助手" onClick={() => setAssistantOpen(false)} className="absolute right-5 top-5 z-10 grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><X size={17}/></button><AssistantPanel title="GlobalPilot 智能体助手" messages={messages} onSendMessage={(message) => void sendMessage(message)} /></div> : null}
    </div>
  );
}

function AgentStatus({ name, detail, active, statusLabel }: { name: string; detail: string; active: boolean; statusLabel: string }) {
  return <div className="rounded-md border border-slate-200 p-3"><div className="flex items-center gap-3"><span className={`grid h-9 w-9 place-items-center rounded-md ${active ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-400'}`}><Bot size={17}/></span><span className="min-w-0 flex-1"><strong className="block text-xs text-slate-800">{name}</strong><span className="mt-1 block truncate text-[10px] text-slate-500">{detail}</span></span><span className={`flex items-center gap-1 text-[10px] font-semibold ${active ? 'text-emerald-600' : 'text-slate-400'}`}><span className="h-1.5 w-1.5 rounded-full bg-current"/>{statusLabel}</span></div></div>;
}

function ActivityRow({ title, time, status }: { title: string; time: string; status: string }) {
  return <div className="flex items-center gap-3 py-3"><span className="grid h-8 w-8 place-items-center rounded-md bg-blue-50 text-blue-600"><Activity size={15}/></span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-slate-800">{title}</strong><span className="mt-1 block text-[10px] text-slate-500">{time}</span></span><span className={`text-[10px] font-semibold ${status === 'FAILED' ? 'text-red-600' : status === 'COMPLETED' ? 'text-emerald-600' : 'text-amber-600'}`}>{executionStatusLabel(status)}</span></div>;
}

function EmptyState({ icon: Icon, title, detail, compact = false }: { icon: typeof BarChart3; title: string; detail: string; compact?: boolean }) {
  return <div className={`grid place-items-center text-center ${compact ? 'py-7' : 'h-full min-h-48'}`}><Icon size={compact ? 22 : 30} className="text-slate-300"/><strong className="mt-2 text-xs text-slate-600">{title}</strong><p className="mt-1 max-w-sm text-[10px] leading-5 text-slate-400">{detail}</p></div>;
}

function Stat({ value, label }: { value: number; label: string }) { return <div><strong className="block text-base text-slate-900">{value.toLocaleString('zh-CN')}</strong><span className="mt-1 block text-[10px] text-slate-500">{label}</span></div>; }

export default Dashboard;
