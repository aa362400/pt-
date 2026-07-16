import { api } from './client';
import type { CostInput, PricingResult, ScenarioSimulation } from '../types';

export interface ProfitCalculation {
  id: string;
  name: string;
  productName?: string;
  salePrice?: number;
  costs: CostInput[];
  result?: PricingResult;
  scenarios?: ScenarioSimulation[];
  createdAt: string;
  updatedAt: string;
}

export interface CalculateInput {
  salePrice?: number;
  costs: CostInput[];
  currency?: string;
  workspaceId?: string;
  productId?: string;
}

export interface OzonPricingCategory {
  module: string;
  category: string;
  commissionRates: {
    upTo1500Rub: number;
    upTo5000Rub: number;
    above5000Rub: number;
  };
}

export interface OzonPricingCatalog {
  mode: 'categories';
  categories: OzonPricingCategory[];
  logistics: Array<{ value: 'express' | 'standard' | 'economy'; label: string; deliveryDays: string }>;
  defaults: { fixedCostRate: number; advertisingRate: number; listingMultiplier: number };
  currency?: { rubPerCny: number; acquiringMinimumRub: number };
  usableForPricing: boolean;
  ruleSourceBlockers: string[];
  source: {
    ruleVersion: string;
    workbook: string;
    workbookSha256?: string;
    rulesHash: string;
    pricingFormulaVersion?: string;
    correctionsApplied: string[];
    authority?: string | null;
    reference?: string | null;
    effectiveAt?: string | null;
    importedAt?: string | null;
    expiresAt?: string | null;
    usableForPricing: boolean;
    blockers: string[];
  };
}

export interface OzonPricingInput {
  mode?: 'calculate' | 'evaluate';
  itemId?: string;
  productTitle?: string;
  sku?: string;
  category: string;
  logistics: 'express' | 'standard' | 'economy';
  purchaseCost: number;
  otherCost?: number;
  weightGram: number;
  targetMarginRate?: number;
  advertisingRate?: number;
  fixedCostRate?: number;
  observedSalePriceCny?: number;
  competitorPriceCny?: number;
  competitorUrl?: string;
  sourceUrl?: string;
  note1?: string;
  note2?: string;
  declaredWeightGram?: number;
  actualWeightGram?: number;
  exchangeRate?: number;
  listingMultiplier?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  hasBattery?: boolean;
  hasMsds?: boolean;
  persist?: boolean;
  workspaceId?: string;
  productId?: string;
}

export interface OzonPricingResponse {
  mode: 'calculate' | 'evaluate';
  status?: 'VERIFIED' | 'BLOCKED';
  publishable?: boolean;
  missingFields?: string[];
  ruleSourceBlockers?: string[];
  category?: OzonPricingCategory;
  logistics?: { key: string; label: string; deliveryDays: string };
  inputs?: {
    purchaseCostCny: number;
    otherCostCny: number;
    weightGram: number;
    targetMarginRate: number;
    advertisingRate: number;
    fixedCostRate: number;
    exchangeRateRubPerCny: number;
  };
  result: {
    salePriceCny: number;
    salePriceRub: number;
    listingPriceCny?: number;
    freightCny: number;
    totalCostCny: number;
    commissionTier: string;
    commissionRate: number;
    commissionFeeCny: number;
    acquiringFeeCny: number;
    acquiringFeeBranch: string;
    advertisingFeeCny: number;
    fixedCostFeeCny: number;
    profitCny: number;
    marginRate: number;
    serviceTier: string;
    minimumPricesCny?: { margin20: number; margin15: number; margin10: number };
  } | null;
  packageCompliance?: {
    status: 'PASS' | 'UNKNOWN' | 'BLOCKED';
    blockers: string[];
    warnings: string[];
    limits: {
      maxWeightGram: number;
      maxDimensionSumCm: number;
      maxSideCm: number;
      batteryRequirement: string;
    };
  };
  decision: 'PASS' | 'CAUTION' | 'REJECT' | 'BLOCKED' | 'DATA_INSUFFICIENT';
  formulaTrace?: string[];
  source: OzonPricingCatalog['source'];
  calculationId?: string;
  persistedAt?: string;
}

