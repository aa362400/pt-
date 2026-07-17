#!/usr/bin/env node

/**
 * 端到端流水线验收。
 *
 * CI（不调用真实 LLM/图片通道）：
 *   node scripts/e2e-pipeline-smoke.mjs --dry-channels
 *
 * 本机真实模式（必须显式提供已授权账号或访问令牌）：
 *   E2E_SMOKE_EMAIL=... E2E_SMOKE_PASSWORD=... node scripts/e2e-pipeline-smoke.mjs
 *   E2E_SMOKE_ACCESS_TOKEN=... node scripts/e2e-pipeline-smoke.mjs
 *
 * 真实模式只会走到发布审批门禁，不会调用任何 Ozon 发布接口。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVIDENCE_SCHEMA_VERSION = 'e2e-pipeline-smoke/v1';
export const RELEASE_GATE_STATUS = 'AWAITING_PUBLISH_APPROVAL';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, '..', '..');

export function parseArgs(argv) {
  const options = {
    dryChannels: false,
    baseUrl:
      process.env.E2E_SMOKE_BASE_URL?.trim() || 'http://127.0.0.1/api/v1',
    output:
      process.env.E2E_SMOKE_EVIDENCE_PATH?.trim() ||
      resolve(workspaceRoot, '.agent-runtime', 'e2e-pipeline-smoke.json'),
    pollMs: Number(process.env.E2E_SMOKE_POLL_MS || 2_000),
    timeoutMs: Number(process.env.E2E_SMOKE_TIMEOUT_MS || 20 * 60_000),
    seedQuery: process.env.E2E_SMOKE_SEED_QUERY?.trim() || '轻小件收纳用品',
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--dry-channels') options.dryChannels = true;
    else if (value === '--base-url') options.baseUrl = argv[++index];
    else if (value === '--output') options.output = resolve(argv[++index]);
    else if (value === '--poll-ms') options.pollMs = Number(argv[++index]);
    else if (value === '--timeout-ms')
      options.timeoutMs = Number(argv[++index]);
    else if (value === '--seed-query') options.seedQuery = argv[++index];
    else throw codedError('E2E_ARGUMENT_INVALID', `未知参数：${value}`);
  }
  if (!Number.isFinite(options.pollMs) || options.pollMs < 50) {
    throw codedError('E2E_ARGUMENT_INVALID', 'poll-ms 必须是不小于 50 的数字');
  }
  if (
    !Number.isFinite(options.timeoutMs) ||
    options.timeoutMs < options.pollMs
  ) {
    throw codedError('E2E_ARGUMENT_INVALID', 'timeout-ms 必须大于 poll-ms');
  }
  return options;
}

export function codedError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

function requireValue(value, code, message) {
  if (value === null || value === undefined || value === '') {
    throw codedError(code, message);
  }
  return value;
}

function isoNow() {
  return new Date().toISOString();
}

async function captureStage(evidence, name, action) {
  const startedAt = isoNow();
  const started = Date.now();
  const stage = {
    name,
    status: 'RUNNING',
    startedAt,
    completedAt: null,
    durationMs: null,
    errorCode: null,
    evidence: null,
  };
  evidence.stages.push(stage);
  try {
    const result = await action();
    stage.status = 'PASSED';
    stage.evidence = result ?? null;
    return result;
  } catch (error) {
    stage.status = 'FAILED';
    stage.errorCode = error?.code || 'E2E_STAGE_FAILED';
    stage.evidence = {
      message: error instanceof Error ? error.message : String(error),
      ...(error?.details === undefined ? {} : { details: error.details }),
    };
    throw error;
  } finally {
    stage.completedAt = isoNow();
    stage.durationMs = Date.now() - started;
  }
}

class DryChannelsClient {
  constructor() {
    this.externalPublishAttempted = false;
  }

  async authenticate() {
    return { organizationId: 'dry-organization', actorId: 'dry-owner' };
  }

  async resolvePrerequisites() {
    return {
      workspaceId: 'dry-ozon-workspace',
      referenceAssetId: 'dry-product-image',
      channelMode: 'mock',
    };
  }

  async createResearchRun() {
    return { runId: 'dry-research-run', reused: false, status: 'PENDING' };
  }

  async waitForResearchRun() {
    return {
      runId: 'dry-research-run',
      status: 'COMPLETED',
      candidateCount: 1,
    };
  }

  async firstCandidate() {
    return {
      candidateId: 'dry-candidate',
      reviewTaskId: 'dry-review-task',
      economicsEvaluationId: 'dry-economics',
      economicsEvaluationHash: 'a'.repeat(64),
      status: 'RECOMMENDED',
    };
  }

  async approveAndStartLaunch() {
    return { launchId: 'dry-product-launch', status: 'QUEUED' };
  }

  async waitForLaunchGate() {
    return {
      launchId: 'dry-product-launch',
      status: RELEASE_GATE_STATUS,
      imageProjectId: 'dry-image-project',
      listingDraftId: 'dry-listing-draft',
      imageGeneration: 'mock_success',
      listingGeneration: 'mock_success',
      externalPublishAttempted: this.externalPublishAttempted,
    };
  }
}

function sleep(milliseconds) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function firstNonEmpty(...values) {
  return values.find(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
}

export class HttpPipelineClient {
  constructor(options, environment = process.env) {
    this.options = options;
    this.environment = environment;
    this.token = null;
    this.externalPublishAttempted = false;
  }

  async request(path, { method = 'GET', body, authenticated = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined)
      headers['Content-Type'] = 'application/json; charset=utf-8';
    if (authenticated) {
      if (!this.token) {
        throw codedError('E2E_AUTH_TOKEN_MISSING', '真实模式尚未获得访问令牌');
      }
      headers.Authorization = `Bearer ${this.token}`;
    }
    const response = await fetch(
      `${this.options.baseUrl.replace(/\/$/, '')}${path}`,
      {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const nested =
        payload?.error && typeof payload.error === 'object'
          ? payload.error
          : payload;
      throw codedError(
        firstNonEmpty(nested?.code, payload?.code) || `HTTP_${response.status}`,
        firstNonEmpty(nested?.message, payload?.message) ||
          `接口请求失败：HTTP ${response.status}`,
        { method, path, httpStatus: response.status },
      );
    }
    return payload;
  }

  async authenticate() {
    const configuredToken = this.environment.E2E_SMOKE_ACCESS_TOKEN?.trim();
    if (configuredToken) {
      this.token = configuredToken;
    } else {
      const email = this.environment.E2E_SMOKE_EMAIL?.trim();
      const password = this.environment.E2E_SMOKE_PASSWORD;
      if (!email || !password) {
        throw codedError(
          'E2E_CREDENTIALS_REQUIRED',
          '真实模式需要 E2E_SMOKE_ACCESS_TOKEN，或 E2E_SMOKE_EMAIL 与 E2E_SMOKE_PASSWORD',
        );
      }
      const login = await this.request('/auth/login', {
        method: 'POST',
        authenticated: false,
        body: { email, password },
      });
      if (login?.requiresTwoFactor === true) {
        throw codedError(
          'E2E_TWO_FACTOR_REQUIRED',
          '该账号启用了两步验证，请提供已经完成验证的 E2E_SMOKE_ACCESS_TOKEN',
        );
      }
      this.token = login?.accessToken || null;
    }
    const profile = await this.request('/auth/me');
    return {
      organizationId: profile?.orgId,
      actorId: profile?.id,
      role: profile?.role,
    };
  }

  async resolvePrerequisites() {
    const workspaceResponse = await this.request(
      '/workspaces?page=1&limit=100',
    );
    const requestedWorkspaceId =
      this.environment.E2E_SMOKE_WORKSPACE_ID?.trim();
    const workspace = asArray(workspaceResponse?.items).find(
      (item) =>
        (!requestedWorkspaceId || item?.id === requestedWorkspaceId) &&
        item?.status === 'ACTIVE' &&
        item?.channelType === 'OZON',
    );
    if (!workspace) {
      throw codedError(
        'E2E_OZON_WORKSPACE_MISSING',
        requestedWorkspaceId
          ? '指定的 Ozon 工作区不存在或未启用'
          : '当前组织没有启用中的 Ozon 工作区',
      );
    }

    const files = await this.request(
      `/files?page=1&limit=100&purpose=PRODUCT_IMAGE&workspaceId=${encodeURIComponent(workspace.id)}`,
    );
    const requestedAssetId = this.environment.E2E_REFERENCE_ASSET_ID?.trim();
    const referenceAsset = asArray(files?.items).find(
      (item) =>
        (!requestedAssetId || item?.id === requestedAssetId) &&
        item?.workspaceId === workspace.id &&
        item?.purpose === 'PRODUCT_IMAGE' &&
        typeof item?.sha256 === 'string' &&
        item.sha256.length === 64,
    );
    if (!referenceAsset) {
      throw codedError(
        'E2E_REFERENCE_IMAGE_MISSING',
        'Ozon 工作区没有可验证的真实 PRODUCT_IMAGE 参考图，请先上传并绑定工作区',
      );
    }
    return {
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      referenceAssetId: referenceAsset.id,
      referenceAssetSha256: referenceAsset.sha256,
      channelMode: 'real',
    };
  }

  async createResearchRun({ prerequisites }) {
    const response = await this.request('/daily-product-research/runs/manual', {
      method: 'POST',
      body: {
        workspaceId: prerequisites.workspaceId,
        timezone: 'Asia/Shanghai',
        candidateLimit: 2,
        topLimit: 2,
        pricingMode: 'AUTO',
        seedQueries: [this.options.seedQuery],
      },
    });
    return {
      runId: response?.run?.id,
      reused: response?.reused === true,
      status: response?.run?.status,
    };
  }

  async poll(action, terminal, failureCode) {
    const deadline = Date.now() + this.options.timeoutMs;
    while (Date.now() <= deadline) {
      const value = await action();
      const result = terminal(value);
      if (result?.done) {
        if (result.error) throw result.error;
        return value;
      }
      await sleep(this.options.pollMs);
    }
    throw codedError(failureCode, `等待超过 ${this.options.timeoutMs}ms`);
  }

  async waitForResearchRun({ runId }) {
    const response = await this.poll(
      () =>
        this.request(
          `/daily-product-research/runs/${encodeURIComponent(runId)}`,
        ),
      (payload) => {
        const status = payload?.run?.status;
        if (['COMPLETED', 'PARTIAL'].includes(status)) return { done: true };
        if (['FAILED', 'CANCELLED', 'STOPPED'].includes(status)) {
          return {
            done: true,
            error: codedError(
              payload?.run?.errorCode || 'E2E_RESEARCH_RUN_FAILED',
              `选品任务失败：${status}`,
            ),
          };
        }
        return { done: false };
      },
      'E2E_RESEARCH_RUN_TIMEOUT',
    );
    return {
      runId,
      status: response?.run?.status,
      candidateCount: response?.run?._count?.candidates ?? null,
      stageCount: asArray(response?.run?.stages).length,
    };
  }

  async firstCandidate({ prerequisites, runId }) {
    const response = await this.request(
      `/daily-product-research/runs/${encodeURIComponent(runId)}/candidates?page=1&limit=2`,
    );
    const candidate = asArray(response?.items)[0];
    if (!candidate) {
      throw codedError('E2E_CANDIDATE_MISSING', '真实选品任务没有返回候选商品');
    }
    if (candidate.workspaceId !== prerequisites.workspaceId) {
      throw codedError(
        'E2E_CANDIDATE_WORKSPACE_MISMATCH',
        '第一个候选未绑定当前 Ozon 工作区',
      );
    }
    const economics = asArray(candidate.economicsEvaluations)[0];
    if (
      !economics ||
      economics.status !== 'VERIFIED' ||
      economics.decision !== 'PASS' ||
      asArray(economics.hardGateReasons).length > 0 ||
      !/^[a-f0-9]{64}$/.test(economics.contentHash || '')
    ) {
      throw codedError(
        'E2E_PUBLISH_ECONOMICS_PROOF_MISSING',
        '第一个真实候选没有 VERIFIED/PASS 的可发布利润证明',
        {
          candidateId: candidate.id,
          economicsStatus: economics?.status || null,
          economicsDecision: economics?.decision || null,
          hardGateReasons: asArray(economics?.hardGateReasons),
        },
      );
    }
    const reviews = await this.request(
      '/review?page=1&limit=100&status=PENDING&entityType=PRODUCT_RESEARCH',
    );
    const review = asArray(reviews?.items).find(
      (item) =>
        item?.entityId === candidate.id &&
        item?.decisionEvidence?.researchRunId === runId,
    );
    if (!review) {
      throw codedError(
        'E2E_REVIEW_TASK_MISSING',
        '第一个候选没有待处理的组织审核任务',
      );
    }
    return {
      candidateId: candidate.id,
      reviewTaskId: review.id,
      economicsEvaluationId: economics.id,
      economicsEvaluationHash: economics.contentHash,
      status: candidate.status,
      confidenceScore: candidate.confidenceScore,
    };
  }

  async approveAndStartLaunch({ prerequisites, candidate }) {
    const response = await this.request(
      `/review/${encodeURIComponent(candidate.reviewTaskId)}/product-launch`,
      {
        method: 'POST',
        body: {
          candidateId: candidate.candidateId,
          preparationMode: 'PUBLISH_READY',
          economicsEvaluationId: candidate.economicsEvaluationId,
          economicsEvaluationHash: candidate.economicsEvaluationHash,
          confirmImageGeneration: true,
          workspaceId: prerequisites.workspaceId,
          referenceAssetId: prerequisites.referenceAssetId,
        },
      },
    );
    return {
      launchId: response?.launch?.id,
      status: response?.launch?.status,
      externalStoreMutation: response?.externalStoreMutation,
    };
  }

  async waitForLaunchGate({ launchId }) {
    const response = await this.poll(
      () =>
        this.request(`/review/product-launch/${encodeURIComponent(launchId)}`),
      (payload) => {
        const status = payload?.launch?.status;
        if (status === RELEASE_GATE_STATUS) return { done: true };
        if (
          ['FAILED', 'BLOCKED', 'AWAITING_ECONOMICS_REVIEW'].includes(status)
        ) {
          return {
            done: true,
            error: codedError(
              payload?.launch?.failureCode || `E2E_PRODUCT_LAUNCH_${status}`,
              payload?.launch?.failureMessage ||
                `商品准备终态不允许继续：${status}`,
            ),
          };
        }
        return { done: false };
      },
      'E2E_PRODUCT_LAUNCH_TIMEOUT',
    );
    return {
      launchId,
      status: response?.launch?.status,
      imageProjectId: response?.launch?.imageProjectId,
      listingDraftId: response?.launch?.listingDraftId,
      externalPublishAttempted: false,
    };
  }
}

export async function runPipeline(options, client) {
  const started = Date.now();
  const evidence = {
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
    mode: options.dryChannels ? 'dry-channels' : 'real',
    status: 'RUNNING',
    startedAt: isoNow(),
    completedAt: null,
    durationMs: null,
    baseUrl: options.dryChannels ? null : options.baseUrl,
    organizationId: null,
    runId: null,
    candidateId: null,
    reviewTaskId: null,
    launchId: null,
    safety: {
      externalPublishAttempted: false,
      stoppedAt: null,
    },
    stages: [],
  };

  try {
    const auth = await captureStage(evidence, 'authenticate', () =>
      client.authenticate(),
    );
    evidence.organizationId = requireValue(
      auth.organizationId,
      'E2E_ORGANIZATION_MISSING',
      '认证结果没有组织 ID',
    );

    const prerequisites = await captureStage(evidence, 'prerequisites', () =>
      client.resolvePrerequisites(auth),
    );
    requireValue(
      prerequisites.workspaceId,
      'E2E_OZON_WORKSPACE_MISSING',
      '没有可用的 Ozon 工作区',
    );
    requireValue(
      prerequisites.referenceAssetId,
      'E2E_REFERENCE_IMAGE_MISSING',
      '没有组织所有的真实商品参考图',
    );

    const created = await captureStage(evidence, 'research-run-create', () =>
      client.createResearchRun({ auth, prerequisites }),
    );
    evidence.runId = requireValue(
      created.runId,
      'E2E_RESEARCH_RUN_MISSING',
      '创建选品任务后没有返回 runId',
    );

    const run = await captureStage(evidence, 'research-run-complete', () =>
      client.waitForResearchRun({ auth, prerequisites, runId: evidence.runId }),
    );
    if (!['COMPLETED', 'PARTIAL'].includes(run.status)) {
      throw codedError(
        'E2E_RESEARCH_RUN_FAILED',
        `选品任务终态不允许继续：${run.status || 'UNKNOWN'}`,
      );
    }

    const candidate = await captureStage(evidence, 'candidate-review', () =>
      client.firstCandidate({ auth, prerequisites, runId: evidence.runId }),
    );
    evidence.candidateId = requireValue(
      candidate.candidateId,
      'E2E_CANDIDATE_MISSING',
      '选品任务没有候选商品',
    );
    evidence.reviewTaskId = requireValue(
      candidate.reviewTaskId,
      'E2E_REVIEW_TASK_MISSING',
      '第一个候选没有审核任务',
    );

    const launch = await captureStage(evidence, 'launch-prepare', () =>
      client.approveAndStartLaunch({ auth, prerequisites, candidate }),
    );
    evidence.launchId = requireValue(
      launch.launchId,
      'E2E_PRODUCT_LAUNCH_MISSING',
      '审核通过后没有创建商品准备任务',
    );

    const gate = await captureStage(evidence, 'publish-approval-gate', () =>
      client.waitForLaunchGate({
        auth,
        prerequisites,
        launchId: evidence.launchId,
      }),
    );
    if (gate.status !== RELEASE_GATE_STATUS) {
      throw codedError(
        'E2E_PUBLISH_GATE_NOT_REACHED',
        `商品准备没有停在发布审批门禁：${gate.status || 'UNKNOWN'}`,
      );
    }
    requireValue(
      gate.imageProjectId,
      'E2E_IMAGE_GENERATION_MISSING',
      '发布审批门禁缺少成功图片项目',
    );
    requireValue(
      gate.listingDraftId,
      'E2E_LISTING_DRAFT_MISSING',
      '发布审批门禁缺少 Listing 草稿',
    );
    if (
      gate.externalPublishAttempted === true ||
      client.externalPublishAttempted === true
    ) {
      throw codedError(
        'E2E_EXTERNAL_PUBLISH_ATTEMPTED',
        '验收脚本禁止调用 Ozon 发布接口',
      );
    }

    evidence.safety.stoppedAt = RELEASE_GATE_STATUS;
    evidence.status = 'PASSED';
    return evidence;
  } catch (error) {
    evidence.status = 'FAILED';
    evidence.errorCode = error?.code || 'E2E_PIPELINE_FAILED';
    evidence.errorMessage =
      error instanceof Error ? error.message : String(error);
    throw Object.assign(
      error instanceof Error ? error : new Error(String(error)),
      {
        evidence,
      },
    );
  } finally {
    evidence.safety.externalPublishAttempted =
      client.externalPublishAttempted === true;
    evidence.completedAt = isoNow();
    evidence.durationMs = Date.now() - started;
  }
}

export async function writeEvidence(path, evidence) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  let evidence;
  try {
    options = parseArgs(argv);
    const client = options.dryChannels
      ? new DryChannelsClient()
      : new HttpPipelineClient(options);
    evidence = await runPipeline(options, client);
    await writeEvidence(options.output, evidence);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    return 0;
  } catch (error) {
    evidence = error?.evidence || {
      schemaVersion: EVIDENCE_SCHEMA_VERSION,
      mode: options?.dryChannels ? 'dry-channels' : 'real',
      status: 'FAILED',
      errorCode: error?.code || 'E2E_PIPELINE_FAILED',
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: isoNow(),
      safety: { externalPublishAttempted: false, stoppedAt: null },
      stages: [],
    };
    if (options?.output) await writeEvidence(options.output, evidence);
    process.stderr.write(`${JSON.stringify(evidence)}\n`);
    return 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = await main();
}
