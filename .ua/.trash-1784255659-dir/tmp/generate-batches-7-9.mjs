import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![7, 8, 9].includes(batchIndex)) throw new Error('Expected batch index 7, 8, or 9');
const projectRoot = 'G:/平台';
const uaDir = path.join(projectRoot, '.ua');
const batchesRaw = JSON.parse(fs.readFileSync(path.join(uaDir, 'intermediate', 'batches.json'), 'utf8'));
const batch = (Array.isArray(batchesRaw) ? batchesRaw : batchesRaw.batches).find(
  (entry) => entry.batchIndex === batchIndex,
);
if (!batch) throw new Error(`Original batchIndex ${batchIndex} not found`);
const extraction = JSON.parse(
  fs.readFileSync(path.join(uaDir, 'tmp', `ua-file-extract-results-${batchIndex}.json`), 'utf8'),
);
if (!extraction.scriptCompleted || extraction.results.length !== batch.files.length) {
  throw new Error(`Structural extraction for batch ${batchIndex} is incomplete`);
}

const labels = {
  'store-monitoring': '店铺监控指标与告警',
  'supply-chain': '供应链供应商、SKU、补货计划和审批',
  tasks: '组织任务',
  users: '用户资料、成员与账户数据',
  workspaces: '渠道工作区',
  dashboard: '仪表盘',
  products: '商品',
  'profit-calculator': '利润计算器',
  prompts: '提示词',
  review: '选品审核',
  sops: '标准作业流程',
  sse: '智能体运行事件流',
  'store-monitor': '店铺监控',
  storeAgentProfiles: '店铺智能体配置',
  supplyChain: '供应链',
  systemHealth: '系统健康',
  trends: '市场趋势',
  agentAutonomy: '智能体自主模式',
  agentConsole: '智能体控制台',
  agentEvaluation: '智能体评测',
  agentHealth: '智能体健康状态',
  agentRoadmap: '智能体路线图与验收证据',
  agentRuns: '智能体运行生命周期',
  'approval-execution': '审批执行与二次验证',
  approvalItems: '审批项',
  'auth-session': '登录会话响应',
  auth: '认证、注册与双因素验证',
  automation: '自动化流程',
  billing: '计费',
  capabilityCenter: '能力中心',
  channels: '渠道连接',
  client: '统一 API 客户端',
  deadLetters: '死信管理',
  enterpriseSlo: '企业 SLO',
  enterpriseTeam: '企业智能体团队',
  files: '文件资产',
  'image-prompt': '图片提示词',
  keywords: '关键词研究',
  'knowledge-base': '知识库',
  listings: 'Listing 草稿与发布预览',
  marketObservations: '市场观察',
  mcpTools: 'MCP 工具',
  memoryGovernance: '记忆治理',
  notifications: '通知与实时事件',
  organizations: '组织',
  productResearch: '商品研究',
  AuthContext: '认证状态与会话',
  ProtectedRoute: '受保护路由',
  AgentRunTimelinePanel: '智能体运行时间线',
  DeadLetterTriagePanel: '死信分诊',
  CapabilityTokensPanel: '能力令牌',
  SystemHealthOverview: '系统健康总览',
  MarketplaceSwitcher: '市场平台切换',
  ProductResearchLaunchPanel: '商品研究启动与证据审核',
  Sidebar: '侧边导航',
  TopBar: '顶部导航与模型状态',
  AgentConsoleSlot: '智能体控制台插槽',
  AgentInputDock: '智能体输入停靠栏',
  AssistantPanel: '助手面板',
  ChartCard: '图表卡片',
  Dropdown: '下拉菜单',
  Modal: '模态框',
  RobotIllustration: '机器人插图',
  AppRouter: '应用路由与页面懒加载',
};