export interface OzonPricingBatchResponse {
  mode: 'batch';
  items: Array<{
    itemId: string;
    ok: boolean;
    result?: OzonPricingResponse;
    error?: { code: string; message: string };
    context?: {
      productTitle?: string;
      sku?: string;
      competitorPriceCny?: number;
      competitorUrl?: string;
      sourceUrl?: string;
      note1?: string;
      note2?: string;
      declaredWeightGram?: number;
      actualWeightGram?: number;
      sourceFileName?: string;
      sourceFileSha256?: string;
      sourceExcelRow?: number;
    };
    calculationId?: string;
    persistedAt?: string;
  }>;
  summary: {
    total: number;
    passed: number;
    cautions: number;
    rejected: number;
    blocked: number;
    failed: number;
  };
  source: OzonPricingCatalog['source'];
}

export interface OzonPricingWorkbookImportResponse {
  import: {
    filename: string;
    sha256: string;
    matchedCurrentRuleSource: boolean;
    parsedRows: number;
    skippedBlankRows: number;
    invalidRows: Array<{
      excelRow: number;
      code: string;
      message: string;
    }>;
  };
  batch: OzonPricingBatchResponse;
}

interface BackendProfitCalculation {
  id: string;
  workspaceId?: string | null;
  productId?: string | null;
  currency?: string;
  salePrice: number | string;
  productCost: number | string;
  packagingCost: number | string;
  shippingCost: number | string;
  platformFee: number | string;
  paymentFee: number | string;
  adCost: number | string;
  storageCost: number | string;
  otherCost: number | string;
  totalCost: number | string;
  estimatedProfit: number | string;
  profitMargin: number;
  roi: number;
  scenarios?: unknown;
  createdAt: string;
}

interface CalculateProfitDto {
  salePrice: number;
  productCost: number;
  packagingCost: number;
  shippingCost: number;
  domesticTransportCost: number;
  internationalLogisticsCost: number;
  platformFee: number;
  paymentFee: number;
  adCost: number;
  storageCost: number;
  taxCost: number;
  refundLossReserve: number;
  exchangeRateRiskReserve: number;
  otherCost: number;
  currency?: string;
  workspaceId?: string;
  productId?: string;
}

type CalculateProfitCostField = Exclude<
  keyof CalculateProfitDto,
  'salePrice' | 'currency' | 'productId' | 'workspaceId'
>;

const requiredProfitCostFields = [
  'productCost',
  'packagingCost',
  'shippingCost',
  'domesticTransportCost',
  'internationalLogisticsCost',
  'platformFee',
  'paymentFee',
  'adCost',
  'storageCost',
  'taxCost',
  'refundLossReserve',
  'exchangeRateRiskReserve',
  'otherCost',
] as const satisfies ReadonlyArray<CalculateProfitCostField>;

const costFieldByLabel: Record<string, CalculateProfitCostField> = {
  产品成本: 'productCost',
  包装成本: 'packagingCost',
  末端配送: 'shippingCost',
  国内运输: 'domesticTransportCost',
  国际物流: 'internationalLogisticsCost',
  平台佣金: 'platformFee',
  支付手续费: 'paymentFee',
  广告费用: 'adCost',
  仓储费: 'storageCost',
  税费: 'taxCost',
  退款损耗预留: 'refundLossReserve',
  汇率波动预留: 'exchangeRateRiskReserve',
  其他杂费: 'otherCost',
};

const costLabelByField: Array<{
  label: string;
  key: keyof BackendProfitCalculation;
}> = [
  { label: '产品成本', key: 'productCost' },
  { label: '包装成本', key: 'packagingCost' },
  { label: '头程运费', key: 'shippingCost' },
  { label: '平台佣金', key: 'platformFee' },
  { label: '支付手续费', key: 'paymentFee' },
  { label: '广告费用', key: 'adCost' },
  { label: '仓储费', key: 'storageCost' },
  { label: '其他杂费', key: 'otherCost' },
];

