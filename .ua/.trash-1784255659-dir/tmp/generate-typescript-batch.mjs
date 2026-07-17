import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![21, 22, 23, 24, 25, 36, 37].includes(batchIndex)) throw new Error('Unsupported TypeScript batch index');
const root = 'G:/平台';
const uaDir = `${root}/.ua`;
const batchesDoc = JSON.parse(fs.readFileSync(`${uaDir}/intermediate/batches.json`, 'utf8'));
const batches = Array.isArray(batchesDoc) ? batchesDoc : batchesDoc.batches;
const batch = batches.find((entry) => entry.batchIndex === batchIndex);
if (!batch) throw new Error(`Original batchIndex ${batchIndex} was not found`);
const extraction = JSON.parse(fs.readFileSync(`${uaDir}/tmp/ua-file-extract-results-${batchIndex}.json`, 'utf8'));
if (!extraction.scriptCompleted || extraction.filesAnalyzed !== batch.files.length) {
  throw new Error(`Structural extraction for batch ${batchIndex} is incomplete`);
}

const subjects = {
  'audit-logs.ts': '审计日志查询 API 客户端',
  'AuditLogViewer.tsx': '审计日志筛选、列表和详情查看页面',
  'audit-presentation.ts': '审计事件状态、动作和风险展示格式化',
  'audit-presentation.test.ts': '审计日志展示格式化',
  'audit-status-presentation.test.ts': '审计状态展示',
  'verify-rls.ts': 'PostgreSQL Row Level Security 验证',
  'rls-readiness.ts': 'RLS 策略就绪状态解析与缺口诊断',
  'rls-readiness.spec.ts': 'RLS 就绪判定和策略缺口',
  'app.module.ts': '后端根应用模块',
  'agent-nonmock-regression.ts': '真实 Agent provider 非 Mock 回归检查',
  'ozon-readonly-regression.ts': 'Ozon 只读能力回归检查',
  'rotate-ozon-credentials.ts': 'Ozon 凭据轮换',
  'agent-autonomy.controller.ts': 'Agent 自主执行模式与策略',
  'agent-autonomy.dto.ts': 'Agent 自主执行配置',
  'agent-autonomy.module.ts': 'Agent 自主执行领域',
  'agent-autonomy.service.ts': 'Agent 自主扫描、任务准入、去重、执行锁和结果状态机',
  'agent-console.controller.ts': 'Agent 对话、计划、工具和执行记录',
  'agent-console.dto.ts': 'Agent 控制台对话、消息、计划和查询',
  'agent-console.module.ts': 'Agent 控制台领域',
  'agent-console.service.ts': 'Agent 对话、计划、队列执行和工具授权',
  'agent-plan-queue-recovery.service.ts': 'Agent 计划队列恢复',
  'agent-tool-registry.service.ts': 'Agent 工具目录、风险级别和执行元数据',
  'assistant.controller.ts': '对话式助手会话和消息',
  'assistant.dto.ts': '助手会话和消息请求',
  'assistant.module.ts': '助手领域',
  'assistant.service.ts': '租户化助手会话、消息和 Agent 回复',
  'audit-logs.repository.ts': '审计日志',
  'automation-scheduler.service.ts': '自动化任务调度、租约、重试和队列投递',
  'billing.controller.ts': '账单计划、配额、用量和 Stripe webhook',
  'billing.dto.ts': '账单计划与用量响应',
  'billing.module.ts': '账单领域',
  'billing.repository.ts': '账单数据',
  'billing.service.ts': '账单计划、配额和用量汇总',
  'invoice.service.ts': '组织发票创建、查询和状态管理',
  'metering.service.ts': '计量事件记录与账期用量聚合',
  'payment.service.ts': 'Stripe 支付会话、签名 webhook 和订阅状态同步',
  'channels.repository.ts': '渠道数据',
  'channels.service.ts': '电商渠道连接、Ozon 凭据、订单同步和授权状态',
  'ozon-order-sync.worker.ts': 'Ozon 订单同步队列',
  'dashboard.repository.ts': '仪表盘数据',
  'image-prompt.repository.ts': '图片提示词数据',
  'action-proposal-recovery.service.ts': '动作提案未完成执行恢复',
  'action-proposals.module.ts': '动作提案领域',
  'action-proposals.service.ts': '高风险动作提案、审批、执行授权和恢复状态机',
  'notification-events.service.ts': '通知事件发布和 SSE 广播',
  'notifications.repository.ts': '通知数据',
  'trusted-economics.contract.ts': '可信利润经济数据、证据和决策',
  'candidate-economics-evaluation.service.ts': '候选商品可信利润评估和硬门禁',
  'candidate-economics-evidence-store.service.ts': '候选商品经济证据持久化与读取',
  'products.controller.ts': '商品资料、状态和批量操作',
  'products.dto.ts': '商品创建、更新、查询和批量操作',
  'products.module.ts': '商品领域',
  'products.service.ts': '租户化商品 CRUD、状态流转和批处理',
  'profit-calculator.repository.ts': '利润计算数据',
  'health.controller.ts': '进程存活、依赖就绪和服务诊断',
  'health.module.ts': '健康检查领域',
  'prisma.service.ts': 'Prisma 客户端生命周期',
  'tenant-database-context.service.ts': '组织作用域数据库事务上下文',
  'agent-health.service.ts': 'Agent provider 健康检查和缓存',
  'agent-provider.interface.ts': 'Agent provider 能力、请求和响应接口',
  'agent.module.ts': 'Agent provider 选择与依赖注入',
  'keyword-analysis.contract.ts': '关键词分析结果与证据结构',
  'supplier-image-search.contract.ts': '供应商以图搜货请求与结果结构',
  'http-agent.provider.ts': '远程 HTTP Agent provider 适配',
  'mock-agent.provider.ts': '本地确定性 Mock Agent provider',
  'sign-commerce-mcp-trust.ts': 'Commerce MCP 信任声明签名',
  'verify-enterprise-readiness.ts': '企业就绪配置与依赖验证',
  'agent-capability-token.dto.ts': 'Agent 能力令牌签发请求',
  'agent-capability-token.service.ts': '短期 Agent 能力令牌签名与校验',
  'agent-proxy.controller.ts': 'Agent 到平台业务能力的受控代理',
  'agent-proxy.dto.ts': 'Agent 代理动作请求',
  'agent-proxy.module.ts': 'Agent 代理领域',
  'visual-qa.service.ts': '生成图片视觉质量验收',
  'keywords.controller.ts': '关键词分析',
  'keywords.dto.ts': '关键词分析请求',
  'keywords.module.ts': '关键词领域',
  'keywords.service.ts': '关键词分析任务和结果持久化',
  'listing-bundle.service.ts': 'Listing 发布包构建和证据快照',
  'listing-evaluator.service.ts': 'Listing 质量、完整性和平台规则评估',
  'listing-risk-clearance.service.ts': 'Listing 风险放行证据校验',
  'listings.controller.ts': 'Listing 草稿生成、查询、评估和发布准备',
  'listings.dto.ts': 'Listing 草稿、评估和发布请求',
  'listings.module.ts': 'Listing 领域',
  'listings.service.ts': 'Listing 草稿生命周期、生成、评估与发布准备',
  'candidate-economics-publish-proof.service.ts': '候选经济性发布证明构建与验证',
  'product-launch.dto.ts': '商品发布启动和确认请求',
  'product-launch.service.ts': '商品发布预检、授权、快照、确认和回滚',
  'publish-execution-grant.ts': '发布执行授权载荷',
  'publish-step-up.ts': '发布二次确认令牌',
  'review.controller.ts': '人工复核任务、决策和批量操作',
  'review.dto.ts': '复核任务查询与决策请求',
  'review.module.ts': '人工复核领域',
  'review.service.ts': '复核队列、任务认领、决策、审计和业务回写',
  'trends.controller.ts': '趋势分析',
  'trends.dto.ts': '趋势分析请求',
  'trends.module.ts': '趋势领域',
  'trends.service.ts': '趋势任务执行、证据验证和结果持久化',
  'audit.service.ts': '结构化审计事件签名和持久化',
  'commerce-mcp-client.service.ts': 'Commerce MCP 工具发现、信任验证和调用',
  'commerce-mcp-trust-signature.ts': 'Commerce MCP 信任清单规范化与签名',
  'commerce-mcp-trust.registry.ts': 'Commerce MCP 信任清单加载和校验',
  'commerce-mcp-trust.service.ts': 'Commerce MCP server 信任决策',
  'risk-clearance-verifier.service.ts': '外部风险放行证据验证',
  'product-launch.worker.ts': '商品发布队列状态机和恢复执行',
  'quota.decorator.ts': '配额元数据装饰器',
  'quota.guard.ts': '请求配额准入',
  'quota.interceptor.ts': '成功请求用量计量',
  'dead-letter.worker.ts': '死信队列处理和告警',
  'sse.controller.ts': '租户化 SSE 事件流',
  'sse.module.ts': 'SSE 领域',
  'sse.service.ts': '组织和用户作用域 SSE 发布',
  'agent-plan.worker.ts': 'Agent 计划执行队列',
  'notification.worker.ts': '通知分发队列',
  'review-notification.worker.ts': '复核通知队列',
};

function complexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines >= 50) return 'moderate';
  return 'simple';
}

function isTestPath(filePath) {
  return /(^|\/)test\/|\.spec\.ts$|\.e2e-spec\.ts$/i.test(filePath);
}

function subject(filePath) {
  const name = path.posix.basename(filePath);
  if (subjects[name]) return subjects[name];
  return name
    .replace(/\.e2e-spec\.ts$|\.spec\.ts$|\.ts$/, '')
    .replaceAll('-', ' ')
    .replaceAll('_', ' ');
}

function fileSummary(filePath) {
  const name = path.posix.basename(filePath);
  const value = subject(filePath);
  if (isTestPath(filePath)) return `覆盖${value}的 Jest 自动化测试，验证成功路径、租户隔离、安全门禁和失败恢复。`;
  if (filePath.includes('/src/api/')) return `封装${value}，统一请求参数、分页结构和后端响应类型，供前端页面复用。`;
  if (filePath.endsWith('.tsx')) return `实现${value}，组合筛选、分页、状态呈现和交互反馈。`;
  if (filePath.includes('/src/utils/')) return `提供${value}工具，将后端领域值转换为稳定的前端标签、文案和样式。`;
  if (filePath.includes('/src/cli/')) return `提供${value}的命令行入口，执行前置校验、操作流程并以退出状态报告结果。`;
  if (name.endsWith('.controller.ts')) return `暴露${value}的 NestJS HTTP API，将鉴权后的请求委派给领域服务。`;
  if (name.endsWith('.dto.ts')) return `定义${value}的请求与响应 DTO，并在 API 边界执行声明式校验。`;
  if (name.endsWith('.module.ts')) return `组装${value}所需的控制器、服务和依赖注入关系。`;
  if (name.endsWith('.repository.ts')) return `提供${value}的数据库访问边界，供领域服务在租户事务中复用。`;
  if (name.endsWith('.worker.ts')) return `消费${value}队列任务，维护重试、状态转换、幂等和失败处理。`;
  if (name.endsWith('.contract.ts') || name.includes('interface')) return `定义${value}的 TypeScript 类型、运行时 schema 和跨模块契约。`;
  if (name.endsWith('.service.ts')) return `实现${value}的核心应用逻辑，协调权限、持久化和外部依赖。`;
  if (name.endsWith('.decorator.ts')) return `定义${value}，供控制器和守卫读取稳定元数据。`;
  if (name.endsWith('.guard.ts')) return `在请求进入业务处理前实施${value}检查并返回明确拒绝原因。`;
  if (name.endsWith('.interceptor.ts')) return `围绕请求处理执行${value}，仅在满足条件时记录副作用。`;
  return `实现${value}相关的共享后端能力。`;
}

