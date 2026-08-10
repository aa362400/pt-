import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import {
  GetBucketVersioningCommand,
  GetObjectCommand,
  GetObjectLockConfigurationCommand,
  ObjectLockMode,
  PutObjectCommand,
  S3Client,
  ServerSideEncryption,
} from '@aws-sdk/client-s3';
import { CommerceMcpClientService } from '../shared/commerce-mcp/commerce-mcp-client.service.js';
import { CommerceMcpTrustService } from '../shared/commerce-mcp/commerce-mcp-trust.service.js';
import { verifyJudgeCalibrationEvidence } from '../features/enterprise-slo/judge-calibration-evidence.js';

type GateStatus = 'passed' | 'failed' | 'not_configured';

interface GateEvidence {
  status: GateStatus;
  message: string;
  details?: Record<string, unknown>;
}

function persistResult(
  env: Record<string, string>,
  result: Record<string, unknown>,
): string {
  const path = resolve(
    process.cwd(),
    env.ENTERPRISE_READINESS_EVIDENCE_PATH ||
      '.agent-runtime/enterprise-readiness.json',
  );
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  renameSync(temporaryPath, path);
  return path;
}

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env');
  const fileEnv = existsSync(envPath)
    ? readFileSync(envPath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line && !line.trimStart().startsWith('#'))
        .reduce<Record<string, string>>((result, line) => {
          const index = line.indexOf('=');
          if (index > 0) {
            result[line.slice(0, index)] = line.slice(index + 1);
          }
          return result;
        }, {})
    : {};
  const runtimeEnv = Object.entries(process.env).reduce<Record<string, string>>(
    (result, [name, value]) => {
      if (typeof value === 'string') result[name] = value;
      return result;
    },
    {},
  );
  return { ...fileEnv, ...runtimeEnv };
}

function credentials(env: Record<string, string>, prefix: string) {
  const accessKeyId = env[`${prefix}_ACCESS_KEY_ID`]?.trim();
  const secretAccessKey = env[`${prefix}_SECRET_ACCESS_KEY`]?.trim();
  return accessKeyId && secretAccessKey
    ? { accessKeyId, secretAccessKey }
    : undefined;
}

async function verifyKms(
  env: Record<string, string>,
  allowExternalProbes: boolean,
): Promise<GateEvidence> {
  const keyId = env.KMS_KEY_ID?.trim();
  if (env.CREDENTIAL_ENCRYPTION_PROVIDER !== 'aws-kms' || !keyId) {
    return {
      status: 'not_configured',
      message: 'AWS KMS credential envelope encryption is not configured.',
    };
  }
  if (!allowExternalProbes) {
    return {
      status: 'failed',
      message:
        'AWS KMS is configured, but the external round-trip probe was not explicitly authorized.',
    };
  }
  const client = new KMSClient({
    region: env.KMS_REGION || 'us-east-1',
    endpoint: env.KMS_ENDPOINT || undefined,
    credentials: credentials(env, 'KMS'),
  });
  let plaintext: Buffer | undefined;
  let decrypted: Buffer | undefined;
  try {
    const context = {
      application: 'shopmate',
      purpose: 'enterprise-readiness-probe',
    };
    const generated = await client.send(
      new GenerateDataKeyCommand({
        KeyId: keyId,
        KeySpec: 'AES_256',
        EncryptionContext: context,
      }),
    );
    if (!generated.Plaintext || !generated.CiphertextBlob) {
      throw new Error('KMS returned incomplete data-key evidence');
    }
    plaintext = Buffer.from(generated.Plaintext);
    const roundTrip = await client.send(
      new DecryptCommand({
        CiphertextBlob: generated.CiphertextBlob,
        EncryptionContext: context,
      }),
    );
    if (!roundTrip.Plaintext) throw new Error('KMS decrypt returned no key');
    decrypted = Buffer.from(roundTrip.Plaintext);
    if (
      plaintext.length !== 32 ||
      decrypted.length !== 32 ||
      !plaintext.equals(decrypted)
    ) {
      throw new Error('KMS generated-key round trip did not match');
    }
    return {
      status: 'passed',
      message: 'AWS KMS generated and decrypted an AES-256 data key.',
      details: { provider: 'aws-kms', keyRoundTrip: true },
    };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    plaintext?.fill(0);
    decrypted?.fill(0);
    client.destroy();
  }
}

