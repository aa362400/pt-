import type { OzonPricingBatchResponse } from "../api/profit-calculator";

function csvCell(value: string | number | undefined) {
  const text = value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function buildOzonPricingCsv(
  batchResult: OzonPricingBatchResponse,
): string {
  const rows: Array<Array<string | number | undefined>> = [
    [
      "货号",
      "商品标题",
      "SKU",
      "类目",
      "物流线路",
      "采购成本CNY",
      "其他成本CNY",
      "计费重量g",
      "申报重量g",
      "实际重量g",
      "竞品价格CNY",
      "竞品链接",
      "货源链接",
      "备注1",
      "备注2",
      "状态",
      "核算售价CNY",
      "售价RUB",
      "上架划线价CNY",
      "最低20%利润售价CNY",
      "最低15%利润售价CNY",
      "最低10%利润售价CNY",
      "毛利CNY",
      "毛利率",
      "ZTO物流CNY",
      "Ozon佣金CNY",
      "佣金率",
      "收单费CNY",
      "广告成本CNY",
      "固定成本CNY",
      "总成本CNY",
      "包裹合规",
      "规则版本",
      "源表SHA256",
      "审计记录",
      "错误",
    ],
    ...batchResult.items.map((item) => {
      const result = item.result;
      const context = item.context;
      return [
        item.itemId,
        context?.productTitle,
        context?.sku,
        result?.category?.category,
        result?.logistics?.label,
        result?.inputs?.purchaseCostCny,
        result?.inputs?.otherCostCny,
        result?.inputs?.weightGram,
        context?.declaredWeightGram,
        context?.actualWeightGram,
        context?.competitorPriceCny,
        context?.competitorUrl,
        context?.sourceUrl,
        context?.note1,
        context?.note2,
        item.ok ? (result?.decision ?? "") : "FAILED",
        result?.result?.salePriceCny,
        result?.result?.salePriceRub,
        result?.result?.listingPriceCny,
        result?.result?.minimumPricesCny?.margin20,
        result?.result?.minimumPricesCny?.margin15,
        result?.result?.minimumPricesCny?.margin10,
        result?.result?.profitCny,
        result?.result
          ? `${(result.result.marginRate * 100).toFixed(2)}%`
          : "",
        result?.result?.freightCny,
        result?.result?.commissionFeeCny,
        result?.result
          ? `${(result.result.commissionRate * 100).toFixed(2)}%`
          : "",
        result?.result?.acquiringFeeCny,
        result?.result?.advertisingFeeCny,
        result?.result?.fixedCostFeeCny,
        result?.result?.totalCostCny,
        result?.packageCompliance?.status,
        result?.source.ruleVersion ?? batchResult.source.ruleVersion,
        result?.source.workbookSha256 ?? batchResult.source.workbookSha256,
        item.calculationId,
        item.error?.message ??
          [
            ...(result?.ruleSourceBlockers ?? []),
            ...(result?.missingFields ?? []),
          ].join("; "),
      ];
    }),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