function subjectTag(filePath) {
  return path.posix.basename(filePath)
    .replace(/\.e2e-spec\.ts$|\.spec\.ts$|\.ts$/, '')
    .replace(/\.(controller|service|module|dto|repository|worker|contract|guard|interceptor|decorator)$/, '')
    .replaceAll('_', '-')
    .toLowerCase();
}

function fileTags(filePath) {
  const name = path.posix.basename(filePath);
  const tag = subjectTag(filePath);
  if (isTestPath(filePath)) return ['test', 'jest', 'regression', tag];
  if (filePath.includes('/src/api/')) return ['api-client', 'data-fetching', 'type-definition', tag];
  if (filePath.endsWith('.tsx')) return ['component', 'react', 'page', tag];
  if (filePath.includes('/src/utils/')) return ['utility', 'presentation', 'formatting', tag];
  if (filePath.includes('/src/cli/')) return ['entry-point', 'cli', 'verification', tag];
  if (name.endsWith('.controller.ts')) return ['api-handler', 'nestjs', 'rest-api', tag];
  if (name.endsWith('.dto.ts')) return ['validation', 'dto', 'api-contract', tag];
  if (name.endsWith('.module.ts')) return ['configuration', 'dependency-injection', 'nestjs', tag];
  if (name.endsWith('.repository.ts')) return ['repository', 'database', 'data-access', tag];
  if (name.endsWith('.worker.ts')) return ['worker', 'queue', 'event-handler', tag];
  if (name.endsWith('.contract.ts') || name.includes('interface')) return ['type-definition', 'validation', 'api-contract', tag];
  if (name.endsWith('.guard.ts')) return ['guard', 'authorization', 'quota', tag];
  if (name.endsWith('.interceptor.ts')) return ['interceptor', 'metering', 'quota', tag];
  if (name.endsWith('.decorator.ts')) return ['decorator', 'metadata', 'quota', tag];
  return ['service', 'application-service', 'multi-tenant', tag];
}