const summaryOverrides = {
  '后端/src/shared/audit/audit-archive.service.ts':
    '按 UTC 日归档审计日志，生成规范化 JSON、校验保留期并记录归档审计事件。服务把不可变对象写入归档存储后提供可追踪的归档列表。',
  '后端/src/shared/audit/s3-audit-archive.store.ts':
    '把审计归档写入 S3 兼容对象存储，并通过对象锁模式、校验和及回读验证确保归档不可篡改。',
  '后端/src/shared/auth/current-user.decorator.ts':
    '定义 CurrentUser 参数 decorator，从 NestJS 请求上下文提取已认证用户。',
  '后端/src/shared/auth/jwt.strategy.ts':
    '实现 Passport JWT 策略，从 bearer token 校验会话与用户状态并返回统一认证主体。',
  '后端/src/shared/auth/public.decorator.ts':
    '定义 Public decorator，为无需 JWT 的路由写入公开访问元数据。',
  '后端/src/shared/dto/page-query.dto.ts':
    '提供通用分页查询 DTO，约束 page 和 limit 的数值范围与默认转换。',
  '后端/src/shared/housekeeping/housekeeping.controller.ts':
    '提供受角色保护的数据清理和指定用户数据删除接口，用于运维与隐私合规。',
  '后端/src/shared/housekeeping/housekeeping.module.ts':
    '组装 housekeeping 控制器、清理服务与数据库依赖。',
  '后端/src/shared/housekeeping/housekeeping.service.ts':
    '执行过期数据清理、用户数据级联删除与必要匿名化，并记录各阶段处理结果。',
  '后端/src/shared/linkfox-skill/linkfox-skill-cli.service.ts':
    '对 Linkfox Skill CLI 的版本、智能体列表、搜索、安装、更新和运行命令提供安全封装。服务验证 slug、agents、路径和数值参数后启动外部进程。',
  '后端/src/shared/rbac/roles.decorator.ts':
    '定义 Roles decorator，把允许的组织角色写入 NestJS 路由元数据。',
  '后端/src/shared/tenancy/org-scope.ts':
    '提供组织存在性、角色授权和工作区归属断言，作为共享的多租户安全边界。',
  '后端/test/agent-data.spec.ts':
    '验证智能体数据控制器对租户范围、输入转换和服务调用的契约。',
  '后端/test/agent-evaluation.service.spec.ts':
    '验证智能体评测服务的评分、持久化和依赖协作，并使用可观察 harness 覆盖主要分支。',
  '智能体前端/src/api/profit-calculator.ts':
    '定义利润计算器的前端模型与 API，并在请求 DTO、后端计算结果和界面视图之间执行精确映射。',
  '智能体前端/src/api/sse.ts':
    '订阅智能体运行的 SSE 流，解析事件块、传播生命周期消息并处理取消、鉴权和连接错误。',
  '智能体前端/src/api/store-monitor.ts':
    '聚合店铺指标和告警 API，把后端时序数据映射为绩效卡片、图表和告警视图模型。',
  '智能体前端/src/auth/AuthContext.tsx':
    '提供 React 认证上下文，负责恢复会话、登录、注册、双因素验证、退出和认证状态传播。',
  '智能体前端/src/auth/ProtectedRoute.tsx':
    '根据认证加载状态保护页面路由，未登录时重定向到登录界面。',
  '智能体前端/src/components/agent/AgentRunTimelinePanel.tsx':
    '展示智能体运行时间线、阶段状态、错误和控制操作，并轮询或刷新运行详情。',
  '智能体前端/src/components/agent/DeadLetterTriagePanel.tsx':
    '展示死信列表、分类与重放资格，并提供分类、重放和解决操作。',
  '智能体前端/src/components/mcp/CapabilityTokensPanel.tsx':
    '管理 MCP 能力令牌的创建、列表、权限范围和撤销状态。',
  '智能体前端/src/components/ops/SystemHealthOverview.tsx':
    '把系统健康检查结果渲染为服务状态、摘要和故障提示。',
  '智能体前端/src/components/platform/MarketplaceSwitcher.tsx':
    '提供当前 marketplace 的选择与切换界面，并同步平台状态到应用上下文。',
  '智能体前端/src/components/review/ProductResearchLaunchPanel.tsx':
    '承载商品研究启动、候选证据审核、客户摘要和 Ozon 发布草稿构建。组件对安全证据、图片和平台字段执行前端门禁。',
  '智能体前端/src/components/sidebar/Sidebar.tsx':
    '渲染按业务域分组的侧边导航，并反映当前路由和折叠状态。',
  '智能体前端/src/components/topbar/TopBar.tsx':
    '渲染顶部导航、当前模型和用户操作，并承载全局状态入口。',
  '智能体前端/src/components/ui/AgentConsoleSlot.tsx':
    '提供可嵌入页面的智能体控制台区域，协调消息、运行状态和提交操作。',
  '智能体前端/src/components/ui/AgentInputDock.tsx':
    '提供固定式智能体输入区，处理文本、提交、禁用和快捷交互状态。',
  '智能体前端/src/components/ui/AssistantPanel.tsx':
    '渲染通用助手面板的消息、状态和操作区域。',
  '智能体前端/src/AppRouter.tsx':
    '定义应用路由树、懒加载页面和 Suspense fallback，并组合认证保护与主布局。',
  '智能体前端/src/api/agentRuns.ts':
    '定义智能体运行、时间线和生命周期模型，并封装创建、查询、取消、重试与轮询等待 API。',
  '智能体前端/src/api/client.ts':
    '提供统一 HTTP 客户端、token 存储、刷新重试、查询串构建和结构化错误解析。',
  '智能体前端/src/api/notifications.ts':
    '封装通知列表与状态 API，并实现带鉴权和重连控制的 SSE 通知订阅。',
  '智能体前端/src/api/productResearch.ts':
    '定义商品研究运行、候选、证据与报告模型，并把后端响应规范化为前端详情视图。',
  '智能体前端/src/api/channels.ts':
    '封装渠道连接、授权、同步和状态管理 API，覆盖多 marketplace 的连接配置模型。',
};

