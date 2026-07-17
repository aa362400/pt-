import React, { useState } from 'react';
import {
  Filter,
  Search,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  TrendingUp,
  DollarSign,
  Download,
} from 'lucide-react';

// 平台图标组件
const PlatformIcon = ({ platform }: { platform: string }) => {
  const colors = {
    Etsy: 'bg-orange-500',
    Shopify: 'bg-green-500',
    Amazon: 'bg-yellow-600',
    TikTok: 'bg-pink-500',
  };
  
  return (
    <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold ${colors[platform as keyof typeof colors] || 'bg-gray-500'}`}>
      {platform[0]}
    </div>
  );
};

export interface ApprovalCenterItem {
  id: string;
  type: string;
  title: string;
  platform: string;
  risk: 'low' | 'medium' | 'high';
  agent: string;
  reason: string;
  impact: string;
  details: string;
  estimatedRevenue: string;
  time: string;
  status: string;
  workQueue: 'actionable' | 'needs_attention' | 'processed';
  imageUrl?: string | null;
  imageEvidenceUrl?: string | null;
}
export interface ApprovalCenterStat { label: string; value: string; icon: typeof Clock; color: string }
interface ApprovalCenterProps {
  approvalTasks: ApprovalCenterItem[];
  stats: ApprovalCenterStat[];
  loading?: boolean;
  onOpenTask?: (taskId: string) => void;
  onTaskAction?: (taskId: string, action: 'view' | 'approve' | 'edit' | 'reject') => void;
  onExport?: () => void;
}
function ApprovalTaskImage({ task }: { task: ApprovalCenterItem }) {
  const [failed, setFailed] = useState(false);
  const content = task.imageUrl && !failed ? (
    <img
      src={task.imageUrl}
      alt={`${task.title}的真实证据图`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-full w-full object-cover"
    />
  ) : (
    <div className="flex h-full w-full items-center justify-center px-2 text-center text-[11px] leading-4 text-gray-500">
      {failed ? '图片加载失败' : '暂无证据图'}
    </div>
  );

  return task.imageEvidenceUrl ? (
    <a
      href={task.imageEvidenceUrl}
      target="_blank"
      rel="noreferrer"
      title="打开图片证据页"
      className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      {content}
    </a>
  ) : (
    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
      {content}
    </div>
  );
}

export function ApprovalCenter({ approvalTasks, stats, loading = false, onOpenTask, onTaskAction, onExport }: ApprovalCenterProps) {
  const [selectedTab, setSelectedTab] = useState('actionable');
  const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');

  const riskConfig = {
    low: { label: '低风险', color: 'text-green-600 bg-green-50 border-green-200', icon: CheckCircle2 },
    medium: { label: '中风险', color: 'text-orange-600 bg-orange-50 border-orange-200', icon: AlertTriangle },
    high: { label: '高风险', color: 'text-red-600 bg-red-50 border-red-200', icon: AlertTriangle },
  };

  const typeConfig = {
    '商品发布': { color: 'bg-blue-100 text-blue-700' },
    '价格调整': { color: 'bg-purple-100 text-purple-700' },
    '广告预算': { color: 'bg-orange-100 text-orange-700' },
    '退款处理': { color: 'bg-red-100 text-red-700' },
    '侵权风险': { color: 'bg-red-100 text-red-700' },
    '库存补货': { color: 'bg-green-100 text-green-700' },
    'SEO优化': { color: 'bg-indigo-100 text-indigo-700' },
    '营销活动': { color: 'bg-pink-100 text-pink-700' },
    '选品审核': { color: 'bg-cyan-100 text-cyan-700' },
    '刊登审核': { color: 'bg-blue-100 text-blue-700' },
    '图片审核': { color: 'bg-violet-100 text-violet-700' },
    '补货审核': { color: 'bg-green-100 text-green-700' },
    '智能体审核': { color: 'bg-gray-100 text-gray-700' },
  };

  const getTypeColor = (type: string) =>
    typeConfig[type as keyof typeof typeConfig]?.color ?? 'bg-gray-100 text-gray-700';

  const toggleTask = (id: string) => {
    if (selectedTasks.includes(id)) {
      setSelectedTasks(selectedTasks.filter(taskId => taskId !== id));
    } else {
      setSelectedTasks([...selectedTasks, id]);
    }
  };

  const visibleTasks = approvalTasks.filter((task) => {
    if (selectedTab !== 'all' && task.workQueue !== selectedTab) return false;
    if (typeFilter !== 'all' && task.type !== typeFilter) return false;
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (riskFilter !== 'all' && task.risk !== riskFilter) return false;
    const query = searchQuery.trim().toLocaleLowerCase();
    return !query || `${task.title} ${task.agent} ${task.type} ${task.platform} ${task.reason} ${task.impact} ${task.details}`.toLocaleLowerCase().includes(query);
  });

  const taskTypes = Array.from(new Set(approvalTasks.map((task) => task.type))).sort();

  const openTask = (taskId: string, action: 'view' | 'approve' | 'edit' | 'reject' = 'view') => {
    if (onTaskAction) onTaskAction(taskId, action);
    else onOpenTask?.(taskId);
  };

  return (
    <div className="p-0">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">审批中心</h1>
        <p className="text-gray-500 mt-1">AI 智能建议，人工审核确认，确保每个决策安全可控</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
              <div className={`w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI 建议 */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-8 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">智能审批建议</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700">{approvalTasks.filter((task) => task.risk === 'high').length} 个真实高风险任务需要逐项审核，系统不会自动批准。</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700">所有发布、改价、库存、广告和订单动作继续保留人工确认。</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* 工具栏 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="搜索任务、智能体..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                aria-expanded={filtersOpen}
                aria-controls="approval-advanced-filters"
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
              >
                <Filter className="w-4 h-4 text-gray-500" />
                筛选
              </button>
            </div>

            <div className="flex items-center gap-3">
              {selectedTasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">已选 {selectedTasks.length} 项</span>
                  <button onClick={() => selectedTasks[0] && openTask(selectedTasks[0])} className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg text-sm">
                    逐项审核
                  </button>
                </div>
              )}
              <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                <Download className="w-4 h-4 text-gray-500" />
                导出
              </button>
            </div>
          </div>

          {filtersOpen ? (
            <div id="approval-advanced-filters" className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3">
              <label className="text-sm font-medium text-gray-700">
                任务类型
                <select
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="all">全部类型</option>
                  {taskTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                风险等级
                <select
                  value={riskFilter}
                  onChange={(event) => setRiskFilter(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="all">全部风险</option>
                  <option value="high">高风险</option>
                  <option value="medium">中风险</option>
                  <option value="low">低风险</option>
                </select>
              </label>
              <label className="text-sm font-medium text-gray-700">
                处理状态
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="all">全部状态</option>
                  <option value="pending">等待处理</option>
                  <option value="approved">已确认</option>
                  <option value="rejected">不采用</option>
                  <option value="rework">要求重做</option>
                </select>
              </label>
            </div>
          ) : null}

          {/* 标签页 */}
          <div className="flex items-center gap-1 border-b border-gray-200 -mb-6">
            {[
              { key: 'actionable', label: '待我处理', count: approvalTasks.filter((task) => task.workQueue === 'actionable').length },
              { key: 'needs_attention', label: '异常与重做', count: approvalTasks.filter((task) => task.workQueue === 'needs_attention').length },
              { key: 'processed', label: '已处理', count: approvalTasks.filter((task) => task.workQueue === 'processed').length },
              { key: 'all', label: '全部任务', count: approvalTasks.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSelectedTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  selectedTab === tab.key
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
                <span className="ml-2 text-xs text-gray-400">({tab.count})</span>
                {selectedTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 任务列表 */}
        <div className="divide-y divide-gray-200">
          {loading && <div className="p-10 text-center text-sm text-gray-500">正在读取真实审核任务...</div>}
          {!loading && visibleTasks.length === 0 && <div className="p-10 text-center text-sm text-gray-500">当前筛选下没有真实审核任务，不展示 Figma 示例审批。</div>}
          {visibleTasks.map((task) => (
            <div key={task.id} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-4">
                <input
                  type="checkbox"
                  checked={selectedTasks.includes(task.id)}
                  onChange={() => toggleTask(task.id)}
                  className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />

                <ApprovalTaskImage task={task} />

                <div className="flex-1">
                  {/* 任务头部 */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-gray-900">{task.title}</h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        riskConfig[task.risk as keyof typeof riskConfig].color
                      }`}>
                        {riskConfig[task.risk as keyof typeof riskConfig].label}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getTypeColor(task.type)}`}>
                        {task.type}
                      </span>
                      <PlatformIcon platform={task.platform} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">{task.time}</span>
                    </div>
                  </div>

                  {/* 任务详情 */}
                  <div className="grid grid-cols-3 gap-6 mb-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        为什么需要审核
                      </div>
                      <div className="text-sm text-gray-900">{task.reason}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" />
                        预期影响
                      </div>
                      <div className="text-sm text-gray-900">{task.impact}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <DollarSign className="w-3 h-3" />
                        预估收益
                      </div>
                      <div className={`text-sm font-bold ${
                        task.estimatedRevenue.startsWith('+') ? 'text-green-600' : 
                        task.estimatedRevenue.startsWith('-') ? 'text-red-600' : 
                        'text-gray-900'
                      }`}>
                        {task.estimatedRevenue}
                      </div>
                    </div>
                  </div>

                  {/* 额外信息 */}
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      {task.agent}
                    </span>
                    <span>•</span>
                    <span>{task.details}</span>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => openTask(task.id, 'view')}
                    aria-label={`查看任务 ${task.title}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white transition-shadow hover:shadow-lg"
                  >
                    <Eye className="w-4 h-4" />
                    查看并处理
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 当前列表范围 */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            当前显示 {visibleTasks.length} 条，共读取 {approvalTasks.length} 条真实任务（单次最多 100 条）
          </div>
          <span className="text-xs text-gray-400">按创建时间从新到旧</span>
        </div>
      </div>
    </div>
  );
}
