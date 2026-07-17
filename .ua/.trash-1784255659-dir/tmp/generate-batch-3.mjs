import fs from 'node:fs';
import path from 'node:path';

const projectRoot = 'G:/平台';
const uaDir = path.join(projectRoot, '.ua');
const batchesRaw = JSON.parse(
  fs.readFileSync(path.join(uaDir, 'intermediate', 'batches.json'), 'utf8'),
);
const batches = Array.isArray(batchesRaw) ? batchesRaw : batchesRaw.batches;
const batch = batches.find((entry) => entry.batchIndex === 3);
if (!batch) throw new Error('Original batchIndex 3 not found');

const extraction = JSON.parse(
  fs.readFileSync(path.join(uaDir, 'tmp', 'ua-file-extract-results-3.json'), 'utf8'),
);
if (!extraction.scriptCompleted || extraction.results.length !== batch.files.length) {
  throw new Error('Structural extraction for batch 3 is incomplete');
}

const fileSummaries = {
  '后端/src/features/product-research/daily/services/supplier-image-search-evidence-read.service.ts':
    '在组织与工作区租户边界内读取指定候选商品的供应商图搜证据，并将持久化记录解析为稳定的读取契约。服务同时校验候选存在性、限制分页数量并拒绝损坏的存储数据。',
  '后端/src/features/product-research/daily/services/supplier-image-search-evidence-store.service.ts':
    '以追加写方式持久化供应商图搜证据，执行请求内容、去重身份与候选归属校验。服务通过规范化 JSON 和 SHA-256 保证原始快照、内容哈希及幂等冲突判定可审计。',
  '后端/src/features/product-research/daily/services/supplier-quote-evidence-policy.service.ts':
    '依据供应商报价证据推导可信采购成本，并对时间链、来源主机、阶梯报价与属性一致性执行硬门禁。只有精确匹配且可验证的报价才会转化为利润计算成本。',
  '后端/src/features/product-research/daily/services/supplier-quote-evidence-store.service.ts':
    '按租户和候选范围追加保存供应商报价证据，生成稳定哈希与原始快照引用并处理幂等冲突。服务拒绝缺失或非法的快照引用，确保报价证据可追溯。',
  '后端/src/features/product-research/daily/services/trusted-profit-economics-policy.service.ts':
    '把可信利润证据转换为 ProfitCapacityService 可用的计算输入，并验证证据链、时效、币种与金额一致性。任何不可信或过期信息都会形成 hard-gate 原因并阻止利润计算。',
  '后端/src/features/product-research/daily/supplier-image-search-evidence-read.controller.ts':
    '提供按候选商品查询供应商图搜证据的 NestJS HTTP 接口。控制器组合当前用户、路径参数和查询 DTO，将租户感知的读取工作委托给证据读取服务。',
  '后端/src/features/product-research/daily/supplier-image-search-evidence-read.dto.ts':
    '定义供应商图搜证据读取接口的路径参数、分页查询和嵌套响应 DTO。字段覆盖报价展示、供应商 offer、规范化图片哈希及证据元数据，用于 Swagger 与运行时校验。',
  '后端/src/shared/queue/queue-job-deadline.ts':
    '为队列任务包装统一的执行截止时间与 AbortSignal 传播，并在超时时抛出携带队列、作业和时长信息的专用错误。实现负责清理计时器和外部取消监听器。',
  '后端/test/agent-provider.spec.ts':
    '验证 HttpAgentProvider 的契约兼容性、HTTP 请求映射、错误处理、超时与取消语义，并检查关键源码约束。该大规模测试套件覆盖智能体供应商适配层的主要成功和失败路径。',
  '后端/test/connector-registry-abort.spec.ts':
    '验证 ConnectorRegistryService 在调用连接器时原样传播 AbortSignal，从而支持上层协作式取消。',
  '后端/test/daily-product-research-cancel.spec.ts':
    '验证每日选品流程在请求取消时停止编排、更新运行状态并保留一致的组织级控制语义。测试夹具模拟数据库、分析服务及状态迁移。',
  '后端/test/daily-product-research-candidate-limit.spec.ts':
    '验证每日选品编排严格遵守候选数量上限，并在批次短缺、归一化和外部候选输入下保持确定性。',
  '后端/test/daily-product-research-domain.spec.ts':
    '覆盖每日选品领域的候选规范化、分析、评分、风险清关、报告与服务协作契约。该综合测试套件验证领域边界和关键业务不变量。',
  '后端/test/daily-product-research-dto.spec.ts':
    '验证每日选品 HTTP DTO 的转换与校验规则，确保请求参数在进入领域服务前被正确约束。',
  '后端/test/daily-product-research-durable-control.spec.ts':
    '验证每日选品编排的组织级持久控制、并发状态条件与重入行为。内存数据库夹具模拟运行记录、状态比较和租户隔离。',
  '后端/test/daily-product-research-feedback-idempotency.spec.ts':
    '验证每日选品 FEEDBACK 阶段在重复执行和恢复场景下保持幂等，避免重复写入反馈结果。',
  '后端/test/daily-product-research-orchestrator-observability.spec.ts':
    '验证每日选品编排器输出队列截止时间、日志和阶段状态等可观测信号，使失败与取消可被追踪。',
  '后端/test/daily-product-research-runtime-policy.spec.ts':
    '验证 DailyProductResearchRuntimePolicyService 对运行策略、默认值及边界条件的解析与约束。',
  '后端/test/global-marketplace-discovery.connector.spec.ts':
    '验证全球市场发现连接器对外部候选的抓取、规范化、去重和异常处理，并确保输出符合候选契约。',
  '后端/test/ozon-evidence-cache.connector.spec.ts':
    '验证 Ozon 证据缓存连接器的缓存命中、回退和证据复用行为，确保市场数据访问稳定且可重复。',
  '后端/test/product-research-feedback-metrics.spec.ts':
    '验证选品反馈指标的聚合计算，将反馈事件转换为稳定的商品表现统计。',
  '后端/test/queue-job-deadline.spec.ts':
    '验证队列任务截止时间包装器的成功、超时、外部取消和资源清理语义，以及专用超时错误的上下文信息。',
  '后端/test/supplier-image-search-allocation.spec.ts':
    '验证供应商图搜分配服务对候选的配额选择、状态持久化和重复执行行为。测试夹具构造外部候选与分配存储边界。',
  '后端/test/supplier-image-search-daily-wiring.spec.ts':
    '验证供应商图搜能力在每日选品配置、服务依赖和编排阶段中的完整接线。测试同时覆盖环境策略、候选输入及编排结果。',
  '后端/test/supplier-image-search-deadline.spec.ts':
    '验证供应商图搜富化服务遵守截止时间和 AbortSignal，在超时或取消后不会继续处理供应商结果。',
  '后端/test/supplier-image-search-enrichment.spec.ts':
    '验证供应商图搜富化服务的候选查询、供应商结果整合、并发与失败降级。测试通过可替换智能体实现和分配服务夹具覆盖成功、部分失败及取消路径。',
  '后端/test/supplier-image-search-evidence-contract.spec.ts':
    '验证供应商图搜证据 schema 对 URL、图片、报价和结果数量等字段的接受与拒绝边界，并固定规范化证据契约。',
  '后端/test/supplier-image-search-evidence-read.spec.ts':
    '验证供应商图搜证据读取服务和控制器的租户隔离、分页、映射、缺失候选及损坏数据处理。',
  '后端/test/supplier-image-search-evidence-store.spec.ts':
    '验证供应商图搜证据追加存储的哈希规范化、幂等、冲突与数据库边界，确保原始请求和供应商结果不可被静默篡改。',
  '后端/test/supplier-quote-contract.spec.ts':
    '验证供应商报价证据 schema 与利润成本策略，包括精确属性匹配、时间链、来源 URL、阶梯价格和硬门禁原因。',
  '后端/test/supplier-quote-evidence-store.spec.ts':
    '验证供应商报价证据存储的追加写、哈希、原始快照引用、幂等冲突及候选租户边界。',
  '后端/test/trusted-profit-economics-policy.spec.ts':
    '验证可信利润经济策略对证据链、时效、金额、币种和供应商来源的硬门禁，并确认有效证据可生成计算输入。',
};

