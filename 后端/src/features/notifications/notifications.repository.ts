import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}
}
