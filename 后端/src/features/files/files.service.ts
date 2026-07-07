import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service.js';
import {
  STORAGE_PROVIDER_TOKEN,
  type StorageProvider,
} from '../../shared/storage/storage.service.js';
import { FileValidatorService } from '../../shared/storage/file-validator.service.js';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import {
  assertWorkspaceInOrg,
  requireOrg,
} from '../../shared/tenancy/org-scope.js';
import { ListFilesQueryDto, UploadFileDto } from './files.dto.js';

const MAX_FILE_BYTES = 12 * 1024 * 1024; // aligned with the 16mb body limit

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'text/'];
const ALLOWED_MIME_EXACT = [
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/** Map organization plan to per-org upload limit in bytes */
const PLAN_UPLOAD_LIMITS: Record<string, number> = {
  FREE: 50 * 1024 * 1024,
  STARTER: 200 * 1024 * 1024,
  PROFESSIONAL: 500 * 1024 * 1024,
  ENTERPRISE: 1024 * 1024 * 1024,
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER_TOKEN)
    private readonly storage: StorageProvider,
    private readonly fileValidator: FileValidatorService,
    private readonly audit: AuditService,
  ) {}

  private assertMimeAllowed(mimeType: string): void {
    const ok =
      ALLOWED_MIME_PREFIXES.some((p) => mimeType.startsWith(p)) ||
      ALLOWED_MIME_EXACT.includes(mimeType);
    if (!ok) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
  }

  async upload(user: JwtPayload, dto: UploadFileDto) {
    const orgId = requireOrg(user);
    if (dto.workspaceId) {
      await assertWorkspaceInOrg(this.prisma, orgId, dto.workspaceId);
    }
    this.assertMimeAllowed(dto.mimeType);

    const base64 = dto.dataBase64.includes(',')
      ? dto.dataBase64.slice(dto.dataBase64.indexOf(',') + 1)
      : dto.dataBase64;
    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch {
      throw new BadRequestException('Invalid base64 payload');
    }
    if (buffer.length === 0) {
      throw new BadRequestException('Empty file');
    }
    if (buffer.length > MAX_FILE_BYTES) {
      throw new PayloadTooLargeException(
        `File exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB limit`,
      );
    }

    // ── Security validation ──────────────────────────────────────

    // 1) Magic byte validation — reject MIME mismatch before any processing
    if (!this.fileValidator.validateMagicBytes(buffer, dto.mimeType)) {
      throw new BadRequestException(
        `File content does not match declared MIME type: ${dto.mimeType}`,
      );
    }

    // 2) Image re-encoding — strip EXIF/metadata, prevent polyglot attacks
    buffer = await this.fileValidator.reencodeImage(buffer, dto.mimeType);

    // 3) Check per-org upload watermark based on plan
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.sub, organizationId: orgId, status: 'ACTIVE' },
      include: { organization: { select: { plan: true } } },
    });
    const plan = membership?.organization.plan ?? 'FREE';
    const orgLimit = PLAN_UPLOAD_LIMITS[plan] ?? PLAN_UPLOAD_LIMITS.FREE;
    this.fileValidator.validateSize(buffer.length, orgLimit);

    // ── Storage ───────────────────────────────────────────────────

    // Never trust the client-provided filename for the storage path.
    const ext = path.extname(dto.filename).slice(0, 10);
    const storageKey = `${orgId}/${randomUUID()}${ext}`;
    await this.storage.upload(buffer, storageKey, dto.mimeType);

    const asset = await this.prisma.fileAsset.create({
      data: {
        organizationId: orgId,
        workspaceId: dto.workspaceId,
        ownerId: user.sub,
        filename: path.basename(dto.filename),
        mimeType: dto.mimeType,
        size: buffer.length,
        storageKey,
        purpose: dto.purpose,
      },
    });
    await this.audit.log({
      organizationId: orgId,
      actorId: user.sub,
      action: 'file.upload',
      resourceType: 'FileAsset',
      resourceId: asset.id,
      after: { filename: asset.filename, size: asset.size },
    });
    return asset;
  }

  async findAll(user: JwtPayload, query: ListFilesQueryDto) {
    const orgId = requireOrg(user);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.FileAssetWhereInput = {
      organizationId: orgId,
      ...(query.purpose ? { purpose: query.purpose } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fileAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.fileAsset.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async getOwned(user: JwtPayload, id: string) {
    const orgId = requireOrg(user);
    const asset = await this.prisma.fileAsset.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!asset) {
      throw new NotFoundException('File not found');
    }
    return asset;
  }

  async remove(user: JwtPayload, id: string) {
    const asset = await this.getOwned(user, id);
    await this.storage.delete(asset.storageKey);
    await this.prisma.fileAsset.delete({ where: { id: asset.id } });
    await this.audit.log({
      organizationId: asset.organizationId,
      actorId: user.sub,
      action: 'file.delete',
      resourceType: 'FileAsset',
      resourceId: asset.id,
      before: { filename: asset.filename },
    });
    return { id: asset.id };
  }
}