const functionSummaries = {
  '后端/src/shared/queue/queue-job-deadline.ts:runWithQueueJobDeadline':
    '运行异步队列操作并合并外部取消与内部超时信号；超时后抛出带作业上下文的 QueueJobTimeoutError，并始终释放监听器和计时器。',
  '后端/test/daily-product-research-cancel.spec.ts:matchesStatus':
    '模拟数据库状态条件匹配，用于验证取消过程中的条件更新。',
  '后端/test/daily-product-research-cancel.spec.ts:orchestrationFixture':
    '构造取消测试所需的编排器、内存状态、数据库替身和分析服务依赖。',
  '后端/test/daily-product-research-durable-control.spec.ts:matchesRunWhere':
    '在内存运行记录上评估 Prisma 风格的条件过滤，用于模拟持久化并发控制。',
  '后端/test/daily-product-research-durable-control.spec.ts:fixture':
    '构造组织级持久控制测试的运行状态、数据库替身与 DailyProductResearchOrchestratorService。',
  '后端/test/daily-product-research-feedback-idempotency.spec.ts:feedbackFixture':
    '构造可重复执行的 FEEDBACK 阶段及其数据库状态，用于检测重复写入。',
  '后端/test/supplier-image-search-allocation.spec.ts:externalCandidate':
    '生成带可覆盖字段的外部候选对象，供图搜分配场景复用。',
  '后端/test/supplier-image-search-allocation.spec.ts:allocationStoreFixture':
    '构造分配服务的内存存储、事务替身和可观察状态。',
  '后端/test/supplier-image-search-daily-wiring.spec.ts:externalCandidate':
    '生成每日图搜接线测试使用的标准外部候选。',
  '后端/test/supplier-image-search-daily-wiring.spec.ts:dailyServiceFixture':
    '构造 DailyProductResearchService 及其图搜配置和存储依赖。',
  '后端/test/supplier-image-search-daily-wiring.spec.ts:orchestratorFixture':
    '构造每日选品编排器及图搜、风险和合规依赖，验证完整阶段接线。',
  '后端/test/supplier-image-search-deadline.spec.ts:enrichmentInput':
    '生成携带 AbortSignal 的图搜富化输入，供截止时间场景复用。',
  '后端/test/supplier-image-search-enrichment.spec.ts:externalCandidate':
    '生成可覆盖的外部候选，作为供应商图搜富化输入。',
  '后端/test/supplier-image-search-enrichment.spec.ts:supplierResult':
    '生成包含请求标识、结果状态、图片和供应商报价的图搜响应。',
  '后端/test/supplier-image-search-enrichment.spec.ts:fixture':
    '使用可注入的智能体实现构造富化服务、分配器和证据存储替身。',
  '后端/test/supplier-image-search-evidence-contract.spec.ts:normalizedOffer':
    '生成符合规范化规则的供应商 offer，用于证据 schema 边界测试。',
  '后端/test/supplier-image-search-evidence-contract.spec.ts:imageSearchEvidence':
    '生成完整的供应商图搜证据对象，供契约接受与拒绝案例修改。',
  '后端/test/supplier-image-search-evidence-read.spec.ts:storedEvidence':
    '生成可覆盖的持久化图搜证据记录，用于读取映射和损坏数据测试。',
  '后端/test/supplier-image-search-evidence-read.spec.ts:fixture':
    '构造租户数据库上下文、查询替身与证据读取服务。',
  '后端/test/supplier-image-search-evidence-store.spec.ts:evidenceFixture':
    '生成带稳定请求标识的完整图搜证据，供追加和幂等场景使用。',
  '后端/test/supplier-image-search-evidence-store.spec.ts:fixture':
    '构造图搜证据存储的事务替身、内存记录和可配置候选状态。',
  '后端/test/supplier-quote-contract.spec.ts:exactVerifiedSupplierQuote':
    '生成属性、价格、时间和来源均可验证的精确供应商报价证据。',
  '后端/test/supplier-quote-contract.spec.ts:deriveCosts':
    '调用报价策略从证据和期望采购条件推导利润成本。',
  '后端/test/supplier-quote-evidence-store.spec.ts:fixture':
    '构造报价证据存储所需的候选、事务替身和内存状态。',
  '后端/test/trusted-profit-economics-policy.spec.ts:verifiedTrace':
    '生成包含供应商、证据 URL 与验证时间的可信追踪记录。',
  '后端/test/trusted-profit-economics-policy.spec.ts:trustedProfitEvidence':
    '生成覆盖采购、物流、平台费用和证据追踪的可信利润证据。',
  '后端/test/trusted-profit-economics-policy.spec.ts:deriveCalculationInput':
    '调用可信利润策略，将证据与原始候选成本转换为计算输入。',
  '后端/test/trusted-profit-economics-policy.spec.ts:expectBlocked':
    '断言策略被指定 hard-gate 原因阻断且未产生计算输入。',
};