function classSummary(name, filePath) {
  const value = subject(filePath);
  if (name.endsWith('Controller')) return `提供${value}的路由处理器，并把当前用户和组织上下文传给领域服务。`;
  if (name.endsWith('Dto')) return `校验${value}中的相关请求字段和枚举约束。`;
  if (name.endsWith('Module')) return `声明${value}的 NestJS 模块边界。`;
  if (name.endsWith('Repository')) return `封装${value}所需的数据访问能力。`;
  if (name.endsWith('Worker')) return `处理${value}的队列任务和失败恢复。`;
  if (name.endsWith('Guard')) return `在请求处理前执行${value}准入判断。`;
  if (name.endsWith('Interceptor')) return `在请求完成前后执行${value}逻辑。`;
  if (name.endsWith('Error')) return `表示${value}流程中的特定失败状态。`;
  if (name.endsWith('Service')) return `封装${value}的核心状态、事务和外部协作行为。`;
  return `封装${value}中的核心类型与行为。`;
}

function classTags(name, filePath) {
  const tag = subjectTag(filePath);
  if (isTestPath(filePath)) return ['test', 'fixture', tag];
  if (name.endsWith('Controller')) return ['api-handler', 'nestjs', tag];
  if (name.endsWith('Dto')) return ['dto', 'validation', tag];
  if (name.endsWith('Module')) return ['configuration', 'dependency-injection', tag];
  if (name.endsWith('Worker')) return ['worker', 'queue', tag];
  if (name.endsWith('Error')) return ['error', 'validation', tag];
  return ['service', 'domain-logic', tag];
}

