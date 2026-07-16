import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service.js';

type TenantOperation<T> = (transaction: Prisma.TransactionClient) => Promise<T>;
type TenantTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

@Injectable()
export class TenantDatabaseContextService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    organizationId: string,
    operation: TenantOperation<T>,
    options: TenantTransactionOptions = {},
  ) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(organizationId)) {
      throw new Error('Organization id is invalid');
    }
    return this.prisma.$transaction(
      async (transaction) => {
        await transaction.$executeRawUnsafe(
          "SELECT set_config('app.current_organization_id', $1, true)",
          organizationId,
        );
        const context = await transaction.$queryRawUnsafe<
          Array<{ organization_id: string | null }>
        >(
          "SELECT current_setting('app.current_organization_id', true) AS organization_id",
        );
        if (context[0]?.organization_id !== organizationId) {
          throw new Error('Tenant database context verification failed');
        }
        return operation(transaction);
      },
      { maxWait: 5_000, timeout: 30_000, ...options },
    );
  }
}
