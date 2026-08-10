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
  source: {
    ruleVersion: string;
    workbook: string;
    workbookSha256?: string;
    rulesHash: string;
    pricingFormulaVersion?: string;
    correctionsApplied: string[];
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
  category: OzonPricingCategory;
  logistics: { key: string; label: string; deliveryDays: string };
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
  };
  packageCompliance: {
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
  decision: 'PASS' | 'CAUTION' | 'REJECT' | 'BLOCKED';
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
  packagingCost?: number;
  shippingCost?: number;
  platformFee?: number;
  paymentFee?: number;
  adCost?: number;
  storageCost?: number;
  otherCost?: number;
  currency?: string;
  workspaceId?: string;
  productId?: string;
}

type CalculateProfitCostField = Exclude<
  keyof CalculateProfitDto,
  'currency' | 'productId' | 'workspaceId'
>;

const costFieldByLabel: Record<string, CalculateProfitCostField> = {
  textcost: 'productCost',
  packagingcost: 'packagingCost',
  english_text: 'shippingCost',
  platformcommission: 'platformFee',
  english_text: 'paymentFee',
  english_text: 'adCost',
  english_text: 'storageCost',
  english_text: 'otherCost',
};

const costLabelByField: Array<{
  label: string;
  key: keyof BackendProfitCalculation;
}> = [
  { label: 'textcost', key: 'productCost' },
  { label: 'packagingcost', key: 'packagingCost' },
  { label: 'english_text', key: 'shippingCost' },
  { label: 'platformcommission', key: 'platformFee' },
  { label: 'english_text', key: 'paymentFee' },
  { label: 'english_text', key: 'adCost' },
  { label: 'english_text', key: 'storageCost' },
  { label: 'english_text', key: 'otherCost' },
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
  const dto: CalculateProfitDto = {
    salePrice: input.salePrice ?? 0,
    productCost: 0,
    currency: input.currency ?? 'USD',
    workspaceId: input.workspaceId,
    productId: input.productId,
  };

  for (const cost of input.costs) {
    const field = costFieldByLabel[cost.key] ?? costFieldByLabel[cost.label];
    if (field) {
      dto[field] = cost.value;
    }
  }

  return dto;
}

function mapCalculation(calc: BackendProfitCalculation): ProfitCalculation {
  const salePrice = numberValue(calc.salePrice);
  const scenarios = Array.isArray(calc.scenarios)
    ? (calc.scenarios as ScenarioSimulation[])
    : [];

  return {
    id: calc.id,
    name: calc.productId ?? 'realprofittext',
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
      throw new Error('backendenglish_textprofitenglish_text');
    }
    return mapped.result;
  },

  delete: (id: string) => api.delete<{ id: string }>(`/profit-calculator/${id}`),
};
