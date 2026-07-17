import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  profitCalculatorApi,
  type OzonPricingBatchResponse,
  type OzonPricingCatalog,
  type OzonPricingInput,
  type OzonPricingResponse,
  type OzonPricingWorkbookImportResponse,
} from "../api/profit-calculator";
import { buildOzonPricingCsv } from "../utils/ozon-pricing-csv";

type PageMode = "calculate" | "evaluate" | "batch";

type OzonPricingDraft = Omit<
  OzonPricingInput,
  "purchaseCost" | "weightGram"
> & {
  purchaseCost?: number;
  weightGram?: number;
};

interface BatchRow {
  itemId: string;
  productTitle: string;
  sku: string;
  category: string;
  logistics: OzonPricingInput["logistics"];
  purchaseCost?: number;
  otherCost?: number;
  weightGram?: number;
  actualWeightGram?: number;
  observedSalePriceCny?: number;
  competitorPriceCny?: number;
  competitorUrl?: string;
  sourceUrl?: string;
  note1?: string;
}

const blockerLabels: Record<string, string> = {
  PACKAGE_DIMENSIONS_INCOMPLETE: "包裹长宽高未填写完整",
  PACKAGE_DIMENSION_SUM_EXCEEDED: "包裹三边之和超过线路限制",
  PACKAGE_MAX_SIDE_EXCEEDED: "包裹最大边超过线路限制",
  BATTERY_MSDS_REQUIRED: "Express 线路的电池商品需要 MSDS",
};

const warningLabels: Record<string, string> = {
  PACKAGE_DIMENSIONS_NOT_PROVIDED: "未填写包裹尺寸，尺寸合规状态暂时未知",
};

const pricingRuleBlockerLabels: Record<string, string> = {
  RULE_SOURCE_AUTHORITY_MISSING: "规则缺少发布机构",
  RULE_SOURCE_REFERENCE_MISSING: "规则缺少可核验引用",
  RULE_SOURCE_EFFECTIVE_AT_MISSING: "规则缺少生效时间",
  RULE_SOURCE_IMPORTED_AT_MISSING: "规则缺少导入时间",
  RULE_SOURCE_EXPIRES_AT_MISSING: "规则缺少失效时间",
  RULE_SOURCE_EXPIRED: "规则已经过期",
  RULE_SOURCE_NOT_YET_EFFECTIVE: "规则尚未生效",
  RULE_SOURCE_VALIDITY_WINDOW_INVALID: "规则有效期不合法",
};

const modeOptions: Array<{ value: PageMode; label: string }> = [
  { value: "calculate", label: "目标核价" },
  { value: "evaluate", label: "现价评估" },
  { value: "batch", label: "批量核价" },
];

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  suffix: string;
  min?: number;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}
      </span>
      <span className="flex h-10 items-center rounded-md border border-slate-200 bg-white px-3 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
        <input
          type="number"
          min={min}
          step="0.01"
          value={value ?? ""}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? undefined : Number(event.target.value),
            )
          }
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none"
        />
        <span className="ml-2 shrink-0 text-xs text-slate-400">{suffix}</span>
      </span>
    </label>
  );
}

function newBatchRow(category = ""): BatchRow {
  return {
    itemId: "",
    productTitle: "",
    sku: "",
    category,
    logistics: "standard",
  };
}

