import { createHash, createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';

export type JudgeCalibrationGateStatus = 'passed' | 'failed' | 'not_configured';

export interface JudgeCalibrationGateEvidence {
  status: JudgeCalibrationGateStatus;
  message: string;
  details?: Record<string, unknown>;
}

export interface JudgeApprovalFields {
  approvalVersion: string;
  organizationId: string;
  datasetVersion: string;
  datasetHash: string;
  reportHash: string;
  reviewerId: string;
  reviewedAt: string;
  keyId: string;
  nonce: string;
  decision: 'approved' | 'revoked';
  reason: string;
  reviewedCaseIds: string[];
  signatureAlgorithm: string;
  signature?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokeReason?: string;
}

const REQUIRED_CATEGORIES = [
  'etsy_title',
  'amazon_title',
  'temu_pricing',
  'ozon_russian_listing',
  'image_consistency',
  'ip_risk',
] as const;
const MAX_BYTES = 1024 * 1024;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path: string): Record<string, unknown> {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > MAX_BYTES) {
    throw new Error('Judge evidence file is invalid or too large');
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!record(parsed)) throw new Error('Judge evidence must be a JSON object');
  return parsed;
}

export function judgeApprovalPayload(approval: JudgeApprovalFields): string {
  return [
    approval.approvalVersion,
    approval.organizationId,
    approval.datasetVersion,
    approval.datasetHash,
    approval.reportHash,
    approval.reviewerId,
    approval.reviewedAt,
    approval.keyId,
    approval.nonce,
    approval.decision,
    approval.reason,
    [...approval.reviewedCaseIds].sort().join(','),
    approval.revokedAt ?? '',
    approval.revokedBy ?? '',
    approval.revokeReason ?? '',
  ].join('\n');
}

