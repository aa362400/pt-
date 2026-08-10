import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { OzonPricingWorkbookImportService } from '../src/features/profit-calculator/ozon-pricing-workbook-import.service.js';

const HEADERS = [
  'category',
  'text',
  'text\n（¥）',
  'textcost\n（¥)',
  'text（g）',
  'ZTO Express',
  'EX text',
  'ZTO Standard',
  'ST text',
  'ZTO Economy',
  'ECO text',
  'rFBStext',
  'cost\n(¥)',
  'profittext',
  'text（1.5）+text（2）+text（5）',
  'english_text',
  'profit',
  'english_text',
  'english_text',
  'OZON\ncommissiontext',
  'textcost',
  'textOZONprice(english_text）',
  'listingtext',
  'text20%profitprice(english_text）',
  'text15%profitprice(english_text）',
  'text10%profitprice(english_text）',
  'competitor price',
  'SKU（1688title+english_text）',
  'sku',
  'english_text',
  'supplier URL',
  'notes1',
  'notes2',
  'text',
  'actual weight',
];

async function workbookFixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('text');
  sheet.addRow(['pricetext']);
  sheet.addRow(HEADERS);
  sheet.addRow([
    'english_text',
    'ZTO Economy',
    20,
    2,
    300,
    ...Array<null>(21).fill(null),
    99,
    'english_text english_textA',
    'CAR-FAN-001',
    'https://www.ozon.ru/product/example',
    'https://detail.1688.com/offer/example.html',
    'notestext',
    'notestext',
    320,
    305,
  ]);
  sheet.addRow(['english_text', 'ZTO Economy', 0, null, 0]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe('OzonPricingWorkbookImportService', () => {
  const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

  it('imports meaningful rows, preserves workbook context and chunks through the existing pricing service', async () => {
    const buffer = await workbookFixture();
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    const profitCalculator = {
      getOzonCategories: jest.fn().mockResolvedValue({
        source: {
          workbook: 'pricetext260604.xlsx',
          workbookSha256: sha256,
          rulesHash: 'rules-hash',
          ruleVersion: '2026-06-04',
        },
      }),
      calculateOzonBatch: jest.fn().mockResolvedValue({
        mode: 'batch',
        items: [{ itemId: '3', ok: true, result: { decision: 'PASS' } }],
        summary: {
          total: 1,
          passed: 1,
          cautions: 0,
          rejected: 0,
          blocked: 0,
          failed: 0,
        },
        source: { rulesHash: 'rules-hash' },
      }),
    };
    const service = new OzonPricingWorkbookImportService(
      profitCalculator as never,
    );

    const response = await service.importWorkbook(user, {
      filename: 'pricetext260604.xlsx',
      dataBase64: buffer.toString('base64'),
      persist: true,
    });

    expect(profitCalculator.calculateOzonBatch).toHaveBeenCalledWith(
      user,
      expect.objectContaining({
        persist: true,
        items: [
          expect.objectContaining({
            itemId: '3',
            productTitle: 'english_text english_textA',
            sku: 'CAR-FAN-001',
            category: 'english_text',
            logistics: 'economy',
            purchaseCost: 20,
            otherCost: 2,
            weightGram: 300,
            targetMarginRate: 0.2,
            fixedCostRate: 0.085,
            advertisingRate: 0.2,
            sourceFileName: 'pricetext260604.xlsx',
            sourceFileSha256: sha256,
            sourceExcelRow: 3,
          }),
        ],
      }),
    );
    expect(response.import).toEqual(
      expect.objectContaining({
        filename: 'pricetext260604.xlsx',
        sha256,
        matchedCurrentRuleSource: true,
        parsedRows: 1,
        skippedBlankRows: 1,
      }),
    );
    expect(response.batch.summary.total).toBe(1);
  });

  it('blocks a workbook whose bytes do not match the active rule source', async () => {
    const buffer = await workbookFixture();
    const profitCalculator = {
      getOzonCategories: jest.fn().mockResolvedValue({
        source: {
          workbook: 'pricetext260604.xlsx',
          workbookSha256: '0'.repeat(64),
        },
      }),
      calculateOzonBatch: jest.fn(),
    };
    const service = new OzonPricingWorkbookImportService(
      profitCalculator as never,
    );

    await expect(
      service.importWorkbook(user, {
        filename: 'changed.xlsx',
        dataBase64: buffer.toString('base64'),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(profitCalculator.calculateOzonBatch).not.toHaveBeenCalled();
  });
});
