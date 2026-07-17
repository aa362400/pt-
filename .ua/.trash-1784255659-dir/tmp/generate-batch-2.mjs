import fs from 'node:fs';
import path from 'node:path';

const root = 'G:/平台';
const uaDir = `${root}/.ua`;
const batchesDoc = JSON.parse(fs.readFileSync(`${uaDir}/intermediate/batches.json`, 'utf8'));
const batches = Array.isArray(batchesDoc) ? batchesDoc : batchesDoc.batches;
const batch = batches.find((entry) => entry.batchIndex === 2);
if (!batch) throw new Error('Original batchIndex 2 was not found');
const extraction = JSON.parse(fs.readFileSync(`${uaDir}/tmp/ua-file-extract-results-2.json`, 'utf8'));
if (!extraction.scriptCompleted || extraction.filesAnalyzed !== batch.files.length) {
  throw new Error('Structural extraction is incomplete');
}

const summaries = {
  'connector-registry.service.ts': '注册并并行调度每日选品数据连接器，按运行配置筛选启用来源，并把成功结果与来源健康状态汇总为统一采集结果。',
  'global-marketplace-discovery.connector.ts': '通过 Agent provider 执行全球市场商品发现，将返回内容解析为外部候选，并清理不安全的可选图片 URL。',
  'manual-import.connector.ts': '把人工传入的候选商品解析为标准外部候选列表，同时生成可供编排流程消费的采集健康信息。',
  'ozon-evidence-cache.connector.ts': '从租户数据库中的历史选品报告复用 Ozon 市场证据，并对时间、价格、竞争对手、URL 与翻译查询匹配进行严格校验。',
  'product-research-connector.ts': '定义每日选品数据连接器的统一输入、采集结果和来源接口，为人工导入、全球发现与缓存来源提供共同契约。',
  'daily-product-research.contract.ts': '集中定义每日选品运行状态、阶段、信号质量、决策、来源状态、队列载荷以及默认评分权重和阈值。',
  'external-candidate.contract.ts': '使用 Zod 描述外部候选商品、成本、风险和信号结构，并规范化 1688 商品链接中的 offer ID。',
  'supplier-image-search-evidence-read.contract.ts': '定义供应商以图搜货证据的读取视图，将持久化证据转换为面向 API 的报价、来源和状态响应结构。',
  'supplier-image-search-evidence.contract.ts': '定义供应商以图搜货证据的写入结构与 HTTPS URL 约束，确保图片、报价和抓取元数据满足持久化要求。',
  'supplier-quote.contract.ts': '定义供应商报价证据与预期采购成本模型，覆盖 MOQ、阶梯价、物流、税费、汇率和证据完整性。',
  'daily-product-research.controller.ts': '暴露每日选品运行、候选、来源健康、报告产物、反馈、评分版本和调度配置的 NestJS HTTP API。',
  'daily-product-research.dto.ts': '提供每日选品控制器的请求 DTO 与校验规则，覆盖手动运行、查询过滤、候选决策、反馈、评分和调度更新。',
  'daily-product-research.module.ts': '组装每日选品领域的控制器、连接器、分析服务、编排器、反馈服务、报告组件与队列处理器。',
  'daily-product-research.service.ts': '实现每日选品应用服务，负责租户权限、运行创建与查询、候选决策、评分版本、自动调度、队列投递和产物读取。',
  'daily-report-renderer.service.ts': '把每日选品结果渲染为可审阅的 Markdown 报告，汇总运行概况、候选排名、决策、风险与理由。',
  'research-artifact-store.service.ts': '在受控本地目录中读写选品报告产物，并清理路径段和文件名以防止越界访问。',
  'business-time.service.ts': '提供时区感知的业务日期计算、数据库日期转换和下一次每日执行时间推算，并验证 IANA 时区。',
  'competition-analysis.service.ts': '从候选商品的市场信号中计算竞争强度、价格中位数和竞争证据完整性，为评分与决策提供输入。',
  'compliance-scanner.service.ts': '对候选商品执行合规扫描，将 Agent 权限与规则检查结果转换为标准风险发现和准入结论。',
  'daily-product-research-orchestrator.service.ts': '编排每日选品的完整多阶段流水线，处理采集、标准化、需求与竞争分析、利润、风险、评分、报告、反馈和取消/租约边界。',
  'daily-product-research-runtime-policy.service.ts': '根据部署与环境配置生成每日选品运行策略，并在创建运行、启用调度和内部动作前实施能力门禁。',
  'demand-analysis.service.ts': '聚合候选商品的搜索量、趋势和增长信号，产出需求评分、信号强度以及缺失证据说明。',
  'product-feedback-metrics.ts': '把选品候选及其后续业务事件汇总为转化率、销售额、退款额和利润等产品表现指标，并标注不可计算原因。',
  'product-research-feedback.service.ts': '记录选品候选的业务反馈事件，并按候选或时间范围读取数据、计算单品表现和汇总反馈指标。',
  'keyword-expansion.service.ts': '从候选名称、品类和已有关键词生成去重后的检索词集合，为市场发现与证据检索扩展查询。',
  'normalization.service.ts': '把外部候选标准化为稳定字段、证据身份和语义概念键，统一空值、文本和来源信号的处理。',
  'profit-capacity.service.ts': '使用定点 BigInt 算法计算收入、成本、费率、净利润和利润率，避免货币计算中的浮点误差。',
  'risk-analysis.service.ts': '汇总候选商品风险发现、计算风险评分并识别高风险硬门禁，在没有证据时生成明确的缺失风险。',
  'scoring.service.ts': '验证评分配置并按需求、竞争、利润、风险等分量计算候选分数，去重排序后给出立即测试、观察或暂缓决策。',
  'semantic-concept-key.ts': '通过 Unicode 规范化、停用词过滤、英文单数化和领域规则生成稳定的商品语义概念键，避免近义候选重复。',
  'supplier-image-search-allocation.service.ts': '为候选商品建立可重复的供应商以图搜货分配，选择合规源图、生成确定性请求 ID，并通过数据库锁保证并发一致性。',
  'supplier-image-search-enrichment.service.ts': '并发执行供应商以图搜货，按分配结果调用 Agent provider、持久化证据并汇总成功、失败、超时及来源健康状态。',
};

