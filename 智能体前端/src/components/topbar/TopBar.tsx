import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Bell, Check, Menu, Search, ShieldCheck, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { notificationsApi, type Notification } from '../../api/notifications';
import { agentHealthApi, type AgentHealthSnapshot } from '../../api/agentHealth';
import { getAgentAutonomyMode, updateAgentAutonomyMode } from '../../api/agentAutonomy';
import { useAuth } from '../../auth/AuthContext';
import { routeTitleForPath, searchNavigation } from '../../lib/navigation';

function modelLabel(health: AgentHealthSnapshot | null) {
  if (!health) return { text: '模型状态检测中', tone: 'bg-slate-100 text-slate-600' };
  if (health.llm.status === 'available') return { text: `模型可用 · ${health.llm.model || '已连接'}`, tone: 'bg-emerald-50 text-emerald-700' };
  if (health.llm.status === 'degraded') return { text: '模型降级中', tone: 'bg-amber-50 text-amber-700' };
  if (health.llm.status === 'quota_exhausted') return { text: '模型额度不足', tone: 'bg-red-50 text-red-700' };
  if (health.llm.status === 'unknown') return { text: '模型待验证', tone: 'bg-slate-100 text-slate-600' };
  if (health.llm.lastErrorCode === 'primary_quota_exhausted_fallback_unavailable') {
    return { text: '主额度不足 · 备用不可用', tone: 'bg-red-50 text-red-700' };
  }
  return { text: '模型不可用', tone: 'bg-red-50 text-red-700' };
}

