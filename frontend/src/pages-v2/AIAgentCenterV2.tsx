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
        error instanceof Error ? error.message : "Agent statusreadfailed",
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
              ? "english_text"
              : `${report?.metrics.agentRunSuccessRate ?? 0}%`,
          revenue: "english_text",
        },
        currentTask: check.detail,
        progress:
          check.status === "ok" ? 100 : check.status === "warn" ? 50 : 0,
        settings: {
          platforms: ["Ozon"],
          frequency: "backendenglish_text",
          autoApproval: false,
        },
        recentActions: [],
      })),
    [report],
  );
  const stats = [
    {
      label: "english_text",
      value: String(
        report?.liveChecks.filter((item) => item.status === "ok").length ?? 0,
      ),
      icon: Bot,
      color: "text-blue-600",
    },
    {
      label: "Agent english_text",
      value: String(report?.metrics.agentRunTotal ?? 0),
      icon: CheckCircle2,
      color: "text-green-600",
    },
    {
      label: "realsuccesstext",
      value:
        report?.metrics.agentRunSuccessRate === null ||
        report?.metrics.agentRunSuccessRate === undefined
          ? "english_text"
          : `${report.metrics.agentRunSuccessRate}%`,
      icon: BarChart3,
      color: "text-purple-600",
    },
    {
      label: "english_text",
      value: String(report?.metrics.unresolvedDeadLetterJobs ?? 0),
      icon: Clock,
      color: "text-orange-600",
    },
  ];
  const summaryLines = report
    ? [
        `Agent text ${report.metrics.agentRunTotal} text，completed ${report.metrics.agentRunCompleted} text，failed ${report.metrics.agentRunFailed} text。`,
        `english_text ${report.metrics.unauthorizedAgentActions} text，english_text ${report.metrics.unresolvedDeadLetterJobs} text。`,
        `textriskenglish_text：${report.operationSafety.highRiskActionMode}；textconnectionstoretext ${report.operationSafety.connectedStoreChannels} text。`,
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