function stem(filePath) {
  return path.posix.basename(filePath).replace(/\.(?:tsx?|jsx?)$/, '');
}

function featureLabel(filePath) {
  const s = stem(filePath).replace(/\.(controller|service|module|dto)$/, '');
  return labels[s] ?? labels[path.posix.basename(path.posix.dirname(filePath))] ?? s.replaceAll('-', ' ');
}

function fileSummary(filePath, result) {
  if (summaryOverrides[filePath]) return summaryOverrides[filePath];
  const label = featureLabel(filePath);
  if (filePath.includes('/src/api/')) {
    return `封装${label}的前端请求、响应类型和 API 调用，为页面组件提供稳定的数据访问边界。`;
  }
  if (filePath.includes('/src/components/')) {
    return `实现${label} React 组件，组合界面状态、用户交互与相关业务数据。`;
  }
  if (filePath.endsWith('.controller.ts')) {
    const methods = (result.classes?.[0]?.methods ?? []).filter((name) => name !== 'constructor').join('、');
    return `提供${label}的 NestJS HTTP 接口，覆盖 ${methods || '主要业务操作'} 并执行认证与租户范围控制。`;
  }
  if (filePath.endsWith('.service.ts')) {
    const methods = (result.classes?.[0]?.methods ?? []).filter((name) => name !== 'constructor').slice(0, 6).join('、');
    return `实现${label}领域服务，负责 ${methods || '核心业务规则'} 等操作及持久化边界。`;
  }
  if (filePath.endsWith('.dto.ts')) return `定义${label}相关请求 DTO，集中声明字段校验、枚举和 API 文档元数据。`;
  if (filePath.endsWith('.module.ts')) return `组装${label}控制器、服务和依赖的 NestJS 功能模块。`;
  if (filePath.endsWith('ChartCard.tsx')) return '提供带标题与内容槽位的通用图表卡片容器。';
  if (filePath.endsWith('Dropdown.tsx')) return '提供可组合的下拉菜单与菜单项组件，并处理展开和点击交互。';
  if (filePath.endsWith('Modal.tsx')) return '提供带遮罩、标题和关闭行为的通用模态框组件。';
  if (filePath.endsWith('RobotIllustration.tsx')) return '渲染可复用的机器人 SVG 插图及其视觉状态。';
  return `实现${label}相关的前端业务逻辑与数据转换。`;
}