async function verifyMcpTrust(
  env: Record<string, string>,
): Promise<GateEvidence> {
  const config = {
    get: (name: string) => env[name],
  } as unknown as ConfigService;
  const trust = new CommerceMcpTrustService(
    new CommerceMcpClientService(config),
  );
  try {
    const result = await trust.inspect();
    return {
      status: result.integrityVerified ? 'passed' : 'failed',
      message: result.integrityVerified
        ? 'MCP registry signature, manifest, executable and tool set match the approved baseline.'
        : 'MCP trust verification failed.',
      details: {
        source: result.source,
        approvalType: result.approvalType,
        approvalExpiresAt: result.expiresAt,
        signingAlgorithm: result.signing.algorithm,
        signingKeyId: result.signing.keyId,
        signatureVerified: result.signing.signatureVerified,
        manifestHash: result.manifest.manifestHash,
        executableHash: result.manifest.executableHash,
        blockers: result.reasons,
      },
    };
  } catch (error) {
    return {
      status: 'failed',
      message:
        error instanceof Error
          ? `MCP trust verification could not run: ${error.message}`
          : 'MCP trust verification could not run.',
    };
  }
}

async function bodyBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error('Object Lock probe readback was empty');
  if (
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray ===
    'function'
  ) {
    return Buffer.from(
      await (
        body as { transformToByteArray: () => Promise<Uint8Array> }
      ).transformToByteArray(),
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function verifyObjectLock(
  env: Record<string, string>,
  allowExternalProbes: boolean,
): Promise<GateEvidence> {
  const bucket = env.AUDIT_ARCHIVE_S3_BUCKET?.trim();
  const kmsKeyId = env.AUDIT_ARCHIVE_KMS_KEY_ID?.trim();
  if (env.AUDIT_ARCHIVE_ENABLED !== 'true' || !bucket || !kmsKeyId) {
    return {
      status: 'not_configured',
      message: 'S3 Object Lock audit archive with SSE-KMS is not configured.',
    };
  }
  if (!allowExternalProbes) {
    return {
      status: 'failed',
      message:
        'S3 Object Lock is configured, but the immutable write probe was not explicitly authorized.',
    };
  }
  const endpoint = env.AUDIT_ARCHIVE_S3_ENDPOINT?.trim();
  const client = new S3Client({
    region: env.AUDIT_ARCHIVE_S3_REGION || 'us-east-1',
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
    credentials: credentials(env, 'AUDIT_ARCHIVE_S3') ?? credentials(env, 'S3'),
  });
  try {
    const [lock, versioning] = await Promise.all([
      client.send(new GetObjectLockConfigurationCommand({ Bucket: bucket })),
      client.send(new GetBucketVersioningCommand({ Bucket: bucket })),
    ]);
    if (
      lock.ObjectLockConfiguration?.ObjectLockEnabled !== 'Enabled' ||
      versioning.Status !== 'Enabled'
    ) {
      throw new Error('Audit bucket lacks Object Lock or versioning');
    }
    const body = Buffer.from(
      JSON.stringify({ probe: 'enterprise-readiness', id: randomUUID() }),
    );
    const hash = createHash('sha256').update(body).digest('hex');
    const checksum = Buffer.from(hash, 'hex').toString('base64');
    const key = `readiness-probes/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.json`;
    const retainUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const put = await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        ChecksumAlgorithm: 'SHA256',
        ChecksumSHA256: checksum,
        ObjectLockMode: ObjectLockMode.COMPLIANCE,
        ObjectLockRetainUntilDate: retainUntil,
        ServerSideEncryption: ServerSideEncryption.aws_kms,
        SSEKMSKeyId: kmsKeyId,
        BucketKeyEnabled: true,
      }),
    );
    const readback = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: put.VersionId,
        ChecksumMode: 'ENABLED',
      }),
    );
    const readbackHash = createHash('sha256')
      .update(await bodyBuffer(readback.Body))
      .digest('hex');
    if (
      !put.VersionId ||
      readbackHash !== hash ||
      readback.ObjectLockMode !== ObjectLockMode.COMPLIANCE ||
      !readback.ObjectLockRetainUntilDate ||
      readback.ObjectLockRetainUntilDate < retainUntil
    ) {
      throw new Error('Object Lock write/readback evidence did not verify');
    }
    return {
      status: 'passed',
      message: 'S3 Object Lock COMPLIANCE write and checksum readback passed.',
      details: {
        versioning: true,
        objectLock: 'COMPLIANCE',
        sseKms: true,
        evidenceVersioned: true,
      },
    };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    client.destroy();
  }
}