function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [openNotifications, setOpenNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [mode, setMode] = useState<'semi' | 'full'>('semi');
  const [confirmFull, setConfirmFull] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [health, setHealth] = useState<AgentHealthSnapshot | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const notificationRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLFormElement>(null);
  const title = routeTitleForPath(location.pathname) || 'GlobalPilot AI';
  const unread = notifications.filter((item) => !item.isRead).length;
  const healthLabel = modelLabel(health);
  const searchResults = searchNavigation(searchQuery);

  useEffect(() => {
    void notificationsApi.list({ limit: 8 })
      .then((result) => {
        setNotifications(result.items);
        setNotificationError(null);
      })
      .catch(() => setNotificationError('通知加载失败，请检查网络后重试。'));
    void getAgentAutonomyMode()
      .then((result) => setMode(result.autoResearchAndDraftEnabled ? 'full' : 'semi'))
      .catch(() => setModeError('自主模式状态读取失败'));
    const refreshHealth = () => {
      void agentHealthApi.get().then(setHealth).catch(() => setHealth(null));
    };
    refreshHealth();
    const timer = window.setInterval(refreshHealth, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) setOpenNotifications(false);
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) setSearchOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const openSearchResult = (path: string) => {
    setSearchQuery('');
    setSearchOpen(false);
    setActiveSearchIndex(0);
    navigate(path);
  };

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
    setSearchOpen(true);
    setActiveSearchIndex(0);
  };

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = searchResults[activeSearchIndex] ?? searchResults[0];
    if (result) openSearchResult(result.path);
  };

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }
    if (!searchResults.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((index) => (index + 1) % searchResults.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSearchOpen(true);
      setActiveSearchIndex((index) => (index - 1 + searchResults.length) % searchResults.length);
    }
  };

  const markAllRead = async () => {
    if (markAllPending || unread === 0) return;
    setMarkAllPending(true);
    setNotificationError(null);
    try {
      await notificationsApi.markAllAsRead();
      setNotifications((items) => items.map((item) => ({ ...item, isRead: true })));
    } catch {
      setNotificationError('全部标记已读失败，通知状态未更改，请检查网络后重试。');
    } finally {
      setMarkAllPending(false);
    }
  };

  const applyMode = async (nextMode: 'semi' | 'full') => {
    setModeSaving(true);
    setModeError(null);
    try {
      const result = await updateAgentAutonomyMode(nextMode === 'full');
      setMode(result.autoResearchAndDraftEnabled ? 'full' : 'semi');
      setConfirmFull(false);
    } catch {
      setModeError('自主模式更新失败');
    } finally {
      setModeSaving(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex h-[76px] items-center gap-3 px-4 md:px-6 lg:px-8">
          <button type="button" aria-label="打开导航" onClick={onMenuClick} className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 md:hidden"><Menu size={19} /></button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-slate-900">{title}</h1>
            <p className="mt-0.5 hidden text-[11px] text-slate-500 sm:block">真实业务数据与智能体运行状态</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className={`hidden rounded-md px-2.5 py-1.5 text-[11px] font-semibold lg:inline-flex ${healthLabel.tone}`}>{healthLabel.text}</span>
            <form ref={searchRef} onSubmit={handleSearchSubmit} className="relative hidden xl:block">
              <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                role="combobox"
                aria-label="搜索平台功能"
                aria-autocomplete="list"
                aria-controls="topbar-global-search-results"
                aria-expanded={searchOpen && Boolean(searchQuery.trim())}
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={handleSearchKeyDown}
                placeholder="搜索功能，例如审批中心"
                className="h-9 w-64 rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-blue-500 focus:bg-white"
              />
              {searchOpen && searchQuery.trim() ? (
                <div id="topbar-global-search-results" role="listbox" aria-label="功能搜索结果" className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-xl">
                  {searchResults.length ? searchResults.map((item, index) => (
                    <button
                      key={item.path}
                      type="button"
                      role="option"
                      aria-selected={index === activeSearchIndex}
                      onMouseEnter={() => setActiveSearchIndex(index)}
                      onClick={() => openSearchResult(item.path)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs ${index === activeSearchIndex ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      <span className="font-medium">{item.label}</span>
                      <span className="text-[10px] text-slate-400">按 Enter 打开</span>
                    </button>
                  )) : (
                    <p role="status" className="px-3 py-4 text-center text-xs text-slate-500">没有找到匹配的功能</p>
                  )}
                </div>
              ) : null}
            </form>
            <div className="relative" ref={notificationRef}>
              <button type="button" aria-label="通知中心" onClick={() => setOpenNotifications((value) => !value)} className="relative grid h-9 w-9 place-items-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                <Bell size={17} />{unread > 0 ? <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-red-500" /> : null}
              </button>
              {openNotifications ? (
                <div className="absolute right-0 top-12 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <strong className="text-sm">通知中心</strong>
                    <button type="button" disabled={markAllPending || unread === 0} onClick={() => void markAllRead()} className="text-xs font-medium text-blue-600 disabled:cursor-not-allowed disabled:text-slate-400">
                      {markAllPending ? '处理中…' : '全部已读'}
                    </button>
                  </div>
                  {notificationError ? <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs leading-5 text-red-700">{notificationError}</p> : null}
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length ? notifications.map((item) => (
                      <button key={item.id} type="button" onClick={() => { setOpenNotifications(false); navigate(item.type === 'APPROVAL_REQUIRED' ? '/review' : '/assistant'); }} className="flex w-full gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50">
                        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-slate-200' : 'bg-blue-500'}`} />
                        <span className="min-w-0"><strong className="block truncate text-xs text-slate-800">{item.title}</strong><span className="mt-1 line-clamp-2 block text-[11px] leading-5 text-slate-500">{item.body || '查看任务详情'}</span></span>
                      </button>
                    )) : notificationError ? null : <p className="px-4 py-8 text-center text-xs text-slate-500">暂无通知</p>}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{user?.name?.slice(0, 2).toUpperCase() || 'JK'}</div>
          </div>
        </div>
        <div className="flex min-h-[58px] flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2 md:px-6 lg:px-8">
          <div aria-label="当前组织" className="flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-700">
            <span className="text-slate-500">组织</span>
            <strong className="font-semibold">当前组织</strong>
          </div>
          <div className="flex items-center gap-1 overflow-x-auto">
            <span aria-label="当前平台：Ozon" className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold text-white">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-white" />
              当前平台：Ozon
            </span>
            {['Etsy', 'Shopify', 'Amazon', 'TikTok'].map((platform) => <button key={platform} type="button" disabled title="该平台尚未接入真实数据" className="h-9 rounded-md px-3 text-xs text-slate-400 disabled:cursor-not-allowed">{platform}</button>)}
          </div>
          <div className="ml-auto flex rounded-md bg-slate-100 p-1">
            <button type="button" disabled={modeSaving} onClick={() => void applyMode('semi')} className={`h-7 rounded px-3 text-xs font-medium disabled:cursor-wait disabled:opacity-60 ${mode === 'semi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>半自动模式</button>
            <button type="button" disabled={modeSaving} onClick={() => setConfirmFull(true)} className={`h-7 rounded px-3 text-xs font-medium disabled:cursor-wait disabled:opacity-60 ${mode === 'full' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>全自动模式</button>
          </div>
          <span className="hidden text-[11px] text-slate-500 2xl:inline">智能体可自动读取与分析，平台写入仍需人工确认</span>
          {modeError ? <span role="alert" className="text-[11px] font-medium text-red-600">{modeError}</span> : null}
        </div>
      </header>

      {confirmFull ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="fullModeTitle">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600"><ShieldCheck size={21} /></span><div><h2 id="fullModeTitle" className="text-base font-bold text-slate-900">开启全自动模式</h2><p className="mt-2 text-sm leading-6 text-slate-600">只读巡检、调研和本地草稿可以自动执行。商品发布、改价、库存、广告和订单动作仍必须进入人工审核。</p></div><button type="button" aria-label="关闭" onClick={() => setConfirmFull(false)} className="ml-auto text-slate-400"><X size={18} /></button></div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={modeSaving} onClick={() => setConfirmFull(false)} className="h-9 rounded-md border border-slate-200 px-4 text-xs font-semibold text-slate-700 disabled:opacity-60">取消</button><button type="button" disabled={modeSaving} onClick={() => void applyMode('full')} className="flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60"><Check size={15} />{modeSaving ? '开启中' : '确认开启'}</button></div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default TopBar;
