import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CalculateProfitDto } from '../src/features/profit-calculator/profit-calculator.dto.js';
import { ProfitCalculatorService } from '../src/features/profit-calculator/profit-calculator.service.js';

describe('ProfitCalculatorService tenant database context', () => {
  const completeInput = {
    salePrice: 200,
    productCost: 50,
    packagingCost: 2,
    shippingCost: 3,
    domesticTransportCost: 4,
    internationalLogisticsCost: 5,
    platformFee: 20,
    paymentFee: 2,
    adCost: 10,
    storageCost: 1,
    taxCost: 6,
    refundLossReserve: 7,
    exchangeRateRiskReserve: 8,
    otherCost: 9,
    currency: 'USD',
  };

  it('rejects an HTTP payload when any required cost component is missing', async () => {
    const dto = plainToInstance(CalculateProfitDto, {
      salePrice: 100,
      productCost: 40,
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining([
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
      ]),
    );
  });

  it('rejects non-positive sale price and product cost', async () => {
    const dto = plainToInstance(CalculateProfitDto, {
      ...completeInput,
      salePrice: 0,
      productCost: 0,
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(
      expect.arrayContaining(['salePrice', 'productCost']),
    );
  });

  it('persists and reads profit calculations only inside tenant transactions', async () => {
    const transaction = {
      profitCalculation: {
        create: jest.fn().mockResolvedValue({ id: 'profit-1' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'profit-1' }]),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const tenantDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (
            _organizationId: string,
            operation: (tx: typeof transaction) => unknown,
          ) => operation(transaction),
        ),
    };
    const service = new ProfitCalculatorService(
      {} as ConstructorParameters<typeof ProfitCalculatorService>[0],
      tenantDatabase as ConstructorParameters<
        typeof ProfitCalculatorService
      >[1],
      { callTool: jest.fn() } as ConstructorParameters<
        typeof ProfitCalculatorService
      >[2],
      { appendStrict: jest.fn() } as unknown as ConstructorParameters<
        typeof ProfitCalculatorService
      >[3],
    );
    const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

    await service.calculate(user, completeInput);
    await service.findAll(user, {});

    expect(tenantDatabase.run).toHaveBeenCalledTimes(2);
    expect(transaction.profitCalculation.create).toHaveBeenCalled();
    expect(transaction.profitCalculation.findMany).toHaveBeenCalled();
    expect(transaction.profitCalculation.count).toHaveBeenCalled();
  });

  it('fails closed before persistence when a direct caller omits costs', async () => {
    const transaction = {
      profitCalculation: {
        create: jest.fn(),
      },
    };
    const tenantDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (
            _organizationId: string,
            operation: (tx: typeof transaction) => unknown,
          ) => operation(transaction),
        ),
    };
    const service = new ProfitCalculatorService(
      {} as ConstructorParameters<typeof ProfitCalculatorService>[0],
      tenantDatabase as ConstructorParameters<
        typeof ProfitCalculatorService
      >[1],
      { callTool: jest.fn() } as ConstructorParameters<
        typeof ProfitCalculatorService
      >[2],
      { appendStrict: jest.fn() } as unknown as ConstructorParameters<
        typeof ProfitCalculatorService
      >[3],
    );
    const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

    await expect(
      service.calculate(user, { salePrice: 100, productCost: 40 }),
    ).rejects.toMatchObject({ status: 400 });
    expect(tenantDatabase.run).not.toHaveBeenCalled();
    expect(transaction.profitCalculation.create).not.toHaveBeenCalled();
  });

  it('aggregates new cost components into existing columns and records the complete evidence version', async () => {
    const transaction = {
      profitCalculation: {
        create: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: 'profit-1', ...data }),
          ),
      },
    };
    const tenantDatabase = {
      run: jest
        .fn()
        .mockImplementation(
          (
            _organizationId: string,
            operation: (tx: typeof transaction) => unknown,
          ) => operation(transaction),
        ),
    };
    const service = new ProfitCalculatorService(
      {} as ConstructorParameters<typeof ProfitCalculatorService>[0],
      tenantDatabase as ConstructorParameters<
        typeof ProfitCalculatorService
      >[1],
      { callTool: jest.fn() } as ConstructorParameters<
        typeof ProfitCalculatorService
      >[2],
      { appendStrict: jest.fn() } as unknown as ConstructorParameters<
        typeof ProfitCalculatorService
      >[3],
    );
    const user = { sub: 'user-1', email: 'user@example.com', orgId: 'org-1' };

    await service.calculate(user, completeInput);

    expect(transaction.profitCalculation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        salePrice: 200,
        productCost: 50,
        shippingCost: 12,
        otherCost: 30,
        totalCost: 127,
        estimatedProfit: 73,
        profitMargin: 36.5,
        roi: 57.48,
        scenarios: [
          expect.objectContaining({
            type: 'complete-cost-breakdown',
            evidenceVersion: 'profit-cost-evidence/v1',
            costBreakdown: completeInput,
          }),
        ],
      }) as unknown,
    });
  });
});
