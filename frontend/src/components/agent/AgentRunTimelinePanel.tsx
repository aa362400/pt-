import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban,
  ChevronRight,
  Clock3,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  AGENT_LIFECYCLE_STATUS_LABELS,
  cancelAgentRun,
  getAgentRunTimeline,
  listAgentRuns,
  retryAgentRun,
  type AgentLifecycleStatus,
  type AgentRun,
  type AgentRunTimeline,
} from "../../api/agentRuns";
import { useToast } from "../ui/use-toast";

const TERMINAL = new Set<AgentLifecycleStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

const EVENT_LABELS: Record<string, string> = {
  RUN_CREATED: "taskenglish_text",
  MIGRATED_LEGACY_STATE: "texttaskstatustextmigration",
  PLAN_STARTED: "english_text",
  TOOL_CALL_REQUESTED: "textrequestenglish_text",
  TOOL_RESULT_RECEIVED: "english_text",
  ACTION_PROPOSED: "english_texthumanapproval",
  APPROVAL_GRANTED: "humanenglish_text",
  APPROVAL_REJECTED: "humanenglish_text",
  EXECUTION_FINISHED: "english_textcompleted",
  VERIFICATION_PASSED: "english_textpassed",
  VERIFICATION_FAILED: "english_textfailed",
  RETRYABLE_ERROR: "english_texterror",
  RETRY_DISPATCHED: "english_text",
  TOOL_TIMEOUT: "english_text",
  NON_RETRYABLE_ERROR: "english_texterror",
  FATAL_ERROR: "english_texterror",
  CANCELLED_BY_USER: "userenglish_texttask",
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  PRODUCT_RESEARCHER: "textproduct research",
  LISTING_OPTIMIZER: "productenglish_text",
  ADVERTISING_STRATEGIST: "english_text",
  PROFIT_ANALYST: "profittext",
  CUSTOMER_INSIGHT: "customertext",
  CONTENT_WRITER: "producttextgeneration",
  KEYWORD_EXPLORER: "keywordstext",
  GENERAL_ASSISTANT: "english_text",
  IMAGE_CREATIVE: "productimagegeneration",
  PLANNER: "automatictextflowtext",
};

