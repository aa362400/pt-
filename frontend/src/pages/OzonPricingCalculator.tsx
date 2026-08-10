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

interface BatchRow {
  itemId: string;
  productTitle: string;
  sku: string;
  category: string;
  logistics: OzonPricingInput["logistics"];
  purchaseCost: number;
  otherCost: number;
  weightGram: number;
  actualWeightGram?: number;
  observedSalePriceCny?: number;
  competitorPriceCny?: number;
  competitorUrl?: string;
  sourceUrl?: string;
  note1?: string;
}

const blockerLabels: Record<string, string> = {
  PACKAGE_DIMENSIONS_INCOMPLETE: "english_text",
  PACKAGE_DIMENSION_SUM_EXCEEDED: "english_text",
  PACKAGE_MAX_SIDE_EXCEEDED: "english_text",
  BATTERY_MSDS_REQUIRED: "Express english_textproducttext MSDS",
};

const warningLabels: Record<string, string> = {
  PACKAGE_DIMENSIONS_NOT_PROVIDED: "english_text，english_textstatusenglish_text",
};

const modeOptions: Array<{ value: PageMode; label: string }> = [
  { value: "calculate", label: "textpricing" },
  { value: "evaluate", label: "english_text" },
  { value: "batch", label: "textpricing" },
];

function NumberField({
  label,
  value,
  onChange,
  suffix,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
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
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none"
        />
        <span className="ml-2 shrink-0 text-xs text-slate-400">{suffix}</span>
      </span>
    </label>
  );
}

function newBatchRow(index: number, category = ""): BatchRow {
  return {
    itemId: `SKU-${String(index + 1).padStart(3, "0")}`,
    productTitle: "",
    sku: "",
    category,
    logistics: "standard",
    purchaseCost: 20,
    otherCost: 0,
    weightGram: 300,
  };
}