function decisionStyle(decision: OzonPricingResponse["decision"]) {
  if (decision === "PASS") {
    return {
      label: "通过",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (decision === "CAUTION") {
    return {
      label: "利润低于目标",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (decision === "DATA_INSUFFICIENT") {
    return {
      label: "定价证据不足",
      className: "border-red-200 bg-red-50 text-red-800",
    };
  }
  return {
    label: decision === "BLOCKED" ? "合规阻断" : "亏损拒绝",
    className: "border-red-200 bg-red-50 text-red-800",
  };
}

function ResultView({ result }: { result: OzonPricingResponse }) {
  const tone = decisionStyle(result.decision);
  if (!result.result) {
    const blockers = [
      ...(result.ruleSourceBlockers ?? []),
      ...(result.missingFields ?? []),
    ];
    return (
      <div className={`rounded-md border px-4 py-4 ${tone.className}`}>
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">定价证据不足</p>
            <p className="mt-1 text-xs">
              当前规则来源或业务输入无法核验，未生成售价、利润或可发布结论，也未写入利润计算记录。
            </p>
            {blockers.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
                {blockers.map((code) => (
                  <li key={code}>{pricingRuleBlockerLabels[code] ?? code}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
  const calculation = result.result;
  const values: Array<[string, string]> = [
    ["核算售价", `¥${calculation.salePriceCny.toFixed(2)}`],
    ["卢布售价", `₽${calculation.salePriceRub.toFixed(2)}`],
    [
      "上架划线价",
      calculation.listingPriceCny
        ? `¥${calculation.listingPriceCny.toFixed(2)}`
        : "-",
    ],
    [
      "毛利",
      `¥${calculation.profitCny.toFixed(2)} · ${(calculation.marginRate * 100).toFixed(1)}%`,
    ],
    ["ZTO 物流", `¥${calculation.freightCny.toFixed(2)}`],
    [
      "Ozon 佣金",
      `¥${calculation.commissionFeeCny.toFixed(2)} · ${(calculation.commissionRate * 100).toFixed(1)}%`,
    ],
    ["收单费", `¥${calculation.acquiringFeeCny.toFixed(2)}`],
    ["广告预估", `¥${calculation.advertisingFeeCny.toFixed(2)}`],
    ["固定成本", `¥${calculation.fixedCostFeeCny.toFixed(2)}`],
    ["基础成本", `¥${calculation.totalCostCny.toFixed(2)}`],
  ];

  return (
    <div>
      <div
        className={`flex items-start gap-3 rounded-md border px-4 py-3 ${tone.className}`}
      >
        {result.decision === "PASS" ? (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold">{tone.label}</p>
          <p className="mt-0.5 text-xs">
            {result.logistics?.label ?? "物流线路未返回"} · {calculation.serviceTier} ·{" "}
            {result.logistics?.deliveryDays ?? "交付时效未返回"}
          </p>
          {result.calculationId ? (
            <p className="mt-1 break-all font-mono text-[10px] opacity-75">
              审计记录 {result.calculationId}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-3">
        {values.map(([label, value]) => (
          <div key={label} className="min-w-0 bg-white p-3">
            <p className="text-[11px] text-slate-500">{label}</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-950">
              {value}
            </p>
          </div>
        ))}
      </div>

      {calculation.minimumPricesCny ? (
        <div className="mt-4 border-y border-slate-200 py-4">
          <p className="text-xs font-semibold text-slate-700">
            源表毛利底线售价
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              ["20%", calculation.minimumPricesCny.margin20],
              ["15%", calculation.minimumPricesCny.margin15],
              ["10%", calculation.minimumPricesCny.margin10],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-md bg-slate-50 px-2 py-2"
              >
                <p className="text-[11px] text-slate-500">{label} 毛利</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  ¥{Number(value).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {result.packageCompliance ? (
      <div className="mt-4 flex items-start gap-2 text-xs text-slate-600">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-600" />
        <div>
          <p>
            重量上限 {result.packageCompliance.limits.maxWeightGram}g，三边和 ≤{" "}
            {result.packageCompliance.limits.maxDimensionSumCm}cm，最大边 ≤{" "}
            {result.packageCompliance.limits.maxSideCm}cm。
          </p>
          {[
            ...result.packageCompliance.blockers,
            ...result.packageCompliance.warnings,
          ].map((code) => (
            <p key={code} className="mt-1 text-amber-700">
              {blockerLabels[code] ?? warningLabels[code] ?? code}
            </p>
          ))}
        </div>
      </div>
      ) : null}

      {result.formulaTrace?.length ? (
        <details className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">
            查看计算轨迹
          </summary>
          <ol className="mt-2 space-y-1.5">
            {result.formulaTrace.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

export default function OzonPricingCalculator() {
  const [catalog, setCatalog] = useState<OzonPricingCatalog | null>(null);
  const [result, setResult] = useState<OzonPricingResponse | null>(null);
  const [batchResult, setBatchResult] =
    useState<OzonPricingBatchResponse | null>(null);
  const [mode, setMode] = useState<PageMode>("calculate");
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [importingWorkbook, setImportingWorkbook] = useState(false);
  const [workbookImport, setWorkbookImport] =
    useState<OzonPricingWorkbookImportResponse["import"] | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<OzonPricingDraft>({
    category: "",
    logistics: "standard",
  });
  const [batchRows, setBatchRows] = useState<BatchRow[]>([
    newBatchRow(),
    newBatchRow(),
  ]);

  const groupedCategories = useMemo(() => {
    const groups = new Map<string, OzonPricingCatalog["categories"]>();
    for (const item of catalog?.categories ?? []) {
      groups.set(item.module, [...(groups.get(item.module) ?? []), item]);
    }
    return [...groups.entries()];
  }, [catalog]);

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    setError("");
    try {
      const data = await profitCalculatorApi.getOzonCatalog();
      setCatalog(data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "无法加载 Ozon 核价规则",
      );
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const calculate = async () => {
    if (catalog?.usableForPricing === false) {
      setError("当前 Ozon 定价规则来源不可核验，已阻止核价和持久化");
      return;
    }
    if (!form.category) {
      setError("请选择已验证类目");
      return;
    }
    if (form.purchaseCost === undefined) {
      setError("请填写真实采购成本");
      return;
    }
    if (form.otherCost === undefined) {
      setError("请明确填写其他成本（没有则填写 0）");
      return;
    }
    if (form.weightGram === undefined || form.weightGram <= 0) {
      setError("请填写真实包装重量");
      return;
    }
    if (
      form.targetMarginRate === undefined ||
      form.advertisingRate === undefined ||
      form.fixedCostRate === undefined ||
      form.exchangeRate === undefined ||
      form.listingMultiplier === undefined
    ) {
      setError("目标毛利、广告费、固定成本、汇率和上架倍率必须由真实规则或人工输入");
      return;
    }
    if (
      form.lengthCm === undefined ||
      form.widthCm === undefined ||
      form.heightCm === undefined
    ) {
      setError("请填写真实包裹长宽高");
      return;
    }
    if (mode === "evaluate" && form.observedSalePriceCny === undefined) {
      setError("请填写当前实际售价");
      return;
    }
    setCalculating(true);
    setError("");
    try {
      setResult(
        await profitCalculatorApi.calculateOzon({
          ...form,
          purchaseCost: form.purchaseCost,
          weightGram: form.weightGram,
          mode: mode === "evaluate" ? "evaluate" : "calculate",
          observedSalePriceCny:
            mode === "evaluate" ? form.observedSalePriceCny : undefined,
          persist: true,
        }),
      );
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "Ozon 核价失败");
    } finally {
      setCalculating(false);
    }
  };

  const updateBatchRow = (index: number, patch: Partial<BatchRow>) => {
    setBatchRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const runBatch = async () => {
    if (catalog?.usableForPricing === false) {
      setError("当前 Ozon 定价规则来源不可核验，已阻止批量核价和持久化");
      return;
    }
    if (
      batchRows.some(
        (row) =>
          !row.itemId.trim() ||
          !row.category ||
          row.purchaseCost === undefined ||
          row.otherCost === undefined ||
          row.weightGram === undefined ||
          row.weightGram <= 0,
      )
    ) {
      setError("批量核价的货号、类目、真实采购/其他成本和重量必须完整");
      return;
    }
    if (
      form.targetMarginRate === undefined ||
      form.advertisingRate === undefined ||
      form.fixedCostRate === undefined ||
      form.exchangeRate === undefined ||
      form.listingMultiplier === undefined
    ) {
      setError("批量核价的费率、汇率和倍率必须由真实规则或人工输入");
      return;
    }
    setCalculating(true);
    setError("");
    try {
      const items: OzonPricingInput[] = batchRows.map((row) => ({
        ...row,
        purchaseCost: row.purchaseCost as number,
        weightGram: row.weightGram as number,
        mode: row.observedSalePriceCny ? "evaluate" : "calculate",
        targetMarginRate: form.targetMarginRate,
        advertisingRate: form.advertisingRate,
        fixedCostRate: form.fixedCostRate,
        exchangeRate: form.exchangeRate,
        listingMultiplier: form.listingMultiplier,
        persist: true,
      }));
      setBatchResult(await profitCalculatorApi.calculateOzonBatch(items, true));
    } catch (cause) {
      setBatchResult(null);
      setError(cause instanceof Error ? cause.message : "Ozon 批量核价失败");
    } finally {
      setCalculating(false);
    }
  };

  const exportBatchCsv = () => {
    if (!batchResult) return;
    const blob = new Blob([buildOzonPricingCsv(batchResult)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ozon-pricing-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };

  const importWorkbook = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("只允许导入 .xlsx 售价表");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("售价表不能超过 8MB");
      return;
    }
    setImportingWorkbook(true);
    setError("");
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("无法读取售价表"));
        reader.readAsDataURL(file);
      });
      const response = await profitCalculatorApi.importOzonWorkbook({
        filename: file.name,
        dataBase64,
        persist: true,
      });
      setMode("batch");
      setWorkbookImport(response.import);
      setBatchResult(response.batch);
    } catch (cause) {
      setWorkbookImport(null);
      setBatchResult(null);
      setError(cause instanceof Error ? cause.message : "售价表导入失败");
    } finally {
      setImportingWorkbook(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-6 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <Calculator className="text-blue-600" size={22} />
            <h1 className="text-xl font-bold text-slate-950">Ozon 核价</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            依据卖家售价表计算目标价、评估现价并批量生成可审计记录。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <Upload size={15} />
            {importingWorkbook ? "正在导入" : "导入售价表"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={importingWorkbook || calculating}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void importWorkbook(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => void loadCatalog()}
            disabled={loadingCatalog}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={loadingCatalog ? "animate-spin" : ""}
            />
            刷新规则
          </button>
        </div>
      </header>

      {catalog ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 pb-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Database size={14} />
            来源：{catalog.source.workbook}
          </span>
          <span>规则版本：{catalog.source.ruleVersion}</span>
          <span>类目：{catalog.categories.length}</span>
          <span className="font-mono text-[11px]">
            规则 {catalog.source.rulesHash.slice(0, 12)}...
          </span>
          {catalog.source.workbookSha256 ? (
            <span className="font-mono text-[11px]">
              源表 {catalog.source.workbookSha256.slice(0, 12)}...
            </span>
          ) : null}
        </div>
      ) : null}

      {catalog?.usableForPricing === false ? (
        <div className="mt-4 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-900">
          <p className="font-semibold">当前 Ozon 定价规则不可用于正式核价</p>
          <p className="mt-1 text-xs">
            规则来源缺少可核验的发布机构、引用或有效期。系统已暂停售价计算、利润持久化和发布结论。
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
            {catalog.ruleSourceBlockers.map((code) => (
              <li key={code}>{pricingRuleBlockerLabels[code] ?? code}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {workbookImport ? (
        <div className="mt-4 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold">已验证并导入 {workbookImport.filename}</span>
            <span>商品行 {workbookImport.parsedRows}</span>
            <span>跳过空白模板行 {workbookImport.skippedBlankRows}</span>
            <span>无效行 {workbookImport.invalidRows.length}</span>
          </div>
          <p className="mt-1 break-all font-mono text-[10px] text-emerald-700">
            SHA-256 {workbookImport.sha256}
          </p>
        </div>
      ) : null}

      <div className="mt-4 inline-flex rounded-md bg-slate-100 p-1">
        {modeOptions.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => {
              setMode(item.value);
              setError("");
            }}
            className={`h-8 rounded px-4 text-sm font-medium ${mode === item.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={17} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {mode !== "batch" ? (
        <div className="mt-5 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(460px,0.95fr)]">
          <section className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900">核价参数</h2>
            <div className="mt-3 grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">
                  Ozon 商品类目
                </span>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  disabled={loadingCatalog}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">
                    {catalog?.usableForPricing === false
                      ? "规则未验证，暂不可核价"
                      : "请选择已验证类目"}
                  </option>
                  {groupedCategories.map(([module, categories]) => (
                    <optgroup key={module} label={module}>
                      {categories.map((item) => (
                        <option key={item.category} value={item.category}>
                          {item.category}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">
                  物流线路
                </span>
                <select
                  value={form.logistics}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      logistics: event.target
                        .value as OzonPricingInput["logistics"],
                    })
                  }
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  {(catalog?.logistics ?? []).map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label} · {item.deliveryDays} 天
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="采购成本"
                value={form.purchaseCost}
                onChange={(value) => setForm({ ...form, purchaseCost: value })}
                suffix="CNY"
              />
              <NumberField
                label="其他成本"
                value={form.otherCost}
                onChange={(value) => setForm({ ...form, otherCost: value })}
                suffix="CNY"
              />
              <NumberField
                label="包装重量"
                value={form.weightGram}
                onChange={(value) => setForm({ ...form, weightGram: value })}
                suffix="g"
                min={1}
              />
              {mode === "evaluate" ? (
                <NumberField
                  label="当前实际售价"
                  value={form.observedSalePriceCny}
                  onChange={(value) =>
                    setForm({ ...form, observedSalePriceCny: value })
                  }
                  suffix="CNY"
                  min={0.01}
                />
              ) : null}
              <NumberField
                label="目标毛利率"
                value={
                  form.targetMarginRate === undefined
                    ? undefined
                    : form.targetMarginRate * 100
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    targetMarginRate:
                      value === undefined ? undefined : value / 100,
                  })
                }
                suffix="%"
              />
              <NumberField
                label="广告费率"
                value={
                  form.advertisingRate === undefined
                    ? undefined
                    : form.advertisingRate * 100
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    advertisingRate:
                      value === undefined ? undefined : value / 100,
                  })
                }
                suffix="%"
              />
              <NumberField
                label="固定成本率"
                value={
                  form.fixedCostRate === undefined
                    ? undefined
                    : form.fixedCostRate * 100
                }
                onChange={(value) =>
                  setForm({
                    ...form,
                    fixedCostRate:
                      value === undefined ? undefined : value / 100,
                  })
                }
                suffix="%"
              />
              <NumberField
                label="人民币兑卢布"
                value={form.exchangeRate}
                onChange={(value) => setForm({ ...form, exchangeRate: value })}
                suffix="RUB/CNY"
                min={0.01}
              />
              <NumberField
                label="上架价倍率"
                value={form.listingMultiplier}
                onChange={(value) =>
                  setForm({ ...form, listingMultiplier: value })
                }
                suffix="×"
                min={0.01}
              />
            </div>

            <h2 className="mt-5 text-sm font-semibold text-slate-900">
              包裹合规
            </h2>
            <div className="mt-3 grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-3">
              <NumberField
                label="长度"
                value={form.lengthCm}
                onChange={(value) =>
                  setForm({ ...form, lengthCm: value })
                }
                suffix="cm"
              />
              <NumberField
                label="宽度"
                value={form.widthCm}
                onChange={(value) =>
                  setForm({ ...form, widthCm: value })
                }
                suffix="cm"
              />
              <NumberField
                label="高度"
                value={form.heightCm}
                onChange={(value) =>
                  setForm({ ...form, heightCm: value })
                }
                suffix="cm"
              />
              <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.hasBattery ?? false}
                  onChange={(event) =>
                    setForm({ ...form, hasBattery: event.target.checked })
                  }
                  className="h-4 w-4 accent-blue-600"
                />
                含电池
              </label>
              <label className="flex h-10 items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.hasMsds ?? false}
                  onChange={(event) =>
                    setForm({ ...form, hasMsds: event.target.checked })
                  }
                  className="h-4 w-4 accent-blue-600"
                />
                已有 MSDS
              </label>
            </div>

            <button
              type="button"
              onClick={() => void calculate()}
              disabled={
                calculating ||
                loadingCatalog ||
                !form.category ||
                catalog?.usableForPricing === false
              }
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {calculating ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <Calculator size={17} />
              )}
              {calculating
                ? "正在核价"
                : mode === "evaluate"
                  ? "评估当前售价"
                  : "计算目标售价"}
            </button>
          </section>

          <section className="min-w-0 xl:border-l xl:border-slate-200 xl:pl-6">
            <h2 className="text-sm font-semibold text-slate-900">计算结果</h2>
            {!result ? (
              <div className="mt-3 grid min-h-72 place-items-center border-y border-dashed border-slate-300 text-center">
                <div className="max-w-xs py-10 text-sm text-slate-500">
                  <Calculator
                    size={28}
                    className="mx-auto mb-3 text-slate-300"
                  />
                  完整且可核验的规则与成本输入通过后，才会生成核价并写入租户审计记录。
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <ResultView result={result} />
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="mt-5 min-w-0">
          <div className="mb-5 grid gap-4 border-y border-slate-200 py-4 sm:grid-cols-2 lg:grid-cols-5">
            <NumberField
              label="目标毛利率"
              value={
                form.targetMarginRate === undefined
                  ? undefined
                  : form.targetMarginRate * 100
              }
              onChange={(value) =>
                setForm({
                  ...form,
                  targetMarginRate:
                    value === undefined ? undefined : value / 100,
                })
              }
              suffix="%"
            />
            <NumberField
              label="广告费率"
              value={
                form.advertisingRate === undefined
                  ? undefined
                  : form.advertisingRate * 100
              }
              onChange={(value) =>
                setForm({
                  ...form,
                  advertisingRate:
                    value === undefined ? undefined : value / 100,
                })
              }
              suffix="%"
            />
            <NumberField
              label="固定成本率"
              value={
                form.fixedCostRate === undefined
                  ? undefined
                  : form.fixedCostRate * 100
              }
              onChange={(value) =>
                setForm({
                  ...form,
                  fixedCostRate:
                    value === undefined ? undefined : value / 100,
                })
              }
              suffix="%"
            />
            <NumberField
              label="人民币兑卢布"
              value={form.exchangeRate}
              onChange={(value) => setForm({ ...form, exchangeRate: value })}
              suffix="RUB/CNY"
              min={0.01}
            />
            <NumberField
              label="上架价倍率"
              value={form.listingMultiplier}
              onChange={(value) =>
                setForm({ ...form, listingMultiplier: value })
              }
              suffix="×"
              min={0.01}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                批量核价清单
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                实际售价留空则反推目标价；填写实际售价则执行利润评估。最多 100
                行。
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setBatchRows((current) => [
                  ...current,
                  newBatchRow(form.category),
                ])
              }
              disabled={batchRows.length >= 100}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus size={15} />
              添加商品
            </button>
          </div>

          <div className="mt-3 overflow-x-auto border-y border-slate-200">
            <table className="w-full min-w-[2440px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {[
                    "货号",
                    "商品标题",
                    "SKU",
                    "商品类目",
                    "线路",
                    "采购成本",
                    "其他成本",
                    "重量(g)",
                    "实际重量(g)",
                    "实际售价(可空)",
                    "竞品价",
                    "竞品链接",
                    "货源链接",
                    "备注",
                    "",
                  ].map((label) => (
                    <th
                      key={label}
                      className="border-b border-slate-200 px-3 py-2 font-medium"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batchRows.map((row, index) => (
                  <tr
                    key={`${row.itemId}-${index}`}
                    className="border-b border-slate-100 last:border-0"
                  >
                    <td className="px-3 py-2">
                      <input
                        value={row.itemId}
                        onChange={(event) =>
                          updateBatchRow(index, { itemId: event.target.value })
                        }
                        className="h-9 w-32 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.productTitle}
                        placeholder="1688标题+采购型号"
                        onChange={(event) =>
                          updateBatchRow(index, {
                            productTitle: event.target.value,
                          })
                        }
                        className="h-9 w-56 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.sku}
                        onChange={(event) =>
                          updateBatchRow(index, { sku: event.target.value })
                        }
                        className="h-9 w-32 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.category}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            category: event.target.value,
                          })
                        }
                        className="h-9 w-64 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      >
                        <option value="">请选择已验证类目</option>
                        {catalog?.categories.map((item) => (
                          <option key={item.category} value={item.category}>
                            {item.category}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.logistics}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            logistics: event.target
                              .value as BatchRow["logistics"],
                          })
                        }
                        className="h-9 w-32 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      >
                        {catalog?.logistics.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={row.purchaseCost ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            purchaseCost: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={row.otherCost ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            otherCost: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        value={row.weightGram ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            weightGram: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="可空"
                        value={row.actualWeightGram ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            actualWeightGram: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="留空反推"
                        value={row.observedSalePriceCny ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            observedSalePriceCny: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        className="h-9 w-28 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="可空"
                        value={row.competitorPriceCny ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            competitorPriceCny: event.target.value
                              ? Number(event.target.value)
                              : undefined,
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="url"
                        placeholder="Ozon商品链接"
                        value={row.competitorUrl ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            competitorUrl: event.target.value,
                          })
                        }
                        className="h-9 w-56 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="url"
                        placeholder="1688货源链接"
                        value={row.sourceUrl ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, { sourceUrl: event.target.value })
                        }
                        className="h-9 w-56 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={row.note1 ?? ""}
                        onChange={(event) =>
                          updateBatchRow(index, { note1: event.target.value })
                        }
                        className="h-9 w-40 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        title="删除商品"
                        aria-label="删除商品"
                        disabled={batchRows.length === 1}
                        onClick={() =>
                          setBatchRows((current) =>
                            current.filter((_, rowIndex) => rowIndex !== index),
                          )
                        }
                        className="inline-grid h-9 w-9 place-items-center rounded text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void runBatch()}
              disabled={
                calculating ||
                loadingCatalog ||
                catalog?.usableForPricing === false
              }
              className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {calculating ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={17} />
              )}
              {calculating ? "正在批量核价" : `核价 ${batchRows.length} 个商品`}
            </button>
            {batchResult ? (
              <button
                type="button"
                onClick={exportBatchCsv}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={16} />
                导出结果 CSV
              </button>
            ) : null}
          </div>

          {batchResult ? (
            <div className="mt-6">
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-sm">
                <span>
                  总计 <strong>{batchResult.summary.total}</strong>
                </span>
                <span className="text-emerald-700">
                  通过 {batchResult.summary.passed}
                </span>
                <span className="text-amber-700">
                  谨慎 {batchResult.summary.cautions}
                </span>
                <span className="text-red-700">
                  拒绝/阻断{" "}
                  {batchResult.summary.rejected + batchResult.summary.blocked}
                </span>
                <span className="text-red-700">
                  失败 {batchResult.summary.failed}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      {[
                        "货号",
                        "商品",
                        "SKU",
                        "结论",
                        "核算售价",
                        "卢布售价",
                        "毛利",
                        "毛利率",
                        "审计记录",
                      ].map((label) => (
                        <th
                          key={label}
                          className="border-b border-slate-200 px-3 py-2 font-medium"
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {batchResult.items.map((item) => (
                      <tr
                        key={item.itemId}
                        className="border-b border-slate-100"
                      >
                        <td className="px-3 py-2 font-medium">{item.itemId}</td>
                        <td className="max-w-64 truncate px-3 py-2">
                          {item.context?.productTitle || "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.context?.sku || "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.ok
                            ? decisionStyle(item.result!.decision).label
                            : item.error?.message}
                        </td>
                        <td className="px-3 py-2">
                          {item.result?.result
                            ? `¥${item.result.result.salePriceCny.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.result?.result
                            ? `₽${item.result.result.salePriceRub.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.result?.result
                            ? `¥${item.result.result.profitCny.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.result?.result
                            ? `${(item.result.result.marginRate * 100).toFixed(1)}%`
                            : "-"}
                        </td>
                        <td className="max-w-56 truncate px-3 py-2 font-mono text-[10px] text-slate-500">
                          {item.calculationId ?? "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      )}

      <div className="mt-6 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" />
        核价仅生成计算与审计证据，不会自动修改 Ozon
        售价。调价仍需在商品管理中创建独立变更单并人工确认。
      </div>
    </div>
  );
}