const classSummaries = {
  SupplierImageSearchEvidenceReadService:
    '在租户数据库上下文中读取、校验并映射候选商品的供应商图搜证据。',
  SupplierImageSearchEvidenceStoreService:
    '执行图搜证据的追加持久化、内容规范化、哈希校验和幂等冲突控制。',
  SupplierQuoteEvidencePolicyService:
    '依据可信报价、属性和时间链门禁推导可用于利润计算的供应商成本。',
  SupplierQuoteEvidenceStoreService:
    '在租户范围内追加供应商报价证据并维护原始快照与稳定内容哈希。',
  TrustedProfitEconomicsPolicyService:
    '验证利润证据可信度并生成 ProfitCapacityService 所需的规范化计算输入。',
  SupplierImageSearchEvidenceReadController:
    '暴露供应商图搜证据读取端点，并把认证用户和 DTO 输入委托给领域服务。',
  SupplierImageSearchEvidenceCandidateParamsDto:
    '约束供应商图搜证据读取路由中的候选商品标识。',
  ListSupplierImageSearchEvidenceQueryDto:
    '约束图搜证据列表查询的可选返回数量。',
  SupplierImageSearchDisplayPriceReadDto:
    '描述供应商展示价、代发价及其采购成本验证状态。',
  SupplierImageSearchOfferReadDto:
    '描述供应商 offer 的标识、标题、链接、图片和展示价格证据。',
  SupplierImageSearchCanonicalImageReadDto:
    '描述规范化图片的来源哈希、尺寸、MIME 类型与检索哈希。',
  SupplierImageSearchEvidenceReadItemDto:
    '定义单条图搜证据读取项，聚合请求元数据、规范化图片和供应商 offers。',
  SupplierImageSearchEvidenceReadResponseDto:
    '定义候选级图搜证据列表响应及其 schema 版本和分页信息。',
  QueueJobTimeoutError:
    '表示队列作业超过截止时间，并携带队列名、作业 ID 和超时毫秒数。',
};

