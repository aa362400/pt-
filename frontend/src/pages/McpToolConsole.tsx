import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Code2,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  SquareTerminal,
  XCircle,
} from "lucide-react";
import { mcpToolsApi } from "../api/mcpTools";
import type {
  AgentProxyAction,
  AgentProxyActionsResponse,
  AgentProxyConsoleResponse,
  McpToolRun,
  McpManifest,
} from "../api/mcpTools";
import { useToast } from "../components/ui/use-toast.ts";
import { CapabilityTokensPanel } from "../components/mcp/CapabilityTokensPanel";

const defaultParamsByAction: Record<string, string> = {
  "profit.analyze": JSON.stringify(
    {
      salePrice: 100,
      productCost: 40,
      shippingCost: 8,
      platformFee: 12,
      currency: "USD",
    },
    null,
    2,
  ),
  "temu.price_check": JSON.stringify(
    {
      productName: "Personalized Book Club Kindle Gift Set",
      declaredPrice: 30,
      cost: 9,
      shippingCost: 2,
      packagingCost: 1.2,
      addedCost: 1.5,
      weightGram: 180,
      packageLengthCm: 20,
      packageWidthCm: 14,
      packageHeightCm: 2,
      blankSimilarityScore: 5,
      lowPriceCompetitorDensity: 4,
      titleIndependenceScore: 4,
      imageIndependenceScore: 4,
      productIdentityScore: 5,
      customizationFields: 3,
      deliveryComponents: ["Kindle case", "reader card", "gift box"],
      giftReady: true,
      realDeliveryEvidence: true,
      baselineCheckedPrice: 18,
    },
    null,
    2,
  ),
  "temu.pricing.calculate": JSON.stringify(
    {
      mode: "quote_simulation",
      blank_cost: 10,
      logistics_fee: 7,
      platform_fee_rate: 0.12,
      withdrawal_fee_rate: 0.01,
      target_margin_rate: 0.35,
      expected_approval_rate: 0.5,
      currency: "CNY",
    },
    null,
    2,
  ),
  "commerce.profit.calculate": JSON.stringify(
    {
      price: 29.99,
      cost: 8,
      freight: 3,
      packaging: 1,
      platform: "etsy",
      mode: "conservative",
      target_margin_pct: 30,
    },
    null,
    2,
  ),
  "commerce.keywords.analyze": JSON.stringify(
    {
      product_name: "personalized wooden pen",
      material: "wood",
      target_audience: "teacher, graduate, dad",
      platform: "etsy",
      count: 13,
    },
    null,
    2,
  ),
  "commerce.image_prompts.generate": JSON.stringify(
    {
      product_name: "personalized wooden pen",
      material: "wood",
      platform: "etsy",
      image_count: 9,
      aspect_ratio: "1:1",
      style: "warm premium gift",
      product_fixed_rules: ["do not change pen color", "do not print on cap"],
    },
    null,
    2,
  ),
  "commerce.csv.export": JSON.stringify(
    {
      platform: "etsy",
      rows: [
        { sku: "PEN-001", title: "Personalized Wooden Pen", price: 29.99 },
      ],
    },
    null,
    2,
  ),
  "commerce.risk.check": JSON.stringify(
    {
      title: "Personalized Wooden Pen Gift",
      description: "Custom name gift made from wood.",
      tags: ["teacher gift", "graduation gift"],
    },
    null,
    2,
  ),
  "amazon.title.optimize": JSON.stringify(
    {
      product_name: "Personalized Wooden Pen",
      attributes: ["Custom Name", "Gift Box"],
      keywords: ["Graduation Gift", "Teacher Gift"],
      max_chars: 75,
    },
    null,
    2,
  ),
  "listing.quality.score": JSON.stringify(
    {
      title: "Personalized Wooden Pen Gift",
      description: "Detailed factual product description.",
      keywords: ["wooden pen", "teacher gift"],
      image_prompts: [{ imageNo: 1 }],
      margin_pct: 35,
      risk_hits: [],
      evidence_count: 2,
    },
    null,
    2,
  ),
  "keyword.analyze": JSON.stringify(
    {
      seedKeywords: ["wireless charger"],
      marketplace: "ozon.ru",
      locale: "zh-CN",
    },
    null,
    2,
  ),
  "trend.analyze": JSON.stringify(
    {
      category: "home goods",
      marketplace: "ozon.ru",
      timeframe: "30d",
    },
    null,
    2,
  ),
  "linkfoxskill.version": "{}",
  "linkfoxskill.agentlist": "{}",
  "linkfoxskill.search": JSON.stringify(
    {
      query: "Ozon product research",
      page: 1,
      limit: 10,
    },
    null,
    2,
  ),
  "listing.publish": JSON.stringify(
    {
      listingId: "replace-with-real-listing-id",
    },
    null,
    2,
  ),
};

