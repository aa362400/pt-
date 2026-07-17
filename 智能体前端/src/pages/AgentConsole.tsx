import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CirclePause,
  CircleStop,
  Clock3,
  Database,
  Loader2,
  MessageSquareText,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  agentConsoleApi,
  type AgentConversation,
  type AgentPlan,
  type AgentToolDefinition,
  type AgentToolExecution,
  type AgentAutonomyPolicy,
} from "../api/agentConsole";
import { useToast } from "../components/ui/use-toast";

const statusLabels: Record<string, string> = {
  PLANNED: "待执行",
  QUEUED: "已入队",
  RUNNING: "执行中",
  COMPLETED: "已完成",
  FAILED: "失败",
  WAITING_FOR_APPROVAL: "等待人工确认",
  PAUSED: "已暂停",
  CANCELLED: "已取消",
};

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "COMPLETED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "FAILED" || status === "CANCELLED"
        ? "border-red-200 bg-red-50 text-red-700"
        : status === "WAITING_FOR_APPROVAL"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-blue-200 bg-blue-50 text-blue-700";
  return (
    <span
      className={`inline-flex border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {statusLabels[status] ?? status}
    </span>
  );
}

function toolLabel(name: string) {
  const labels: Record<string, string> = {
    "system.health.read": "系统健康检查",
    "product.list": "读取商品",
    "market.observation.list": "读取 Ozon 公开证据",
    "opportunity.list": "读取选品候选",
    "automation.list": "读取自动化流程",
    "notification.list": "读取我的通知",
    "listing.publish.propose": "申请发布商品",
  };
  return labels[name] ?? name;
}

function ResultSummary({ execution }: { execution: AgentToolExecution }) {
  if (execution.status === "FAILED") {
    return (
      <p className="mt-2 flex items-start gap-2 text-xs text-red-700">
        <XCircle size={14} className="mt-0.5 shrink-0" />
        {execution.error?.message || "工具执行失败，未产生业务结果。"}
      </p>
    );
  }
  if (execution.status === "WAITING_FOR_APPROVAL") {
    return (
      <p className="mt-2 flex items-start gap-2 text-xs text-amber-700">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        已创建审批提案；人工确认前不会写入外部平台。
      </p>
    );
  }
  if (execution.status !== "COMPLETED") return null;
  const output = execution.output;
  if (Array.isArray(output)) {
    const names = output
      .slice(0, 3)
      .map((item) =>
        item && typeof item === "object"
          ? String(
              (item as Record<string, unknown>).title ??
                (item as Record<string, unknown>).name ??
                "已返回记录",
            )
          : String(item),
      );
    return (
      <div className="mt-2 text-xs text-slate-600">
        <p>返回 {output.length} 条真实记录。</p>
        {names.length ? (
          <p className="mt-1 truncate">{names.join("、")}</p>
        ) : null}
      </div>
    );
  }
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (record.proposalId) {
      return <p className="mt-2 text-xs text-amber-700">审批提案已创建。</p>;
    }
    if (record.counts && typeof record.counts === "object") {
      return (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {Object.entries(record.counts as Record<string, unknown>).map(
            ([key, value]) => (
              <span key={key}>
                {key}: {String(value)}
              </span>
            ),
          )}
        </div>
      );
    }
  }
  return (
    <p className="mt-2 text-xs text-emerald-700">工具已完成并保存执行证据。</p>
  );
}

function ExecutionRow({
  execution,
  busy,
  onRetry,
}: {
  execution: AgentToolExecution;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="border-t border-slate-100 py-3 first:border-t-0">
      <div className="flex items-center gap-2">
        <Wrench size={15} className="text-blue-600" />
        <strong className="text-sm text-slate-900">
          {toolLabel(execution.toolName)}
        </strong>
        <StatusBadge status={execution.status} />
        {execution.riskLevel === "HIGH" ? (
          <span className="ml-auto text-xs text-amber-700">高风险·需审批</span>
        ) : (
          <span className="ml-auto text-xs text-slate-500">只读</span>
        )}
      </div>
      <ResultSummary execution={execution} />
      {execution.status === "FAILED" ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRetry}
          className="mt-2 inline-flex h-8 items-center gap-1 border border-slate-300 bg-white px-3 text-xs text-slate-700 hover:border-blue-500 disabled:opacity-50"
        >
          <RotateCcw size={13} /> 仅重试失败步骤
        </button>
      ) : null}
    </div>
  );
}

export default function AgentConsole() {
  const { addToast } = useToast();
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [selected, setSelected] = useState<AgentConversation | null>(null);
  const [tools, setTools] = useState<AgentToolDefinition[]>([]);
  const [policy, setPolicy] = useState<AgentAutonomyPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("Ozon 运营检查");
  const [message, setMessage] = useState("");
  const [goal, setGoal] = useState("检查当前商品、Ozon 证据和待处理通知");
  const [selectedTools, setSelectedTools] = useState<string[]>([
    "system.health.read",
    "product.list",
    "market.observation.list",
    "notification.list",
  ]);

  const loadConversation = useCallback(async (id: string) => {
    const detail = await agentConsoleApi.getConversation(id);
    setSelected(detail);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [conversationResult, toolResult, policyResult] = await Promise.all([
        agentConsoleApi.listConversations(),
        agentConsoleApi.listTools(),
        agentConsoleApi.getPolicy(),
      ]);
      setConversations(conversationResult.items);
      setTools(toolResult.items);
      setPolicy(policyResult);
      const id = selected?.id ?? conversationResult.items[0]?.id;
      if (id) await loadConversation(id);
      else setSelected(null);
    } catch {
      addToast(
        "智能体执行台加载失败，请稍后重试",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [addToast, loadConversation, selected?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (
      !selected?.plans?.some((plan) =>
        ["QUEUED", "RUNNING", "WAITING_FOR_APPROVAL"].includes(plan.status),
      )
    )
      return;
    const timer = window.setInterval(
      () => void loadConversation(selected.id),
      5000,
    );
    return () => window.clearInterval(timer);
  }, [loadConversation, selected]);

  const effectiveTools = useMemo(
    () =>
      tools.map((tool) => ({
        ...tool,
        allowed:
          Boolean(policy) &&
          policy!.level >= tool.requiredLevel &&
          !policy!.deniedTools.includes(tool.name) &&
          (policy!.allowedTools.length === 0 ||
            policy!.allowedTools.includes(tool.name)),
      })),
    [policy, tools],
  );

  const createConversation = async () => {
    if (!newTitle.trim() || !policy) return;
    setBusy("create");
    try {
      const created = await agentConsoleApi.createConversation({
        title: newTitle.trim(),
        autonomyLevel: policy.level,
      });
      setConversations((current) => [created, ...current]);
      await loadConversation(created.id);
      addToast("已创建受控智能体会话", "success");
    } catch {
      addToast("创建失败，请稍后重试", "error");
    } finally {
      setBusy(null);
    }
  };

  const createPlan = async () => {
    if (!selected || !goal.trim() || selectedTools.length === 0) return;
    setBusy("plan");
    try {
      await agentConsoleApi.createPlan(selected.id, {
        goal: goal.trim(),
        steps: selectedTools.map((toolName) => ({
          toolName,
          input: toolName.endsWith(".list") ? { limit: 20 } : {},
        })),
      });
      await loadConversation(selected.id);
      addToast("执行计划已生成，尚未执行", "success");
    } catch {
      addToast(
        "计划创建失败，请稍后重试",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  const planAction = async (
    plan: AgentPlan,
    action: "execute" | "pause" | "resume" | "cancel",
  ) => {
    if (!selected) return;
    setBusy(`${action}:${plan.id}`);
    try {
      if (action === "execute") await agentConsoleApi.executePlan(plan.id);
      if (action === "pause") await agentConsoleApi.pausePlan(plan.id);
      if (action === "resume") await agentConsoleApi.resumePlan(plan.id);
      if (action === "cancel") await agentConsoleApi.cancelPlan(plan.id);
      await loadConversation(selected.id);
    } catch {
      addToast("操作失败，请稍后重试", "error");
    } finally {
      setBusy(null);
    }
  };

  const retry = async (executionId: string) => {
    if (!selected) return;
    setBusy(`retry:${executionId}`);
    try {
      await agentConsoleApi.retryExecution(executionId);
      await loadConversation(selected.id);
    } catch {
      addToast("重试失败，请稍后重试", "error");
    } finally {
      setBusy(null);
    }
  };

  const sendMessage = async () => {
    if (!selected || !message.trim()) return;
    setBusy("message");
    try {
      await agentConsoleApi.postMessage(selected.id, message.trim());
      setMessage("");
      await loadConversation(selected.id);
    } catch {
      addToast(
        "消息发送失败，请稍后重试",
        "error",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-full bg-[#F5F7FB] px-5 py-6 xl:px-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">智能体执行台</h1>
            <p className="mt-1 text-sm text-slate-500">
              计划、工具、审批和结果都留下真实运行记录。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 border border-slate-300 bg-white px-4 text-sm hover:border-blue-500"
          >
            <RefreshCw size={16} /> 刷新状态
          </button>
        </div>

        <div className="grid min-h-[720px] grid-cols-1 border border-slate-200 bg-white lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="border-b border-slate-200 p-4 lg:border-b-0 lg:border-r">
            <label
              className="text-xs font-medium text-slate-600"
              htmlFor="conversation-title"
            >
              新会话名称
            </label>
            <input
              id="conversation-title"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              className="mt-1 h-10 w-full border border-slate-300 px-3 text-sm"
            />
            <button
              type="button"
              disabled={busy === "create" || !policy}
              onClick={createConversation}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "create" ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )}{" "}
              新建会话
            </button>
            <h2 className="mt-6 text-xs font-semibold uppercase text-slate-500">
              我的会话
            </h2>
            <div className="mt-2 space-y-1">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => void loadConversation(conversation.id)}
                  className={`w-full border-l-2 px-3 py-3 text-left ${selected?.id === conversation.id ? "border-blue-600 bg-blue-50" : "border-transparent hover:bg-slate-50"}`}
                >
                  <strong className="block truncate text-sm text-slate-900">
                    {conversation.title}
                  </strong>
                  <span className="mt-1 block text-xs text-slate-500">
                    L{conversation.autonomyLevel} ·{" "}
                    {conversation._count?.messages ?? 0} 条消息
                  </span>
                </button>
              ))}
              {!loading && conversations.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500">
                  还没有智能体会话
                </p>
              ) : null}
            </div>
          </aside>

          <main className="min-w-0 p-5">
            {!selected ? (
              <div className="grid min-h-[560px] place-items-center text-center text-sm text-slate-500">
                <div>
                  <Bot className="mx-auto mb-3 text-slate-400" />
                  <p>创建会话后才能生成受控执行计划。</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <section>
                  <div className="flex items-center gap-2">
                    <MessageSquareText size={18} className="text-blue-600" />
                    <h2 className="font-semibold text-slate-900">对话</h2>
                  </div>
                  <div className="mt-3 max-h-56 space-y-3 overflow-auto border-y border-slate-100 py-3">
                    {(selected.messages ?? []).map((item) => (
                      <div
                        key={item.id}
                        className={`max-w-[82%] px-3 py-2 text-sm leading-6 ${item.role === "USER" ? "ml-auto bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}
                      >
                        {item.content}
                      </div>
                    ))}
                    {selected.messages?.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        可以先说明目标，再选择工具生成计划。
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void sendMessage();
                      }}
                      placeholder="输入经营问题或任务目标"
                      className="h-10 min-w-0 flex-1 border border-slate-300 px-3 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy === "message"}
                      onClick={sendMessage}
                      aria-label="发送消息"
                      className="grid h-10 w-10 place-items-center bg-blue-600 text-white disabled:opacity-50"
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </section>

                <section className="border-t border-slate-200 pt-5">
                  <h2 className="font-semibold text-slate-900">生成执行计划</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    选择后端已注册工具；创建计划不会立即执行。
                  </p>
                  <input
                    value={goal}
                    onChange={(event) => setGoal(event.target.value)}
                    className="mt-3 h-10 w-full border border-slate-300 px-3 text-sm"
                  />
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {effectiveTools.map((tool) => (
                      <label
                        key={tool.name}
                        className={`flex items-start gap-3 border p-3 text-sm ${tool.allowed ? "border-slate-200" : "border-slate-100 bg-slate-50 text-slate-400"}`}
                      >
                        <input
                          type="checkbox"
                          disabled={!tool.allowed}
                          checked={selectedTools.includes(tool.name)}
                          onChange={(event) =>
                            setSelectedTools((current) =>
                              event.target.checked
                                ? [...current, tool.name]
                                : current.filter((name) => name !== tool.name),
                            )
                          }
                          className="mt-1"
                        />
                        <span>
                          <strong className="block font-medium">
                            {toolLabel(tool.name)}
                          </strong>
                          <small className="mt-1 block leading-5">
                            {tool.description}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={busy === "plan" || selectedTools.length === 0}
                    onClick={createPlan}
                    className="mt-3 inline-flex h-10 items-center gap-2 bg-blue-600 px-4 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Database size={16} />
                    生成计划
                  </button>
                </section>

                <section className="border-t border-slate-200 pt-5">
                  <h2 className="font-semibold text-slate-900">执行记录</h2>
                  <div className="mt-3 divide-y divide-slate-200">
                    {(selected.plans ?? []).map((plan) => (
                      <article key={plan.id} className="py-5 first:pt-0">
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <strong className="block text-sm text-slate-900">
                              {plan.goal}
                            </strong>
                            <span className="mt-1 block text-xs text-slate-500">
                              {new Date(plan.createdAt).toLocaleString(
                                "zh-CN",
                                { hour12: false },
                              )}
                            </span>
                          </div>
                          <StatusBadge status={plan.status} />
                        </div>
                        <div className="mt-3 border border-slate-200 px-3">
                          {plan.executions.map((execution) => (
                            <ExecutionRow
                              key={execution.id}
                              execution={execution}
                              busy={Boolean(busy)}
                              onRetry={() => void retry(execution.id)}
                            />
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {plan.status === "PLANNED" ||
                          plan.status === "FAILED" ? (
                            <button
                              type="button"
                              onClick={() => void planAction(plan, "execute")}
                              disabled={Boolean(busy)}
                              className="inline-flex h-8 items-center gap-1 bg-blue-600 px-3 text-xs text-white disabled:opacity-50"
                            >
                              <Play size={13} />
                              执行
                            </button>
                          ) : null}
                          {["QUEUED", "RUNNING"].includes(plan.status) ? (
                            <button
                              type="button"
                              onClick={() => void planAction(plan, "pause")}
                              disabled={Boolean(busy)}
                              className="inline-flex h-8 items-center gap-1 border border-slate-300 px-3 text-xs"
                            >
                              <CirclePause size={13} />
                              暂停
                            </button>
                          ) : null}
                          {plan.status === "PAUSED" ? (
                            <button
                              type="button"
                              onClick={() => void planAction(plan, "resume")}
                              disabled={Boolean(busy)}
                              className="inline-flex h-8 items-center gap-1 bg-blue-600 px-3 text-xs text-white disabled:opacity-50"
                            >
                              <Play size={13} />
                              继续
                            </button>
                          ) : null}
                          {!["COMPLETED", "CANCELLED"].includes(plan.status) ? (
                            <button
                              type="button"
                              onClick={() => void planAction(plan, "cancel")}
                              disabled={Boolean(busy)}
                              className="inline-flex h-8 items-center gap-1 border border-red-200 px-3 text-xs text-red-700"
                            >
                              <CircleStop size={13} />
                              取消
                            </button>
                          ) : null}
                        </div>
                      </article>
                    ))}
                    {selected.plans?.length === 0 ? (
                      <p className="py-8 text-center text-sm text-slate-500">
                        尚未生成执行计划
                      </p>
                    ) : null}
                  </div>
                </section>
              </div>
            )}
          </main>

          <aside className="border-t border-slate-200 p-5 lg:border-l lg:border-t-0">
            <div className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-600" />
              <h2 className="font-semibold text-slate-900">自治与权限</h2>
            </div>
            {policy ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="border-l-4 border-blue-600 bg-blue-50 p-3">
                  <strong className="block text-lg text-blue-900">
                    L{policy.level}
                  </strong>
                  <span className="text-xs text-blue-700">
                    {policy.source === "system_default"
                      ? "系统默认策略"
                      : policy.source === "user_override"
                        ? "用户专属策略"
                        : "组织策略"}
                  </span>
                </div>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-slate-500">只读工具</dt>
                    <dd className="mt-1 text-slate-900">L1 可执行</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">外部写入</dt>
                    <dd className="mt-1 text-slate-900">必须进入人工审批</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">工具白名单</dt>
                    <dd className="mt-1 text-slate-900">
                      {policy.allowedTools.length
                        ? `${policy.allowedTools.length} 项`
                        : "使用等级默认范围"}
                    </dd>
                  </div>
                </dl>
                {!policy.highRiskApproval ? (
                  <p className="flex gap-2 border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertTriangle size={15} />
                    高风险审批已关闭，因此所有高风险工具被拒绝。
                  </p>
                ) : null}
              </div>
            ) : (
              <Loader2 className="mt-5 animate-spin text-slate-400" />
            )}
            <div className="mt-7 flex items-center gap-2">
              <Clock3 size={17} className="text-slate-500" />
              <h2 className="font-semibold text-slate-900">状态说明</h2>
            </div>
            <ul className="mt-3 space-y-3 text-xs leading-5 text-slate-600">
              <li className="flex gap-2">
                <CheckCircle2 size={14} className="mt-0.5 text-emerald-600" />
                已完成：后端工具已返回并保存结果。
              </li>
              <li className="flex gap-2">
                <ShieldCheck size={14} className="mt-0.5 text-amber-600" />
                等待人工确认：未执行外部写入。
              </li>
              <li className="flex gap-2">
                <XCircle size={14} className="mt-0.5 text-red-600" />
                失败：显示真实原因，可只重试失败步骤。
              </li>
            </ul>
          </aside>
        </div>
      </div>
    </div>
  );
}
