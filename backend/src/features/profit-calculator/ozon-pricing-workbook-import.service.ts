import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import type {
  CalculateOzonPricingDto,
  ImportOzonPricingWorkbookDto,
} from './profit-calculator.dto.js';
import {
  ProfitCalculatorService,
  type OzonPricingBatchToolResult,
} from './profit-calculator.service.js';

const MAX_WORKBOOK_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 5_000;
const MCP_BATCH_SIZE = 100;

type CellScalar = string | number | boolean | null;

export interface InvalidWorkbookRow {
  excelRow: number;
  code: string;
  message: string;
}

export interface OzonPricingWorkbookImportResponse {
  import: {
    filename: string;
    sha256: string;
    matchedCurrentRuleSource: true;
    parsedRows: number;
    skippedBlankRows: number;
    invalidRows: InvalidWorkbookRow[];
  };
  batch: OzonPricingBatchToolResult;
}

interface PricingCatalogSource {
  source?: {
    workbook?: string;
    workbookSha256?: string;
    rulesHash?: string;
    ruleVersion?: string;
    [key: string]: unknown;
  };
}

function scalar(cell: ExcelJS.Cell): CellScalar {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if ('result' in value) {
    const result = value.result;
    if (
      result === null ||
      typeof result === 'string' ||
      typeof result === 'number' ||
      typeof result === 'boolean'
    ) {
      return result;
    }
  }
  if ('richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  if ('text' in value && typeof value.text === 'string') return value.text;
  if ('hyperlink' in value && typeof value.hyperlink === 'string') {
    return value.hyperlink;
  }
  return cell.text || null;
}

function textValue(cell: ExcelJS.Cell): string {
  const value = scalar(cell);
  return value === null ? '' : String(value).trim();
}

function numberValue(cell: ExcelJS.Cell): number | undefined {
  const value = scalar(cell);
  if (value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeHeader(value: string): string {
  return value.replace(/[\s\n\r（）()¥￥]/g, '').toLowerCase();
}

function normalizeRate(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  return value > 1 ? value / 100 : value;
}

function logisticsValue(value: string): CalculateOzonPricingDto['logistics'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'zto express' || normalized === 'express')
    return 'express';
  if (normalized === 'zto standard' || normalized === 'standard') {
    return 'standard';
  }
  if (normalized === 'zto economy' || normalized === 'economy')
    return 'economy';
  throw new Error(`english_textlogistics route：${value || 'text'}`);
}

@Injectable()
export class OzonPricingWorkbookImportService {
  constructor(private readonly profitCalculator: ProfitCalculatorService) {}

  async importWorkbook(
    user: JwtPayload,
    dto: ImportOzonPricingWorkbookDto,
  ): Promise<OzonPricingWorkbookImportResponse> {
    const buffer = this.decodeWorkbook(dto.dataBase64);
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const catalog =
      (await this.profitCalculator.getOzonCategories()) as PricingCatalogSource;
    const expectedSha256 = catalog.source?.workbookSha256?.toLowerCase();
    if (!expectedSha256 || sha256 !== expectedSha256) {
      throw new BadRequestException({
        code: 'OZON_PRICING_RULE_SOURCE_MISMATCH',
        message:
          'textfileenglish_text Ozon pricingtextsource workbookenglish_text，english_text',
        expectedSha256: expectedSha256 ?? null,
        actualSha256: sha256,
      });
    }

    const workbook = new ExcelJS.Workbook();
    try {
      const arrayBuffer = buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
      await workbook.xlsx.load(arrayBuffer);
    } catch {
      throw new BadRequestException({
        code: 'OZON_PRICING_WORKBOOK_INVALID',
        message: 'noneenglish_text .xlsx file',
      });
    }
    const sheet = workbook.getWorksheet('text');
    if (!sheet) {
      throw new BadRequestException({
        code: 'OZON_PRICING_SHEET_MISSING',
        message: 'english_text“text”english_text',
      });
    }
    this.assertHeaders(sheet);
    if (sheet.rowCount - 2 > MAX_IMPORT_ROWS) {
      throw new BadRequestException({
        code: 'OZON_PRICING_TOO_MANY_ROWS',
        message: `priceenglish_text ${MAX_IMPORT_ROWS} textproductdata`,
      });
    }

    const items: CalculateOzonPricingDto[] = [];
    const invalidRows: InvalidWorkbookRow[] = [];
    let skippedBlankRows = 0;
    for (let excelRow = 3; excelRow <= sheet.rowCount; excelRow += 1) {
      const row = sheet.getRow(excelRow);
      if (!this.isMeaningful(row)) {
        skippedBlankRows += 1;
        continue;
      }
      try {
        items.push(this.toPricingInput(row, excelRow, dto, sha256));
      } catch (error) {
        invalidRows.push({
          excelRow,
          code: 'OZON_PRICING_ROW_INVALID',
          message: error instanceof Error ? error.message : 'producttextnonetext',
        });
      }
    }
    if (items.length === 0) {
      throw new BadRequestException({
        code: 'OZON_PRICING_NO_IMPORTABLE_ROWS',
        message: 'pricetextyestextpricingenglish_textproducttext',
        invalidRows,
      });
    }

    const batch = await this.calculateChunks(
      user,
      items,
      dto.persist !== false,
    );
    const parseFailures = invalidRows.map((row) => ({
      itemId: String(row.excelRow),
      ok: false,
      error: { code: row.code, message: row.message },
      context: {
        sourceFileName: dto.filename,
        sourceFileSha256: sha256,
        sourceExcelRow: row.excelRow,
      },
    }));
    return {
      import: {
        filename: dto.filename,
        sha256,
        matchedCurrentRuleSource: true,
        parsedRows: items.length,
        skippedBlankRows,
        invalidRows,
      },
      batch: {
        ...batch,
        items: [...batch.items, ...parseFailures],
        summary: {
          ...batch.summary,
          total: batch.summary.total + invalidRows.length,
          failed: batch.summary.failed + invalidRows.length,
        },
      },
    };
  }

  private decodeWorkbook(dataBase64: string): Buffer {
    const encoded = dataBase64.includes(',')
      ? dataBase64.slice(dataBase64.indexOf(',') + 1)
      : dataBase64;
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length === 0) {
      throw new BadRequestException('Ozon pricing workbook is empty');
    }
    if (buffer.length > MAX_WORKBOOK_BYTES) {
      throw new BadRequestException(
        `Ozon pricing workbook exceeds ${MAX_WORKBOOK_BYTES / 1024 / 1024}MB`,
      );
    }
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new BadRequestException(
        'Ozon pricing workbook is not an .xlsx file',
      );
    }
    return buffer;
  }

  private assertHeaders(sheet: ExcelJS.Worksheet): void {
    const required: Array<[number, string]> = [
      [1, 'category'],
      [2, 'text'],
      [3, 'text'],
      [4, 'textcost'],
      [5, 'textg'],
      [14, 'profittext'],
      [15, 'text1.5+text2+text5'],
      [16, 'english_text'],
      [27, 'competitor price'],
      [28, 'SKU1688title+english_text'],
      [29, 'sku'],
      [30, 'english_text'],
      [31, 'supplier URL'],
      [34, 'text'],
      [35, 'actual weight'],
    ];
    const header = sheet.getRow(2);
    const mismatches = required.filter(
      ([column, expected]) =>
        !normalizeHeader(textValue(header.getCell(column))).includes(
          normalizeHeader(expected),
        ),
    );
    if (mismatches.length > 0) {
      throw new BadRequestException({
        code: 'OZON_PRICING_HEADERS_INVALID',
        message: 'priceenglish_text“pricetext260604.xlsx”english_text',
        columns: mismatches.map(([column]) => column),
      });
    }
  }

  private isMeaningful(row: ExcelJS.Row): boolean {
    return Boolean(
      numberValue(row.getCell(3)) ||
      numberValue(row.getCell(5)) ||
      textValue(row.getCell(28)) ||
      textValue(row.getCell(29)) ||
      textValue(row.getCell(31)),
    );
  }

  private toPricingInput(
    row: ExcelJS.Row,
    excelRow: number,
    dto: ImportOzonPricingWorkbookDto,
    sha256: string,
  ): CalculateOzonPricingDto {
    const category = textValue(row.getCell(1));
    const logistics = logisticsValue(textValue(row.getCell(2)));
    const purchaseCost = numberValue(row.getCell(3));
    const weightGram = numberValue(row.getCell(5));
    if (!category) throw new Error('categoryenglish_text');
    if (purchaseCost === undefined || purchaseCost < 0) {
      throw new Error('textcosttextyesenglish_text 0 english_text');
    }
    if (weightGram === undefined || weightGram <= 0) {
      throw new Error('english_textyestext 0 english_text');
    }
    return {
      mode: 'calculate',
      itemId: String(excelRow),
      productTitle: textValue(row.getCell(28)) || undefined,
      sku: textValue(row.getCell(29)) || undefined,
      category,
      logistics,
      purchaseCost,
      otherCost: numberValue(row.getCell(4)) ?? 0,
      weightGram,
      targetMarginRate: normalizeRate(numberValue(row.getCell(14)), 0.2),
      fixedCostRate: normalizeRate(numberValue(row.getCell(15)), 0.085),
      advertisingRate: normalizeRate(numberValue(row.getCell(16)), 0.2),
      competitorPriceCny: numberValue(row.getCell(27)),
      competitorUrl: textValue(row.getCell(30)) || undefined,
      sourceUrl: textValue(row.getCell(31)) || undefined,
      note1: textValue(row.getCell(32)) || undefined,
      note2: textValue(row.getCell(33)) || undefined,
      declaredWeightGram: numberValue(row.getCell(34)),
      actualWeightGram: numberValue(row.getCell(35)),
      sourceFileName: dto.filename,
      sourceFileSha256: sha256,
      sourceExcelRow: excelRow,
      workspaceId: dto.workspaceId,
      productId: dto.productId,
      persist: dto.persist !== false,
    };
  }

  private async calculateChunks(
    user: JwtPayload,
    items: CalculateOzonPricingDto[],
    persist: boolean,
  ): Promise<OzonPricingBatchToolResult> {
    const combined: OzonPricingBatchToolResult = {
      mode: 'batch',
      items: [],
      summary: {
        total: 0,
        passed: 0,
        cautions: 0,
        rejected: 0,
        blocked: 0,
        failed: 0,
      },
      source: {},
    };
    for (let offset = 0; offset < items.length; offset += MCP_BATCH_SIZE) {
      const chunk = items.slice(offset, offset + MCP_BATCH_SIZE);
      const response = await this.profitCalculator.calculateOzonBatch(user, {
        items: chunk,
        persist,
      });
      combined.items.push(...response.items);
      combined.source = response.source;
      for (const key of [
        'total',
        'passed',
        'cautions',
        'rejected',
        'blocked',
        'failed',
      ] as const) {
        combined.summary[key] += Number(response.summary[key] ?? 0);
      }
    }
    return combined;
  }
}
