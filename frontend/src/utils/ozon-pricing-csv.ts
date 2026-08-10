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
      "SKU",
      "producttitle",
      "SKU",
      "category",
      "logistics route",
      "textcostCNY",
      "textcostCNY",
      "billable weightg",
      "declared weightg",
      "actual weightg",
      "competitor priceCNY",
      "competitor URL",
      "supplier URL",
      "notes1",
      "notes2",
      "status",
      "textpriceCNY",
      "priceRUB",
      "listingenglish_textCNY",
      "text20%profitpriceCNY",
      "text15%profitpriceCNY",
      "text10%profitpriceCNY",
      "gross profitCNY",
      "gross margin",
      "ZTOtextCNY",
      "OzoncommissionCNY",
      "commission rate",
      "english_textCNY",
      "textcostCNY",
      "textcostCNY",
      "textcostCNY",
      "parcel compliance",
      "rule version",
      "source workbookSHA256",
      "audit record",
      "error",
    ],
    ...batchResult.items.map((item) => {
      const result = item.result;
      const context = item.context;
      return [
        item.itemId,
        context?.productTitle,
        context?.sku,
        result?.category.category,
        result?.logistics.label,
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
        result?.result.salePriceCny,
        result?.result.salePriceRub,
        result?.result.listingPriceCny,
        result?.result.minimumPricesCny?.margin20,
        result?.result.minimumPricesCny?.margin15,
        result?.result.minimumPricesCny?.margin10,
        result?.result.profitCny,
        result ? `${(result.result.marginRate * 100).toFixed(2)}%` : "",
        result?.result.freightCny,
        result?.result.commissionFeeCny,
        result ? `${(result.result.commissionRate * 100).toFixed(2)}%` : "",
        result?.result.acquiringFeeCny,
        result?.result.advertisingFeeCny,
        result?.result.fixedCostFeeCny,
        result?.result.totalCostCny,
        result?.packageCompliance.status,
        result?.source.ruleVersion ?? batchResult.source.ruleVersion,
        result?.source.workbookSha256 ?? batchResult.source.workbookSha256,
        item.calculationId,
        item.error?.message,
      ];
    }),
  ];

  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
