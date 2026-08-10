import { createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { OzonPricingWorkbookImportService } from '../src/features/profit-calculator/ozon-pricing-workbook-import.service.js';

const HEADERS = [
  '类目',
  '物流',
  '采购\n（¥）',
  '其他成本\n（¥)',
  '重量（g）',
  'ZTO Express',
  'EX 运费',
  'ZTO Standard',
  'ST 运费',
  'ZTO Economy',
  'ECO 运费',
  'rFBS运费',
  '成本\n(¥)',
  '利润率',
  '星星（1.5）+收单（2）+退货（5）',
  '广告占比',
  '利润',
  '广告预估费用',
  '手续费',
  'OZON\n佣金费率',
  '广告成本',
  '最终OZON售价(人民币）',
  '上架价',
  '最低20%利润售价(人民币）',
  '最低15%利润售价(人民币）',
  '最低10%利润售价(人民币）',
  '竞品价格',
  '货号（1688标题+采购型号）',
  'sku',
  '竞品主页链接',
  '货源链接',
  '备注1',
  '备注2',
  '重量',
  '实际重量',
];

async function workbookFixture() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('定价');
  sheet.addRow(['售价表']);
  sheet.addRow(HEADERS);
  sheet.addRow([
    '汽车用品',
    'ZTO Economy',
    20,
    2,
    300,
    ...Array<null>(21).fill(null),
    99,
    '汽车风扇 采购型号A',
    'CAR-FAN-001',
    'https://www.ozon.ru/product/example',
    'https://detail.1688.com/offer/example.html',
    '备注一',
    '备注二',
    320,
    305,
  ]);
  sheet.addRow(['汽车用品', 'ZTO Economy', 0, null, 0]);
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
          workbook: '售价表260604.xlsx',
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
      filename: '售价表260604.xlsx',
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
            productTitle: '汽车风扇 采购型号A',
            sku: 'CAR-FAN-001',
            category: '汽车用品',
            logistics: 'economy',
            purchaseCost: 20,
            otherCost: 2,
            weightGram: 300,
            targetMarginRate: 0.2,
            fixedCostRate: 0.085,
            advertisingRate: 0.2,
            sourceFileName: '售价表260604.xlsx',
            sourceFileSha256: sha256,
            sourceExcelRow: 3,
          }),
        ],
      }),
    );
    expect(response.import).toEqual(
      expect.objectContaining({
        filename: '售价表260604.xlsx',
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
          workbook: '售价表260604.xlsx',
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
