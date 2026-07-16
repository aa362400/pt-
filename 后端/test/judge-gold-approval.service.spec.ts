import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JudgeGoldApprovalService } from '../src/features/enterprise-slo/judge-gold-approval.service.js';

const categories = [
  'etsy_title',
  'amazon_title',
  'temu_pricing',
  'ozon_russian_listing',
  'image_consistency',
  'ip_risk',
];

describe('JudgeGoldApprovalService', () => {
  let directory: string;
  let datasetPath: string;
  let reportPath: string;
  let approvalPath: string;
  let privateKeyPath: string;
  let publicKeyPath: string;
  let datasetHash: string;
  let reportHash: string;
  let caseIds: string[];
  let audit: { appendStrict: jest.Mock };
  let service: JudgeGoldApprovalService;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'judge-gold-approval-'));
    datasetPath = join(directory, 'gold.json');
    reportPath = join(directory, 'report.json');
    approvalPath = join(directory, 'approval.json');
    privateKeyPath = join(directory, 'private.pem');
    publicKeyPath = join(directory, 'public.pem');
    caseIds = Array.from({ length: 12 }, (_, index) => `case-${index}`);
    const dataset = Buffer.from(
      JSON.stringify({
        datasetVersion: '1.0.0-provisional',
        labelPolicy: 'provisional_policy_gold',
        cases: caseIds.map((id, index) => ({
          id,
          category: categories[Math.floor(index / 2)],
          input: { sample: index },
          expectedDecision: index % 2 === 0 ? 'PASS' : 'BLOCK',
        })),
      }),
    );
    datasetHash = createHash('sha256').update(dataset).digest('hex');
    const report = Buffer.from(
      JSON.stringify({
        status: 'passed',
        datasetVersion: '1.0.0-provisional',
        datasetHash,
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
    reportHash = createHash('sha256').update(report).digest('hex');
    await Promise.all([
      writeFile(datasetPath, dataset),
      writeFile(reportPath, report),
    ]);
    Object.assign(process.env, {
      JUDGE_CALIBRATION_EVIDENCE_PATH: reportPath,
      JUDGE_GOLD_DATASET_PATH: datasetPath,
      JUDGE_GOLD_APPROVAL_PATH: approvalPath,
      JUDGE_GOLD_SIGNING_PRIVATE_KEY_PATH: privateKeyPath,
      JUDGE_GOLD_APPROVAL_PUBLIC_KEY_PATH: publicKeyPath,
      JUDGE_GOLD_LOCAL_SIGNING_ENABLED: 'true',
    });
    audit = { appendStrict: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
    service = new JudgeGoldApprovalService(audit as never);
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await rm(directory, { recursive: true, force: true });
  });

  it('requires every case, signs the approval and records the reviewer in the audit chain', async () => {
    const before = await service.getStatus('org-1');
    expect(before.approvable).toBe(true);
    expect(before.gate.status).toBe('not_configured');

    const result = await service.approve(
      'org-1',
      { sub: 'owner-1', email: 'owner@example.com', orgId: 'org-1' },
      {
        datasetHash,
        reportHash,
        reviewedCaseIds: caseIds,
        reason: '逐项核对了六类业务的正反例与预期决策。',
        confirmation: '确认批准金标数据集',
      },
    );

    expect(result.gate.status).toBe('passed');
    expect(result.approval).toEqual(
      expect.objectContaining({
        reviewerId: 'owner-1',
        decision: 'approved',
        reviewedCaseCount: 12,
      }),
    );
    expect(audit.appendStrict).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'enterprise.judge-gold-approved',
        actorId: 'owner-1',
        organizationId: 'org-1',
      }),
    );
    expect((await readFile(privateKeyPath, 'utf8')).toString()).toContain(
      'PRIVATE KEY',
    );
  });

  it('refuses partial review and stale hashes', async () => {
    await expect(
      service.approve(
        'org-1',
        { sub: 'owner-1', email: 'owner@example.com', orgId: 'org-1' },
        {
          datasetHash,
          reportHash,
          reviewedCaseIds: caseIds.slice(0, 11),
          reason: '逐项核对了六类业务的正反例与预期决策。',
          confirmation: '确认批准金标数据集',
        },
      ),
    ).rejects.toThrow('必须逐项确认全部金标样本');
    await expect(
      service.approve(
        'org-1',
        { sub: 'owner-1', email: 'owner@example.com', orgId: 'org-1' },
        {
          datasetHash: '0'.repeat(64),
          reportHash,
          reviewedCaseIds: caseIds,
          reason: '逐项核对了六类业务的正反例与预期决策。',
          confirmation: '确认批准金标数据集',
        },
      ),
    ).rejects.toThrow('金标数据或回归报告已变化');
  });

  it('keeps a signed revocation failed and auditable', async () => {
    await service.approve(
      'org-1',
      { sub: 'owner-1', email: 'owner@example.com', orgId: 'org-1' },
      {
        datasetHash,
        reportHash,
        reviewedCaseIds: caseIds,
        reason: '逐项核对了六类业务的正反例与预期决策。',
        confirmation: '确认批准金标数据集',
      },
    );
    const revoked = await service.revoke(
      'org-1',
      { sub: 'admin-2', email: 'admin@example.com', orgId: 'org-1' },
      {
        reason: '发现标签策略需要重新进行人工复核。',
        confirmation: '确认撤销金标审批',
      },
    );

    expect(revoked.gate.status).toBe('failed');
    expect(revoked.approvable).toBe(true);
    expect(revoked.approval).toEqual(
      expect.objectContaining({ decision: 'revoked', revokedBy: 'admin-2' }),
    );
    expect(audit.appendStrict).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'enterprise.judge-gold-revoked' }),
    );
  });
});
