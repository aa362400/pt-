import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CalculateOzonPricingDto } from '../src/features/profit-calculator/profit-calculator.dto.js';
import { ProfitCalculatorService } from '../src/features/profit-calculator/profit-calculator.service.js';

describe('Ozon workbook pricing integration', () => {
  const commerceMcp = { callTool: jest.fn() };
  const service = new ProfitCalculatorService(
    {} as ConstructorParameters<typeof ProfitCalculatorService>[0],
    {} as ConstructorParameters<typeof ProfitCalculatorService>[1],
    commerceMcp as ConstructorParameters<typeof ProfitCalculatorService>[2],
    { appendStrict: jest.fn() } as unknown as ConstructorParameters<
      typeof ProfitCalculatorService
    >[3],
  );
  const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

  beforeEach(() => commerceMcp.callTool.mockReset());

  it('requires explicit logistics, positive cost, weight, and all dimensions', async () => {
    const dto = plainToInstance(CalculateOzonPricingDto, {
      category: 'vehicle-accessories',
      purchaseCost: 0,
      weightGram: 0,
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining([
        'logistics',
        'purchaseCost',
        'weightGram',
        'lengthCm',
        'widthCm',
        'heightCm',
      ]),
    );
  });

  it('loads category options from the Ozon MCP rule source', async () => {
    commerceMcp.callTool.mockResolvedValue({ categories: [] });
    await service.getOzonCategories();
    expect(commerceMcp.callTool).toHaveBeenCalledWith('ozon_pricing_engine', {
      mode: 'categories',
    });
  });

  it('passes explicit physical inputs without overriding versioned engine defaults', async () => {
    commerceMcp.callTool.mockResolvedValue({ decision: 'PASS' });
    await service.calculateOzon(user, {
      category: '汽车用品',
      logistics: 'standard',
      purchaseCost: 20,
      otherCost: 2,
      weightGram: 300,
      lengthCm: 20,
      widthCm: 10,
      heightCm: 5,
      hasBattery: false,
      hasMsds: false,
      persist: false,
    });
    const args = commerceMcp.callTool.mock.calls[0]?.[1];
    expect(commerceMcp.callTool).toHaveBeenCalledWith(
      'ozon_pricing_engine',
      expect.objectContaining({
        mode: 'calculate',
        category: '汽车用品',
        purchase_cost: 20,
        other_cost: 2,
        weight_gram: 300,
        length_cm: 20,
        width_cm: 10,
        height_cm: 5,
      }),
    );
    expect(args).not.toHaveProperty('target_margin_rate');
    expect(args).not.toHaveProperty('advertising_rate');
    expect(args).not.toHaveProperty('fixed_cost_rate');
  });

  it('passes batch rows through one deterministic MCP call', async () => {
    commerceMcp.callTool.mockResolvedValue({
      mode: 'batch',
      items: [],
      summary: { total: 1 },
      source: {},
    });
    await service.calculateOzonBatch(user, {
      persist: false,
      items: [
        {
          itemId: 'SKU-1',
          productTitle: '汽车风扇',
          sku: 'CAR-FAN-001',
          competitorPriceCny: 99,
          competitorUrl: 'https://www.ozon.ru/product/example',
          sourceUrl: 'https://detail.1688.com/offer/example.html',
          category: '汽车用品',
          logistics: 'economy',
          purchaseCost: 20,
          weightGram: 300,
          lengthCm: 20,
          widthCm: 10,
          heightCm: 5,
        },
      ],
    });
    expect(commerceMcp.callTool).toHaveBeenCalledWith(
      'ozon_pricing_engine',
      expect.objectContaining({
        mode: 'batch',
        items: [expect.objectContaining({ item_id: 'SKU-1' })],
      }),
    );
    commerceMcp.callTool.mockResolvedValueOnce({
      mode: 'batch',
      items: [{ itemId: 'SKU-1', ok: false }],
      summary: { total: 1, failed: 1 },
      source: {},
    });
    const response = await service.calculateOzonBatch(user, {
      persist: false,
      items: [
        {
          itemId: 'SKU-1',
          productTitle: '汽车风扇',
          sku: 'CAR-FAN-001',
          category: '汽车用品',
          logistics: 'economy',
          purchaseCost: 20,
          weightGram: 300,
          lengthCm: 20,
          widthCm: 10,
          heightCm: 5,
        },
      ],
    });
    expect(response.items[0]?.context).toEqual(
      expect.objectContaining({
        productTitle: '汽车风扇',
        sku: 'CAR-FAN-001',
      }),
    );
  });

  it('persists the complete cost breakdown and appends a strict audit record', async () => {
    const transaction = {
      profitCalculation: {
        create: jest.fn().mockResolvedValue({
          id: 'ozon-calc-1',
          createdAt: new Date('2026-07-14T04:00:00.000Z'),
        }),
        delete: jest.fn(),
      },
    };
    const tenantDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (_orgId: string, operation: (tx: typeof transaction) => unknown) =>
            operation(transaction),
        ),
    };
    const mcp = {
      callTool: jest.fn().mockResolvedValue({
        mode: 'calculate',
        decision: 'PASS',
        inputs: {
          purchaseCostCny: 20,
          otherCostCny: 2,
          weightGram: 300,
          targetMarginRate: 0.2,
          advertisingRate: 0.2,
          fixedCostRate: 0.085,
          exchangeRateRubPerCny: 11.2793,
        },
        result: {
          salePriceCny: 100,
          freightCny: 13.5,
          commissionFeeCny: 17,
          acquiringFeeCny: 2,
          advertisingFeeCny: 20,
          fixedCostFeeCny: 8.5,
          profitCny: 17,
          marginRate: 0.17,
        },
        source: { rulesHash: 'rules-hash' },
      }),
    };
    const audit = {
      appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    };
    const persistentService = new ProfitCalculatorService(
      {} as ConstructorParameters<typeof ProfitCalculatorService>[0],
      tenantDatabase as unknown as ConstructorParameters<
        typeof ProfitCalculatorService
      >[1],
      mcp as unknown as ConstructorParameters<
        typeof ProfitCalculatorService
      >[2],
      audit as unknown as ConstructorParameters<
        typeof ProfitCalculatorService
      >[3],
    );

    const response = await persistentService.calculateOzon(user, {
      category: '汽车用品',
      logistics: 'standard',
      purchaseCost: 20,
      otherCost: 2,
      weightGram: 300,
      lengthCm: 20,
      widthCm: 10,
      heightCm: 5,
    });

    expect(response).toEqual(
      expect.objectContaining({ calculationId: 'ozon-calc-1' }),
    );
    expect(transaction.profitCalculation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        currency: 'CNY',
        salePrice: 100,
        platformFee: 17,
        paymentFee: 2,
        adCost: 20,
        estimatedProfit: 17,
      }) as unknown,
    });
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ozon.pricing.calculated',
        resourceId: 'ozon-calc-1',
      }),
    );
  });

  it.each([
    {
      status: 'BLOCKED',
      decision: 'DATA_INSUFFICIENT',
      missingFields: ['lengthCm'],
      result: null,
    },
    {
      status: 'BLOCKED',
      decision: 'BLOCKED',
      inputs: {
        purchaseCostCny: 20,
        otherCostCny: 0,
        weightGram: 300,
        targetMarginRate: 0.2,
        advertisingRate: 0.2,
        fixedCostRate: 0.085,
        exchangeRateRubPerCny: 11.2,
      },
      result: {
        salePriceCny: 100,
        freightCny: 10,
        commissionFeeCny: 15,
        acquiringFeeCny: 2,
        advertisingFeeCny: 20,
        fixedCostFeeCny: 8.5,
        profitCny: 24.5,
        marginRate: 0.245,
      },
    },
  ])(
    'returns $decision without writing a ProfitCalculation',
    async (blockedResult) => {
      const transaction = {
        profitCalculation: {
          create: jest.fn(),
        },
      };
      const tenantDatabase = {
        run: jest
          .fn()
          .mockImplementation(
            (_orgId: string, operation: (tx: typeof transaction) => unknown) =>
              operation(transaction),
          ),
      };
      const mcp = { callTool: jest.fn().mockResolvedValue(blockedResult) };
      const audit = { appendStrict: jest.fn() };
      const blockingService = new ProfitCalculatorService(
        {} as ConstructorParameters<typeof ProfitCalculatorService>[0],
        tenantDatabase as unknown as ConstructorParameters<
          typeof ProfitCalculatorService
        >[1],
        mcp as unknown as ConstructorParameters<
          typeof ProfitCalculatorService
        >[2],
        audit as unknown as ConstructorParameters<
          typeof ProfitCalculatorService
        >[3],
      );

      await expect(
        blockingService.calculateOzon(user, {
          category: 'vehicle-accessories',
          logistics: 'standard',
          purchaseCost: 20,
          weightGram: 300,
          lengthCm: 20,
          widthCm: 10,
          heightCm: 5,
        }),
      ).resolves.toEqual(blockedResult);
      expect(tenantDatabase.run).not.toHaveBeenCalled();
      expect(transaction.profitCalculation.create).not.toHaveBeenCalled();
      expect(audit.appendStrict).not.toHaveBeenCalled();
    },
  );
});