const classSummaries = {
  ConnectorRegistryService: '管理可用商品研究连接器，并按配置并发收集各来源候选与健康结果。',
  GlobalMarketplaceDiscoveryConnector: '将全球市场发现 Agent 适配为标准商品研究连接器，并清理不可信图片链接。',
  ManualImportConnector: '将用户提供的候选列表适配为标准连接器输出。',
  OzonEvidenceCacheConnector: '从历史报告抽取并验证可复用的 Ozon 竞争证据。',
  DailyProductResearchController: '提供每日选品领域的 REST 控制器入口，并把鉴权后的请求委派给应用与反馈服务。',
  ManualDailyResearchRunDto: '校验手动选品运行的工作区、日期、时区、候选数量、定价模式和输入候选。',
  ListDailyResearchRunsQueryDto: '校验每日选品运行列表的工作区、状态与日期范围筛选条件。',
  ListDailyCandidatesQueryDto: '校验候选列表的决策状态和文本搜索条件。',
  CreateScoringVersionDto: '校验新评分版本的工作区、变更原因、权重和阈值配置。',
  ScoringVersionActionDto: '校验评分版本启用或回滚动作的原因。',
  UpdateDailyResearchScheduleDto: '校验每日选品调度的启用状态、当地时间、时区、工作区和定价模式。',
  CandidateDecisionDto: '校验候选批准或拒绝决策的原因。',
  CreateProductFeedbackDto: '校验候选业务反馈事件及其金额、引用、质量、关联实体和扩展元数据。',
  ProductFeedbackSummaryQueryDto: '校验反馈汇总查询的工作区与时间范围。',
  DailyProductResearchModule: '声明每日选品 NestJS 模块的依赖注入边界。',
  DailyProductResearchService: '协调每日选品运行生命周期、权限、持久化、队列、调度、评分版本和候选决策。',
  DailyReportRendererService: '将结构化选品结果渲染为 Markdown 审阅报告。',
  ResearchArtifactStoreService: '安全地持久化和读取每日选品报告文件。',
  BusinessTimeService: '封装时区感知的业务日期与每日调度时间计算。',
  CompetitionAnalysisService: '根据市场信号计算候选商品的竞争分析结果。',
  ComplianceScannerService: '执行候选商品合规检查并生成标准风险发现。',
  DailyProductResearchOrchestratorService: '执行每日选品多阶段状态机，并维护取消、控制修订、执行租约、持久化和报告边界。',
  DailyProductResearchRuntimePolicyService: '从环境配置导出运行能力策略并实施准入断言。',
  DemandAnalysisService: '将搜索与趋势信号转换为需求分析指标。',
  ProductResearchFeedbackService: '持久化反馈事实并计算候选表现与聚合指标。',
  KeywordExpansionService: '生成清洗、去重且数量受限的商品检索关键词。',
  NormalizationService: '标准化外部候选并生成稳定证据键和语义概念键。',
  ProfitCapacityService: '用定点货币运算计算候选的利润承载能力。',
  RiskAnalysisService: '聚合风险发现并计算风险分数和硬门禁。',
  ScoringService: '验证评分配置、计算候选分数并生成排序决策。',
  SupplierImageSearchAllocationService: '以事务锁和确定性规则生成供应商以图搜货任务分配。',
  SupplierImageSearchEnrichmentService: '并发执行供应商以图搜货并持久化、汇总证据结果。',
};

const functionSummaries = {
  canonical1688OfferId: '从受支持的 1688 商品 URL 或纯数字输入中提取规范 offer ID，拒绝其他路径格式。',
  candidateBatchShortfall: '计算候选批次请求数量与实际处理数量之间的短缺及是否满足要求。',
  ratio: '安全计算两个计数的比率，并在分母无效时返回不可计算原因。',
  sumByCurrency: '按事件类型聚合反馈事实中的金额，并按币种分别求和。',
  buildProductPerformance: '把候选与反馈事实转换为完整产品表现快照，涵盖漏斗、销售、退款和利润指标。',
  missingRiskEvidenceFinding: '创建表示风险证据缺失的标准高严重性风险发现。',
  singular: '用受控英文词尾规则将商品词元归一为单数形式。',
  tokens: '对文本执行 Unicode 规范化、切词、停用词过滤和单数化。',
  semanticConceptKey: '结合商品名称与类型的领域词元规则生成稳定概念键，无法分类时回退到排序词元或 SHA-256 摘要。',
};

