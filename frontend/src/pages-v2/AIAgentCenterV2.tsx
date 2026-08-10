import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Bot, CheckCircle2, Clock } from "lucide-react";
import { getAgentRoadmap, type AgentRoadmapReport } from "../api/agentRoadmap";
import {
  AIAgentCenter,
  type AIAgentCenterItem,
} from "../figma-exact/AIAgentCenter";
import { useToast } from "../components/ui/use-toast";
import { AgentRunTimelinePanel } from "../components/agent/AgentRunTimelinePanel";
import { DeadLetterTriagePanel } from "../components/agent/DeadLetterTriagePanel";

export default function AIAgentCenterV2() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [report, setReport] = useState<AgentRoadmapReport | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await getAgentRoadmap());
    } catch (error) {
      setReport(null);
      addToast(
        error instanceof Error ? error.message : "Agent 状态读取失败",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);
  useEffect(() => {
    void load();
  }, [load]);
  const agents = useMemo<AIAgentCenterItem[]>(
    () =>
      (report?.liveChecks ?? []).map((check) => ({
        id: check.key,
        name: check.label,
        description: check.detail,
        status:
          check.status === "ok"
            ? "active"
            : check.status === "warn"
              ? "paused"
              : "error",
        icon: Bot,
        color:
          check.status === "ok"
            ? "from-blue-500 to-cyan-500"
            : check.status === "warn"
              ? "from-orange-500 to-yellow-500"
              : "from-red-500 to-rose-500",
        performance: {
          today: 0,
          week: 0,
          successRate:
            report?.metrics.agentRunSuccessRate === null
              ? "未返回"
              : `${report?.metrics.agentRunSuccessRate ?? 0}%`,
          revenue: "未评估",
        },
        currentTask: check.detail,
        progress:
          check.status === "ok" ? 100 : check.status === "warn" ? 50 : 0,
        settings: {
          platforms: ["Ozon"],
          frequency: "后端实时检查",
          autoApproval: false,
        },
        recentActions: [],
      })),
    [report],
  );
  const stats = [
    {
      label: "健康检查",
      value: String(
        report?.liveChecks.filter((item) => item.status === "ok").length ?? 0,
      ),
      icon: Bot,
      color: "text-blue-600",
    },
    {
      label: "Agent 运行总数",
      value: String(report?.metrics.agentRunTotal ?? 0),
      icon: CheckCircle2,
      color: "text-green-600",
    },
    {
      label: "真实成功率",
      value:
        report?.metrics.agentRunSuccessRate === null ||
        report?.metrics.agentRunSuccessRate === undefined
          ? "未返回"
          : `${report.metrics.agentRunSuccessRate}%`,
      icon: BarChart3,
      color: "text-purple-600",
    },
    {
      label: "未解决死信",
      value: String(report?.metrics.unresolvedDeadLetterJobs ?? 0),
      icon: Clock,
      color: "text-orange-600",
    },
  ];
  const summaryLines = report
    ? [
        `Agent 运行 ${report.metrics.agentRunTotal} 次，完成 ${report.metrics.agentRunCompleted} 次，失败 ${report.metrics.agentRunFailed} 次。`,
        `未授权动作 ${report.metrics.unauthorizedAgentActions} 次，未解决死信 ${report.metrics.unresolvedDeadLetterJobs} 个。`,
        `高风险动作模式：${report.operationSafety.highRiskActionMode}；已连接店铺通道 ${report.operationSafety.connectedStoreChannels} 个。`,
      ]
    : [];
  return (
    <AIAgentCenter
      agents={agents}
      stats={stats}
      summaryLines={summaryLines}
      loading={loading}
      runPanel={
        <div className="space-y-6">
          <DeadLetterTriagePanel onChanged={() => void load()} />
          <AgentRunTimelinePanel />
        </div>
      }
      onOpenOperations={() => navigate("/agent-roadmap/operations")}
    />
  );
}