function verifyPentest(env: Record<string, string>): GateEvidence {
  const path = env.PENTEST_REPORT_PATH?.trim();
  const expectedHash = env.PENTEST_REPORT_SHA256?.trim().toLowerCase();
  const provider = env.PENTEST_PROVIDER?.trim();
  const completedAt = new Date(env.PENTEST_COMPLETED_AT || 'invalid');
  if (!path || !expectedHash || !provider || !existsSync(path)) {
    return {
      status: 'not_configured',
      message: 'A verifiable external penetration-test report is missing.',
    };
  }
  const actualHash = createHash('sha256')
    .update(readFileSync(path))
    .digest('hex');
  const ageDays = (Date.now() - completedAt.getTime()) / 86_400_000;
  const unresolvedCritical = Number(env.PENTEST_UNRESOLVED_CRITICAL || 0);
  const unresolvedHigh = Number(env.PENTEST_UNRESOLVED_HIGH || 0);
  const passed =
    actualHash === expectedHash &&
    Number.isFinite(ageDays) &&
    ageDays >= 0 &&
    ageDays <= 90 &&
    unresolvedCritical === 0 &&
    unresolvedHigh === 0;
  return {
    status: passed ? 'passed' : 'failed',
    message: passed
      ? 'External penetration-test evidence is current and has no open high findings.'
      : 'Penetration-test hash, age, or unresolved findings failed the gate.',
    details: {
      providerPresent: true,
      reportHashVerified: actualHash === expectedHash,
      reportAgeDays: Number.isFinite(ageDays) ? Math.floor(ageDays) : null,
      unresolvedCritical,
      unresolvedHigh,
    },
  };
}

function verifyEvidenceFile(
  path: string,
  validate: (value: Record<string, unknown>) => boolean,
  label: string,
): GateEvidence {
  if (!existsSync(path)) {
    return {
      status: 'not_configured',
      message: `${label} evidence is missing.`,
    };
  }
  try {
    const value = JSON.parse(readFileSync(path, 'utf8')) as Record<
      string,
      unknown
    >;
    const passed = validate(value);
    return {
      status: passed ? 'passed' : 'failed',
      message: passed
        ? `${label} evidence passed.`
        : `${label} evidence did not satisfy the release gate.`,
    };
  } catch {
    return { status: 'failed', message: `${label} evidence is invalid JSON.` };
  }
}

