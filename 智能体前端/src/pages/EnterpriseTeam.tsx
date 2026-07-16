import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, BrainCircuit, CheckCircle2, LoaderCircle, Play, ShieldCheck, Users, XCircle } from 'lucide-react';
import { enterpriseTeamApi, type EnterpriseTeam as TeamReport } from '../api/enterpriseTeam';
import { getAgentRun, type AgentRun } from '../api/agentRuns';
import { workspacesApi, type WorkspaceSummary } from '../api/workspaces';
import { useToast } from '../components/ui/use-toast';

const stateLabel = { available: '可调用', partial: '受限可用', blocked: '未接入' };
const stateClass = { available: 'bg-green-50 text-green-700 border-green-200', partial: 'bg-amber-50 text-amber-700 border-amber-200', blocked: 'bg-red-50 text-red-700 border-red-200' };

export default function EnterpriseTeam() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [team, setTeam] = useState<TeamReport | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [goal, setGoal] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [run, setRun] = useState<AgentRun | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teamResult, workspaceResult] = await Promise.all([enterpriseTeamApi.get(), workspacesApi.list({ limit: 100 })]);
      setTeam(teamResult);
      setWorkspaces(workspaceResult.items);
      setWorkspaceId((current) => current || workspaceResult.items[0]?.id || '');
      setSelected(teamResult.specialists.filter((item) => item.state !== 'blocked').map((item) => item.id));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'AI 团队状态读取失败', 'error');
      setTeam(null);
    } finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!run || !['PENDING', 'RUNNING'].includes(run.status)) return;
    const timer = window.setInterval(() => {
      void getAgentRun(run.id).then((latest) => setRun(latest)).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [run]);
  const selectedCount = useMemo(() => selected.length, [selected]);

  const toggle = (id: string, blocked: boolean) => {
    if (blocked) return;
    setSelected((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };

  const launch = async () => {
    if (goal.trim().length < 8) { addToast('企业目标至少需要 8 个字符', 'error'); return; }
    if (selected.length === 0) { addToast('至少选择一个可用专业 Agent', 'error'); return; }
    setLaunching(true);
    try {
      const result = await enterpriseTeamApi.launch({ goal: goal.trim(), workspaceId: workspaceId || undefined, specialistIds: selected });
      setRun(result.run);
      addToast(`CEO Agent 已创建任务 ${result.run.id}`, 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : '企业目标启动失败', 'error'); }
    finally { setLaunching(false); }
  };

  return <div className="p-0">
    <div className="mb-6"><h1 className="text-2xl font-bold text-gray-900">AI 运营团队</h1><p className="mt-1 text-gray-500">CEO Agent 拆解企业目标，协调专业 Agent、Skill、MCP 和 Connector</p></div>
    {loading && <div className="rounded-lg border border-gray-200 bg-white py-20 text-center text-sm text-gray-500">正在读取真实 Agent 能力...</div>}
    {!loading && !team && <div className="rounded-lg border border-red-200 bg-red-50 py-20 text-center text-sm text-red-700">团队能力读取失败，禁止使用假 Agent。</div>}
    {team && <>
      <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-4"><div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white"><BrainCircuit className="h-6 w-6" /></div><div><h2 className="font-bold text-gray-900">CEO Agent 企业目标</h2><p className="mt-1 text-sm text-gray-500">真实创建 PLANNER AgentRun，不直接执行外部平台写入。</p></div></div>
          <label className="mb-2 block text-sm font-medium text-gray-700">目标工作区</label>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">不指定工作区</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.channelType}</option>)}</select>
          <label className="mb-2 block text-sm font-medium text-gray-700">企业运营目标</label>
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={5} placeholder="例如：分析当前 Ozon 店铺商品，找出三款可优化商品，生成调研和 Listing 草稿，所有外部写入等待我确认。" className="w-full resize-none rounded-md border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-gray-500">已选择 {selectedCount} 个专业 Agent</span><button onClick={() => void launch()} disabled={launching} className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">{launching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}启动 CEO 编排</button></div>
        </div>
        <aside className="rounded-lg border border-blue-100 bg-blue-50 p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-gray-900">执行护栏</h2></div><div className="space-y-3 text-sm text-gray-700"><p>只读分析可自动执行</p><p>报告和本地草稿可自动创建</p><p>发布、改价、库存、广告、退款必须人工确认</p><p>未接入 Connector 的 Agent 禁止选择</p></div><div className="mt-5 rounded-md bg-white px-3 py-3 text-xs text-gray-600">已连接店铺通道：{team.operationSafety.connectedStoreChannels}<br/>外部写入适配器：{team.operationSafety.externalWriteAdapterConnected ? '已连接受控通道' : '未连接'}</div>{run && <div className={`mt-4 rounded-md border p-3 ${run.status === 'FAILED' ? 'border-red-200 bg-red-50' : run.status === 'COMPLETED' ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-white'}`}><div className={`flex items-center gap-2 text-sm font-medium ${run.status === 'FAILED' ? 'text-red-800' : run.status === 'COMPLETED' ? 'text-green-800' : 'text-blue-800'}`}>{run.status === 'FAILED' ? <XCircle className="h-4 w-4"/> : run.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4"/> : <LoaderCircle className="h-4 w-4 animate-spin"/>}{run.status === 'FAILED' ? '任务执行失败' : run.status === 'COMPLETED' ? '任务已完成' : '任务执行中'}</div><div className="mt-2 break-all text-xs text-gray-700">{run.id} · {run.status}</div>{run.errorMessage && <p className="mt-2 text-xs leading-5 text-red-700">{run.errorMessage}</p>}<button onClick={() => navigate('/agent-roadmap')} className="mt-3 text-xs font-medium text-blue-600">查看 Agent 状态</button></div>}</aside>
      </section>
      <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-gray-900">专业 Agent</h2></div>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{team.specialists.map((agent) => { const blocked=agent.state==='blocked'; const checked=selected.includes(agent.id); return <button key={agent.id} onClick={() => toggle(agent.id, blocked)} className={`min-h-[190px] rounded-lg border bg-white p-5 text-left shadow-sm transition ${blocked ? 'cursor-not-allowed border-gray-200 opacity-65' : checked ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300'}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-gray-100 text-blue-600"><Bot className="h-5 w-5"/></div><div><h3 className="font-bold text-gray-900">{agent.name}</h3><p className="text-xs text-gray-500">{agent.title}</p></div></div><span className={`rounded-full border px-2 py-0.5 text-xs ${stateClass[agent.state]}`}>{stateLabel[agent.state]}</span></div><div className="mt-4 flex flex-wrap gap-1.5">{agent.responsibilities.map((item) => <span key={item} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{item}</span>)}</div><div className="mt-4 flex items-center gap-2 text-xs">{blocked ? <><XCircle className="h-3.5 w-3.5 text-red-500"/><span className="line-clamp-1 text-red-600">{agent.blockers[0] || '真实能力未接入'}</span></> : checked ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-600"/><span className="text-green-700">已加入本次团队</span></> : <span className="text-gray-400">点击加入本次团队</span>}</div></button>;})}</section>
    </>}
  </div>;
}
