import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  judgeApprovalPayload,
  verifyJudgeCalibrationEvidence,
} from '../src/features/enterprise-slo/judge-calibration-evidence.js';

const categories = [
  'etsy_title',
  'amazon_title',
  'temu_pricing',
  'ozon_russian_listing',
  'image_consistency',
  'ip_risk',
] as const;

function goldDataset(version = '1.0.0') {
  return Buffer.from(
    JSON.stringify({
      datasetVersion: version,
      cases: Array.from({ length: 12 }, (_, index) => ({
        id: `case-${index}`,
      })),
    }),
  );
}

describe('verifyJudgeCalibrationEvidence', () => {
  let directory: string;
  let datasetPath: string;
  let reportPath: string;
  let approvalPath: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'judge-calibration-'));
    datasetPath = join(directory, 'gold.json');
    reportPath = join(directory, 'report.json');
    approvalPath = join(directory, 'approval.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('passes only a complete calibration with an authorized Ed25519 approval', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const dataset = goldDataset();
    const hash = createHash('sha256').update(dataset).digest('hex');
    const report = {
      status: 'passed',
      datasetVersion: '1.0.0',
      datasetHash: hash,
      totalCases: 12,
      failedCases: 0,
      categoryCoverage: categories,
      categoryCounts: Object.fromEntries(categories.map((name) => [name, 2])),
      liveJudge: {
        status: 'passed',
        totalCases: 12,
        passedCases: 12,
        failedCases: 0,
      },
    };
    const reportBytes = Buffer.from(JSON.stringify(report));
    const approval = {
      approvalVersion: '2',
      organizationId: 'org-1',
      datasetVersion: '1.0.0',
      datasetHash: hash,
      reportHash: createHash('sha256').update(reportBytes).digest('hex'),
      reviewerId: 'quality-owner-01',
      reviewedAt: '2026-07-13T08:00:00.000Z',
      keyId: 'judge-reviewer-2026-01',
      nonce: '123e4567-e89b-42d3-a456-426614174000',
      decision: 'approved' as const,
      reason: 'Reviewed all twelve policy gold cases.',
      reviewedCaseIds: Array.from(
        { length: 12 },
        (_, index) => `case-${index}`,
      ),
      signatureAlgorithm: 'Ed25519',
      signature: '',
    };
    approval.signature = sign(
      null,
      Buffer.from(judgeApprovalPayload(approval)),
      privateKey,
    ).toString('base64');
    await Promise.all([
      writeFile(datasetPath, dataset),
      writeFile(reportPath, reportBytes),
      writeFile(approvalPath, JSON.stringify(approval)),
    ]);

    const result = verifyJudgeCalibrationEvidence({
      reportPath,
      datasetPath,
      approvalPath,
      publicKeyPem: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.status).toBe('passed');
    expect(result.details).toEqual(
      expect.objectContaining({
        signatureVerified: true,
        totalCases: 12,
        approvalVersion: '2',
      }),
    );
  });

  it('invalidates approval when the signed report bytes change', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const dataset = goldDataset('1.0.0-provisional');
    const hash = createHash('sha256').update(dataset).digest('hex');
    const report = Buffer.from(
      JSON.stringify({
        status: 'passed',
        datasetVersion: '1.0.0',
        datasetHash: hash,
        totalCases: 12,
        failedCases: 0,
        categoryCoverage: categories,
        categoryCounts: Object.fromEntries(categories.map((name) => [name, 2])),
        liveJudge: {
          status: 'passed',
          totalCases: 12,
          passedCases: 12,
          failedCases: 0,
        },
      }),
    );
    const approval = {
      approvalVersion: '2',
      organizationId: 'org-1',
      datasetVersion: '1.0.0',
      datasetHash: hash,
      reportHash: createHash('sha256').update(report).digest('hex'),
      reviewerId: 'quality-owner-01',
      reviewedAt: '2026-07-13T08:00:00.000Z',
      keyId: 'judge-reviewer-2026-01',
      nonce: '123e4567-e89b-42d3-a456-426614174000',
      decision: 'approved' as const,
      reason: 'Reviewed all twelve policy gold cases.',
      reviewedCaseIds: Array.from(
        { length: 12 },
        (_, index) => `case-${index}`,
      ),
      signatureAlgorithm: 'Ed25519',
      signature: '',
    };
    approval.signature = sign(
      null,
      Buffer.from(judgeApprovalPayload(approval)),
      privateKey,
    ).toString('base64');
    await Promise.all([
      writeFile(datasetPath, dataset),
      writeFile(reportPath, report),
      writeFile(approvalPath, JSON.stringify(approval)),
    ]);
    await writeFile(reportPath, `${report.toString()}\n`);

    const result = verifyJudgeCalibrationEvidence({
      reportPath,
      datasetPath,
      approvalPath,
      publicKeyPem: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.status).toBe('failed');
    expect(result.message).toContain('metadata');
  });

  it('rejects a cryptographically signed revocation', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const dataset = goldDataset();
    const hash = createHash('sha256').update(dataset).digest('hex');
    const report = Buffer.from(
      JSON.stringify({
        status: 'passed',
        datasetVersion: '1.0.0',
        datasetHash: hash,
        totalCases: 12,
        failedCases: 0,
        categoryCoverage: categories,
        categoryCounts: Object.fromEntries(categories.map((name) => [name, 2])),
        liveJudge: {
          status: 'passed',
          totalCases: 12,
          passedCases: 12,
          failedCases: 0,
        },
      }),
    );
    const approval = {
      approvalVersion: '2',
      organizationId: 'org-1',
      datasetVersion: '1.0.0',
      datasetHash: hash,
      reportHash: createHash('sha256').update(report).digest('hex'),
      reviewerId: 'quality-owner-01',
      reviewedAt: '2026-07-13T08:00:00.000Z',
      keyId: 'judge-reviewer-2026-01',
      nonce: '123e4567-e89b-42d3-a456-426614174000',
      decision: 'revoked' as const,
      reason: 'Reviewed all twelve policy gold cases.',
      reviewedCaseIds: Array.from(
        { length: 12 },
        (_, index) => `case-${index}`,
      ),
      signatureAlgorithm: 'Ed25519',
      revokedAt: '2026-07-13T09:00:00.000Z',
      revokedBy: 'quality-owner-02',
      revokeReason: 'Dataset labels need to be reviewed again.',
      signature: '',
    };
    approval.signature = sign(
      null,
      Buffer.from(judgeApprovalPayload(approval)),
      privateKey,
    ).toString('base64');
    await Promise.all([
      writeFile(datasetPath, dataset),
      writeFile(reportPath, report),
      writeFile(approvalPath, JSON.stringify(approval)),
    ]);

    const result = verifyJudgeCalibrationEvidence({
      reportPath,
      datasetPath,
      approvalPath,
      publicKeyPem: publicKey
        .export({ type: 'spki', format: 'pem' })
        .toString(),
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.status).toBe('failed');
  });

  it('does not promote provisional regression evidence without signed approval', async () => {
    const dataset = goldDataset();
    const hash = createHash('sha256').update(dataset).digest('hex');
    await writeFile(datasetPath, dataset);
    await writeFile(
      reportPath,
      JSON.stringify({
        status: 'passed',
        datasetVersion: '1.0.0-provisional',
        datasetHash: hash,
        totalCases: 12,
        failedCases: 0,
        categoryCoverage: categories,
        categoryCounts: Object.fromEntries(categories.map((name) => [name, 2])),
        liveJudge: {
          status: 'passed',
          totalCases: 12,
          passedCases: 12,
          failedCases: 0,
        },
      }),
    );

    const result = verifyJudgeCalibrationEvidence({
      reportPath,
      datasetPath,
      approvalPath,
      publicKeyPem: '',
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.status).toBe('not_configured');
  });

  it('requires a live Judge run in addition to deterministic policy regression', async () => {
    const dataset = goldDataset();
    const hash = createHash('sha256').update(dataset).digest('hex');
    await writeFile(datasetPath, dataset);
    await writeFile(
      reportPath,
      JSON.stringify({
        status: 'passed',
        datasetVersion: '1.0.0',
        datasetHash: hash,
        totalCases: 12,
        failedCases: 0,
        categoryCoverage: categories,
        categoryCounts: Object.fromEntries(categories.map((name) => [name, 2])),
        liveJudge: { status: 'not_run' },
      }),
    );

    const result = verifyJudgeCalibrationEvidence({
      reportPath,
      datasetPath,
      approvalPath,
      publicKeyPem: '',
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.status).toBe('not_configured');
    expect(result.message).toContain('Live Judge');
  });

  it('fails when the approved dataset bytes no longer match the report hash', async () => {
    await writeFile(datasetPath, '{"changed":true}\n');
    await writeFile(
      reportPath,
      JSON.stringify({
        status: 'passed',
        datasetVersion: '1.0.0',
        datasetHash: '0'.repeat(64),
        totalCases: 12,
        failedCases: 0,
        categoryCoverage: categories,
        categoryCounts: Object.fromEntries(categories.map((name) => [name, 2])),
      }),
    );
    await writeFile(approvalPath, '{}');

    const result = verifyJudgeCalibrationEvidence({
      reportPath,
      datasetPath,
      approvalPath,
      publicKeyPem: 'invalid',
      now: new Date('2026-07-13T12:00:00.000Z'),
    });

    expect(result.status).toBe('failed');
    expect(result.message).toContain('hash');
  });
});
