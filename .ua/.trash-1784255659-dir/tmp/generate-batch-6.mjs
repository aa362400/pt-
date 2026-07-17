import fs from 'node:fs';
import path from 'node:path';

const root = 'G:/平台';
const uaDir = `${root}/.ua`;
const batchesDoc = JSON.parse(fs.readFileSync(`${uaDir}/intermediate/batches.json`, 'utf8'));
const batches = Array.isArray(batchesDoc) ? batchesDoc : batchesDoc.batches;
const batch = batches.find((entry) => entry.batchIndex === 6);
if (!batch) throw new Error('Original batchIndex 6 was not found');
const extraction = JSON.parse(fs.readFileSync(`${uaDir}/tmp/ua-file-extract-results-6.json`, 'utf8'));
if (!extraction.scriptCompleted || extraction.filesAnalyzed !== batch.files.length) {
  throw new Error('Structural extraction is incomplete');
}

const summaries = {
  'market-observations.controller.ts': '提供市场观察采集、查询、评分以及商品机会列表、决策和业务结果记录的 NestJS HTTP API。',
  'market-observations.dto.ts': '定义浏览器采集市场观察、商品条目、机会决策和业务结果的请求 DTO 与运行时校验规则。',
  'market-observations.module.ts': '组装市场观察控制器、持久化服务和机会评分服务的 NestJS 模块边界。',
  'market-observations.service.ts': '实现市场观察的租户化存储、清洗、批次评分和商品机会生命周期，并规范化 Ozon 链接、证据与输入字段。',
  'opportunity-scoring.service.ts': '根据市场条目的价格、销量、评分、评论、广告和置信度等信号计算商品机会分数与解释。',
  'approval-items.controller.ts': '提供审批事项创建、查询、批准、拒绝、要求修改和管理员覆盖的受控 HTTP 接口。',
  'approval-items.dto.ts': '定义审批事项状态、动作以及创建、审批和审阅请求的 DTO 校验约束。',
  'notifications.controller.ts': '提供通知创建、检索、未读计数、SSE 推送、已读标记、决策、更新和删除的 HTTP API。',
  'notifications.dto.ts': '定义通知类型及创建、更新、筛选、批量已读和决策操作的请求 DTO。',
  'notifications.module.ts': '组装通知、审批事项、动作路由和相关业务模块的依赖注入配置。',
  'notifications.service.ts': '管理通知与审批执行的完整生命周期，覆盖提案决策、执行授权消费、上架发布预检、自动化恢复和高风险动作批准。',
  'ozon-approved-action-router.service.ts': '把已审批的 Ozon 操作路由到商品、订单、库存或广告 provider，并统一参数规范化和失败结果。',
  'organizations.controller.ts': '提供当前组织信息、组织更新、成员列表、角色调整和成员移除的租户管理 API。',
  'organizations.dto.ts': '定义组织资料更新、成员分页查询和成员角色变更的 DTO 校验规则。',
  'organizations.module.ts': '注册组织控制器和组织服务的 NestJS 模块。',
  'organizations.service.ts': '实现组织资料和成员关系管理，执行组织作用域、角色权限和最后管理员保护等约束。',
  'product-research.controller.ts': '提供选品报告创建、候选查询与复核、候选批准/拒绝以及报告删除的 HTTP API。',
  'product-research.dto.ts': '定义选品报告创建、报告和候选筛选、候选批准及拒绝请求的 DTO。',
  'product-research.module.ts': '组装选品控制器、核心服务、Agent、通知和商品模块的 NestJS 依赖关系。',
  'product-research.service.ts': '实现选品报告与候选决策的核心应用服务，调用 Agent 研究市场、验证 Ozon 证据、创建人工复核并把已批准候选转为商品。',
  'prompts.controller.ts': '提供用户提示词的创建、查询、使用计数、更新和删除 API。',
  'prompts.dto.ts': '定义提示词创建、更新和按分类或关键词筛选的请求 DTO。',
  'prompts.module.ts': '注册提示词控制器和服务的 NestJS 模块。',
  'prompts.service.ts': '实现组织与用户作用域内的提示词 CRUD、检索和使用计数更新。',
  'sops.controller.ts': '提供 SOP 创建、查询、更新、发布、归档和删除的 HTTP API。',
  'sops.dto.ts': '定义 SOP 状态以及创建、更新和列表筛选请求的 DTO 校验规则。',
  'sops.module.ts': '注册 SOP 控制器和服务的 NestJS 模块。',
  'sops.service.ts': '实现租户作用域内 SOP 的 CRUD、状态发布与归档，并维护所有权和访问控制。',
  'store-monitoring.controller.ts': '提供店铺指标写入与查询、告警创建与查询以及告警状态更新的 HTTP API。',
  'store-monitoring.dto.ts': '定义店铺健康指标、告警类型、严重性、状态以及相关查询和写入 DTO。',
  'store-monitoring.module.ts': '注册店铺监控控制器与服务的 NestJS 模块。',
};

