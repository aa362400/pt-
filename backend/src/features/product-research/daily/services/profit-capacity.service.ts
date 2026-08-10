import { BadRequestException, Injectable } from '@nestjs/common';

const MONEY_SCALE = 10_000n;
const RATE_SCALE = 1_000_000n;
const REQUIRED_COST_CODES = ['PRODUCT', 'SHIPPING'] as const;

export interface ProfitCostInput {
  code: string;
  amount: string | null;
  required: boolean;
}

export interface ProfitCalculationInput {
  currency: string;
  salePrice: string;
  costs: ProfitCostInput[];
  platformFeeRate: string;
  paymentFeeRate: string;
  adRate: string;
  refundRate: string;
}

export interface ProfitCalculationResult {
  currency: string;
  salePrice: string;
  grossProfitBeforeAds: string | null;
  grossMarginBeforeAds: string | null;
  netProfitAfterAds: string | null;
  netMarginAfterAds: string | null;
  totalKnownCost: string;
  hardGateReasons: string[];
}

@Injectable()
export class ProfitCapacityService {
  calculate(input: ProfitCalculationInput): ProfitCalculationResult {
    const salePrice = this.parseScaled(
      input.salePrice,
      MONEY_SCALE,
      'salePrice',
    );
    if (salePrice <= 0n)
      throw new BadRequestException('salePrice must be positive');

    const mandatoryCostReasons = REQUIRED_COST_CODES.filter((code) => {
      const matchingCosts = input.costs.filter(
        (cost) => cost.code.trim().toUpperCase() === code,
      );
      return !matchingCosts.some(
        (cost) =>
          cost.amount !== null &&
          this.parseScaled(cost.amount, MONEY_SCALE, `cost:${cost.code}`) > 0n,
      );
    }).map((code) => `MISSING_REQUIRED_COST:${code}`);
    const otherRequiredCostReasons = input.costs
      .filter(
        (cost) =>
          cost.required &&
          cost.amount === null &&
          !REQUIRED_COST_CODES.includes(
            cost.code.trim().toUpperCase() as (typeof REQUIRED_COST_CODES)[number],
          ),
      )
      .map((cost) => `MISSING_REQUIRED_COST:${cost.code.trim().toUpperCase()}`);
    const missing = [...new Set([
      ...mandatoryCostReasons,
      ...otherRequiredCostReasons,
    ])];
    const knownCost = input.costs.reduce(
      (total, cost) =>
        total +
        (cost.amount === null
          ? 0n
          : this.parseScaled(cost.amount, MONEY_SCALE, `cost:${cost.code}`)),
      0n,
    );

    if (missing.length > 0) {
      return {
        currency: input.currency,
        salePrice: this.formatMoney(salePrice),
        grossProfitBeforeAds: null,
        grossMarginBeforeAds: null,
        netProfitAfterAds: null,
        netMarginAfterAds: null,
        totalKnownCost: this.formatMoney(knownCost),
        hardGateReasons: missing,
      };
    }

    const platformFee = this.rateAmount(
      salePrice,
      input.platformFeeRate,
      'platformFeeRate',
    );
    const paymentFee = this.rateAmount(
      salePrice,
      input.paymentFeeRate,
      'paymentFeeRate',
    );
    const adCost = this.rateAmount(salePrice, input.adRate, 'adRate');
    const refundReserve = this.rateAmount(
      salePrice,
      input.refundRate,
      'refundRate',
    );
    const grossProfit = salePrice - knownCost - platformFee - paymentFee;
    const netProfit = grossProfit - adCost - refundReserve;

    return {
      currency: input.currency,
      salePrice: this.formatMoney(salePrice),
      grossProfitBeforeAds: this.formatMoney(grossProfit),
      grossMarginBeforeAds: this.formatRate(grossProfit, salePrice),
      netProfitAfterAds: this.formatMoney(netProfit),
      netMarginAfterAds: this.formatRate(netProfit, salePrice),
      totalKnownCost: this.formatMoney(
        knownCost + platformFee + paymentFee + adCost + refundReserve,
      ),
      hardGateReasons: netProfit <= 0n ? ['NON_POSITIVE_NET_PROFIT'] : [],
    };
  }

  private rateAmount(amount: bigint, rate: string, field: string): bigint {
    const parsedRate = this.parseScaled(rate, RATE_SCALE, field);
    if (parsedRate < 0n || parsedRate > RATE_SCALE) {
      throw new BadRequestException(`${field} must be between 0 and 1`);
    }
    return (amount * parsedRate + RATE_SCALE / 2n) / RATE_SCALE;
  }

  private parseScaled(value: string, scale: bigint, field: string): bigint {
    if (!/^-?\d+(\.\d+)?$/.test(value)) {
      throw new BadRequestException(`${field} must be a decimal string`);
    }
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const [whole, fraction = ''] = unsigned.split('.');
    const digits = scale.toString().length - 1;
    const padded = `${fraction}${'0'.repeat(digits)}`.slice(0, digits);
    const result = BigInt(whole) * scale + BigInt(padded || '0');
    return negative ? -result : result;
  }

  private formatMoney(value: bigint): string {
    const negative = value < 0n;
    const absolute = negative ? -value : value;
    const roundedCents = (absolute + 50n) / 100n;
    const whole = roundedCents / 100n;
    const cents = (roundedCents % 100n).toString().padStart(2, '0');
    return `${negative ? '-' : ''}${whole}.${cents}`;
  }

  private formatRate(numerator: bigint, denominator: bigint): string {
    const scaled = (numerator * MONEY_SCALE) / denominator;
    const negative = scaled < 0n;
    const absolute = negative ? -scaled : scaled;
    return `${negative ? '-' : ''}${absolute / MONEY_SCALE}.${(
      absolute % MONEY_SCALE
    )
      .toString()
      .padStart(4, '0')}`;
  }
}