function functionSummary(name, filePath) {
  const label = featureLabel(filePath);
  const special = {
    classifyDeadLetter: '检查错误、负载和处理上下文，返回死信分类、原因和重放资格。',
    Public: '为路由写入公开访问元数据，使认证 guard 可以跳过 JWT 校验。',
    Roles: '为路由写入允许的组织角色列表，供 RBAC guard 执行授权。',
    requireOrg: '要求认证用户属于组织并返回组织标识，否则拒绝请求。',
    requireOrgRole: '校验认证用户在组织中具有指定角色。',
    assertWorkspaceInOrg: '查询并确认工作区属于指定组织，阻止跨租户访问。',
    createController: '构造带替身依赖的智能体数据控制器测试夹具。',
    createHarness: '构造智能体评测服务、内存状态和依赖替身的测试 harness。',
    subscribeToAgentRun: '建立智能体运行 SSE 连接并把事件、错误和取消传播给调用方。',
    toCalculateDto: '把利润计算器界面输入转换为后端计算请求 DTO。',
    mapCalculation: '把后端利润计算结果映射为前端展示模型。',
    AuthProvider: '恢复并维护认证会话，通过 React Context 向子组件提供认证操作。',
    useAuth: '读取认证上下文，并在缺少 Provider 时给出明确错误。',
    ProtectedRoute: '根据认证状态显示加载态、重定向或受保护页面。',
    AppRouter: '组合懒加载页面、认证保护和主布局，定义完整客户端路由树。',
    PageFallback: '在路由页面懒加载期间渲染统一 fallback。',
    tryRefreshToken: '使用 refresh token 更新访问令牌，并协调并发刷新请求。',
    parseError: '把 HTTP 失败响应解析为统一的 ApiRequestError。',
    apiRequest: '执行带认证、刷新重试、JSON 解析和结构化错误的 HTTP 请求。',
    buildQueryString: '从可选参数构建 URL 查询串并跳过空值。',
    subscribeToNotificationStream: '建立通知 SSE 流并解析事件、鉴权失败和断开状态。',
    parseSseBlock: '把原始 SSE 文本块解析为事件名称和 JSON 数据。',
    waitForAgentRun: '轮询智能体运行直到结束、超时或被外部取消。',
  };
  if (special[name]) return special[name];
  if (/^[A-Z]/.test(name)) return `实现 ${name} React 组件，呈现${label}并处理相关交互状态。`;
  if (name.startsWith('map')) return `把后端${label}数据映射为前端视图模型。`;
  if (name.startsWith('build')) return `根据输入数据构建${label}所需的派生结构。`;
  if (name.startsWith('extract') || name.startsWith('as')) return `从弱结构化输入中提取并规范化${label}数据。`;
  if (name.startsWith('format')) return `把${label}数据格式化为界面可读值。`;
  if (name.startsWith('classify') || name.startsWith('normalize')) return `规范化并分类${label}的输入状态。`;
  if (name.startsWith('subscribe')) return `订阅${label}实时事件并管理连接生命周期。`;
  const action = name.match(/^(get|list|create|update|cancel|retry|login|register|verify|enable|disable|logout|stepUp|run)/)?.[1];
  if (action) return `执行${label}的 ${name} 操作并返回类型化结果。`;
  return `为${label}实现 ${name} 数据处理逻辑。`;
}

function classSummary(cls, filePath) {
  const label = featureLabel(filePath);
  if (cls.name === 'ApiRequestError') return '表示结构化 API 请求失败，并携带 HTTP 状态、错误代码和详情。';
  if (cls.name.endsWith('Dto')) {
    const fields = (cls.properties ?? []).join('、');
    return `定义并校验${label}的${fields ? ` ${fields} 字段` : '请求字段'}。`;
  }
  if (cls.name.endsWith('Module')) return `组装${label}相关控制器、服务和依赖的 NestJS 模块。`;
  if (cls.name.endsWith('Controller')) return `暴露${label}的认证 HTTP 接口。`;
  if (cls.name.endsWith('Strategy')) return `实现${label}的认证策略与主体校验。`;
  if (cls.name.endsWith('Store')) return `实现${label}的持久化存储边界。`;
  return `${fileSummary(filePath, { classes: [cls] }).split('。')[0]}。`;
}

function complexity(lines) {
  return lines < 50 ? 'simple' : lines <= 200 ? 'moderate' : 'complex';
}

function tagsFor(filePath, name, type) {
  const isFrontend = filePath.startsWith('智能体前端/');
  const isTest = filePath.includes('/test/');
  if (isTest) return ['test', 'jest', 'fixture', 'backend'];
  if (type === 'function') {
    if (/^[A-Z]/.test(name)) return ['component', 'react', 'frontend'];
    if (filePath.endsWith('.spec.ts')) return ['test', 'fixture', 'test-helper'];
    if (filePath.includes('/api/')) return ['api-client', 'data-mapping', 'frontend'];
    return ['utility', 'validation', 'tenant-scope'];
  }
  if (type === 'class') {
    if (name.endsWith('Dto')) return ['data-model', 'validation', 'api-contract'];
    if (name.endsWith('Module')) return ['nestjs-module', 'dependency-injection', 'configuration'];
    if (name.endsWith('Controller')) return ['api-handler', 'nestjs', 'tenant-scope'];
    if (name.endsWith('Strategy')) return ['authentication', 'passport', 'security'];
    if (name.endsWith('Store')) return ['storage', 'audit', 'integrity'];
    if (name === 'ApiRequestError') return ['error-type', 'api-client', 'frontend'];
    return ['service', 'nestjs', 'domain-logic'];
  }
  if (isFrontend && filePath.includes('/api/')) return ['api-client', 'frontend', 'type-definition'];
  if (isFrontend && filePath.includes('/components/')) return ['component', 'react', 'frontend'];
  if (isFrontend && filePath.includes('/auth/')) return ['authentication', 'react', 'frontend'];
  if (isFrontend) return ['frontend', 'react', 'routing'];
  if (filePath.endsWith('.dto.ts')) return ['data-model', 'validation', 'api-contract'];
  if (filePath.endsWith('.module.ts')) return ['nestjs-module', 'dependency-injection', 'configuration'];
  if (filePath.endsWith('.controller.ts')) return ['api-handler', 'nestjs', 'tenant-scope'];
  if (filePath.includes('/auth/')) return ['authentication', 'security', 'nestjs'];
  if (filePath.includes('/audit/')) return ['audit', 'archive', 'integrity'];
  return ['service', 'nestjs', 'domain-logic'];
}

