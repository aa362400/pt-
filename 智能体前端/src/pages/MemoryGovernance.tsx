import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  PenLine,
  RefreshCw,
  ShieldX,
  Trash2,
} from "lucide-react";
import {
  memoryGovernanceApi,
  type GovernedMemoryItem,
  type MemoryGovernanceResponse,
} from "../api/memoryGovernance";
import Modal from "../components/ui/Modal";

type Filter = "all" | "trusted" | "unverified" | "quarantined" | "inactive";
type PendingAction =
  | { kind: "correct"; item: GovernedMemoryItem }
  | { kind: "revoke"; item: GovernedMemoryItem }
  | null;

function statusOf(item: GovernedMemoryItem) {
  return item.governance?.trustStatus ?? "unverified";
}

function statusLabel(status: ReturnType<typeof statusOf>) {
  const labels = {
    trusted: "可信",
    quarantined: "已隔离",
    superseded: "已被纠正",
    revoked: "已撤销",
    unverified: "历史未验证",
  };
  return labels[status];
}

function statusTone(status: ReturnType<typeof statusOf>) {
  if (status === "trusted") return "bg-emerald-50 text-emerald-700";
  if (status === "quarantined") return "bg-red-50 text-red-700";
  if (status === "unverified") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function MemoryGovernance() {
  const [data, setData] = useState<MemoryGovernanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [pending, setPending] = useState<PendingAction>(null);
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await memoryGovernanceApi.list());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "记忆治理数据读取失败",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => {
    const source = data?.items ?? [];
    if (filter === "all") return source;
    if (filter === "inactive") {
      return source.filter((item) =>
        ["superseded", "revoked"].includes(statusOf(item)),
      );
    }
    return source.filter((item) => statusOf(item) === filter);
  }, [data, filter]);

  const openAction = (action: NonNullable<PendingAction>) => {
    setPending(action);
    setReason("");
    setNotes(
      action.kind === "correct"
        ? (action.item.lesson ?? action.item.reviewNotes ?? "")
        : "",
    );
  };

  const closeAction = () => {
    if (saving) return;
    setPending(null);
    setNotes("");
    setReason("");
  };

  const submit = async () => {
    if (!pending || !reason.trim()) return;
    if (pending.kind === "correct" && !notes.trim()) return;
    setSaving(true);
    try {
      if (pending.kind === "correct") {
        await memoryGovernanceApi.correctExperience(pending.item.id, {
          notes: notes.trim(),
          reason: reason.trim(),
        });
      } else {
        await memoryGovernanceApi.revoke(
          pending.item.memoryType,
          pending.item.id,
          { reason: reason.trim() },
        );
      }
      closeAction();
      await load();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "记忆治理操作失败",
      );
    } finally {
      setSaving(false);
    }
  };

  const summary = data?.summary;
  const metrics: Array<{
    label: string;
    value: number;
    icon: typeof BrainCircuit;
  }> = [
    { label: "全部", value: summary?.total ?? 0, icon: BrainCircuit },
    { label: "可信", value: summary?.trusted ?? 0, icon: CheckCircle2 },
    { label: "历史未验证", value: summary?.unverified ?? 0, icon: Clock3 },
    { label: "已隔离", value: summary?.quarantined ?? 0, icon: ShieldX },
    {
      label: "已失效",
      value: (summary?.superseded ?? 0) + (summary?.revoked ?? 0),
      icon: Trash2,
    },
  ];
  return (
    <div className="space-y-5" data-testid="memory-governance-page">
      <header className="flex flex-col gap-4 border-b border-[#E5E7EB] pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-[#3157D5]">
            <BrainCircuit size={18} />
            Agent 记忆治理
          </div>
          <h1 className="mt-2 text-2xl font-bold text-[#101828]">
            来源、版本与可信状态
          </h1>
          <p className="mt-1 text-sm text-[#667085]">
            未验证、过期、隔离、撤销和已被纠正的记忆不会再提供给 Agent。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-10 items-center gap-2 border border-[#D0D5DD] bg-white px-3 text-sm font-semibold text-[#344054] hover:bg-[#F9FAFB] disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      </header>

      {error ? (
        <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="border border-[#E5E7EB] bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#667085]">{label}</p>
              <Icon size={16} className="text-[#3157D5]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-[#101828]">{value}</p>
          </div>
        ))}
      </section>

      <section className="border border-[#E5E7EB] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#101828]">记忆记录</h2>
            <p className="mt-1 text-xs text-[#667085]">
              纠正会创建新版本并保留旧版本证据；撤销立即停止复用。
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                "all",
                "trusted",
                "unverified",
                "quarantined",
                "inactive",
              ] as Filter[]
            ).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`h-8 px-3 text-xs font-semibold ${filter === value ? "bg-[#3157D5] text-white" : "bg-[#F2F4F7] text-[#475467]"}`}
              >
                {
                  {
                    all: "全部",
                    trusted: "可信",
                    unverified: "未验证",
                    quarantined: "隔离",
                    inactive: "失效",
                  }[value]
                }
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[#F9FAFB] text-left text-xs text-[#667085]">
              <tr>
                <th className="px-5 py-3">类型</th>
                <th className="px-5 py-3">内容</th>
                <th className="px-5 py-3">来源</th>
                <th className="px-5 py-3">版本</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3">时间</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const status = statusOf(item);
                return (
                  <tr
                    key={`${item.memoryType}-${item.id}`}
                    className="border-t border-[#EAECF0]"
                  >
                    <td className="px-5 py-3 text-[#475467]">
                      {item.memoryType === "experience" ? "经验卡" : "工作记忆"}
                    </td>
                    <td className="max-w-[360px] px-5 py-3">
                      <p className="truncate font-semibold text-[#101828]">
                        {item.title ??
                          item.productName ??
                          item.taskType ??
                          item.id}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-[#667085]">
                        {item.lesson ?? item.reviewNotes ?? item.status ?? "-"}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-xs text-[#475467]">
                      {item.governance?.sourceType ?? "legacy"}
                      <span className="mt-1 block max-w-48 truncate font-mono text-[10px] text-[#98A2B3]">
                        {item.governance?.sourceId ?? "-"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#475467]">
                      v{item.governance?.version ?? 0}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`px-2 py-1 text-xs font-semibold ${statusTone(status)}`}
                      >
                        {statusLabel(status)}
                      </span>
                      {item.governance?.reasons?.length ? (
                        <span className="mt-1 block text-[10px] text-red-600">
                          {item.governance.reasons.join("、")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 text-xs text-[#475467]">
                      {new Date(item.createdAt).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        {item.memoryType === "experience" &&
                        status !== "revoked" &&
                        status !== "superseded" ? (
                          <button
                            type="button"
                            title="纠正记忆"
                            onClick={() =>
                              openAction({ kind: "correct", item })
                            }
                            className="grid h-8 w-8 place-items-center text-[#3157D5] hover:bg-blue-50"
                          >
                            <PenLine size={15} />
                          </button>
                        ) : null}
                        {status !== "revoked" ? (
                          <button
                            type="button"
                            title="撤销记忆"
                            onClick={() => openAction({ kind: "revoke", item })}
                            className="grid h-8 w-8 place-items-center text-red-600 hover:bg-red-50"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-sm text-[#98A2B3]"
                  >
                    没有符合当前筛选条件的记忆。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        open={Boolean(pending)}
        onClose={closeAction}
        title={
          pending?.kind === "correct" ? "纠正 Agent 经验" : "撤销 Agent 记忆"
        }
      >
        <div className="space-y-4">
          {pending?.kind === "correct" ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-[#344054]">
                正确内容
              </span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={5}
                className="w-full border border-[#D0D5DD] p-3 text-sm outline-none focus:border-[#3157D5]"
              />
            </label>
          ) : (
            <div className="flex gap-2 border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={17} className="mt-0.5 shrink-0" />
              撤销后 Agent 将立即停止使用该记忆，审计记录仍会保留。
            </div>
          )}
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#344054]">
              原因
            </span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="w-full border border-[#D0D5DD] p-3 text-sm outline-none focus:border-[#3157D5]"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeAction}
              disabled={saving}
              className="h-9 border border-[#D0D5DD] px-4 text-sm font-semibold text-[#344054]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={
                saving ||
                !reason.trim() ||
                (pending?.kind === "correct" && !notes.trim())
              }
              className="h-9 bg-[#3157D5] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "处理中" : "确认"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