function fileTags(filePath) {
  if (filePath.endsWith('.spec.ts')) {
    const tags = ['test', 'jest', 'backend'];
    if (filePath.includes('supplier-image-search')) tags.push('image-search');
    else if (filePath.includes('supplier-quote')) tags.push('supplier-quote');
    else if (filePath.includes('daily-product-research')) tags.push('product-research');
    else if (filePath.includes('queue-job')) tags.push('queue-deadline');
    else if (filePath.includes('agent-provider')) tags.push('agent-provider');
    else if (filePath.includes('connector')) tags.push('connector');
    else if (filePath.includes('feedback')) tags.push('metrics');
    else tags.push('domain-logic');
    return tags;
  }
  if (filePath.endsWith('.controller.ts')) return ['api-handler', 'nestjs', 'evidence-read', 'product-research'];
  if (filePath.endsWith('.dto.ts')) return ['data-model', 'validation', 'api-contract', 'openapi'];
  if (filePath.includes('queue-job-deadline')) return ['utility', 'queue', 'deadline', 'cancellation'];
  if (filePath.includes('evidence-store')) return ['service', 'evidence-store', 'idempotency', 'tenant-scope'];
  if (filePath.includes('evidence-read')) return ['service', 'evidence-read', 'tenant-scope', 'product-research'];
  if (filePath.includes('trusted-profit')) return ['service', 'profit-policy', 'validation', 'hard-gate'];
  if (filePath.includes('quote-evidence-policy')) return ['service', 'supplier-quote', 'validation', 'hard-gate'];
  return ['service', 'product-research', 'domain-logic'];
}

