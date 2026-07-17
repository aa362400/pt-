import React, { type ReactNode, useEffect, useState } from "react";
import {
  Bot,
  Play,
  Pause,
  Settings,
  Trash2,
  Plus,
  Sparkles,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Copy,
} from "lucide-react";

export interface AIAgentCenterItem {
  id: string;
  name: string;
  description: string;
  status: "active" | "paused" | "error";
  icon: typeof Bot;
  color: string;
  performance: {
    today: number;
    week: number;
    successRate: string;
    revenue: string;
  };
  currentTask: string;
  progress: number;
  settings: { platforms: string[]; frequency: string; autoApproval: boolean };
  recentActions: Array<{ time: string; action: string; result: string }>;
}
export interface AIAgentCenterStat {
  label: string;
  value: string;
  icon: typeof Bot;
  color: string;
}
interface AIAgentCenterProps {
  agents: AIAgentCenterItem[];
  stats: AIAgentCenterStat[];
  summaryLines?: string[];
  loading?: boolean;
  runPanel?: ReactNode;
  onOpenOperations?: () => void;
}
export function AIAgentCenter({
  agents,
  stats,
  summaryLines = [],
  loading = false,
  runPanel,
  onOpenOperations,
}: AIAgentCenterProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  useEffect(() => {
    if (agents.length === 0) {
      setSelectedAgent(null);
      return;
    }
    if (!selectedAgent || !agents.some((agent) => agent.id === selectedAgent)) {
      setSelectedAgent(agents[0].id);
    }
  }, [agents, selectedAgent]);

  const statusConfig = {
    active: {
      label: "运行中",
      color: "bg-green-50 text-green-700 border-green-200",
    },
    paused: {
      label: "已暂停",
      color: "bg-gray-50 text-gray-700 border-gray-200",
    },
    error: { label: "异常", color: "bg-red-50 text-red-700 border-red-200" },
  };

  const selectedAgentData = agents.find((a) => a.id === selectedAgent);

  return (
    <div className="p-0">
      {/* 页面标题 */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">AI Agent 中心</h1>
          <p className="text-gray-500 mt-1">
            管理和监控所有 AI 智能助手，创建自定义工作流
          </p>
        </div>
        <button
          onClick={onOpenOperations}
          disabled={!onOpenOperations}
          title={
            !onOpenOperations ? "尚未接入 Agent 创建与控制 API" : undefined
          }
          className="flex items-center justify-center gap-2 whitespace-nowrap px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
        >
          <Plus className="w-5 h-5" />
          {onOpenOperations ? "创建新 Agent" : "创建 Agent（未接入）"}
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 mb-8">
        {stats.map((stat, index) => (
          <div
            key={index}
            className="bg-white rounded-xl p-5 shadow-sm border border-gray-100"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-gray-900 mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
              <div
                className={`w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center ${stat.color}`}
              >
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI 工作摘要 */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-5 mb-8 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">今日 AI 工作摘要</h3>
            <div className="grid gap-2 lg:grid-cols-3">
              {summaryLines.map((line, index) => (
                <div
                  key={line}
                  className="flex items-start gap-2 rounded-lg border border-white/70 bg-white/55 px-3 py-2.5"
                >
                  {index === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  )}
                  <span className="text-sm text-gray-700">{line}</span>
                </div>
              ))}
              {!loading && summaryLines.length === 0 && (
                <div className="text-sm text-gray-600">
                  后端尚未返回真实 Agent 摘要。
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {runPanel}

      {/* 主内容区 */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(400px,0.85fr)]">
        {/* 左侧：Agent 列表 */}
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-gray-900">所有 Agent</h2>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                {agents.length}
              </span>
            </div>
            <button
              onClick={onOpenOperations}
              disabled={!onOpenOperations}
              title={
                !onOpenOperations ? "尚未接入 Agent 创建与控制 API" : undefined
              }
              aria-label="筛选 Agent"
              className="rounded-lg p-2 text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          {loading && (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              正在读取真实 Agent 状态...
            </div>
          )}
          {!loading && agents.length === 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
              后端没有返回真实 Agent 状态，不展示 Figma 示例 Agent。
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {agents.map((agent) => (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    setSelectedAgent(agent.id);
                }}
                className={`flex min-h-[168px] flex-col bg-white rounded-xl p-5 shadow-sm border cursor-pointer transition-all ${
                  selectedAgent === agent.id
                    ? "border-blue-500 shadow-md ring-2 ring-blue-100"
                    : "border-gray-100 hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
                }`}
              >
                <div className="flex items-start gap-4 mb-3">
                  <div
                    className={`w-12 h-12 rounded-lg bg-gradient-to-br ${agent.color} flex items-center justify-center flex-shrink-0`}
                  >
                    <agent.icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-gray-900">{agent.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                          statusConfig[
                            agent.status as keyof typeof statusConfig
                          ].color
                        }`}
                      >
                        {
                          statusConfig[
                            agent.status as keyof typeof statusConfig
                          ].label
                        }
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {agent.description}
                    </p>
                  </div>
                </div>

                {/* Agent 状态 */}
                <div className="flex items-center gap-1 text-xs text-gray-600 mb-2">
                  {agent.status === "active" && agent.progress < 100 && (
                    <>
                      <Clock className="w-3 h-3 text-blue-600" />
                      <span className="line-clamp-1">{agent.currentTask}</span>
                    </>
                  )}
                  {agent.status === "active" && agent.progress === 100 && (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      <span className="line-clamp-1">{agent.currentTask}</span>
                    </>
                  )}
                  {agent.status === "paused" && (
                    <>
                      <Pause className="w-3 h-3 text-gray-600" />
                      <span className="line-clamp-1">{agent.currentTask}</span>
                    </>
                  )}
                </div>

                {/* 进度条 */}
                {agent.status === "active" && agent.progress < 100 && (
                  <div className="mb-3">
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={`bg-gradient-to-r ${agent.color} h-1.5 rounded-full transition-all`}
                        style={{ width: `${agent.progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* 性能指标 */}
                <div className="mt-auto grid grid-cols-2 gap-2 border-t border-gray-100 pt-3 text-xs">
                  <div>
                    <span className="text-gray-500">今日:</span>
                    <span className="font-medium text-gray-900 ml-1">
                      {agent.performance.today}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">成功率:</span>
                    <span className="font-medium text-green-600 ml-1">
                      {agent.performance.successRate}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 右侧：Agent 详情 */}
        {selectedAgentData && (
          <aside className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm xl:sticky xl:top-4">
            {/* 详情头部 */}
            <div className="p-5 border-b border-gray-200">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br ${selectedAgentData.color} flex items-center justify-center`}
                  >
                    <selectedAgentData.icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-lg font-bold text-gray-900">
                        {selectedAgentData.name}
                      </h2>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium border ${
                          statusConfig[
                            selectedAgentData.status as keyof typeof statusConfig
                          ].color
                        }`}
                      >
                        {
                          statusConfig[
                            selectedAgentData.status as keyof typeof statusConfig
                          ].label
                        }
                      </span>
                    </div>
                    <p className="text-gray-600">
                      {selectedAgentData.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {selectedAgentData.status === "active" ? (
                    <button
                      onClick={onOpenOperations}
                      disabled={!onOpenOperations}
                      title={
                        !onOpenOperations
                          ? "尚未接入 Agent 创建与控制 API"
                          : undefined
                      }
                      aria-label="暂停 Agent"
                      className="p-2 hover:bg-gray-100 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Pause className="w-5 h-5 text-orange-600" />
                    </button>
                  ) : (
                    <button
                      onClick={onOpenOperations}
                      disabled={!onOpenOperations}
                      title={
                        !onOpenOperations
                          ? "尚未接入 Agent 创建与控制 API"
                          : undefined
                      }
                      aria-label="启动 Agent"
                      className="p-2 hover:bg-gray-100 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Play className="w-5 h-5 text-green-600" />
                    </button>
                  )}
                  <button
                    onClick={onOpenOperations}
                    disabled={!onOpenOperations}
                    title={
                      !onOpenOperations
                        ? "尚未接入 Agent 创建与控制 API"
                        : undefined
                    }
                    aria-label="Agent 设置"
                    className="p-2 hover:bg-gray-100 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Settings className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={onOpenOperations}
                    disabled={!onOpenOperations}
                    title={
                      !onOpenOperations
                        ? "尚未接入 Agent 创建与控制 API"
                        : undefined
                    }
                    aria-label="复制 Agent"
                    className="p-2 hover:bg-gray-100 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Copy className="w-5 h-5 text-gray-600" />
                  </button>
                  <button
                    onClick={onOpenOperations}
                    disabled={!onOpenOperations}
                    title={
                      !onOpenOperations
                        ? "尚未接入 Agent 创建与控制 API"
                        : undefined
                    }
                    aria-label="删除 Agent"
                    className="p-2 hover:bg-red-50 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </button>
                </div>
              </div>

              {/* 性能指标卡片 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500 mb-1">今日任务</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {selectedAgentData.performance.today}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500 mb-1">本周任务</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {selectedAgentData.performance.week}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500 mb-1">成功率</div>
                  <div className="text-2xl font-bold text-green-600">
                    {selectedAgentData.performance.successRate}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm text-gray-500 mb-1">贡献收益</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {selectedAgentData.performance.revenue}
                  </div>
                </div>
              </div>
            </div>

            {/* 当前任务 */}
            <div className="p-5 border-b border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4">当前任务</h3>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Bot className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm text-gray-900 mb-2">
                      {selectedAgentData.currentTask}
                    </p>
                    {selectedAgentData.progress < 100 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-blue-200 rounded-full h-2">
                          <div
                            className={`bg-gradient-to-r ${selectedAgentData.color} h-2 rounded-full`}
                            style={{ width: `${selectedAgentData.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-xs font-medium text-blue-600">
                          {selectedAgentData.progress}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 最近活动 */}
            <div className="p-5 border-b border-gray-200">
              <h3 className="font-bold text-gray-900 mb-4">最近活动</h3>
              <div className="space-y-3">
                {selectedAgentData.recentActions.map((action, index) => (
                  <div
                    key={index}
                    className="flex items-start gap-4 pb-3 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-shrink-0 w-16 text-center">
                      <div className="text-sm font-medium text-gray-900">
                        {action.time}
                      </div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-gray-900">
                        {action.action}
                      </div>
                    </div>
                    <div>
                      {action.result === "success" && (
                        <span className="px-2 py-1 bg-green-50 text-green-700 rounded text-xs">
                          完成
                        </span>
                      )}
                      {action.result === "pending" && (
                        <span className="px-2 py-1 bg-orange-50 text-orange-700 rounded text-xs">
                          待审批
                        </span>
                      )}
                      {action.result === "warning" && (
                        <span className="px-2 py-1 bg-red-50 text-red-700 rounded text-xs">
                          警告
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Agent 设置 */}
            <div className="p-5">
              <h3 className="font-bold text-gray-900 mb-4">Agent 设置</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    适用平台
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedAgentData.settings.platforms.map(
                      (platform, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 bg-blue-100 text-blue-700 rounded-lg text-sm"
                        >
                          {platform}
                        </span>
                      ),
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    执行频率
                  </label>
                  <div className="text-sm text-gray-900">
                    {selectedAgentData.settings.frequency}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!selectedAgentData.settings.autoApproval}
                      readOnly
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      高风险动作需人工确认
                    </span>
                  </label>
                </div>
                <div className="pt-4">
                  <button
                    onClick={onOpenOperations}
                    disabled={!onOpenOperations}
                    title={
                      !onOpenOperations
                        ? "尚未接入 Agent 创建与控制 API"
                        : undefined
                    }
                    className="w-full px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
                  >
                    打开完整设置
                  </button>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
