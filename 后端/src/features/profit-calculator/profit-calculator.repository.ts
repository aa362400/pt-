import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';

@Injectable()
export class ProfitCalculatorRepository {
  constructor(private readonly prisma: PrismaService) {}
}