function formatTime(value?: string | null) {
  if (!value) return "english_text";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function statusTone(status: AgentLifecycleStatus) {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  if (status === "FAILED" || status === "CANCELLED") {
    return "bg-red-50 text-red-700";
  }
  if (status === "WAITING_APPROVAL") return "bg-amber-50 text-amber-700";
  return "bg-blue-50 text-blue-700";
}

export function AgentRunTimelinePanel() {
  const { addToast } = useToast();
  const [runs, setRuns] = useState<AgentRun<Record<string, unknown>>[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<AgentRunTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const page = await listAgentRuns(1, 8);
      setRuns(page.items);
      setSelectedId((current) =>
        current && page.items.some((item) => item.id === current)
          ? current
          : (page.items[0]?.id ?? null),
      );
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "taskstatusreadfailed",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  const loadTimeline = useCallback(async (runId: string) => {
    const result = await getAgentRunTimeline(runId);
    setTimeline(result);
  }, []);

  useEffect(() => {
    void loadRuns();
    const timer = window.setInterval(() => void loadRuns(), 5_000);
    return () => window.clearInterval(timer);
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedId) {
      setTimeline(null);
      return;
    }
    void loadTimeline(selectedId).catch((error) =>
      addToast(
        error instanceof Error ? error.message : "taskenglish_textreadfailed",
        "error",
      ),
    );
  }, [addToast, loadTimeline, selectedId, runs]);

  const selected = useMemo(
    () => runs.find((run) => run.id === selectedId) ?? null,
    [runs, selectedId],
  );

  const handleCancel = async () => {
    if (!selected || TERMINAL.has(selected.lifecycleStatus)) return;
    if (!window.confirm("english_texttasktext？")) return;
    setCancelling(true);
    try {
      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `cancel-${selected.id}-${Date.now()}`;
      await cancelAgentRun(selected.id, requestId);
      await loadRuns();
      await loadTimeline(selected.id);
      addToast("taskenglish_text", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "texttaskfailed",
        "error",
      );
    } finally {
      setCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (
      !selected ||
      !["FAILED", "CANCELLED"].includes(selected.lifecycleStatus)
    ) {
      return;
    }
    setRetrying(true);
    try {
      const requestId =
        globalThis.crypto?.randomUUID?.() ??
        `retry-${selected.id}-${Date.now()}`;
      const retryRun = await retryAgentRun(selected.id, requestId);
      await loadRuns();
      setSelectedId(retryRun.id);
      await loadTimeline(retryRun.id);
      addToast("english_texttask，texttaskenglish_text", "success");
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "texttasktextfailed",
        "error",
      );
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className="mb-8 overflow-hidden border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            taskenglish_text
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            textrealbackendstatus、text、approvalenglish_text
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRuns()}
          className="inline-flex h-9 w-9 items-center justify-center border border-gray-200 text-gray-600 hover:bg-gray-50"
          title="texttask"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          textreadtask...
        </div>
      ) : runs.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-gray-500">
          textnonerealtasktext
        </div>
      ) : (
        <div className="grid min-h-[340px] lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-gray-200 lg:border-b-0 lg:border-r">
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => setSelectedId(run.id)}
                className={`flex w-full items-center gap-3 border-b border-gray-100 px-5 py-4 text-left hover:bg-gray-50 ${
                  run.id === selectedId ? "bg-blue-50/60" : "bg-white"
                }`}
              >
                <Clock3 className="h-4 w-4 shrink-0 text-gray-400" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {AGENT_TYPE_LABELS[run.agentType] ?? "textagent"}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    {formatTime(run.createdAt)}
                  </span>
                </span>
                <span
                  className={`shrink-0 px-2 py-1 text-xs ${statusTone(run.lifecycleStatus)}`}
                >
                  {AGENT_LIFECYCLE_STATUS_LABELS[run.lifecycleStatus]}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>

          <div className="min-w-0 px-5 py-4">
            {selected && timeline ? (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {AGENT_TYPE_LABELS[selected.agentType] ?? "textagent"}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs ${statusTone(selected.lifecycleStatus)}`}
                      >
                        {
                          AGENT_LIFECYCLE_STATUS_LABELS[
                            selected.lifecycleStatus
                          ]
                        }
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      tasktext {selected.id} · text {selected.version}
                    </p>
                  </div>
                  {!TERMINAL.has(selected.lifecycleStatus) && (
                    <button
                      type="button"
                      onClick={() => void handleCancel()}
                      disabled={cancelling}
                      className="inline-flex items-center gap-2 border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Ban className="h-4 w-4" />
                      {cancelling ? "english_text" : "texttask"}
                    </button>
                  )}
                  {["FAILED", "CANCELLED"].includes(
                    selected.lifecycleStatus,
                  ) && (
                    <button
                      type="button"
                      onClick={() => void handleRetry()}
                      disabled={retrying}
                      className="inline-flex items-center gap-2 border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {retrying ? "english_text" : "english_text"}
                    </button>
                  )}
                </div>

                <ol className="space-y-0">
                  {timeline.transitions.map((item, index) => (
                    <li key={item.id} className="relative flex gap-3 pb-5">
                      {index < timeline.transitions.length - 1 && (
                        <span className="absolute left-[7px] top-4 h-full w-px bg-gray-200" />
                      )}
                      <span className="relative mt-1.5 h-4 w-4 shrink-0 border-4 border-white bg-blue-600" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {EVENT_LABELS[item.eventType] ?? "statusenglish_text"}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {item.fromStatus
                            ? AGENT_LIFECYCLE_STATUS_LABELS[item.fromStatus]
                            : "textstatus"}
                          {" → "}
                          {AGENT_LIFECYCLE_STATUS_LABELS[item.toStatus]}
                          {" · "}text {item.attempt} english_text
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>

                {selected.errorMessage && (
                  <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {selected.errorMessage}
                  </div>
                )}
              </>
            ) : (
              <div className="py-12 text-center text-sm text-gray-500">
                textreadenglish_text...
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