function numberValue(value: number | string | null | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toCalculateDto(input: CalculateInput): CalculateProfitDto {
  if (
    input.salePrice === undefined ||
    !Number.isFinite(input.salePrice) ||
    input.salePrice <= 0
  ) {
    throw new Error('PROFIT_COST_DATA_INSUFFICIENT: salePrice');
  }

  const values: Partial<Record<CalculateProfitCostField, number>> = {};

  for (const cost of input.costs) {
    const field = costFieldByLabel[cost.key] ?? costFieldByLabel[cost.label];
    if (field && Number.isFinite(cost.value) && cost.value >= 0) {
      values[field] = cost.value;
    }
  }

  const missingFields = requiredProfitCostFields.filter(
    (field) => values[field] === undefined,
  );
  if (missingFields.length > 0 || (values.productCost ?? 0) <= 0) {
    if ((values.productCost ?? 0) <= 0 && !missingFields.includes('productCost')) {
      missingFields.unshift('productCost');
    }
    throw new Error(
      `PROFIT_COST_DATA_INSUFFICIENT: ${missingFields.join(', ')}`,
    );
  }

  return {
    salePrice: input.salePrice,
    productCost: values.productCost as number,
    packagingCost: values.packagingCost as number,
    shippingCost: values.shippingCost as number,
    domesticTransportCost: values.domesticTransportCost as number,
    internationalLogisticsCost: values.internationalLogisticsCost as number,
    platformFee: values.platformFee as number,
    paymentFee: values.paymentFee as number,
    adCost: values.adCost as number,
    storageCost: values.storageCost as number,
    taxCost: values.taxCost as number,
    refundLossReserve: values.refundLossReserve as number,
    exchangeRateRiskReserve: values.exchangeRateRiskReserve as number,
    otherCost: values.otherCost as number,
    currency: input.currency ?? 'USD',
    workspaceId: input.workspaceId,
    productId: input.productId,
  };
}

function mapCalculation(calc: BackendProfitCalculation): ProfitCalculation {
  const salePrice = numberValue(calc.salePrice);
  const scenarios = Array.isArray(calc.scenarios)
    ? (calc.scenarios as ScenarioSimulation[])
    : [];

  return {
    id: calc.id,
    name: calc.productId ?? '真实利润计算',
    productName: calc.productId ?? undefined,
    salePrice,
    costs: costLabelByField.map(({ label, key }) => ({
      label,
      key: label,
      value: numberValue(calc[key] as number | string | null | undefined),
      unit: calc.currency ?? 'USD',
    })),
    result: {
      salePrice,
      suggestedMin: salePrice,
      suggestedMax: salePrice,
      estimatedProfit: numberValue(calc.estimatedProfit),
      profitMargin: calc.profitMargin,
      roi: calc.roi,
    },
    scenarios,
    createdAt: calc.createdAt,
    updatedAt: calc.createdAt,
  };
}

export const profitCalculatorApi = {
  getOzonCatalog: () =>
    api.get<OzonPricingCatalog>('/profit-calculator/ozon/categories'),

  calculateOzon: (input: OzonPricingInput) =>
    api.post<OzonPricingResponse>('/profit-calculator/ozon/calculate', input),

  calculateOzonBatch: (items: OzonPricingInput[], persist = true) =>
    api.post<OzonPricingBatchResponse>('/profit-calculator/ozon/batch', {
      items,
      persist,
    }),

  importOzonWorkbook: (input: {
    filename: string;
    dataBase64: string;
    persist?: boolean;
    workspaceId?: string;
    productId?: string;
  }) =>
    api.post<OzonPricingWorkbookImportResponse>(
      '/profit-calculator/ozon/import-workbook',
      input,
    ),

  list: async (params?: { page?: number; limit?: number }) => {
    const res = await api.get<{ items: BackendProfitCalculation[]; total: number }>(
      '/profit-calculator',
      { params },
    );
    return {
      ...res,
      items: res.items.map(mapCalculation),
    };
  },

  getById: async (id: string) => {
    const calc = await api.get<BackendProfitCalculation>(
      `/profit-calculator/${id}`,
    );
    return mapCalculation(calc);
  },

  calculate: async (input: CalculateInput) => {
    const calc = await api.post<BackendProfitCalculation>(
      '/profit-calculator/calculate',
      toCalculateDto(input),
    );
    const mapped = mapCalculation(calc);
    if (!mapped.result) {
      throw new Error('后端未返回利润计算结果');
    }
    return mapped.result;
  },

  delete: (id: string) => api.delete<{ id: string }>(`/profit-calculator/${id}`),
};