async function verifyDatabaseEvidence(
  prisma: PrismaClient,
  pilotOrganizationIds: string[],
): Promise<{ slo: GateEvidence; agent: GateEvidence }> {
  if (pilotOrganizationIds.length === 0) {
    const missing: GateEvidence = {
      status: 'not_configured',
      message: 'No enterprise pilot organization is configured.',
    };
    return { slo: missing, agent: missing };
  }
  const organizationList = pilotOrganizationIds
    .map((id) => `'${id.replaceAll("'", "''")}'`)
    .join(',');
  const sloRows = await prisma.$queryRawUnsafe<
    Array<{
      organization_id: string;
      observed_days: number;
      passed_days: number;
    }>
  >(`
    WITH pilot_organizations AS (
      SELECT organizations.id,
             COALESCE(
               (
                 SELECT workspaces.timezone
                   FROM workspaces
                  WHERE workspaces."organizationId" = organizations.id
                    AND workspaces.status = 'ACTIVE'
                  ORDER BY workspaces."createdAt" ASC
                  LIMIT 1
               ),
               'Asia/Shanghai'
             ) AS timezone
        FROM organizations
       WHERE organizations.id IN (${organizationList})
    )
    SELECT organizations.id AS organization_id,
           COUNT(snapshots.date)::int AS observed_days,
           COUNT(snapshots.date) FILTER (WHERE snapshots.passed)::int AS passed_days
      FROM pilot_organizations organizations
      LEFT JOIN enterprise_slo_daily_snapshots snapshots
        ON snapshots."organizationId" = organizations.id
       AND snapshots.date >=
           (CURRENT_TIMESTAMP AT TIME ZONE organizations.timezone)::date - INTERVAL '14 days'
       AND snapshots.date <
           (CURRENT_TIMESTAMP AT TIME ZONE organizations.timezone)::date
     GROUP BY organizations.id
  `);
  const sloPassed =
    sloRows.length > 0 &&
    sloRows.every((row) => row.observed_days === 14 && row.passed_days === 14);
  const nonMockRuns = await prisma.$queryRawUnsafe<Array<{ count: number }>>(`
    SELECT COUNT(*)::int AS count
      FROM agent_runs
     WHERE status = 'COMPLETED'
       AND "organizationId" IN (${organizationList})
       AND "createdAt" >= NOW() - INTERVAL '7 days'
       AND LOWER(COALESCE(provider, '')) NOT IN ('', 'mock')
       AND LOWER(provider) NOT LIKE '%mock%'
       AND COALESCE(output->>'mockMode', 'false') = 'false'
  `);
  return {
    slo: {
      status: sloPassed ? 'passed' : 'failed',
      message: sloPassed
        ? 'Every organization has 14 consecutive passing SLO days.'
        : 'The required 14-day passing SLO window is incomplete.',
      details: {
        organizations: sloRows.length,
        minimumObservedDays:
          sloRows.length > 0
            ? Math.min(...sloRows.map((row) => row.observed_days))
            : 0,
        minimumPassedDays:
          sloRows.length > 0
            ? Math.min(...sloRows.map((row) => row.passed_days))
            : 0,
      },
    },
    agent: {
      status: Number(nonMockRuns[0]?.count ?? 0) > 0 ? 'passed' : 'failed',
      message:
        Number(nonMockRuns[0]?.count ?? 0) > 0
          ? 'Recent completed non-mock AgentRun evidence exists.'
          : 'No recent completed non-mock AgentRun evidence exists.',
      details: { recentNonMockRuns: Number(nonMockRuns[0]?.count ?? 0) },
    },
  };
}

async function verifyMemoryGovernance(
  prisma: PrismaClient,
  pilotOrganizationIds: string[],
): Promise<GateEvidence> {
  if (pilotOrganizationIds.length === 0) {
    return {
      status: 'not_configured',
      message: 'No enterprise pilot organization is configured.',
    };
  }
  const organizationList = pilotOrganizationIds
    .map((id) => `'${id.replaceAll("'", "''")}'`)
    .join(',');
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      total: number;
      governed: number;
      unverified: number;
      quarantined: number;
      revoked: number;
    }>
  >(`
    WITH memories AS (
      SELECT metadata->'governance' AS governance
        FROM agent_work_memories
       WHERE "organizationId" IN (${organizationList})
      UNION ALL
      SELECT evidence->'governance' AS governance
        FROM agent_experience_cards
       WHERE "organizationId" IN (${organizationList})
    )
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE governance IS NOT NULL)::int AS governed,
           COUNT(*) FILTER (WHERE governance IS NULL)::int AS unverified,
           COUNT(*) FILTER (WHERE governance->>'trustStatus' = 'quarantined')::int AS quarantined,
           COUNT(*) FILTER (WHERE governance->>'trustStatus' = 'revoked')::int AS revoked
      FROM memories
  `);
  const evidence = rows[0] ?? {
    total: 0,
    governed: 0,
    unverified: 0,
    quarantined: 0,
    revoked: 0,
  };
  const passed = evidence.total > 0 && evidence.unverified === 0;
  return {
    status: passed ? 'passed' : 'failed',
    message: passed
      ? 'All agent memory records carry governance metadata.'
      : evidence.total === 0
        ? 'No governed agent memory sample exists.'
        : 'Legacy agent memory records still lack governance metadata.',
    details: evidence,
  };
}