function subNodeTags(filePath, name, type) {
  if (filePath.includes('/test/')) {
    return ['test', 'fixture', name.toLowerCase().includes('candidate') ? 'test-data' : 'test-helper'];
  }
  if (type === 'class' && name.endsWith('Dto')) return ['data-model', 'validation', 'api-contract'];
  if (name.endsWith('Controller')) return ['api-handler', 'nestjs', 'evidence-read'];
  if (name === 'QueueJobTimeoutError') return ['error-type', 'queue', 'deadline'];
  if (name === 'runWithQueueJobDeadline') return ['utility', 'queue', 'deadline', 'cancellation'];
  if (name.includes('Store')) return ['service', 'evidence-store', 'idempotency'];
  if (name.includes('Policy')) return ['service', 'validation', 'hard-gate'];
  if (name.includes('Read')) return ['service', 'evidence-read', 'tenant-scope'];
  return ['service', 'product-research', 'domain-logic'];
}

function complexityFromLines(lines) {
  if (lines < 50) return 'simple';
  if (lines <= 200) return 'moderate';
  return 'complex';
}

const resultByPath = new Map(extraction.results.map((entry) => [entry.path, entry]));
const nodes = [];
const edges = [];

for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result) throw new Error(`Missing extraction result for ${file.path}`);
  const fileNodeId = `file:${file.path}`;
  const fileNode = {
    id: fileNodeId,
    type: 'file',
    name: path.posix.basename(file.path),
    filePath: file.path,
    summary: fileSummaries[file.path],
    tags: fileTags(file.path),
    complexity: complexityFromLines(result.nonEmptyLines),
  };
  if (!fileNode.summary) throw new Error(`Missing file summary for ${file.path}`);
  if (file.path.endsWith('.dto.ts')) {
    fileNode.languageNotes = '使用 NestJS Swagger decorators 与 class-validator 同步描述 API 文档和运行时输入约束。';
  } else if (file.path.includes('evidence-store.service.ts')) {
    fileNode.languageNotes = '通过 TypeScript 服务层显式规范化 JSON，并以 SHA-256 构建可重复的幂等身份。';
  } else if (file.path.endsWith('.spec.ts') && result.nonEmptyLines > 500) {
    fileNode.languageNotes = '大型 Jest 套件使用内存 fixture 隔离数据库和外部连接器边界。';
  }
  nodes.push(fileNode);

  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({
      source: fileNodeId,
      target: `file:${importedPath}`,
      type: 'imports',
      direction: 'forward',
      weight: 0.7,
    });
  }

  for (const fn of result.functions ?? []) {
    const exported = (result.exports ?? []).some((entry) => entry.name === fn.name);
    const lineCount = fn.endLine - fn.startLine + 1;
    if (lineCount < 10 && !exported) continue;
    const id = `function:${file.path}:${fn.name}`;
    const summary = functionSummaries[`${file.path}:${fn.name}`];
    if (!summary) throw new Error(`Missing function summary for ${file.path}:${fn.name}`);
    nodes.push({
      id,
      type: 'function',
      name: fn.name,
      filePath: file.path,
      lineRange: [fn.startLine, fn.endLine],
      summary,
      tags: subNodeTags(file.path, fn.name, 'function'),
      complexity: complexityFromLines(lineCount),
    });
    edges.push({ source: fileNodeId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exported) {
      edges.push({ source: fileNodeId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
    }
  }

  for (const cls of result.classes ?? []) {
    const exported = (result.exports ?? []).some((entry) => entry.name === cls.name);
    const lineCount = cls.endLine - cls.startLine + 1;
    if ((cls.methods?.length ?? 0) < 2 && lineCount < 20 && !exported) continue;
    const id = `class:${file.path}:${cls.name}`;
    const summary = classSummaries[cls.name];
    if (!summary) throw new Error(`Missing class summary for ${file.path}:${cls.name}`);
    nodes.push({
      id,
      type: 'class',
      name: cls.name,
      filePath: file.path,
      lineRange: [cls.startLine, cls.endLine],
      summary,
      tags: subNodeTags(file.path, cls.name, 'class'),
      complexity: complexityFromLines(lineCount),
    });
    edges.push({ source: fileNodeId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exported) {
      edges.push({ source: fileNodeId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
    }
  }
}

const importEdgeCount = edges.filter((edge) => edge.type === 'imports').length;
const expectedImports = batch.files.reduce(
  (total, file) => total + (batch.batchImportData[file.path] ?? []).length,
  0,
);
if (importEdgeCount !== expectedImports) {
  throw new Error(`Import edge mismatch: ${importEdgeCount} emitted, ${expectedImports} expected`);
}

const nodeIds = new Set(nodes.map((node) => node.id));
if (nodeIds.size !== nodes.length) throw new Error('Duplicate node IDs detected');
for (const edge of edges) {
  if (edge.source === edge.target) throw new Error(`Self edge detected: ${edge.source}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedFiles = [...batch.files].sort((a, b) =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
);
const filesPerPart = Math.ceil(sortedFiles.length / partCount);
const written = [];

for (let partIndex = 0; partIndex < partCount; partIndex += 1) {
  const partFiles = sortedFiles
    .slice(partIndex * filesPerPart, (partIndex + 1) * filesPerPart)
    .map((entry) => entry.path);
  const partFileSet = new Set(partFiles);
  const partNodes = nodes.filter((node) => partFileSet.has(node.filePath));
  const partNodeIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => partNodeIds.has(edge.source));

  for (const edge of partEdges) {
    const targetIsLocal = partNodeIds.has(edge.target);
    const importedTargets = new Set(
      partFiles.flatMap((filePath) => batch.batchImportData[filePath] ?? []).map((filePath) => `file:${filePath}`),
    );
    const neighborTargets = new Set(
      partFiles.flatMap((filePath) => batch.neighborMap[filePath] ?? []).map((entry) => `file:${entry.path}`),
    );
    if (!targetIsLocal && !importedTargets.has(edge.target) && !neighborTargets.has(edge.target)) {
      throw new Error(`Part ${partIndex + 1} has invalid edge target ${edge.target}`);
    }
  }

  const output = { nodes: partNodes, edges: partEdges };
  const outputName =
    partCount === 1 ? 'batch-3.json' : `batch-3-part-${partIndex + 1}.json`;
  const outputPath = path.join(uaDir, 'intermediate', outputName);
  fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  written.push({ outputName, nodes: partNodes.length, edges: partEdges.length });
}

console.log(
  JSON.stringify(
    {
      batchIndex: batch.batchIndex,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      importEdges: importEdgeCount,
      expectedImports,
      parts: written,
      filesSkipped: extraction.filesSkipped,
    },
    null,
    2,
  ),
);