const exportedByPath = new Map();
for (const result of extraction.results) {
  exportedByPath.set(result.path, new Set((result.exports ?? []).map((entry) => entry.name)));
}

function complexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines >= 50) return 'moderate';
  return 'simple';
}

function fileTags(filePath) {
  const name = path.posix.basename(filePath);
  if (filePath.includes('/connectors/')) return ['service', 'data-source', 'product-research', 'integration'];
  if (filePath.includes('/contracts/')) return ['type-definition', 'validation', 'zod-schema', 'product-research'];
  if (name.endsWith('.controller.ts')) return ['api-handler', 'nestjs', 'rest-api', 'product-research'];
  if (name.endsWith('.dto.ts')) return ['validation', 'dto', 'api-contract', 'nestjs'];
  if (name.endsWith('.module.ts')) return ['configuration', 'dependency-injection', 'nestjs', 'module-wiring'];
  if (filePath.includes('/reports/')) return ['service', 'reporting', 'artifact', 'product-research'];
  if (filePath.includes('/feedback/')) return ['service', 'analytics', 'feedback', 'metrics'];
  if (name === 'daily-product-research-orchestrator.service.ts') return ['service', 'orchestration', 'state-machine', 'workflow'];
  if (name === 'daily-product-research.service.ts') return ['service', 'application-service', 'workflow', 'multi-tenant'];
  if (name.includes('supplier-image-search')) return ['service', 'supplier-search', 'image-search', 'evidence'];
  if (name === 'semantic-concept-key.ts') return ['utility', 'normalization', 'deduplication', 'nlp'];
  return ['service', 'domain-logic', 'product-research', 'analysis'];
}

function classTags(name) {
  if (name.endsWith('Dto')) return ['dto', 'validation', 'api-contract'];
  if (name.endsWith('Controller')) return ['api-handler', 'nestjs', 'rest-api'];
  if (name.endsWith('Connector')) return ['service', 'connector', 'data-source'];
  if (name.endsWith('Module')) return ['configuration', 'dependency-injection', 'nestjs'];
  if (name.includes('Orchestrator')) return ['service', 'orchestration', 'state-machine'];
  return ['service', 'domain-logic', 'product-research'];
}

function functionTags(name) {
  if (name === 'buildProductPerformance' || name === 'ratio' || name === 'sumByCurrency') return ['utility', 'metrics', 'feedback'];
  if (name === 'semanticConceptKey' || name === 'singular' || name === 'tokens') return ['utility', 'normalization', 'nlp'];
  if (name === 'canonical1688OfferId') return ['utility', 'validation', '1688'];
  return ['utility', 'domain-logic', 'product-research'];
}

function languageNotes(fileName) {
  if (fileName.includes('contract') || fileName.endsWith('.dto.ts')) return '通过 TypeScript 类型与 Zod 或 class-validator 运行时校验保持 API 和持久化边界一致。';
  if (fileName.endsWith('.controller.ts') || fileName.endsWith('.module.ts')) return '采用 NestJS 装饰器声明路由、鉴权元数据和依赖注入关系。';
  if (fileName === 'daily-product-research-orchestrator.service.ts') return '以显式阶段、控制修订和执行租约实现可取消、可恢复的长流程编排。';
  if (fileName === 'profit-capacity.service.ts') return '使用 BigInt 定点缩放表示金额与费率，规避 JavaScript 浮点舍入误差。';
  return undefined;
}

const nodes = [];
const edges = [];
const localNodeIds = new Set();

for (const result of extraction.results) {
  const name = path.posix.basename(result.path);
  const fileNode = {
    id: `file:${result.path}`,
    type: 'file',
    name,
    filePath: result.path,
    summary: summaries[name] ?? `实现每日选品领域中的 ${name} 组件。`,
    tags: fileTags(result.path),
    complexity: complexity(result.nonEmptyLines),
  };
  const notes = languageNotes(name);
  if (notes) fileNode.languageNotes = notes;
  nodes.push(fileNode);
  localNodeIds.add(fileNode.id);

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
      summary: classSummaries[item.name] ?? `封装 ${name} 中的核心领域行为与状态。`,
      tags: classTags(item.name),
      complexity: complexity(lineCount),
    };
    nodes.push(node);
    localNodeIds.add(node.id);
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
      summary: functionSummaries[item.name] ?? `实现 ${name} 中的可复用领域计算。`,
      tags: functionTags(item.name),
      complexity: complexity(lineCount),
    };
    nodes.push(node);
    localNodeIds.add(node.id);
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
  const outputPath = `${uaDir}/intermediate/batch-2-part-${index + 1}.json`;
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

console.log(JSON.stringify({ partCount, nodeCount, edgeCount, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
