import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';
import type { Paginated } from '../../shared/tenancy/org-scope.js';

export interface InvoiceSummary {
  id: string;
  organizationId: string;
  amount: number;
  currency: string;
  status: string;
  plan: string;
  periodStart: Date;
  periodEnd: Date;
  paidAt: Date | null;
  stripeInvoiceId: string | null;
  createdAt: Date;
}

@Injectable()
export class InvoiceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List invoices for an organization with pagination.
   */
  async findAll(
    orgId: string,
    page: number,
    limit: number,
  ): Promise<Paginated<InvoiceSummary>> {
    const where = { organizationId: orgId };
    const orderBy = { createdAt: 'desc' as const };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      items: items as unknown as InvoiceSummary[],
      total,
      page,
      limit,
    };
  }

  /**
   * Get a single invoice by ID (scoped to org).
   */
  async findOne(id: string, orgId: string): Promise<InvoiceSummary> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice as unknown as InvoiceSummary;
  }

  /**
   * Create an invoice record when a payment succeeds.
   */
  async create(data: {
    organizationId: string;
    amount: number;
    currency?: string;
    status?: string;
    plan: string;
    periodStart: Date;
    periodEnd: Date;
    paidAt?: Date;
    stripeInvoiceId?: string;
  }): Promise<InvoiceSummary> {
    const invoice = await this.prisma.invoice.create({
      data: {
        organizationId: data.organizationId,
        amount: data.amount,
        currency: data.currency ?? 'USD',
        status: data.status ?? 'PAID',
        plan: data.plan,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        paidAt: data.paidAt ?? new Date(),
        stripeInvoiceId: data.stripeInvoiceId ?? null,
      },
    });

    return invoice as unknown as InvoiceSummary;
  }
}