function decisionStyle(decision: OzonPricingResponse["decision"]) {
  if (decision === "PASS") {
    return {
      label: "passed",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (decision === "CAUTION") {
    return {
      label: "profitenglish_text",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  return {
    label: decision === "BLOCKED" ? "english_text" : "english_text",
    className: "border-red-200 bg-red-50 text-red-800",
  };
}

function ResultView({ result }: { result: OzonPricingResponse }) {
  const tone = decisionStyle(result.decision);
  const values: Array<[string, string]> = [
    ["textprice", `¥${result.result.salePriceCny.toFixed(2)}`],
    ["textprice", `₽${result.result.salePriceRub.toFixed(2)}`],
    [
      "listingenglish_text",
      result.result.listingPriceCny
        ? `¥${result.result.listingPriceCny.toFixed(2)}`
        : "-",
    ],
    [
      "gross profit",
      `¥${result.result.profitCny.toFixed(2)} · ${(result.result.marginRate * 100).toFixed(1)}%`,
    ],
    ["ZTO text", `¥${result.result.freightCny.toFixed(2)}`],
    [
      "Ozon commission",
      `¥${result.result.commissionFeeCny.toFixed(2)} · ${(result.result.commissionRate * 100).toFixed(1)}%`,
    ],
    ["english_text", `¥${result.result.acquiringFeeCny.toFixed(2)}`],
    ["english_text", `¥${result.result.advertisingFeeCny.toFixed(2)}`],
    ["textcost", `¥${result.result.fixedCostFeeCny.toFixed(2)}`],
    ["textcost", `¥${result.result.totalCostCny.toFixed(2)}`],
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
            {result.logistics.label} · {result.result.serviceTier} ·{" "}
            {result.logistics.deliveryDays} text
          </p>
          {result.calculationId ? (
            <p className="mt-1 break-all font-mono text-[10px] opacity-75">
              audit record {result.calculationId}
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

      {result.result.minimumPricesCny ? (
        <div className="mt-4 border-y border-slate-200 py-4">
          <p className="text-xs font-semibold text-slate-700">
            source workbookgross profittextprice
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              ["20%", result.result.minimumPricesCny.margin20],
              ["15%", result.result.minimumPricesCny.margin15],
              ["10%", result.result.minimumPricesCny.margin10],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-md bg-slate-50 px-2 py-2"
              >
                <p className="text-[11px] text-slate-500">{label} gross profit</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  ¥{Number(value).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-2 text-xs text-slate-600">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-blue-600" />
        <div>
          <p>
            english_text {result.packageCompliance.limits.maxWeightGram}g，english_text ≤{" "}
            {result.packageCompliance.limits.maxDimensionSumCm}cm，english_text ≤{" "}
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

      {result.formulaTrace?.length ? (
        <details className="mt-4 border-t border-slate-200 pt-4 text-xs text-slate-600">
          <summary className="cursor-pointer font-semibold text-slate-700">
            english_text
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
  const [form, setForm] = useState<OzonPricingInput>({
    category: "",
    logistics: "standard",
    purchaseCost: 20,
    otherCost: 0,
    weightGram: 300,
    targetMarginRate: 0.2,
    advertisingRate: 0.2,
    fixedCostRate: 0.085,
    exchangeRate: 11.2793,
    listingMultiplier: 1.98,
    observedSalePriceCny: 100,
    lengthCm: 20,
    widthCm: 10,
    heightCm: 5,
    hasBattery: false,
    hasMsds: false,
    persist: true,
  });
  const [batchRows, setBatchRows] = useState<BatchRow[]>([
    newBatchRow(0),
    newBatchRow(1),
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
      const firstCategory = data.categories[0]?.category || "";
      setCatalog(data);
      setForm((current) => ({
        ...current,
        category: current.category || firstCategory,
        advertisingRate: data.defaults.advertisingRate,
        fixedCostRate: data.defaults.fixedCostRate,
        exchangeRate: data.currency?.rubPerCny ?? current.exchangeRate ?? 11.2793,
        listingMultiplier: data.defaults.listingMultiplier,
      }));
      setBatchRows((current) =>
        current.map((row) => ({
          ...row,
          category: row.category || firstCategory,
        })),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "noneenglish_text Ozon pricingtext",
      );
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    void loadCatalog();
  }, []);

  const calculate = async () => {
    if (!form.category) return;
    setCalculating(true);
    setError("");
    try {
      setResult(
        await profitCalculatorApi.calculateOzon({
          ...form,
          mode: mode === "evaluate" ? "evaluate" : "calculate",
          observedSalePriceCny:
            mode === "evaluate" ? form.observedSalePriceCny : undefined,
          persist: true,
        }),
      );
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : "Ozon pricingfailed");
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
    if (
      batchRows.some(
        (row) => !row.itemId.trim() || !row.category || row.weightGram <= 0,
      )
    ) {
      setError("textpricingtextSKU、categoryenglish_text");
      return;
    }
    setCalculating(true);
    setError("");
    try {
      const items: OzonPricingInput[] = batchRows.map((row) => ({
        ...row,
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
      setError(cause instanceof Error ? cause.message : "Ozon textpricingfailed");
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
      setError("english_text .xlsx pricetext");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("priceenglish_text 8MB");
      return;
    }
    setImportingWorkbook(true);
    setError("");
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(new Error("nonetextreadpricetext"));
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
      setError(cause instanceof Error ? cause.message : "priceenglish_textfailed");
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
            <h1 className="text-xl font-bold text-slate-950">Ozon pricing</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            english_textpriceenglish_text、english_textgenerationtextaudit record。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
            <Upload size={15} />
            {importingWorkbook ? "english_text" : "textpricetext"}
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
            english_text
          </button>
        </div>
      </header>

      {catalog ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-slate-200 pb-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <Database size={14} />
            source：{catalog.source.workbook}
          </span>
          <span>rule version：{catalog.source.ruleVersion}</span>
          <span>category：{catalog.categories.length}</span>
          <span className="font-mono text-[11px]">
            text {catalog.source.rulesHash.slice(0, 12)}...
          </span>
          {catalog.source.workbookSha256 ? (
            <span className="font-mono text-[11px]">
              source workbook {catalog.source.workbookSha256.slice(0, 12)}...
            </span>
          ) : null}
        </div>
      ) : null}

      {workbookImport ? (
        <div className="mt-4 border-l-4 border-emerald-500 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold">english_text {workbookImport.filename}</span>
            <span>producttext {workbookImport.parsedRows}</span>
            <span>english_texttemplatetext {workbookImport.skippedBlankRows}</span>
            <span>nonetext {workbookImport.invalidRows.length}</span>
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
            <h2 className="text-sm font-semibold text-slate-900">pricingtext</h2>
            <div className="mt-3 grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block min-w-0 sm:col-span-2">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">
                  Ozon productcategory
                </span>
                <select
                  value={form.category}
                  onChange={(event) =>
                    setForm({ ...form, category: event.target.value })
                  }
                  disabled={loadingCatalog}
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
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
                  logistics route
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
                      {item.label} · {item.deliveryDays} text
                    </option>
                  ))}
                </select>
              </label>
              <NumberField
                label="textcost"
                value={form.purchaseCost}
                onChange={(value) => setForm({ ...form, purchaseCost: value })}
                suffix="CNY"
              />
              <NumberField
                label="textcost"
                value={form.otherCost ?? 0}
                onChange={(value) => setForm({ ...form, otherCost: value })}
                suffix="CNY"
              />
              <NumberField
                label="packagingtext"
                value={form.weightGram}
                onChange={(value) => setForm({ ...form, weightGram: value })}
                suffix="g"
                min={1}
              />
              {mode === "evaluate" ? (
                <NumberField
                  label="english_textprice"
                  value={form.observedSalePriceCny ?? 0}
                  onChange={(value) =>
                    setForm({ ...form, observedSalePriceCny: value })
                  }
                  suffix="CNY"
                  min={0.01}
                />
              ) : null}
              <NumberField
                label="textgross margin"
                value={(form.targetMarginRate ?? 0) * 100}
                onChange={(value) =>
                  setForm({ ...form, targetMarginRate: value / 100 })
                }
                suffix="%"
              />
              <NumberField
                label="english_text"
                value={(form.advertisingRate ?? 0) * 100}
                onChange={(value) =>
                  setForm({ ...form, advertisingRate: value / 100 })
                }
                suffix="%"
              />
              <NumberField
                label="textcosttext"
                value={(form.fixedCostRate ?? 0) * 100}
                onChange={(value) =>
                  setForm({ ...form, fixedCostRate: value / 100 })
                }
                suffix="%"
              />
              <NumberField
                label="english_text"
                value={form.exchangeRate ?? 0}
                onChange={(value) => setForm({ ...form, exchangeRate: value })}
                suffix="RUB/CNY"
                min={0.01}
              />
              <NumberField
                label="listingenglish_text"
                value={form.listingMultiplier ?? 0}
                onChange={(value) =>
                  setForm({ ...form, listingMultiplier: value })
                }
                suffix="×"
                min={0.01}
              />
            </div>

            <h2 className="mt-5 text-sm font-semibold text-slate-900">
              parcel compliance
            </h2>
            <div className="mt-3 grid gap-4 border-y border-slate-200 py-5 sm:grid-cols-3">
              <NumberField
                label="text"
                value={form.lengthCm ?? 0}
                onChange={(value) =>
                  setForm({ ...form, lengthCm: value || undefined })
                }
                suffix="cm"
              />
              <NumberField
                label="text"
                value={form.widthCm ?? 0}
                onChange={(value) =>
                  setForm({ ...form, widthCm: value || undefined })
                }
                suffix="cm"
              />
              <NumberField
                label="text"
                value={form.heightCm ?? 0}
                onChange={(value) =>
                  setForm({ ...form, heightCm: value || undefined })
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
                english_text
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
                textyes MSDS
              </label>
            </div>

            <button
              type="button"
              onClick={() => void calculate()}
              disabled={calculating || loadingCatalog || !form.category}
              className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {calculating ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <Calculator size={17} />
              )}
              {calculating
                ? "textpricing"
                : mode === "evaluate"
                  ? "english_textprice"
                  : "english_textprice"}
            </button>
          </section>

          <section className="min-w-0 xl:border-l xl:border-slate-200 xl:pl-6">
            <h2 className="text-sm font-semibold text-slate-900">english_text</h2>
            {!result ? (
              <div className="mt-3 grid min-h-72 place-items-center border-y border-dashed border-slate-300 text-center">
                <div className="max-w-xs py-10 text-sm text-slate-500">
                  <Calculator
                    size={28}
                    className="mx-auto mb-3 text-slate-300"
                  />
                  english_textlocal Agent MCP english_text，textwritetextaudit record。
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
              label="textgross margin"
              value={(form.targetMarginRate ?? 0) * 100}
              onChange={(value) =>
                setForm({ ...form, targetMarginRate: value / 100 })
              }
              suffix="%"
            />
            <NumberField
              label="english_text"
              value={(form.advertisingRate ?? 0) * 100}
              onChange={(value) =>
                setForm({ ...form, advertisingRate: value / 100 })
              }
              suffix="%"
            />
            <NumberField
              label="textcosttext"
              value={(form.fixedCostRate ?? 0) * 100}
              onChange={(value) =>
                setForm({ ...form, fixedCostRate: value / 100 })
              }
              suffix="%"
            />
            <NumberField
              label="english_text"
              value={form.exchangeRate ?? 0}
              onChange={(value) => setForm({ ...form, exchangeRate: value })}
              suffix="RUB/CNY"
              min={0.01}
            />
            <NumberField
              label="listingenglish_text"
              value={form.listingMultiplier ?? 0}
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
                textpricingtext
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                textpriceenglish_text；english_textpriceenglish_textprofittext。text 100
                text。
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setBatchRows((current) => [
                  ...current,
                  newBatchRow(current.length, form.category),
                ])
              }
              disabled={batchRows.length >= 100}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Plus size={15} />
              textproduct
            </button>
          </div>

          <div className="mt-3 overflow-x-auto border-y border-slate-200">
            <table className="w-full min-w-[2440px] border-collapse text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {[
                    "SKU",
                    "producttitle",
                    "SKU",
                    "productcategory",
                    "text",
                    "textcost",
                    "textcost",
                    "text(g)",
                    "actual weight(g)",
                    "textprice(text)",
                    "english_text",
                    "competitor URL",
                    "supplier URL",
                    "notes",
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
                        placeholder="1688title+english_text"
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
                        value={row.purchaseCost}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            purchaseCost: Number(event.target.value),
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        value={row.otherCost}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            otherCost: Number(event.target.value),
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="1"
                        value={row.weightGram}
                        onChange={(event) =>
                          updateBatchRow(index, {
                            weightGram: Number(event.target.value),
                          })
                        }
                        className="h-9 w-24 rounded border border-slate-200 px-2 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        placeholder="text"
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
                        placeholder="english_text"
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
                        placeholder="text"
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
                        placeholder="Ozonproducttext"
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
                        placeholder="1688supplier URL"
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
                        title="textproduct"
                        aria-label="textproduct"
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
              disabled={calculating || loadingCatalog}
              className="inline-flex h-11 items-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {calculating ? (
                <RefreshCw size={17} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={17} />
              )}
              {calculating ? "english_textpricing" : `pricing ${batchRows.length} textproduct`}
            </button>
            {batchResult ? (
              <button
                type="button"
                onClick={exportBatchCsv}
                className="inline-flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Download size={16} />
                english_text CSV
              </button>
            ) : null}
          </div>

          {batchResult ? (
            <div className="mt-6">
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-sm">
                <span>
                  text <strong>{batchResult.summary.total}</strong>
                </span>
                <span className="text-emerald-700">
                  passed {batchResult.summary.passed}
                </span>
                <span className="text-amber-700">
                  text {batchResult.summary.cautions}
                </span>
                <span className="text-red-700">
                  text/text{" "}
                  {batchResult.summary.rejected + batchResult.summary.blocked}
                </span>
                <span className="text-red-700">
                  failed {batchResult.summary.failed}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      {[
                        "SKU",
                        "product",
                        "SKU",
                        "text",
                        "textprice",
                        "textprice",
                        "gross profit",
                        "gross margin",
                        "audit record",
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
                          {item.result
                            ? `¥${item.result.result.salePriceCny.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.result
                            ? `₽${item.result.result.salePriceRub.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.result
                            ? `¥${item.result.result.profitCny.toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-3 py-2">
                          {item.result
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
        pricingtextgenerationenglish_textevidence，textautomatictext Ozon
        price。english_textproductenglish_texthumantext。
      </div>
    </div>
  );
}