const resultByPath = new Map(extraction.results.map((entry) => [entry.path, entry]));
const nodes = [];
const edges = [];
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result) throw new Error(`Missing extraction result for ${file.path}`);
  const fileId = `file:${file.path}`;
  const summary = fileSummary(file.path, result);
  nodes.push({
    id: fileId,
    type: 'file',
    name: path.posix.basename(file.path),
    filePath: file.path,
    summary,
    tags: tagsFor(file.path, '', 'file'),
    complexity: complexity(result.nonEmptyLines),
    ...(file.path.endsWith('.tsx')
      ? { languageNotes: '使用 TypeScript React 组件和 hooks 管理类型化 props、异步状态与用户交互。' }
      : file.path.includes('/api/')
        ? { languageNotes: '以 TypeScript 类型和映射函数隔离后端契约与前端视图模型。' }
        : {}),
  });
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({ source: fileId, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
  for (const fn of result.functions ?? []) {
    const exported = (result.exports ?? []).some((entry) => entry.name === fn.name);
    const lineCount = fn.endLine - fn.startLine + 1;
    if (lineCount < 10 && !exported) continue;
    const id = `function:${file.path}:${fn.name}`;
    nodes.push({
      id,
      type: 'function',
      name: fn.name,
      filePath: file.path,
      lineRange: [fn.startLine, fn.endLine],
      summary: functionSummary(fn.name, file.path),
      tags: tagsFor(file.path, fn.name, 'function'),
      complexity: complexity(lineCount),
    });
    edges.push({ source: fileId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exported) edges.push({ source: fileId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
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
      summary: classSummary(cls, file.path),
      tags: tagsFor(file.path, cls.name, 'class'),
      complexity: complexity(lineCount),
    });
    edges.push({ source: fileId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exported) edges.push({ source: fileId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

const expectedImports = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
const importEdges = edges.filter((edge) => edge.type === 'imports').length;
if (importEdges !== expectedImports) throw new Error(`Import mismatch ${importEdges}/${expectedImports}`);
if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Duplicate node IDs');
if (edges.some((edge) => edge.source === edge.target)) throw new Error('Self-referencing edge');

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedFiles = [...batch.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
const filesPerPart = Math.ceil(sortedFiles.length / partCount);
const written = [];
for (let part = 1; part <= partCount; part += 1) {
  const partFiles = sortedFiles.slice((part - 1) * filesPerPart, part * filesPerPart).map((entry) => entry.path);
  const partFileSet = new Set(partFiles);
  const partNodes = nodes.filter((node) => partFileSet.has(node.filePath));
  const partNodeIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => partNodeIds.has(edge.source));
  const allowedFileTargets = new Set(
    partFiles.flatMap((filePath) => [
      ...(batch.batchImportData[filePath] ?? []),
      ...(batch.neighborMap[filePath] ?? []).map((entry) => entry.path),
    ]).map((filePath) => `file:${filePath}`),
  );
  for (const edge of partEdges) {
    if (!partNodeIds.has(edge.target) && !allowedFileTargets.has(edge.target)) {
      throw new Error(`Batch ${batchIndex} part ${part} invalid target ${edge.target}`);
    }
  }
  const name = partCount === 1 ? `batch-${batchIndex}.json` : `batch-${batchIndex}-part-${part}.json`;
  const outputPath = path.join(uaDir, 'intermediate', name);
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  written.push({ name, nodes: partNodes.length, edges: partEdges.length });
}
console.log(JSON.stringify({ batchIndex, totalNodes: nodes.length, totalEdges: edges.length, importEdges, expectedImports, parts: written, filesSkipped: extraction.filesSkipped }, null, 2));
