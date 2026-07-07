import { useState, useRef, useEffect, useMemo } from 'react';
import { Play, CheckCircle, Clock, Shield, MoreHorizontal, FileText, Globe, Package, Search, Filter, Rocket, BarChart3, Eye, Bot, DollarSign } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StatsCard from '../components/ui/StatsCard';
import StatusBadge from '../components/ui/StatusBadge';
import AgentConsoleSlot from '../components/ui/AgentConsoleSlot';
import RobotIllustration from '../components/ui/RobotIllustration';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/use-toast.ts';
import { automationApi } from '../api/automation';
import { api } from '../api/client';
import type { AutomationFlow, FlowTemplate } from '../types';

const templateIconMap: Record<string, React.ComponentType<any>> = {
  DollarSign,
  Rocket,
  Shield,
  Package,
  BarChart3,
  Eye,
  Globe,
  FileText,
};

function Automation() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [flows, setFlows] = useState<AutomationFlow[]>([]);
  const [flowTemplates, setFlowTemplates] = useState<FlowTemplate[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [agentMessages, setAgentMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
  const { addToast } = useToast();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdownId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch automation flows from API on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [flowsRes, templatesRes] = await Promise.all([
          automationApi.list().catch(() => null),
          api.get<FlowTemplate[]>('/automation/templates').catch(() => null),
        ]);
        if (flowsRes?.items) {
          setFlows(flowsRes.items);
        } else {
          // Fallback mock data for flows
          setFlows([
            { id: 'flow-1', name: 'Amazon 新品上架 SEO 优化', description: '自动抓取新品信息，生成优化后的标题、五点描述和 Search Terms', icon: 'FileText', status: 'running', channel: 'Amazon', channelIcon: 'shopping-bag', runDuration: '3 分 24 秒', successRate: 98.5, nextRun: '2026-07-05 02:00', lastRun: '2026-07-04 10:30', isEnabled: true },
            { id: 'flow-2', name: 'TikTok Shop 竞品监控', description: '每小时扫描 Top 20 竞品的价格、销量和评分变化', icon: 'Eye', status: 'running', channel: 'TikTok Shop', channelIcon: 'music', runDuration: '1 分 12 秒', successRate: 99.2, nextRun: '2026-07-04 15:00', lastRun: '2026-07-04 13:00', isEnabled: true },
            { id: 'flow-3', name: 'Temu 库存自动补货', description: '当库存低于安全线时自动生成补货单并发送给供应商', icon: 'Package', status: 'success', channel: 'Temu', channelIcon: 'shopping-cart', runDuration: '45 秒', successRate: 100, nextRun: '2026-07-04 18:00', lastRun: '2026-07-04 12:15', isEnabled: true },
            { id: 'flow-4', name: 'Etsy 广告智能调价', description: '根据广告 ROI 和竞品出价自动调整关键词出价策略', icon: 'TrendingUp', status: 'paused', channel: 'Etsy', channelIcon: 'store', runDuration: '2 分 08 秒', successRate: 94.7, nextRun: '已暂停', lastRun: '2026-07-03 22:00', isEnabled: false },
            { id: 'flow-5', name: '多平台比价 & 调价', description: '跨 Amazon / Temu / TikTok Shop 自动比价并建议最优售价', icon: 'DollarSign', status: 'running', channel: '全平台', channelIcon: 'globe', runDuration: '5 分 36 秒', successRate: 96.3, nextRun: '2026-07-04 16:00', lastRun: '2026-07-04 14:00', isEnabled: true },
            { id: 'flow-6', name: '独立站订单同步 ERP', description: '将 Shopify 订单实时同步至 ERP 系统并更新库存', icon: 'RefreshCw', status: 'running', channel: '独立站', channelIcon: 'globe', runDuration: '28 秒', successRate: 100, nextRun: '实时', lastRun: '2026-07-04 14:22', isEnabled: true },
            { id: 'flow-7', name: '差评预警 & 自动跟进', description: '监控全平台差评，自动发送补救邮件并生成分析报告', icon: 'MessageSquare', status: 'warning', channel: '全平台', channelIcon: 'globe', runDuration: '4 分 15 秒', successRate: 88.9, nextRun: '2026-07-04 17:00', lastRun: '2026-07-04 11:45', isEnabled: true },
            { id: 'flow-8', name: '周报自动生成', description: '每周日自动汇总全平台运营数据，生成中英文双语周报', icon: 'FileText', status: 'pending', channel: '全平台', channelIcon: 'globe', runDuration: '—', successRate: 100, nextRun: '2026-07-06 09:00', lastRun: '2026-06-29 09:00', isEnabled: true },
          ]);
        }
        if (templatesRes) {
          setFlowTemplates(templatesRes);
        } else {
          // Fallback templates
          setFlowTemplates([
            { id: 'ft1', name: '跨平台比价自动化', description: '每小时自动扫描 Amazon、Temu、TikTok Shop 同款商品价格，输出调价建议', icon: 'DollarSign', category: '价格管理', popularity: 92 },
            { id: 'ft2', name: '新品上架全流程', description: '从选品确认到多平台上架的完整自动化流程，含 SEO 优化和图片生成', icon: 'Rocket', category: '上架管理', popularity: 88 },
            { id: 'ft3', name: '差评预警 & 处置', description: '监控全平台差评，自动分类分级并触发对应处置方案', icon: 'Shield', category: '客服管理', popularity: 85 },
            { id: 'ft4', name: '库存智能补货', description: '根据销售预测和安全库存模型，自动生成采购建议和补货计划', icon: 'Package', category: '供应链', popularity: 90 },
            { id: 'ft5', name: '广告效果日报', description: '每日自动汇总全平台广告投放数据，生成可视化日报并推送到企业微信', icon: 'BarChart3', category: '广告管理', popularity: 78 },
            { id: 'ft6', name: '竞品监控雷达', description: '7x24h 追踪指定竞品的价格、销量、评分、新品动态', icon: 'Eye', category: '市场研究', popularity: 95 },
            { id: 'ft7', name: '社交媒体舆情监控', description: '抓取 TikTok、Instagram、Reddit 等平台品牌提及和产品讨论', icon: 'Globe', category: '品牌管理', popularity: 72 },
            { id: 'ft8', name: '财务对账自动化', description: '自动拉取各平台结算报告，与 ERP 对账并生成差异报表', icon: 'FileText', category: '财务管理', popularity: 68 },
          ]);
        }
      } catch (err) {
        console.error('Failed to fetch automation data:', err);
      } finally {
        setPageLoading(false);
      }
    };
    fetchData();
  }, []);

  const tabs = useMemo(() => [
    { id: 'all', label: t('automation.allFlows'), count: 12 },
    { id: 'running', label: t('automation.runningFlows'), count: 6 },
    { id: 'done', label: t('automation.completedFlows'), count: 24 },
    { id: 'error', label: t('automation.errorFlows'), count: 1 },
  ], [t]);

  const executionSteps = useMemo(() => [
    { name: t('automation.executionStepCollect'), progress: 76, status: 'running' as const },
    { name: t('automation.executionStepProcess'), progress: 58, status: 'running' as const },
    { name: t('automation.executionStepAiAnalyze'), progress: 42, status: 'running' as const },
    { name: t('automation.executionStepGenerateResult'), progress: 28, status: 'running' as const },
    { name: t('automation.executionStepPushNotify'), progress: 0, status: 'pending' as const },
  ], [t]);

  // Filter flows by active tab and search query
  const filteredFlows = flows.filter((flow) => {
    // Tab filter
    if (activeTab === 'running' && flow.status !== 'running') return false;
    if (activeTab === 'done' && flow.status !== 'success') return false;
    if (activeTab === 'error' && flow.status !== 'warning' && flow.status !== 'danger') return false;
    // Search filter
    if (searchQuery && !flow.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const handleToggleFlow = async (flowId: string) => {
    const flow = flows.find((f) => f.id === flowId);
    if (!flow) return;
    const newEnabled = !flow.isEnabled;
    try {
      await automationApi.toggleEnabled(flowId, newEnabled);
      setFlows((prev) =>
        prev.map((f) => (f.id === flowId ? { ...f, isEnabled: newEnabled } : f))
      );
      addToast(newEnabled ? t('automation.flowEnabled') : t('automation.flowDisabled'), 'success');
    } catch {
      addToast(t('automation.operationFailed'), 'error');
    }
  };

  const handleAgentCommand = (command: string) => {
    setAgentMessages((prev) => [
      ...prev,
      { role: 'user', text: command },
      { role: 'agent', text: t('automation.executingCommand', { command }) },
    ]);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <RobotIllustration size="md" variant="working" />
          <div>
            <h2 className="text-xl font-bold text-[#1A1A2E]">{t('automation.title')}与 Agent 执行台</h2>
            <p className="text-sm text-[#6B7280] mt-1">{t('automation.subtitle')} 🚀</p>
          </div>
        </div>
        {/* Create card */}
        <div className="w-64 rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A2E] mb-3">{t('automation.createNewFlow')}</h3>
          <div className="space-y-2">
            <button
              data-testid="create-from-template"
              onClick={() => setTemplateModalOpen(true)}
              className="w-full rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              {t('automation.fromTemplate')}
            </button>
            <button
              data-testid="custom-flow"
              onClick={() => addToast(t('automation.openingEditor'), 'info')}
              className="w-full rounded-lg border border-[#E8E8F0] py-2 text-sm font-medium text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
            >
              {t('automation.customFlow')}
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-5">
        <StatsCard icon={<Play size={22} />} value="6" label={t('automation.runningCount')} trend={{ value: 2, isUp: true }} color="#6C63FF" />
        <StatsCard icon={<CheckCircle size={22} />} value="24" label={t('automation.todayCompleted')} trend={{ value: 8, isUp: true }} color="#34D399" />
        <StatsCard icon={<Clock size={22} />} value="8.6h" label={t('automation.timeSaved')} trend={{ value: 15, isUp: true }} color="#FB923C" />
        <StatsCard icon={<Shield size={22} />} value="98.2%" label={t('automation.taskSuccessRate')} trend={{ value: 1.2, isUp: true }} color="#4A9EFF" />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-5">
        {/* Flow List */}
        <div className="col-span-2 rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-[#E8E8F0] px-5 py-3">
            <div className="flex items-center gap-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  data-testid={`tab-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-[#F0EEFF] text-[#6C63FF]'
                      : 'text-[#6B7280] hover:text-[#6C63FF]'
                  }`}
                >
                  {tab.label}({tab.count})
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <input
                  data-testid="search-input"
                  type="text"
                  placeholder={t('automation.searchFlowPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-32 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] pl-7 pr-2 py-1.5 text-xs outline-none"
                />
              </div>
              <Filter size={15} className="text-[#8B93B5] cursor-pointer" />
            </div>
          </div>

          {/* List */}
          <div className="divide-y divide-[#F0F0F8]">
            {filteredFlows.map((flow) => (
              <div key={flow.id} data-testid={`flow-item-${flow.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[#F8F9FF] transition-colors">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
                  <FileText size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1A1A2E]">{flow.name}</span>
                    <StatusBadge status={flow.status as 'running' | 'success' | 'warning' | 'danger'} />
                  </div>
                  <p className="text-xs text-[#8B93B5] truncate">{flow.description}</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#6B7280] shrink-0">
                  <span className="hidden lg:inline">{flow.channel}</span>
                  <span className="hidden lg:inline">{flow.runDuration}</span>
                  <span className="text-[#34D399] font-medium">{flow.successRate}%</span>
                  <span className="hidden lg:inline">{flow.nextRun}</span>
                  <span className="hidden xl:inline">{flow.lastRun}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    data-testid={`toggle-${flow.id}`}
                    onClick={() => handleToggleFlow(flow.id)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${flow.isEnabled ? 'bg-[#6C63FF]' : 'bg-[#D1D5DB]'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${flow.isEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'}`} />
                  </button>
                  <div className="relative">
                    <button
                      data-testid={`more-${flow.id}`}
                      onClick={() => setOpenDropdownId(openDropdownId === flow.id ? null : flow.id)}
                      className="p-1 text-[#8B93B5] hover:text-[#1A1A2E]"
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {openDropdownId === flow.id && (
                      <div
                        ref={dropdownRef}
                        data-testid={`dropdown-${flow.id}`}
                        className="absolute right-0 top-full z-50 mt-1 w-36 rounded-xl border border-[#E8E8F0] bg-white py-1 shadow-lg"
                      >
                        <button className="w-full px-3 py-1.5 text-left text-xs text-[#4A5578] hover:bg-[#F8F9FF]">{t('automation.editFlow')}</button>
                        <button className="w-full px-3 py-1.5 text-left text-xs text-[#4A5578] hover:bg-[#F8F9FF]">{t('automation.viewLog')}</button>
                        <button className="w-full px-3 py-1.5 text-left text-xs text-[#FF5A6A] hover:bg-[#FFF5F5]">{t('automation.deleteFlow')}</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredFlows.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-[#8B93B5]">{t('automation.noMatchingFlows')}</div>
            )}
          </div>
        </div>

        {/* Agent Console */}
        <AgentConsoleSlot
          quickCommands={[
            t('automation.commandDailyReport'),
            t('automation.commandSalesTrend'),
            t('automation.commandOptimizeListing'),
            t('automation.commandCheckInventory'),
          ]}
          onCommand={handleAgentCommand}
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-2 gap-5">
        {/* Execution Queue */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-[#1A1A2E] mb-4">{t('automation.executionQueue')}</h3>
          <div className="grid grid-cols-5 gap-3">
            {executionSteps.map((step) => (
              <div key={step.name} className="text-center">
                <div className="relative h-20 rounded-xl bg-[#F8F9FF] mb-2 flex flex-col items-center justify-center">
                  <div
                    className="absolute bottom-0 left-0 right-0 rounded-b-xl transition-all"
                    style={{
                      height: `${step.progress}%`,
                      background: step.status === 'running' ? 'linear-gradient(to top, #6C63FF, #8B7CFF)' : '#E8E8F0',
                      opacity: 0.15,
                    }}
                  />
                  <span className="relative text-lg font-bold text-[#6C63FF]">{step.progress}%</span>
                </div>
                <p className="text-[10px] text-[#6B7280]">{step.name}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Flow Templates */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('automation.templateCenter')}</h3>
            <span className="text-xs text-[#6C63FF] cursor-pointer">{t('common.viewAll')} →</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {flowTemplates.map((tpl) => {
              const Icon = templateIconMap[tpl.icon] || FileText;
              return (
                <div key={tpl.id} className="rounded-xl border border-[#E8E8F0] p-3 hover:border-[#6C63FF] transition-colors cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
                      <Icon size={14} />
                    </div>
                    <span className="text-xs font-semibold text-[#1A1A2E]">{tpl.name}</span>
                  </div>
                  <p className="text-[10px] text-[#8B93B5]">{tpl.description}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-[10px] text-[#6B7280]">{tpl.category}</span>
                    <span className="text-[10px] text-[#FB923C]">{t('automation.popularity')} {tpl.popularity}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Template Modal */}
      <Modal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={t('automation.createFromTemplate')} width="max-w-3xl">
        <div className="grid grid-cols-2 gap-4">
          {flowTemplates.map((tpl) => {
            const Icon = templateIconMap[tpl.icon] || FileText;
            return (
              <div
                key={tpl.id}
                data-testid={`template-card-${tpl.id}`}
                className="rounded-xl border border-[#E8E8F0] p-4 hover:border-[#6C63FF] hover:shadow-sm transition-all cursor-pointer"
                onClick={() => {
                  addToast(t('automation.templateSelected', { name: tpl.name }), 'success');
                  setTemplateModalOpen(false);
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
                    <Icon size={16} />
                  </div>
                  <span className="text-sm font-semibold text-[#1A1A2E]">{tpl.name}</span>
                </div>
                <p className="text-xs text-[#8B93B5] mb-3">{tpl.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#6B7280] bg-[#F8F9FF] px-2 py-0.5 rounded">{tpl.category}</span>
                  <span className="text-xs text-[#FB923C]">{t('automation.popularity')} {tpl.popularity}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      {/* Agent Console Messages */}
      {agentMessages.length > 0 && (
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <h3 className="text-xs font-semibold text-[#1A1A2E] mb-3 flex items-center gap-1.5">
            <Bot size={14} className="text-[#6C63FF]" /> {t('automation.agentMessages')}
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {agentMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 text-xs ${msg.role === 'user' ? '' : ''}`}>
                <span className={`shrink-0 font-medium ${msg.role === 'user' ? 'text-[#6C63FF]' : 'text-[#34D399]'}`}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </span>
                <span className="text-[#4A5578]">{msg.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default Automation;
