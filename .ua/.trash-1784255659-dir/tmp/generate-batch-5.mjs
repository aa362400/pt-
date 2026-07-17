import fs from 'node:fs';
import path from 'node:path';

const projectRoot = 'G:/平台';
const uaDir = path.join(projectRoot, '.ua');
const batchesRaw = JSON.parse(fs.readFileSync(path.join(uaDir, 'intermediate', 'batches.json'), 'utf8'));
const batch = (Array.isArray(batchesRaw) ? batchesRaw : batchesRaw.batches).find(
  (entry) => entry.batchIndex === 5,
);
if (!batch) throw new Error('Original batchIndex 5 not found');

const extraction = JSON.parse(
  fs.readFileSync(path.join(uaDir, 'tmp', 'ua-file-extract-results-5.json'), 'utf8'),
);
if (!extraction.scriptCompleted || extraction.results.length !== batch.files.length) {
  throw new Error('Structural extraction for batch 5 is incomplete');
}

const fileSummaries = {
  '后端/src/features/dashboard/dashboard.controller.ts':
    '提供工作区仪表盘的统计数量、近期活动、机会、热销商品、利润和趋势摘要接口。控制器从当前用户解析组织范围，并把查询委托给 DashboardService。',
  '后端/src/features/dashboard/dashboard.dto.ts':
    '定义仪表盘路由的工作区参数 DTO，要求请求携带有效的 workspaceId。',
  '后端/src/features/dashboard/dashboard.module.ts':
    '组装仪表盘控制器与服务的 NestJS 功能模块。',
  '后端/src/features/dashboard/dashboard.service.ts':
    '聚合租户数据库中的商品、任务、选品、关键词和财务数据，为仪表盘生成计数、活动、机会、热品、利润及趋势摘要。服务同时处理工作区过滤、候选关联和弱结构化分析结果解析。',
  '后端/src/features/dead-letter/dead-letter-triage.service.ts':
    '根据死信错误、负载和处理上下文把失败分类为可重放、永久失败或需人工检查等结果。纯函数分类器输出稳定的原因与 replayEligible 决策，服务类提供 NestJS 注入入口。',
  '后端/src/features/dead-letter/dead-letter.controller.ts':
    '提供死信列表、批量分诊、分类、重放和解决接口，并在组织范围内执行权限控制。',
  '后端/src/features/dead-letter/dead-letter.dto.ts':
    '定义死信查询、分类、解决与重放请求 DTO，约束分页、分类枚举、原因和幂等键。',
  '后端/src/features/dead-letter/dead-letter.module.ts':
    '组装死信控制器、持久化服务、分诊服务与队列依赖的 NestJS 模块。',
  '后端/src/features/dead-letter/dead-letter.service.ts':
    '管理死信的租户化查询、自动分诊、重放认领、目标检查和人工解决。服务通过幂等请求标识、陈旧认领释放与审计备注避免重复重放和并发争用。',
  '后端/src/features/enterprise-team/enterprise-team.controller.ts':
    '提供企业智能体团队配置读取和目标启动接口，并把当前组织与用户上下文传递给团队服务。',
  '后端/src/features/enterprise-team/enterprise-team.dto.ts':
    '定义启动企业目标所需的目标文本、工作区和可选专家智能体列表。',
  '后端/src/features/enterprise-team/enterprise-team.module.ts':
    '组装企业团队控制器、服务以及智能体和任务模块依赖。',
  '后端/src/features/enterprise-team/enterprise-team.service.ts':
    '维护预定义企业专家团队视图，并把用户目标分派为带选定专家的组织级任务。服务校验工作区归属和专家标识后调用任务执行层。',
  '后端/src/features/events/events.controller.ts':
    '以 Server-Sent Events 流向认证用户推送待处理事件，并在断开时清理轮询资源。事件查询受组织和工作区范围约束。',
  '后端/src/features/events/events.module.ts':
    '注册事件流控制器的轻量 NestJS 模块。',
  '后端/src/features/features.module.ts':
    '作为后端业务功能的组合根，导入并统一装配认证、任务、选品、知识库、仪表盘、死信和发布安全等 NestJS 模块。',
  '后端/src/features/image-prompt/image-prompt.controller.ts':
    '提供图片提示词的创建、列表、读取、更新和删除 REST 接口，并将当前用户上下文传给服务层。',
  '后端/src/features/image-prompt/image-prompt.dto.ts':
    '定义图片提示词创建、更新和响应 DTO，覆盖提示词正文、关联商品、工作区、生成设置与状态。',
  '后端/src/features/image-prompt/image-prompt.module.ts':
    '组装图片提示词控制器、服务、认证与数据库依赖。',
  '后端/src/features/image-prompt/image-prompt.service.ts':
    '在用户与组织范围内持久化图片提示词，提供 CRUD、关联商品校验和未找到错误处理。',
  '后端/src/features/knowledge-base/knowledge-base.controller.ts':
    '提供知识文档的创建、检索、读取、更新和删除接口，并执行认证用户范围的访问控制。',
  '后端/src/features/knowledge-base/knowledge-base.dto.ts':
    '定义知识文档创建、更新和列表查询 DTO，约束正文、标签、可见性、工作区和文件资产关联。',
  '后端/src/features/knowledge-base/knowledge-base.module.ts':
    '组装知识库控制器与服务的 NestJS 功能模块。',
  '后端/src/features/knowledge-base/knowledge-base.service.ts':
    '在组织和所有者边界内管理知识文档 CRUD、全文筛选、标签过滤与可见性。服务校验工作区和文件资产归属，防止跨租户访问。',
  '后端/src/features/legal/legal.controller.ts':
    '提供隐私政策、服务条款读取和用户同意记录接口，并内置当前法律文本与版本。控制器把同意类型、版本、IP 和用户上下文写入数据库。',
  '后端/src/features/legal/legal.module.ts':
    '注册法律文本与同意记录控制器的 NestJS 模块。',
  '后端/src/features/listing-sandbox/listing-sandbox-rule-engine.ts':
    '实现商品发布沙箱的确定性规则引擎，按图片、内容、价格、利润、属性、渠道、审批和外部响应维度评分。引擎使用版本化阈值生成规则命中、原因代码与是否允许发布的安全结论。',
  '后端/src/features/listing-sandbox/listing-sandbox.controller.ts':
    '提供发布沙箱评估、报告查询和人工 override 接口，并要求组织级权限与风险控制。',
  '后端/src/features/listing-sandbox/listing-sandbox.dto.ts':
    '定义发布沙箱评估所需的快照标识和人工 override 原因 DTO。',
  '后端/src/features/listing-sandbox/listing-sandbox.module.ts':
    '组装发布沙箱控制器、服务和发布快照依赖。',
  '后端/src/features/listing-sandbox/listing-sandbox.service.ts':
    '协调发布快照完整性校验、规则引擎评估、报告持久化、可发布断言和人工 override。服务以稳定 JSON 校验快照哈希，并保留规则命中与覆盖审计。',
};

