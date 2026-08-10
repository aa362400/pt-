import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomUUID,
  sign,
} from 'node:crypto';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { AuditService } from '../../shared/audit/audit.service.js';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import type {
  ApproveJudgeGoldDto,
  RevokeJudgeGoldDto,
} from './judge-gold-approval.dto.js';
import {
  judgeApprovalPayload,
  type JudgeApprovalFields,
  verifyJudgeCalibrationEvidence,
} from './judge-calibration-evidence.js';

const MAX_BYTES = 1024 * 1024;
const APPROVE_CONFIRMATION = 'english_textdatatext';
const REVOKE_CONFIRMATION = 'english_textapproval';

export interface GoldCase {
  id: string;
  category: string;
  input: Record<string, unknown>;
  expectedDecision: string;
}

interface GoldDataset {
  datasetVersion: string;
  labelPolicy: string;
  cases: GoldCase[];
}

@Injectable()
export class JudgeGoldApprovalService {
  constructor(private readonly audit: AuditService) {}

  async getStatus(organizationId: string) {
    const paths = this.paths();
    const [datasetBytes, reportBytes] = await Promise.all([
      this.safeRead(paths.dataset),
      this.safeRead(paths.report),
    ]);
    if (!datasetBytes || !reportBytes) {
      return {
        approvable: false,
        gate: verifyJudgeCalibrationEvidence({
          reportPath: paths.report,
          datasetPath: paths.dataset,
          approvalPath: paths.approval,
          publicKeyPem: '',
        }),
        cases: [],
        signerConfigured: this.signerConfigured(paths),
      };
    }

    const dataset = this.parseDataset(datasetBytes);
    const datasetHash = this.hash(datasetBytes);
    const reportHash = this.hash(reportBytes);
    const publicKeyPem =
      (await this.safeRead(paths.publicKey))?.toString() ?? '';
    const baseline = verifyJudgeCalibrationEvidence({
      reportPath: paths.report,
      datasetPath: paths.dataset,
      approvalPath: '',
      publicKeyPem: '',
    });
    let gate = verifyJudgeCalibrationEvidence({
      reportPath: paths.report,
      datasetPath: paths.dataset,
      approvalPath: paths.approval,
      publicKeyPem,
    });
    const approval = await this.readApproval(paths.approval);
    const approvalMatchesOrganization =
      !approval || approval.organizationId === organizationId;
    if (approval && !approvalMatchesOrganization) {
      gate = {
        status: 'failed',
        message: 'Judge gold approval belongs to a different organization.',
        details: { organizationMatch: false },
      };
    }
    const approvable =
      approvalMatchesOrganization &&
      baseline.status !== 'failed' &&
      baseline.details?.deterministicRegressionPassed === true &&
      baseline.details?.liveJudgePassed === true;

    return {
      approvable,
      signerConfigured: this.signerConfigured(paths),
      datasetVersion: dataset.datasetVersion,
      labelPolicy: dataset.labelPolicy,
      datasetHash,
      reportHash,
      cases: dataset.cases,
      gate,
      approval: approval
        ? {
            organizationId: approval.organizationId,
            reviewerId: approval.reviewerId,
            reviewedAt: approval.reviewedAt,
            decision: approval.decision,
            reason: approval.reason,
            reviewedCaseCount: approval.reviewedCaseIds.length,
            revokedAt: approval.revokedAt ?? null,
            revokedBy: approval.revokedBy ?? null,
            revokeReason: approval.revokeReason ?? null,
            keyId: approval.keyId,
            nonce: approval.nonce,
          }
        : null,
    };
  }