function readable(name) {
  return name.replace(/^_+/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').toLowerCase();
}

function functionSummary(name, filePath) {
  const value = subject(filePath);
  const label = readable(name);
  if (name === 'main') return `执行${value}命令行流程，汇总结果并设置成功或失败退出状态。`;
  if (/^(assert|validate|verify|check|is|has)/i.test(name)) return `校验${value}中的 ${label} 条件，并在边界不满足时阻止后续处理。`;
  if (/^(create|build|make|sign|issue)/i.test(name)) return `构建${value}中的 ${label} 结果或安全载荷。`;
  if (/^(load|read|get|list|find|resolve|parse)/i.test(name)) return `读取并规范化${value}所需的 ${label} 信息。`;
  if (/^(run|execute|process|handle|sync|rotate)/i.test(name)) return `执行${value}的 ${label} 流程并协调相关依赖。`;
  return `实现${value}中的 ${label} 处理逻辑。`;
}

function functionTags(name, filePath) {
  const tag = subjectTag(filePath);
  if (isTestPath(filePath)) return ['test', 'helper', tag];
  if (name === 'main') return ['entry-point', 'cli', tag];
  if (/assert|validate|verify|check|safe/i.test(name)) return ['validation', 'security', tag];
  return ['function', 'domain-logic', tag];
}

function languageNotes(filePath) {
  const name = path.posix.basename(filePath);
  if (isTestPath(filePath)) return '使用 Jest 描述块、Mock 和断言覆盖同步、异步及租户边界场景。';
  if (name.endsWith('.controller.ts') || name.endsWith('.module.ts')) return '采用 NestJS decorator 声明路由、鉴权元数据和依赖注入关系。';
  if (name.endsWith('.dto.ts')) return '使用 class-validator 与 class-transformer 在 HTTP 边界执行运行时校验和类型转换。';
  if (name.endsWith('.worker.ts')) return '通过 BullMQ worker 处理可重试队列任务，并显式维护幂等与失败状态。';
  return undefined;
}

const exportedByPath = new Map(
  extraction.results.map((result) => [result.path, new Set((result.exports ?? []).map((entry) => entry.name))]),
);
const nodes = [];
const edges = [];

for (const result of extraction.results) {
  const name = path.posix.basename(result.path);
  const fileNode = {
    id: `file:${result.path}`,
    type: 'file',
    name,
    filePath: result.path,
    summary: fileSummary(result.path),
    tags: fileTags(result.path),
    complexity: complexity(result.nonEmptyLines),
  };
  const notes = languageNotes(result.path);
  if (notes) fileNode.languageNotes = notes;
  nodes.push(fileNode);

  const exported = exportedByPath.get(result.path);
  for (const item of result.classes ?? []) {
    const lineCount = item.endLine - item.startLine + 1;
    const isExported = exported.has(item.name);
    if (!isExported && (item.methods?.length ?? 0) < 2 && lineCount < 20) continue;
    const node = {
      id: `class:${result.path}:${item.name}`,
      type: 'class',
      name: item.name,
      filePath: result.path,
      lineRange: [item.startLine, item.endLine],
      summary: classSummary(item.name, result.path),
      tags: classTags(item.name, result.path),
      complexity: complexity(lineCount),
    };
    nodes.push(node);
    edges.push({ source: fileNode.id, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (isExported) edges.push({ source: fileNode.id, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }

  for (const item of result.functions ?? []) {
    const lineCount = item.endLine - item.startLine + 1;
    const isExported = exported.has(item.name);
    if (!isExported && lineCount < 10) continue;
    const node = {
      id: `function:${result.path}:${item.name}`,
      type: 'function',
      name: item.name,
      filePath: result.path,
      lineRange: [item.startLine, item.endLine],
      summary: functionSummary(item.name, result.path),
      tags: functionTags(item.name, result.path),
      complexity: complexity(lineCount),
    };
    nodes.push(node);
    edges.push({ source: fileNode.id, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (isExported) edges.push({ source: fileNode.id, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

for (const file of batch.files) {
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({ source: `file:${file.path}`, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
}

for (const [filePath, neighbors] of Object.entries(batch.neighborMap ?? {})) {
  const sourceIsTest = isTestPath(filePath);
  for (const neighbor of neighbors) {
    const neighborIsTest = isTestPath(neighbor.path);
    if (sourceIsTest === neighborIsTest) continue;
    edges.push({ source: `file:${filePath}`, target: `file:${neighbor.path}`, type: 'tested_by', direction: 'forward', weight: 0.5 });
  }
}

const importExpected = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
const importActual = edges.filter((edge) => edge.type === 'imports').length;
if (importActual !== importExpected) throw new Error(`Import edge mismatch: ${importActual} != ${importExpected}`);
const nodeIds = new Set(nodes.map((node) => node.id));
if (nodeIds.size !== nodes.length) throw new Error('Duplicate node IDs detected');
for (const node of nodes) {
  if (!node.id || !node.type || !node.name || !node.summary || !Array.isArray(node.tags) || node.tags.length < 3) {
    throw new Error(`Invalid node: ${node.id}`);
  }
  if ((node.type === 'class' || node.type === 'function') && (!Array.isArray(node.lineRange) || node.lineRange.length !== 2)) {
    throw new Error(`Missing line range: ${node.id}`);
  }
}
for (const edge of edges) if (edge.source === edge.target) throw new Error(`Self edge detected: ${edge.source}`);

const nodeCount = nodes.length;
const edgeCount = edges.length;
const partCount = Math.ceil(Math.max(nodeCount / 60, edgeCount / 120));
const sortedFiles = batch.files.map((file) => file.path).sort((a, b) => a.localeCompare(b, 'zh-CN'));
const filesPerPart = Math.ceil(sortedFiles.length / partCount);
const importTargets = new Set(Object.values(batch.batchImportData).flat());
const neighborTargets = new Set(Object.values(batch.neighborMap ?? {}).flat().map((item) => item.path));

for (let index = 0; index < partCount; index += 1) {
  const partFiles = new Set(sortedFiles.slice(index * filesPerPart, (index + 1) * filesPerPart));
  const partNodes = nodes.filter((node) => partFiles.has(node.filePath));
  const partNodeIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => partNodeIds.has(edge.source));
  for (const edge of partEdges) {
    const targetOkay = partNodeIds.has(edge.target) ||
      (edge.target.startsWith('file:') && (importTargets.has(edge.target.slice(5)) || neighborTargets.has(edge.target.slice(5))));
    if (!targetOkay) throw new Error(`Batch ${batchIndex} part ${index + 1} has invalid target: ${edge.target}`);
  }
  const outputPath = partCount === 1
    ? `${uaDir}/intermediate/batch-${batchIndex}.json`
    : `${uaDir}/intermediate/batch-${batchIndex}-part-${index + 1}.json`;
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

console.log(JSON.stringify({ batchIndex, partCount, nodeCount, edgeCount, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