const classSummaries = {
  DashboardController: '暴露工作区仪表盘的聚合统计与趋势查询端点。',
  DashboardParamsDto: '校验仪表盘路由中的工作区标识。',
  DashboardService: '从租户数据库聚合商品、任务、关键词和财务信息，生成仪表盘视图。',
  DeadLetterTriageService: '把纯函数死信分类器包装为可注入的 NestJS 服务。',
  DeadLetterController: '暴露死信列表、分诊、分类、重放和解决端点。',
  ListDeadLettersQueryDto: '约束死信列表的分页、分类和解决状态过滤条件。',
  ClassifyDeadLetterDto: '描述人工死信分类、可重放标记和分类原因。',
  ResolveDeadLetterDto: '描述解决死信时附加的审计备注。',
  ReplayDeadLetterDto: '描述重放死信的原因和幂等键。',
  DeadLetterService: '执行死信查询、分类、重放认领、目标检查和人工解决工作流。',
  EnterpriseTeamController: '暴露企业专家团队读取和目标启动端点。',
  LaunchEnterpriseObjectiveDto: '校验企业目标、工作区及可选专家智能体标识。',
  EnterpriseTeamService: '提供企业专家团队视图并把用户目标分派到任务执行层。',
  EventsController: '通过 SSE 向认证用户持续推送租户范围内的待处理事件。',
  ImagePromptController: '暴露图片提示词资源的 REST CRUD 端点。',
  CreateImagePromptDto: '描述新图片提示词的标题、正文、商品和工作区。',
  UpdateImagePromptDto: '描述图片提示词可更新的正文、设置和状态字段。',
  ImagePromptResponseDto: '定义图片提示词响应中的标识、内容和时间戳。',
  ImagePromptService: '在租户和用户范围内持久化并管理图片提示词。',
  KnowledgeBaseController: '暴露知识文档的认证 CRUD 和筛选端点。',
  CreateKnowledgeDocDto: '描述知识文档正文、标签、可见性、工作区和文件资产。',
  UpdateKnowledgeDocDto: '描述知识文档允许修改的标题、正文、标签和可见性。',
  ListKnowledgeDocsQueryDto: '约束知识文档列表的搜索、标签和工作区过滤条件。',
  KnowledgeBaseService: '在组织、所有者和可见性边界内管理知识文档。',
  RecordConsentDto: '校验法律同意的类型、版本和可选来源 IP。',
  LegalController: '提供版本化法律文本并记录认证用户的同意审计。',
  ListingSandboxRuleEngine: '按八个发布安全维度执行版本化规则评估并生成规则命中与分数。',
  ListingSandboxController: '暴露发布沙箱评估、报告读取和人工覆盖端点。',
  EvaluateListingSandboxDto: '校验待评估的发布快照标识。',
  OverrideListingSandboxDto: '校验人工覆盖发布沙箱结论的原因。',
  ListingSandboxService: '协调快照完整性、规则评估、报告持久化和人工覆盖审计。',
};