export function verifyJudgeCalibrationEvidence(options: {
  reportPath: string;
  datasetPath: string;
  approvalPath: string;
  publicKeyPem: string;
  now?: Date;
}): JudgeCalibrationGateEvidence {
  if (!existsSync(options.reportPath) || !existsSync(options.datasetPath)) {
    return {
      status: 'not_configured',
      message: 'Judge calibration regression evidence or dataset is missing.',
    };
  }
  try {
    const report = readJson(options.reportPath);
    const dataset = readJson(options.datasetPath);
    const datasetCases = Array.isArray(dataset.cases) ? dataset.cases : [];
    const datasetCaseIds = datasetCases
      .map((item) =>
        record(item) && typeof item.id === 'string' ? item.id : '',
      )
      .filter(Boolean)
      .sort();
    const reportHash = createHash('sha256')
      .update(readFileSync(options.reportPath))
      .digest('hex');
    const datasetHash = createHash('sha256')
      .update(readFileSync(options.datasetPath))
      .digest('hex');
    if (report.datasetHash !== datasetHash) {
      return {
        status: 'failed',
        message:
          'Judge calibration dataset hash does not match the regression report.',
      };
    }
    const coverage = Array.isArray(report.categoryCoverage)
      ? report.categoryCoverage.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const counts = record(report.categoryCounts) ? report.categoryCounts : {};
    const regressionPassed =
      report.status === 'passed' &&
      report.failedCases === 0 &&
      typeof report.totalCases === 'number' &&
      report.totalCases >= REQUIRED_CATEGORIES.length * 2 &&
      datasetCaseIds.length === report.totalCases &&
      new Set(datasetCaseIds).size === datasetCaseIds.length &&
      REQUIRED_CATEGORIES.every(
        (name) => coverage.includes(name) && Number(counts[name]) >= 2,
      );
    if (!regressionPassed) {
      return {
        status: 'failed',
        message:
          'Judge six-family regression did not satisfy coverage or accuracy requirements.',
      };
    }
    const liveJudge = record(report.liveJudge) ? report.liveJudge : {};
    const liveJudgePassed =
      liveJudge.status === 'passed' &&
      liveJudge.failedCases === 0 &&
      Number(liveJudge.totalCases) >= REQUIRED_CATEGORIES.length * 2 &&
      Number(liveJudge.passedCases) === Number(liveJudge.totalCases);
    if (!liveJudgePassed) {
      const attempted =
        liveJudge.status === 'failed' || liveJudge.status === 'unavailable';
      return {
        status: attempted ? 'failed' : 'not_configured',
        message: attempted
          ? 'Live Judge calibration did not pass the authorized gold-set comparison.'
          : 'Live Judge calibration has not been run against the six-family gold set.',
        details: {
          datasetHash,
          deterministicRegressionPassed: true,
          liveJudgeStatus: liveJudge.status ?? 'missing',
          liveJudgeFailedCases: liveJudge.failedCases ?? null,
        },
      };
    }
    if (
      !options.approvalPath ||
      !options.publicKeyPem.trim() ||
      !existsSync(options.approvalPath)
    ) {
      return {
        status: 'not_configured',
        message:
          'Judge policy regression passed, but authorized human gold approval is not configured.',
        details: {
          datasetHash,
          totalCases: report.totalCases,
          categoryCoverage: coverage,
          deterministicRegressionPassed: true,
          signatureVerified: false,
          liveJudgePassed: true,
        },
      };
    }
    const approval = readJson(
      options.approvalPath,
    ) as unknown as JudgeApprovalFields;
    if (
      approval.approvalVersion !== '2' ||
      typeof approval.organizationId !== 'string' ||
      approval.organizationId.trim().length === 0 ||
      approval.signatureAlgorithm !== 'Ed25519' ||
      approval.datasetHash !== datasetHash ||
      approval.reportHash !== reportHash ||
      approval.datasetVersion !== report.datasetVersion ||
      typeof approval.reviewerId !== 'string' ||
      approval.reviewerId.trim().length === 0 ||
      typeof approval.keyId !== 'string' ||
      approval.keyId.trim().length === 0 ||
      typeof approval.reviewedAt !== 'string' ||
      typeof approval.nonce !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        approval.nonce,
      ) ||
      approval.decision !== 'approved' ||
      typeof approval.reason !== 'string' ||
      approval.reason.trim().length < 10 ||
      !Array.isArray(approval.reviewedCaseIds) ||
      approval.reviewedCaseIds.length !== Number(report.totalCases) ||
      new Set(approval.reviewedCaseIds).size !==
        approval.reviewedCaseIds.length ||
      [...approval.reviewedCaseIds]
        .sort()
        .some((id, index) => id !== datasetCaseIds[index]) ||
      typeof approval.signature !== 'string'
    ) {
      return {
        status: 'failed',
        message:
          'Judge human approval metadata is incomplete or targets a different dataset.',
      };
    }
    const reviewedAt = Date.parse(approval.reviewedAt);
    const ageMs = (options.now ?? new Date()).getTime() - reviewedAt;
    if (!Number.isFinite(reviewedAt) || ageMs < 0 || ageMs > 180 * 86_400_000) {
      return {
        status: 'failed',
        message:
          'Judge human approval is invalid, future-dated, or older than 180 days.',
      };
    }
    const publicKey = createPublicKey(
      options.publicKeyPem.replaceAll('\\n', '\n'),
    );
    const signatureVerified = verify(
      null,
      Buffer.from(judgeApprovalPayload(approval)),
      publicKey,
      Buffer.from(approval.signature, 'base64'),
    );
    return {
      status: signatureVerified ? 'passed' : 'failed',
      message: signatureVerified
        ? 'Judge six-family regression and authorized human gold signature passed.'
        : 'Judge human gold signature verification failed.',
      details: {
        datasetVersion: report.datasetVersion,
        datasetHash,
        reportHash,
        totalCases: report.totalCases,
        categoryCoverage: coverage,
        reviewerId: approval.reviewerId,
        reviewedAt: approval.reviewedAt,
        keyId: approval.keyId,
        signatureAlgorithm: approval.signatureAlgorithm,
        approvalVersion: approval.approvalVersion,
        organizationId: approval.organizationId,
        nonce: approval.nonce,
        decision: approval.decision,
        signatureVerified,
        liveJudgePassed: true,
      },
    };
  } catch (error) {
    return {
      status: 'failed',
      message:
        error instanceof Error
          ? `Judge calibration verification failed: ${error.message}`
          : 'Judge calibration verification failed.',
    };
  }
}