function permissionLabel(level: number): string {
  if (level >= 4) return "L4 publish/text";
  if (level === 3) return "L3 english_textdata";
  if (level === 2) return "L2 generationtext";
  return "L1 english_text";
}

function statusTone(action: AgentProxyAction): string {
  if (!action.permission.allowed)
    return "border-red-200 bg-red-50 text-red-700";
  if (action.permission.requireConfirm) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function statusLabel(action: AgentProxyAction): string {
  if (!action.permission.allowed) return "english_text";
  if (action.permission.requireConfirm) return "texthumantext";
  return "textautomatictext";
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(input: string): Record<string, unknown> {
  if (!input.trim()) return {};
  const parsed = JSON.parse(input) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("english_textyes JSON text");
  }
  return parsed as Record<string, unknown>;
}

function ResultPanel({ result }: { result: AgentProxyConsoleResponse | null }) {
  if (!result) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-lg border border-dashed border-[#DDE1F2] bg-[#FAFBFF] text-center text-sm text-[#8B93B5]">
        textbackendtext
      </div>
    );
  }

  const pending = result.status === "pending_confirmation";
  const executed = result.status === "executed";
  const dryRun = result.dryRun === true;

  return (
    <div className="space-y-3">
      <div
        className={`rounded-lg border px-4 py-3 text-sm ${
          pending
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : executed
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : dryRun
                ? "border-blue-200 bg-blue-50 text-blue-800"
                : "border-[#E8E8F0] bg-[#FAFBFF] text-[#4A5578]"
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {pending ? (
            <ClipboardCheck size={16} />
          ) : executed ? (
            <CheckCircle2 size={16} />
          ) : (
            <ShieldCheck size={16} />
          )}
          {pending
            ? "english_text，texthumanreviewenglish_text"
            : executed
              ? "backendenglish_text"
              : dryRun
                ? "english_textpassed"
                : "backendenglish_text"}
        </div>
        {result.notificationId ? (
          <p className="mt-1 text-xs">reviewnotification ID：{result.notificationId}</p>
        ) : null}
      </div>
      <pre className="max-h-[520px] overflow-auto rounded-lg bg-[#101828] p-4 text-xs leading-5 text-white">
        {formatJson(result)}
      </pre>
    </div>
  );
}

export default function McpToolConsole() {
  const { addToast } = useToast();
  const initializedActionRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [actionsResponse, setActionsResponse] =
    useState<AgentProxyActionsResponse | null>(null);
  const [selectedActionName, setSelectedActionName] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [paramsText, setParamsText] = useState("{}");
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AgentProxyConsoleResponse | null>(null);
  const [runs, setRuns] = useState<McpToolRun[]>([]);
  const [manifest, setManifest] = useState<McpManifest | null>(null);

  const actions = useMemo(
    () => actionsResponse?.actions ?? [],
    [actionsResponse],
  );
  const selectedAction = useMemo(
    () => actions.find((item) => item.name === selectedActionName) ?? null,
    [actions, selectedActionName],
  );
  const selectedMcpTool = useMemo(
    () =>
      manifest?.tools.find((tool) => tool.action === selectedActionName) ??
      null,
    [manifest, selectedActionName],
  );
  const mcpExecutionBlocked = Boolean(
    selectedMcpTool && manifest?.trust.status !== "trusted",
  );

  const fetchActions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, runResult, manifestResult] = await Promise.all([
        mcpToolsApi.listActions(),
        mcpToolsApi.listRuns(),
        mcpToolsApi.getManifest(),
      ]);
      setActionsResponse(data);
      setRuns(runResult.items);
      setManifest(manifestResult);
      const firstAllowed =
        data.actions.find((item) => item.permission.allowed)?.name ??
        data.actions[0]?.name ??
        "";
      if (!initializedActionRef.current && firstAllowed) {
        initializedActionRef.current = true;
        setSelectedActionName(firstAllowed);
        setParamsText(defaultParamsByAction[firstAllowed] ?? "{}");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "english_textfailed";
      setError(message);
      addToast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void fetchActions();
  }, [fetchActions]);

  const handleSelectAction = (name: string) => {
    setSelectedActionName(name);
    setParamsText(defaultParamsByAction[name] ?? "{}");
    setResult(null);
  };

  const handleCall = async () => {
    if (!selectedAction) {
      addToast("english_textbackendenglish_text action", "error");
      return;
    }
    let params: Record<string, unknown>;
    try {
      params = parseJsonObject(paramsText);
    } catch (err) {
      addToast(
        err instanceof Error ? err.message : "JSON english_texterror",
        "error",
      );
      return;
    }

    setRunning(true);
    setResult(null);
    try {
      const response = await mcpToolsApi.call({
        action: selectedAction.name,
        workspaceId: workspaceId.trim() || undefined,
        params,
        dryRun,
      });
      setResult(response);
      if (!dryRun) {
        const runResult = await mcpToolsApi.listRuns();
        setRuns(runResult.items);
      }
      if (response.status === "pending_confirmation") {
        addToast("textriskenglish_texthumanreviewtext，english_textwritestore。", "warning");
      } else if (response.status === "executed") {
        addToast("backendenglish_text。", "success");
      } else if (response.dryRun) {
        addToast("english_textcompleted，english_textrealtext。", "success");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "english_textfailed";
      setResult({
        status: "error",
        action: selectedAction.name,
        result: { message },
      });
      addToast(message, "error");
    } finally {
      setRunning(false);
    }
  };

  const allowedCount = actions.filter((item) => item.permission.allowed).length;
  const confirmCount = actions.filter(
    (item) => item.permission.requireConfirm,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
            <SquareTerminal size={22} />
          </span>
          <div>
            <h1 className="text-xl font-bold text-[#1A1A2E]">
              MCP english_text
            </h1>
            <p className="mt-1 text-sm text-[#6B7280]">agent-proxy / console</p>
          </div>
        </div>
        <button
          onClick={() => void fetchActions()}
          disabled={loading}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm font-medium text-[#4A5578] hover:bg-[#F8F9FF] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          english_text
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <p className="text-xs text-[#8B93B5]">english_text</p>
          <p className="mt-1 text-2xl font-bold text-[#1A1A2E]">
            {actions.length}
          </p>
        </div>
        <div className="rounded-lg border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <p className="text-xs text-[#8B93B5]">english_text</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600">
            {allowedCount}
          </p>
        </div>
        <div className="rounded-lg border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <p className="text-xs text-[#8B93B5]">texthumantext</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {confirmCount}
          </p>
        </div>
        <div className="rounded-lg border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <p className="text-xs text-[#8B93B5]">agentenglish_text</p>
          <p
            className={`mt-1 text-2xl font-bold ${actionsResponse?.autonomyEnabled ? "text-emerald-600" : "text-red-600"}`}
          >
            {actionsResponse?.autonomyEnabled ? "english_text" : "english_text"}
          </p>
        </div>
      </div>

      {manifest ? (
        <section
          className={`border-y px-5 py-4 ${
            manifest.trust.integrityVerified
              ? "border-emerald-200 bg-emerald-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-[#4A5578]">
                MCP Trust Gateway
              </p>
              <p className="mt-1 text-sm text-[#1A1A2E]">
                {manifest.server.name} v{manifest.server.version} ·{" "}
                {manifest.transport} · {manifest.tools.length} english_text
              </p>
              <p className="mt-1 text-xs text-[#667085]">
                english_text：{manifest.trust.approvalType} · text：
                {new Date(manifest.trust.expiresAt).toLocaleDateString("zh-CN")}
              </p>
              <p className="mt-1 text-xs text-[#667085]">
                text：{manifest.trust.signing.algorithm} · secret：
                {manifest.trust.signing.keyId}
              </p>
            </div>
            <div className="min-w-0 lg:text-right">
              <p
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  manifest.trust.integrityVerified
                    ? "text-emerald-700"
                    : "text-red-700"
                }`}
              >
                {manifest.trust.integrityVerified ? (
                  <CheckCircle2 size={14} />
                ) : (
                  <XCircle size={14} />
                )}
                {manifest.trust.integrityVerified
                  ? "text、Manifest english_textfileenglish_text"
                  : "english_textfailed，realenglish_text"}
              </p>
              <p className="mt-1 break-all font-mono text-[10px] text-[#8B93B5]">
                Manifest {manifest.manifestHash}
              </p>
              <p className="mt-1 break-all font-mono text-[10px] text-[#8B93B5]">
                Executable {manifest.executableHash}
              </p>
              {manifest.trust.blockers.length ? (
                <p className="mt-2 text-xs text-red-700">
                  {manifest.trust.blockers.join("、")}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <CapabilityTokensPanel actions={actions} />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-lg border border-[#E8E8F0] bg-white shadow-sm">
          <div className="border-b border-[#E8E8F0] px-5 py-4">
            <h2 className="text-sm font-semibold text-[#1A1A2E]">english_text</h2>
          </div>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#4A5578]">
                Action
              </span>
              <select
                value={selectedActionName}
                onChange={(event) => handleSelectAction(event.target.value)}
                className="h-10 w-full rounded-lg border border-[#DDE1F2] bg-white px-3 text-sm text-[#1A1A2E] outline-none focus:border-[#6C63FF]"
              >
                {actions.map((action) => (
                  <option key={action.name} value={action.name}>
                    {action.name} - {statusLabel(action)}
                  </option>
                ))}
              </select>
            </label>

            {selectedAction ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-[#E8E8F0] bg-[#FAFBFF] p-3">
                  <p className="text-xs text-[#8B93B5]">english_text</p>
                  <p className="mt-1 text-sm font-semibold text-[#1A1A2E]">
                    {permissionLabel(selectedAction.permission.level)}
                  </p>
                </div>
                <div
                  className={`rounded-lg border p-3 ${statusTone(selectedAction)}`}
                >
                  <p className="text-xs opacity-80">english_text</p>
                  <p className="mt-1 text-sm font-semibold">
                    {statusLabel(selectedAction)}
                  </p>
                </div>
                <div className="rounded-lg border border-[#E8E8F0] bg-[#FAFBFF] p-3">
                  <p className="text-xs text-[#8B93B5]">english_text</p>
                  <p className="mt-1 line-clamp-2 text-sm font-medium text-[#1A1A2E]">
                    {selectedAction.description}
                  </p>
                </div>
              </div>
            ) : null}

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-[#4A5578]">
                Workspace ID（text）
              </span>
              <input
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                placeholder="english_textbackendenglish_text"
                className="h-10 w-full rounded-lg border border-[#DDE1F2] px-3 text-sm text-[#1A1A2E] outline-none focus:border-[#6C63FF]"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[#4A5578]">
                <Code2 size={14} />
                Params JSON
              </span>
              <textarea
                value={paramsText}
                onChange={(event) => setParamsText(event.target.value)}
                spellCheck={false}
                className="min-h-[260px] w-full resize-y rounded-lg border border-[#DDE1F2] bg-[#101828] p-4 font-mono text-xs leading-5 text-white outline-none focus:border-[#6C63FF]"
              />
            </label>

            <div className="flex flex-col gap-3 border-t border-[#F0F0F8] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#4A5578]">
                <input
                  type="checkbox"
                  checked={dryRun}
                  onChange={(event) => setDryRun(event.target.checked)}
                  className="h-4 w-4 rounded border-[#DDE1F2] accent-[#6C63FF]"
                />
                english_text，english_textrealtext
              </label>
              <button
                onClick={() => void handleCall()}
                disabled={
                  running ||
                  loading ||
                  !selectedAction ||
                  (!dryRun && mcpExecutionBlocked)
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#6C63FF] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Play size={16} />
                )}
                {dryRun ? "english_text" : "english_text"}
              </button>
            </div>

            {!dryRun && mcpExecutionBlocked ? (
              <div className="flex gap-2 border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">
                <XCircle size={17} className="mt-0.5 shrink-0" />
                text MCP english_textpassedenglish_text，backendtextfrontendenglish_textrealtext。
              </div>
            ) : null}

            {!dryRun && selectedAction?.permission.requireConfirm ? (
              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                <AlertTriangle size={17} className="mt-0.5 shrink-0" />
                text action
                english_textrisktext。backendenglish_textreviewnotification，english_texthumanenglish_textstore。
              </div>
            ) : null}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-lg border border-[#E8E8F0] bg-white shadow-sm">
            <div className="border-b border-[#E8E8F0] px-5 py-4">
              <h2 className="text-sm font-semibold text-[#1A1A2E]">english_text</h2>
            </div>
            <div className="p-5">
              <ResultPanel result={result} />
            </div>
          </section>

          <section className="rounded-lg border border-[#E8E8F0] bg-white p-5 shadow-sm">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#1A1A2E]">
              <Bot size={16} className="text-[#6C63FF]" />
              securitystatus
            </h2>
            <div className="space-y-3 text-sm leading-6 text-[#4A5578]">
              <div className="flex gap-2">
                <CheckCircle2
                  size={16}
                  className="mt-1 shrink-0 text-emerald-600"
                />
                <span>english_textsecretenglish_text</span>
              </div>
              <div className="flex gap-2">
                <ShieldCheck
                  size={16}
                  className="mt-1 shrink-0 text-[#6C63FF]"
                />
                <span>JWT english_text</span>
              </div>
              <div className="flex gap-2">
                <ClipboardCheck
                  size={16}
                  className="mt-1 shrink-0 text-amber-600"
                />
                <span>textriskreviewtext</span>
              </div>
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-lg border border-[#E8E8F0] bg-white shadow-sm">
        <div className="border-b border-[#E8E8F0] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#1A1A2E]">
            backendenglish_text
          </h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-[#6C63FF]">
            <Loader2 size={16} className="animate-spin" />
            textreadbackendenglish_text...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F8] bg-[#FAFBFF] text-left text-xs text-[#8B93B5]">
                  <th className="px-5 py-3 font-medium">Action</th>
                  <th className="px-5 py-3 font-medium">english_text</th>
                  <th className="px-5 py-3 font-medium">english_textstatus</th>
                  <th className="px-5 py-3 font-medium">text</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((action) => (
                  <tr
                    key={action.name}
                    className={`cursor-pointer border-b border-[#F0F0F8] last:border-0 hover:bg-[#FAFAFF] ${
                      action.name === selectedActionName ? "bg-[#F8F7FF]" : ""
                    }`}
                    onClick={() => handleSelectAction(action.name)}
                  >
                    <td className="px-5 py-3 font-mono text-xs text-[#1A1A2E]">
                      {action.name}
                    </td>
                    <td className="px-5 py-3 text-[#4A5578]">
                      {permissionLabel(action.permission.level)}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium ${statusTone(action)}`}
                      >
                        {action.permission.allowed ? (
                          <CheckCircle2 size={13} />
                        ) : (
                          <XCircle size={13} />
                        )}
                        {statusLabel(action)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[#6B7280]">
                      {action.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-[#E8E8F0] bg-white shadow-sm">
        <div className="border-b border-[#E8E8F0] px-5 py-4">
          <h2 className="text-sm font-semibold text-[#1A1A2E]">MCP english_text</h2>
          <p className="mt-1 text-xs text-[#8B93B5]">
            realtext
            run_id、text、text、statustextfailedtext；textfieldstextdataenglish_text。
          </p>
        </div>
        {runs.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8B93B5]">
            textnonereal MCP english_text。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-[#F0F0F8] bg-[#FAFBFF] text-left text-xs text-[#8B93B5]">
                  <th className="px-5 py-3">Run ID</th>
                  <th className="px-5 py-3">Action / Tool</th>
                  <th className="px-5 py-3">status</th>
                  <th className="px-5 py-3">text</th>
                  <th className="px-5 py-3">text</th>
                  <th className="px-5 py-3">failedtext</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-[#F0F0F8] last:border-0"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-[#4A5578]">
                      {run.id}
                    </td>
                    <td className="px-5 py-3">
                      <strong className="block text-xs text-[#1A1A2E]">
                        {run.action}
                      </strong>
                      <span className="text-xs text-[#8B93B5]">
                        {run.toolName}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-medium ${run.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : run.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}
                      >
                        {run.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-[#4A5578]">
                      {run.durationMs === null
                        ? "running"
                        : `${run.durationMs} ms`}
                    </td>
                    <td className="px-5 py-3 text-xs text-[#4A5578]">
                      {new Date(run.startedAt).toLocaleString("zh-CN", {
                        hour12: false,
                      })}
                    </td>
                    <td className="max-w-72 px-5 py-3 text-xs text-red-600">
                      {run.errorMessage || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
