import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, BrainCircuit, CheckCircle2, LoaderCircle, Play, ShieldCheck, Users, XCircle } from 'lucide-react';
import { enterpriseTeamApi, type EnterpriseTeam as TeamReport } from '../api/enterpriseTeam';
import { getAgentRun, type AgentRun } from '../api/agentRuns';
import { workspacesApi, type WorkspaceSummary } from '../api/workspaces';
import { useToast } from '../components/ui/use-toast';

const stateLabel = { available: 'english_text', partial: 'english_text', blocked: 'english_text' };
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
      addToast(error instanceof Error ? error.message : 'AI teamstatusreadfailed', 'error');
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
    if (goal.trim().length < 8) { addToast('english_text 8 english_text', 'error'); return; }
    if (selected.length === 0) { addToast('english_text Agent', 'error'); return; }
    setLaunching(true);
    try {
      const result = await enterpriseTeamApi.launch({ goal: goal.trim(), workspaceId: workspaceId || undefined, specialistIds: selected });
      setRun(result.run);
      addToast(`CEO Agent english_texttask ${result.run.id}`, 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : 'english_textfailed', 'error'); }
    finally { setLaunching(false); }
  };

  return <div className="p-0">
    <div className="mb-6"><h1 className="text-2xl font-bold text-gray-900">AI textteam</h1><p className="mt-1 text-gray-500">CEO Agent english_text，english_text Agent、Skill、MCP text Connector</p></div>
    {loading && <div className="rounded-lg border border-gray-200 bg-white py-20 text-center text-sm text-gray-500">textreadreal Agent text...</div>}
    {!loading && !team && <div className="rounded-lg border border-red-200 bg-red-50 py-20 text-center text-sm text-red-700">teamtextreadfailed，english_text Agent。</div>}
    {team && <>
      <section className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-start gap-4"><div className="grid h-12 w-12 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white"><BrainCircuit className="h-6 w-6" /></div><div><h2 className="font-bold text-gray-900">CEO Agent english_text</h2><p className="mt-1 text-sm text-gray-500">realtext PLANNER AgentRun，english_textplatformwrite。</p></div></div>
          <label className="mb-2 block text-sm font-medium text-gray-700">english_text</label>
          <select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"><option value="">english_text</option>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.channelType}</option>)}</select>
          <label className="mb-2 block text-sm font-medium text-gray-700">english_text</label>
          <textarea value={goal} onChange={(event) => setGoal(event.target.value)} rows={5} placeholder="text：english_text Ozon storeproduct，english_textproduct，generationenglish_text Listing text，textyestextwriteenglish_text。" className="w-full resize-none rounded-md border border-gray-300 px-4 py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-gray-500">english_text {selectedCount} english_text Agent</span><button onClick={() => void launch()} disabled={launching} className="flex items-center justify-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60">{launching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}text CEO text</button></div>
        </div>
        <aside className="rounded-lg border border-blue-100 bg-blue-50 p-5"><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-gray-900">english_text</h2></div><div className="space-y-3 text-sm text-gray-700"><p>english_textautomatictext</p><p>reporttextlocalenglish_textautomatictext</p><p>publish、text、text、text、english_texthumantext</p><p>english_text Connector text Agent english_text</p></div><div className="mt-5 rounded-md bg-white px-3 py-3 text-xs text-gray-600">textconnectionstoretext：{team.operationSafety.connectedStoreChannels}<br/>textwriteenglish_text：{team.operationSafety.externalWriteAdapterConnected ? 'textconnectionenglish_text' : 'textconnection'}</div>{run && <div className={`mt-4 rounded-md border p-3 ${run.status === 'FAILED' ? 'border-red-200 bg-red-50' : run.status === 'COMPLETED' ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-white'}`}><div className={`flex items-center gap-2 text-sm font-medium ${run.status === 'FAILED' ? 'text-red-800' : run.status === 'COMPLETED' ? 'text-green-800' : 'text-blue-800'}`}>{run.status === 'FAILED' ? <XCircle className="h-4 w-4"/> : run.status === 'COMPLETED' ? <CheckCircle2 className="h-4 w-4"/> : <LoaderCircle className="h-4 w-4 animate-spin"/>}{run.status === 'FAILED' ? 'tasktextfailed' : run.status === 'COMPLETED' ? 'tasktextcompleted' : 'taskenglish_text'}</div><div className="mt-2 break-all text-xs text-gray-700">{run.id} · {run.status}</div>{run.errorMessage && <p className="mt-2 text-xs leading-5 text-red-700">{run.errorMessage}</p>}<button onClick={() => navigate('/agent-roadmap')} className="mt-3 text-xs font-medium text-blue-600">text Agent status</button></div>}</aside>
      </section>
      <div className="mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-600"/><h2 className="font-bold text-gray-900">text Agent</h2></div>
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{team.specialists.map((agent) => { const blocked=agent.state==='blocked'; const checked=selected.includes(agent.id); return <button key={agent.id} onClick={() => toggle(agent.id, blocked)} className={`min-h-[190px] rounded-lg border bg-white p-5 text-left shadow-sm transition ${blocked ? 'cursor-not-allowed border-gray-200 opacity-65' : checked ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200 hover:border-blue-300'}`}><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-lg bg-gray-100 text-blue-600"><Bot className="h-5 w-5"/></div><div><h3 className="font-bold text-gray-900">{agent.name}</h3><p className="text-xs text-gray-500">{agent.title}</p></div></div><span className={`rounded-full border px-2 py-0.5 text-xs ${stateClass[agent.state]}`}>{stateLabel[agent.state]}</span></div><div className="mt-4 flex flex-wrap gap-1.5">{agent.responsibilities.map((item) => <span key={item} className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">{item}</span>)}</div><div className="mt-4 flex items-center gap-2 text-xs">{blocked ? <><XCircle className="h-3.5 w-3.5 text-red-500"/><span className="line-clamp-1 text-red-600">{agent.blockers[0] || 'realenglish_text'}</span></> : checked ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-600"/><span className="text-green-700">english_textteam</span></> : <span className="text-gray-400">english_textteam</span>}</div></button>;})}</section>
    </>}
  </div>;
}
