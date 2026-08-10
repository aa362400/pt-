import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service.js';

@Injectable()
export class ImagePromptRepository {
  constructor(private readonly prisma: PrismaService) {}
}