  async approve(
    organizationId: string,
    user: JwtPayload,
    dto: ApproveJudgeGoldDto,
  ) {
    if (dto.confirmation !== APPROVE_CONFIRMATION) {
      throw new ForbiddenException('approvalenglish_text');
    }
    const paths = this.paths();
    const before = await this.getStatus(organizationId);
    if (!before.approvable) {
      throw new ConflictException('Judge english_textapprovaltext');
    }
    if (
      before.datasetHash !== dto.datasetHash ||
      before.reportHash !== dto.reportHash
    ) {
      throw new ConflictException('textdataenglish_textreportenglish_text，english_textreview');
    }
    const expectedIds = before.cases.map((item) => item.id).sort();
    const reviewedIds = [...dto.reviewedCaseIds].sort();
    if (
      expectedIds.length === 0 ||
      expectedIds.length !== reviewedIds.length ||
      expectedIds.some((id, index) => id !== reviewedIds[index])
    ) {
      throw new ConflictException('english_textallenglish_text');
    }

    const key = await this.ensureSigningKey(paths);
    const approval: JudgeApprovalFields = {
      approvalVersion: '2',
      organizationId,
      datasetVersion: before.datasetVersion,
      datasetHash: before.datasetHash,
      reportHash: before.reportHash,
      reviewerId: user.sub,
      reviewedAt: new Date().toISOString(),
      keyId: key.keyId,
      nonce: randomUUID(),
      decision: 'approved',
      reason: dto.reason.trim(),
      reviewedCaseIds: expectedIds,
      signatureAlgorithm: 'Ed25519',
      signature: '',
    };
    approval.signature = sign(
      null,
      Buffer.from(judgeApprovalPayload(approval)),
      createPrivateKey(key.privateKeyPem),
    ).toString('base64');
    await this.atomicWrite(paths.approval, JSON.stringify(approval, null, 2));

    const verified = verifyJudgeCalibrationEvidence({
      reportPath: paths.report,
      datasetPath: paths.dataset,
      approvalPath: paths.approval,
      publicKeyPem: key.publicKeyPem,
    });
    if (verified.status !== 'passed') {
      throw new ServiceUnavailableException('textwriteenglish_textfailed，approvalenglish_text');
    }
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'enterprise.judge-gold-approved',
      resourceType: 'JudgeGoldDataset',
      resourceId: approval.datasetHash,
      before: before.approval,
      after: {
        datasetVersion: approval.datasetVersion,
        datasetHash: approval.datasetHash,
        reportHash: approval.reportHash,
        reviewerId: approval.reviewerId,
        reviewedAt: approval.reviewedAt,
        reviewedCaseCount: approval.reviewedCaseIds.length,
        keyId: approval.keyId,
        nonce: approval.nonce,
      },
    });
    return this.getStatus(organizationId);
  }

  async revoke(
    organizationId: string,
    user: JwtPayload,
    dto: RevokeJudgeGoldDto,
  ) {
    if (dto.confirmation !== REVOKE_CONFIRMATION) {
      throw new ForbiddenException('english_text');
    }
    const paths = this.paths();
    const current = await this.readApproval(paths.approval);
    if (!current) throw new NotFoundException('textnoneenglish_textapproval');
    if (current.organizationId !== organizationId) {
      throw new ForbiddenException('english_textapproval');
    }
    if (current.decision === 'revoked') {
      throw new ConflictException('english_textapprovalenglish_text');
    }
    const key = await this.ensureSigningKey(paths);
    const revoked: JudgeApprovalFields = {
      ...current,
      decision: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedBy: user.sub,
      revokeReason: dto.reason.trim(),
      signature: '',
    };
    revoked.signature = sign(
      null,
      Buffer.from(judgeApprovalPayload(revoked)),
      createPrivateKey(key.privateKeyPem),
    ).toString('base64');
    await this.atomicWrite(paths.approval, JSON.stringify(revoked, null, 2));
    await this.audit.appendStrict({
      organizationId,
      actorId: user.sub,
      action: 'enterprise.judge-gold-revoked',
      resourceType: 'JudgeGoldDataset',
      resourceId: revoked.datasetHash,
      before: {
        reviewerId: current.reviewerId,
        reviewedAt: current.reviewedAt,
        nonce: current.nonce,
      },
      after: {
        revokedAt: revoked.revokedAt,
        revokedBy: revoked.revokedBy,
        revokeReason: revoked.revokeReason,
      },
    });
    return this.getStatus(organizationId);
  }

  private paths() {
    const runtimeRoot = resolve(
      process.cwd(),
      '.agent-runtime',
      'judge-approval',
    );
    return {
      report: resolve(
        process.cwd(),
        process.env.JUDGE_CALIBRATION_EVIDENCE_PATH ||
          '../.agent-runtime/judge-calibration.json',
      ),
      dataset: resolve(
        process.cwd(),
        process.env.JUDGE_GOLD_DATASET_PATH ||
          '../e-commerceenglish_textconsistencyagent/agent/evals/judge-golden-v1.json',
      ),
      approval: resolve(
        process.cwd(),
        process.env.JUDGE_GOLD_APPROVAL_PATH ||
          resolve(runtimeRoot, 'judge-gold-approval.json'),
      ),
      privateKey: resolve(
        process.cwd(),
        process.env.JUDGE_GOLD_SIGNING_PRIVATE_KEY_PATH ||
          resolve(runtimeRoot, 'judge-gold-private.pem'),
      ),
      publicKey: resolve(
        process.cwd(),
        process.env.JUDGE_GOLD_APPROVAL_PUBLIC_KEY_PATH ||
          resolve(runtimeRoot, 'judge-gold-public.pem'),
      ),
    };
  }

  private signerConfigured(
    paths: ReturnType<JudgeGoldApprovalService['paths']>,
  ) {
    return (
      (existsSync(paths.privateKey) && existsSync(paths.publicKey)) ||
      process.env.JUDGE_GOLD_LOCAL_SIGNING_ENABLED === 'true'
    );
  }

  private async ensureSigningKey(
    paths: ReturnType<JudgeGoldApprovalService['paths']>,
  ) {
    const existingPrivate = await this.safeRead(paths.privateKey);
    const existingPublic = await this.safeRead(paths.publicKey);
    if (existingPrivate && existingPublic) {
      return {
        privateKeyPem: existingPrivate.toString(),
        publicKeyPem: existingPublic.toString(),
        keyId: this.keyId(existingPublic),
      };
    }
    if (process.env.JUDGE_GOLD_LOCAL_SIGNING_ENABLED !== 'true') {
      throw new ServiceUnavailableException('Judge textsecrettextconfiguration');
    }
    await mkdir(dirname(paths.privateKey), { recursive: true });
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const privateKeyPem = privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString();
    const publicKeyPem = publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString();
    await Promise.all([
      this.atomicWrite(paths.privateKey, privateKeyPem),
      this.atomicWrite(paths.publicKey, publicKeyPem),
    ]);
    await Promise.all([
      chmod(paths.privateKey, 0o600).catch(() => undefined),
      chmod(paths.publicKey, 0o644).catch(() => undefined),
    ]);
    return {
      privateKeyPem,
      publicKeyPem,
      keyId: this.keyId(Buffer.from(publicKeyPem)),
    };
  }

  private keyId(publicKey: Buffer) {
    return `judge-ed25519-${this.hash(publicKey).slice(0, 16)}`;
  }

  private parseDataset(bytes: Buffer): GoldDataset {
    const value = JSON.parse(bytes.toString('utf8')) as Partial<GoldDataset>;
    if (
      typeof value.datasetVersion !== 'string' ||
      typeof value.labelPolicy !== 'string' ||
      !Array.isArray(value.cases) ||
      value.cases.some(
        (item) =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.category !== 'string' ||
          typeof item.expectedDecision !== 'string' ||
          typeof item.input !== 'object' ||
          item.input === null,
      )
    ) {
      throw new ConflictException('textdataenglish_textnonetext');
    }
    return value as GoldDataset;
  }

  private async readApproval(
    path: string,
  ): Promise<JudgeApprovalFields | null> {
    const bytes = await this.safeRead(path);
    if (!bytes) return null;
    try {
      return JSON.parse(bytes.toString('utf8')) as JudgeApprovalFields;
    } catch {
      throw new ConflictException('textyestextapprovalfilenoneenglish_text');
    }
  }

  private async safeRead(path: string): Promise<Buffer | null> {
    try {
      const info = await stat(path);
      if (!info.isFile() || info.size > MAX_BYTES) return null;
      return await readFile(path);
    } catch {
      return null;
    }
  }

  private hash(bytes: Buffer) {
    return createHash('sha256').update(bytes).digest('hex');
  }

  private async atomicWrite(path: string, contents: string) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.${randomUUID()}.tmp`;
    await writeFile(temporary, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, path);
  }
}
