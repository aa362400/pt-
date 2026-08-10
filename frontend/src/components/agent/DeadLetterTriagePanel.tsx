import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  ServerOff,
} from "lucide-react";
import {
  deadLettersApi,
  type DeadLetterClassification,
  type DeadLetterJob,
} from "../../api/deadLetters";
import Modal from "../ui/Modal";
import { useToast } from "../ui/use-toast";

interface DeadLetterTriagePanelProps {
  onChanged?: () => void;
}

type PendingAction =
  | { type: "replay"; item: DeadLetterJob; idempotencyKey: string }
  | { type: "resolve"; item: DeadLetterJob }
  | null;

function createIdempotencyKey(scope: string): string {
  const randomPart =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${scope}:${randomPart}`;
}

const CLASSIFICATION_META: Record<
  DeadLetterClassification,
  { label: string; className: string; nextStep: string }
> = {
  UNCLASSIFIED: {
    label: "待分类",
    className: "border-gray-200 bg-gray-50 text-gray-700",
    nextStep: "运行证据扫描后再决定",
  },
  RETRYABLE: {
    label: "可安全重试",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    nextStep: "创建新的幂等恢复任务",
  },
  PERMANENT: {
    label: "永久失败",
    className: "border-red-200 bg-red-50 text-red-700",
    nextStep: "保留失败证据并归档",
  },
  DATA_MISSING: {
    label: "数据缺失",
    className: "border-amber-200 bg-amber-50 text-amber-800",
    nextStep: "补齐数据后重新发起业务任务",
  },
  PROVIDER_FAILURE: {
    label: "供应商失败",
    className: "border-orange-200 bg-orange-50 text-orange-800",
    nextStep: "先验证模型额度和服务健康",
  },
};

export function DeadLetterTriagePanel({
  onChanged,
}: DeadLetterTriagePanelProps) {
  const { addToast } = useToast();
  const [items, setItems] = useState<DeadLetterJob[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [triaging, setTriaging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [replayReason, setReplayReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await deadLettersApi.listOpen();
      setItems(response.items);
      setTotal(response.total);
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "死信记录读取失败",
        "error",
      );
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<DeadLetterClassification, number> = {
      UNCLASSIFIED: 0,
      RETRYABLE: 0,
      PERMANENT: 0,
      DATA_MISSING: 0,
      PROVIDER_FAILURE: 0,
    };
    for (const item of items) result[item.classification] += 1;
    return result;
  }, [items]);

  const runTriage = async () => {
    setTriaging(true);
    try {
      const result = await deadLettersApi.triage();
      const staleClaimText = result.staleClaimsReleased
        ? `，另有 ${result.staleClaimsReleased} 条超时恢复已转人工检查`
        : "";
      addToast(
        `已根据证据分类 ${result.scanned} 条记录${staleClaimText}`,
        "success",
      );
      await load();
      onChanged?.();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "死信分类失败",
        "error",
      );
    } finally {
      setTriaging(false);
    }
  };

  const submitAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.type === "replay" && replayReason.trim().length < 8) {
      addToast("请填写至少 8 个字的恢复原因", "error");
      return;
    }
    setSubmitting(true);
    try {
      if (pendingAction.type === "replay") {
        const result = await deadLettersApi.replay(pendingAction.item.id, {
          reason: replayReason.trim(),
          idempotencyKey: pendingAction.idempotencyKey,
        });
        addToast(`恢复任务 ${result.replayRunId} 已创建`, "success");
      } else {
        await deadLettersApi.resolve(
          pendingAction.item.id,
          resolutionNote.trim(),
        );
        addToast("失败记录已归档，原任务状态保持不变", "success");
      }
      setPendingAction(null);
      setResolutionNote("");
      setReplayReason("");
      await load();
      onChanged?.();
    } catch (error) {
      addToast(
        error instanceof Error ? error.message : "处置操作失败",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-gray-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <h2 className="text-base font-semibold text-gray-900">死信处置</h2>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            失败任务不会被删除或伪装成成功；只有明确可重试的记录才能创建恢复任务。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="重新读取记录"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => void runTriage()}
            disabled={triaging}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {triaging ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            扫描并分类
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 border-b border-gray-200 sm:grid-cols-5">
        <SummaryCell label="未处理" value={total} />
        <SummaryCell label="可重试" value={counts.RETRYABLE} />
        <SummaryCell label="供应商失败" value={counts.PROVIDER_FAILURE} />
        <SummaryCell label="数据缺失" value={counts.DATA_MISSING} />
        <SummaryCell label="永久失败" value={counts.PERMANENT} />
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在读取失败记录
        </div>
      ) : items.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center text-sm text-gray-500">
          <CheckCircle2 className="mb-2 h-6 w-6 text-emerald-600" />
          当前没有未处理死信
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {items.map((item) => {
            const meta = CLASSIFICATION_META[item.classification];
            return (
              <div
                key={item.id}
                className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1.4fr)_minmax(180px,1fr)_auto] lg:items-center"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {item.queueName === "agent-runs"
                      ? "Agent 任务"
                      : "自动化流程"}
                  </div>
                  <div
                    className="mt-1 truncate text-xs text-gray-500"
                    title={sourceId(item)}
                  >
                    {sourceId(item)}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(item.failedAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">
                    {item.classificationReason ?? "尚未完成根因分类"}
                  </p>
                </div>
                <div className="text-sm text-gray-600">
                  <div className="text-xs text-gray-400">建议下一步</div>
                  <div className="mt-1">{meta.nextStep}</div>
                </div>
                <div className="flex justify-end gap-2">
                  {item.classification === "RETRYABLE" &&
                  item.replayEligible ? (
                    <button
                      type="button"
                      onClick={() => {
                        setReplayReason("");
                        setPendingAction({
                          type: "replay",
                          item,
                          idempotencyKey: createIdempotencyKey(
                            `dead-letter-${item.id}`,
                          ),
                        });
                      }}
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                    >
                      <RotateCcw className="h-4 w-4" />
                      创建恢复任务
                    </button>
                  ) : item.classification !== "UNCLASSIFIED" ? (
                    <button
                      type="button"
                      onClick={() =>
                        setPendingAction({ type: "resolve", item })
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Archive className="h-4 w-4" />
                      归档记录
                    </button>
                  ) : (
                    <ServerOff className="h-5 w-5 text-gray-300" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(pendingAction)}
        onClose={() => {
          if (!submitting) {
            setPendingAction(null);
            setResolutionNote("");
            setReplayReason("");
          }
        }}
        title={
          pendingAction?.type === "replay"
            ? "确认创建恢复任务"
            : "确认归档失败记录"
        }
      >
        {pendingAction?.type === "replay" ? (
          <div className="space-y-4">
            <p className="text-sm leading-6 text-gray-600">
              系统会创建一个新的幂等任务，原失败任务和审计证据保持不变。该操作不会直接写入店铺。
            </p>
            <label className="block text-sm font-medium text-gray-700">
              恢复原因
              <textarea
                value={replayReason}
                onChange={(event) => setReplayReason(event.target.value)}
                placeholder="说明已核对的失败原因，以及为什么现在可以重试"
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <p className="text-xs leading-5 text-gray-500">
              本次确认会使用固定防重复编号；网络重试不会创建第二个恢复任务。
            </p>
            <ActionButtons
              submitting={submitting}
              confirmLabel="确认创建"
              confirmDisabled={replayReason.trim().length < 8}
              onCancel={() => {
                setPendingAction(null);
                setReplayReason("");
              }}
              onConfirm={() => void submitAction()}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700">
              归档说明
              <textarea
                value={resolutionNote}
                onChange={(event) => setResolutionNote(event.target.value)}
                placeholder="说明为什么不重试，以及后续如何处理"
                className="mt-2 min-h-24 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <p className="text-xs text-gray-500">
              归档只关闭死信记录，不会把原失败任务改成成功。
            </p>
            <ActionButtons
              submitting={submitting}
              confirmLabel="确认归档"
              confirmDisabled={resolutionNote.trim().length < 8}
              onCancel={() => {
                setPendingAction(null);
                setResolutionNote("");
              }}
              onConfirm={() => void submitAction()}
            />
          </div>
        )}
      </Modal>
    </section>
  );
}

function SummaryCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-gray-100 px-4 py-3 last:border-r-0">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function sourceId(item: DeadLetterJob): string {
  const value =
    item.queueName === "agent-runs"
      ? item.data.agentRunId
      : item.data.automationRunId;
  return typeof value === "string" ? value : `死信 ${item.id}`;
}

function ActionButtons({
  submitting,
  confirmLabel,
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: {
  submitting: boolean;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="h-9 rounded-lg border border-gray-300 px-4 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      >
        取消
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={submitting || confirmDisabled}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  );
}