const classSummaries = {
  MarketObservationsController: '接收市场观察采集、查询与评分请求，并委派给市场观察服务。',
  ProductOpportunitiesController: '提供商品机会的列表、人工决策和业务结果记录接口。',
  MarketObservationsModule: '声明市场观察功能的 NestJS 依赖注入边界。',
  MarketObservationsService: '清洗并持久化市场观察批次，生成评分机会并维护机会决策与业务结果。',
  OpportunityScoringService: '把市场信号归一化为可解释的商品机会评分。',
  ApprovalItemsController: '提供审批事项生命周期与高权限覆盖操作的 API 入口。',
  NotificationsController: '提供通知 CRUD、决策、未读计数和 SSE 推送接口。',
  NotificationsModule: '声明通知、审批与批准动作执行所需的模块依赖。',
  NotificationsService: '协调通知持久化、提案审批、一次性执行授权和批准后业务动作。',
  OzonApprovedActionRouterService: '识别并执行已批准的 Ozon 动作，按领域选择对应 provider。',
  OrganizationsController: '提供组织资料与成员管理的 API 入口。',
  OrganizationsModule: '声明组织管理功能的 NestJS 模块边界。',
  OrganizationsService: '管理组织资料、成员角色和成员移除，并实施租户与管理员约束。',
  ProductResearchController: '提供选品报告、候选审阅与候选决策的 API 入口。',
  ProductResearchModule: '声明选品功能及其 Agent、通知和商品依赖。',
  ProductResearchService: '协调 Agent 选品、证据验证、报告持久化、候选复核和批准后商品创建。',
  PromptsController: '提供个人提示词资源的 REST API。',
  PromptsModule: '声明提示词功能的 NestJS 模块边界。',
  PromptsService: '管理租户和用户作用域内的提示词及使用记录。',
  SopsController: '提供 SOP 资源与发布状态变更的 REST API。',
  SopsModule: '声明 SOP 功能的 NestJS 模块边界。',
  SopsService: '管理租户作用域内 SOP 的内容、所有权和发布状态。',
  StoreMonitoringController: '提供店铺指标和告警管理的 API 入口。',
  StoreMonitoringModule: '声明店铺监控功能的 NestJS 模块边界。',
};

const dtoSummaries = {
  MarketObservationItemDto: '校验单个市场商品条目的标识、价格、销量、评分、卖家、促销和广告字段。',
  CreateMarketObservationDto: '校验浏览器采集批次的来源、页面上下文、版本、置信度、证据和商品列表。',
  ListMarketObservationsQueryDto: '校验市场观察列表的分页参数。',
  RecordOpportunityDecisionDto: '校验商品机会的人工状态决策和原因。',
  CreateBusinessOutcomeDto: '校验商品机会业务结果的周期、指标、证据、置信度和关联实体。',
  ListApprovalItemsQueryDto: '校验审批事项的状态筛选参数。',
  CreateApprovalItemDto: '校验审批事项标题、正文、动作参数、上下文和过期时间。',
  ApproveApprovalItemDto: '校验批准审批事项时的原因与沙箱报告引用。',
  ReviewApprovalItemDto: '校验拒绝或要求修改时的原因与沙箱报告引用。',
  CreateNotificationDto: '校验新通知的类型、标题和正文。',
  UpdateNotificationDto: '校验通知类型、标题和正文的可选更新。',
  ListNotificationsQueryDto: '校验通知列表的类型和已读状态筛选。',
  MarkReadDto: '校验批量标记已读的通知 ID 列表。',
  NotificationDecisionDto: '校验通知提案的批准或拒绝决策。',
  UpdateOrganizationDto: '校验组织名称和 slug 更新。',
  ListOrgMembersQueryDto: '复用分页规则校验组织成员列表查询。',
  UpdateMemberRoleDto: '校验组织成员的新角色。',
  CreateResearchReportDto: '校验选品查询词、目标平台和工作区。',
  ListResearchReportsQueryDto: '校验选品报告的工作区与关键词筛选。',
  ListResearchCandidatesQueryDto: '校验候选列表的工作区、搜索词和决策状态。',
  ApproveResearchCandidateDto: '校验批准候选时的目标工作区。',
  RejectResearchCandidateDto: '校验拒绝候选的原因。',
  CreatePromptDto: '校验提示词标题、说明、分类、正文和变量列表。',
  UpdatePromptDto: '校验提示词字段的可选更新。',
  ListPromptsQueryDto: '校验提示词分类和关键词筛选。',
  CreateSopDto: '校验 SOP 标题、说明和步骤集合。',
  UpdateSopDto: '校验 SOP 内容的可选更新。',
  ListSopsQueryDto: '校验 SOP 状态和关键词筛选。',
  UpsertMetricDto: '校验店铺每日健康分、订单、收入、转化率和 ACOS 指标。',
  ListMetricsQueryDto: '校验店铺指标的工作区和日期范围。',
  CreateAlertDto: '校验店铺告警类型、严重性、标题、说明和工作区。',
  UpdateAlertStatusDto: '校验店铺告警的新状态。',
  ListAlertsQueryDto: '校验告警状态、严重性和工作区筛选。',
};

function complexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines >= 50) return 'moderate';
  return 'simple';
}

function domainTag(filePath) {
  const match = filePath.match(/\/features\/([^/]+)\//);
  return match?.[1] ?? 'backend';
}

function fileTags(filePath) {
  const name = path.posix.basename(filePath);
  const domain = domainTag(filePath);
  if (name.endsWith('.controller.ts')) return ['api-handler', 'nestjs', 'rest-api', domain];
  if (name.endsWith('.dto.ts')) return ['validation', 'dto', 'api-contract', domain];
  if (name.endsWith('.module.ts')) return ['configuration', 'dependency-injection', 'nestjs', domain];
  if (name === 'opportunity-scoring.service.ts') return ['service', 'scoring', 'analytics', domain];
  if (name === 'ozon-approved-action-router.service.ts') return ['service', 'action-router', 'ozon', 'approval'];
  return ['service', 'application-service', 'multi-tenant', domain];
}

function classTags(name, filePath) {
  const domain = domainTag(filePath);
  if (name.endsWith('Dto')) return ['dto', 'validation', 'api-contract', domain];
  if (name.endsWith('Controller')) return ['api-handler', 'nestjs', 'rest-api', domain];
  if (name.endsWith('Module')) return ['configuration', 'dependency-injection', 'nestjs', domain];
  if (name.includes('Scoring')) return ['service', 'scoring', 'analytics', domain];
  if (name.includes('Router')) return ['service', 'action-router', 'approval', domain];
  return ['service', 'domain-logic', 'multi-tenant', domain];
}

function languageNotes(name) {
  if (name.endsWith('.controller.ts') || name.endsWith('.module.ts')) return '采用 NestJS 装饰器声明路由、鉴权元数据和依赖注入关系。';
  if (name.endsWith('.dto.ts')) return '使用 class-validator 与 class-transformer 在 HTTP 边界执行声明式运行时校验和类型转换。';
  if (name === 'notifications.service.ts') return '通过显式审批执行授权把用户决策与高风险副作用隔离，并防止授权重复消费。';
  if (name === 'product-research.service.ts') return '将 Agent 输出视为不可信输入，在进入候选决策前执行结构、来源和 Ozon 证据校验。';
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
    summary: summaries[name] ?? `实现 ${domainTag(result.path)} 功能域中的 ${name} 组件。`,
    tags: fileTags(result.path),
    complexity: complexity(result.nonEmptyLines),
  };
  const notes = languageNotes(name);
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
      summary:
        classSummaries[item.name] ??
        dtoSummaries[item.name] ??
        `封装 ${name} 中的 ${domainTag(result.path)} 领域行为。`,
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
      summary: `实现 ${name} 中的可复用领域计算。`,
      tags: ['utility', 'domain-logic', domainTag(result.path)],
      complexity: complexity(lineCount),
    };
    nodes.push(node);
    edges.push({ source: fileNode.id, target: node.id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (isExported) edges.push({ source: fileNode.id, target: node.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

for (const file of batch.files) {
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({
      source: `file:${file.path}`,
      target: `file:${importedPath}`,
      type: 'imports',
      direction: 'forward',
      weight: 0.7,
    });
  }
}

for (const [filePath, neighbors] of Object.entries(batch.neighborMap ?? {})) {
  for (const neighbor of neighbors) {
    if (!/(^|\/)test\/|\.spec\./i.test(neighbor.path)) continue;
    edges.push({
      source: `file:${filePath}`,
      target: `file:${neighbor.path}`,
      type: 'tested_by',
      direction: 'forward',
      weight: 0.5,
    });
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
for (const edge of edges) {
  if (edge.source === edge.target) throw new Error(`Self edge detected: ${edge.source}`);
}

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
    const targetOkay =
      partNodeIds.has(edge.target) ||
      (edge.target.startsWith('file:') && (importTargets.has(edge.target.slice(5)) || neighborTargets.has(edge.target.slice(5))));
    if (!targetOkay) throw new Error(`Part ${index + 1} has invalid target: ${edge.target}`);
  }
  const outputPath = `${uaDir}/intermediate/batch-6-part-${index + 1}.json`;
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

console.log(JSON.stringify({ partCount, nodeCount, edgeCount, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