const featureLabels = {
  DashboardModule: '仪表盘',
  DeadLetterModule: '死信管理',
  EnterpriseTeamModule: '企业智能体团队',
  EventsModule: '事件流',
  FeaturesModule: '全部业务功能',
  ImagePromptModule: '图片提示词',
  KnowledgeBaseModule: '知识库',
  LegalModule: '法律文本与同意记录',
  ListingSandboxModule: '发布沙箱',
};

function classSummary(name) {
  if (classSummaries[name]) return classSummaries[name];
  if (name.endsWith('Module') && featureLabels[name]) {
    return `组装${featureLabels[name]}相关控制器、服务和依赖的 NestJS 模块。`;
  }
  throw new Error(`Missing class summary for ${name}`);
}

function featureTag(filePath) {
  const segment = filePath.split('/')[3] ?? 'features';
  return segment.includes('.') ? 'feature-composition' : segment;
}

function fileTags(filePath) {
  const feature = featureTag(filePath);
  if (filePath.endsWith('.controller.ts')) return ['api-handler', 'nestjs', feature, 'tenant-scope'];
  if (filePath.endsWith('.dto.ts')) return ['data-model', 'validation', 'api-contract', feature];
  if (filePath.endsWith('.module.ts')) return ['nestjs-module', 'configuration', feature, 'dependency-injection'];
  if (filePath.includes('rule-engine')) return ['rule-engine', 'publication-safety', 'validation', 'policy'];
  if (filePath.includes('triage.service')) return ['service', 'dead-letter', 'classification', 'replay-policy'];
  return ['service', 'nestjs', feature, 'tenant-scope'];
}

function subNodeTags(filePath, name, type) {
  const feature = featureTag(filePath);
  if (type === 'function') return ['classification', 'dead-letter', 'replay-policy', 'utility'];
  if (name.endsWith('Dto')) return ['data-model', 'validation', 'api-contract', feature];
  if (name.endsWith('Module')) return ['nestjs-module', 'dependency-injection', feature];
  if (name.endsWith('Controller')) return ['api-handler', 'nestjs', feature, 'tenant-scope'];
  if (name.includes('RuleEngine')) return ['rule-engine', 'publication-safety', 'validation', 'policy'];
  return ['service', 'nestjs', feature, 'domain-logic'];
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
    fileNode.languageNotes = '使用 class-validator 与 Swagger decorators 让运行时校验和 OpenAPI 描述保持一致。';
  } else if (file.path.endsWith('.module.ts')) {
    fileNode.languageNotes = '采用 NestJS @Module 元数据声明控制器、providers、imports 与 exports。';
  } else if (file.path.includes('listing-sandbox-rule-engine')) {
    fileNode.languageNotes = '规则引擎保持无外部依赖，以版本常量和纯计算提供可重复的发布安全结论。';
  } else if (file.path === '后端/src/features/features.module.ts') {
    fileNode.languageNotes = '该组合根集中导入大量 NestJS 功能模块，决定后端业务能力的装配边界。';
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
    const summary =
      fn.name === 'classifyDeadLetter'
        ? '检查死信错误、负载和上下文字段，返回稳定的分类、原因及是否允许重放的决策。'
        : null;
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
    nodes.push({
      id,
      type: 'class',
      name: cls.name,
      filePath: file.path,
      lineRange: [cls.startLine, cls.endLine],
      summary: classSummary(cls.name),
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
const sortedFiles = [...batch.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
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
  const importedTargets = new Set(
    partFiles.flatMap((filePath) => batch.batchImportData[filePath] ?? []).map((filePath) => `file:${filePath}`),
  );
  const neighborTargets = new Set(
    partFiles.flatMap((filePath) => batch.neighborMap[filePath] ?? []).map((entry) => `file:${entry.path}`),
  );
  for (const edge of partEdges) {
    if (!partNodeIds.has(edge.target) && !importedTargets.has(edge.target) && !neighborTargets.has(edge.target)) {
      throw new Error(`Part ${partIndex + 1} has invalid edge target ${edge.target}`);
    }
  }
  const outputName = partCount === 1 ? 'batch-5.json' : `batch-5-part-${partIndex + 1}.json`;
  const outputPath = path.join(uaDir, 'intermediate', outputName);
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
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