async function main() {
  const env = loadEnv();
  const allowExternalProbes =
    env.ENTERPRISE_READINESS_ALLOW_EXTERNAL_PROBES === 'true';
  const adminUrl = env.DATABASE_ADMIN_URL;
  if (!adminUrl) throw new Error('DATABASE_ADMIN_URL is required');
  const prisma = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  try {
    const pilotOrganizationIds = (env.ENTERPRISE_PILOT_ORGANIZATION_IDS || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => /^[A-Za-z0-9_-]{1,128}$/.test(value))
      .slice(0, 2);
    const database = await verifyDatabaseEvidence(prisma, pilotOrganizationIds);
    const ozonPath = resolve(
      process.cwd(),
      env.OZON_E2E_EVIDENCE_PATH ||
        '.agent-runtime/ozon-readonly-regression.json',
    );
    const judgeReportPath = resolve(
      process.cwd(),
      env.JUDGE_CALIBRATION_EVIDENCE_PATH ||
        '../.agent-runtime/judge-calibration.json',
    );
    const judgeDatasetPath = resolve(
      process.cwd(),
      env.JUDGE_GOLD_DATASET_PATH ||
        '../e-commerceenglish_textconsistencyagent/agent/evals/judge-golden-v1.json',
    );
    const gates: Record<string, GateEvidence> = {
      kms: await verifyKms(env, allowExternalProbes),
      objectLock: await verifyObjectLock(env, allowExternalProbes),
      penetrationTest: verifyPentest(env),
      slo14Day: database.slo,
      nonMockAgent: database.agent,
      mcpTrust: await verifyMcpTrust(env),
      memoryGovernance: await verifyMemoryGovernance(
        prisma,
        pilotOrganizationIds,
      ),
      judgeCalibration: verifyJudgeCalibrationEvidence({
        reportPath: judgeReportPath,
        datasetPath: judgeDatasetPath,
        approvalPath: env.JUDGE_GOLD_APPROVAL_PATH || '',
        publicKeyPem:
          env.JUDGE_GOLD_APPROVAL_PUBLIC_KEY ||
          (env.JUDGE_GOLD_APPROVAL_PUBLIC_KEY_PATH &&
          existsSync(env.JUDGE_GOLD_APPROVAL_PUBLIC_KEY_PATH)
            ? readFileSync(env.JUDGE_GOLD_APPROVAL_PUBLIC_KEY_PATH, 'utf8')
            : ''),
      }),
      ozonReadOnly: verifyEvidenceFile(
        ozonPath,
        (value) =>
          value.status === 'passed' &&
          value.externalMutation === false &&
          (value.auditIntegrity as { valid?: unknown } | undefined)?.valid ===
            true,
        'Ozon read-only regression',
      ),
      stripeLive: verifyEvidenceFile(
        env.STRIPE_LIVE_E2E_RECEIPT_PATH || '',
        (value) =>
          value.mode === 'live' &&
          value.paymentStatus === 'succeeded' &&
          value.refundStatus === 'succeeded',
        'Stripe live payment/refund',
      ),
    };
    const failures = Object.entries(gates)
      .filter(([, gate]) => gate.status !== 'passed')
      .map(([name, gate]) => `${name}: ${gate.message}`);
    const result = {
      status: failures.length === 0 ? 'passed' : 'failed',
      checkedAt: new Date().toISOString(),
      externalProbesAuthorized: allowExternalProbes,
      gates,
      failures,
    };
    persistResult(env, result);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
