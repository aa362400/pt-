import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![16, 17, 18, 19, 20].includes(batchIndex)) throw new Error('Expected batch index 16 through 20');
const projectRoot = 'G:/平台';
const uaDir = path.join(projectRoot, '.ua');
const batchesRaw = JSON.parse(fs.readFileSync(path.join(uaDir, 'intermediate', 'batches.json'), 'utf8'));
const batch = (Array.isArray(batchesRaw) ? batchesRaw : batchesRaw.batches).find((entry) => entry.batchIndex === batchIndex);
if (!batch) throw new Error(`Original batchIndex ${batchIndex} not found`);
const extraction = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp', `ua-file-extract-results-${batchIndex}.json`), 'utf8'));
if (!extraction.scriptCompleted || extraction.results.length !== batch.files.length) throw new Error(`Extraction incomplete for ${batchIndex}`);

const labelMap = {
  risk_check: '风险检查', risk_evidence_gate: '风险证据门禁', runtime_heartbeat: '运行心跳', safety_bundle: '安全证据包',
  scene_matcher: '场景匹配', shared_agent_state: '共享智能体状态', stage_13_17_platform_proxy: '13 至 17 阶段平台代理',
  stage_18_20_memory: '18 至 20 阶段记忆治理', sub_agents: '子智能体编排', supplier_image_evidence: '供应商图片证据',
  supplier_image_search_client: '供应商图搜客户端', supplier_quote_config: '供应商报价配置', trace_context: '追踪上下文',
  utils: '通用工具', web_generation_regressions: '网页生成回归', web_research: '网页研究', x_round: '多轮执行',
  app: 'FastAPI 应用', engine: 'Web 智能体执行引擎', chat: '聊天', commerce: '电商智能体', core: '核心运行状态',
  integration: '平台集成', mcp: 'MCP', media: '媒体文件', sessions: '会话', sync: '平台同步', tasks: '任务',
  autonomy_platform: '自主执行平台适配', autonomy_runtime: '自主运行时', biz_tools: '电商工具集', chat_flow: '聊天流程',
  commerce_llm: '电商 LLM', commerce_strategy: '电商策略', edit_resolver: '图片编辑解析', global_product_discovery: '全球商品发现',
  hd_export: '高清导出', housekeeping: '数据清理', image_store: '图片存储', inpaint: '局部重绘', job_queue: '作业队列',
  llm_runtime: 'LLM 运行时', opportunity: '商品机会分析', ozon_pricing: 'Ozon 定价', path_security: '路径安全',
  platform_tasks: '平台任务执行', platform_webhook: '平台 Webhook', safety: '生成安全', security: '请求安全',
  session_store: '会话存储', shared_state: '共享运行状态', task_state: '任务状态', visual_locate: '视觉定位',
  'agent-memory-governance.service': '智能体记忆治理服务', 'agent-memory-governance': '智能体记忆治理接口',
  'agent-memory': '智能体记忆', 'agent-roadmap': '智能体路线图', 'agent-scorecard': '智能体记分卡', app: '应用端到端',
  'audit-archive': '审计归档', 'audit-incident-timeline.service': '审计事故时间线', 'automation-service': '自动化服务',
  'capability-center': '能力中心', 'dashboard-service': '仪表盘服务', 'dead-letter-triage.service': '死信分诊',
  'dead-letter.controller': '死信控制器', 'dead-letter.service': '死信服务', 'enterprise-team': '企业智能体团队',
  'high-risk-rbac': '高风险 RBAC', 'jwt-strategy-status': 'JWT 用户状态', 'knowledge-base': '知识库',
  'linkfox-skill-cli': 'Linkfox Skill CLI', 'listing-sandbox-rule-engine': 'Listing 沙箱规则引擎',
  'listing-sandbox.service': 'Listing 沙箱服务', 'notifications-service': '通知服务',
  'ozon-approved-action-router.service': 'Ozon 审批动作路由', 'product-research-candidates': '商品研究候选',
  'real-operations-loop': '真实操作闭环', 'sops-prompts-tenant': 'SOP 与提示词租户隔离',
  'store-agent-profile.service': '店铺智能体配置', 'store-monitoring-alert-tenant': '店铺告警租户隔离',
  'supply-chain': '供应链', 'tasks-tenant': '任务租户隔离', env: '运行环境配置',
  'agent-run-consistency.service': '智能体运行一致性', 'agent-run-lease.service': '智能体运行租约',
  'agent-run-lifecycle.service': '智能体运行生命周期', 'agent-run-outbox.publisher': '智能体运行 outbox 发布',
  'agent-run-recovery.service': '智能体运行恢复', 'agent-runs': '智能体运行', 'agent-state-machine': '智能体状态机',
  'automation-step-executions.service': '自动化步骤执行', 'organization-agent-control-resume-dispatcher.service': '组织智能体恢复分派',
  'organization-agent-control': '组织智能体控制', 'agent-kill-switch': '智能体紧急停止', 'agent-permissions': '智能体权限',
  'jwt-auth': 'JWT 认证', 'feature-flags': '功能开关', 'event-bus': '事件总线', logger: '结构化日志',
  metrics: 'Prometheus 指标', 'prometheus.provider': 'Prometheus 指标注册', 'queue-metrics.collector': '队列指标采集',
  locale: '区域语言', 'request-id': '请求标识', 'security-headers': '安全响应头',
  'observability-context': '可观测上下文', 'trace-context': '追踪上下文', queue: '队列基础设施', roles: '角色授权',
  coerce: '输入强制转换', 'agent-run.worker': '智能体运行 Worker', 'automation.worker': '自动化 Worker',
  'daily-product-research.worker': '每日商品研究 Worker', exceptions: '共享业务异常', prisma: 'Prisma 数据库',
};

function stem(filePath) {
  return path.posix.basename(filePath).replace(/\.(?:py|tsx?|jsx?)$/, '').replace(/\.spec$/, '');
}
function label(filePath) {
  let s = stem(filePath);
  if (s.startsWith('test_')) s = s.slice(5);
  s = s.replace(/\.(controller|service|module|dto|guard|interceptor|middleware|collector)$/, '');
  return labelMap[stem(filePath)] ?? labelMap[s] ?? s.replaceAll('_', ' ').replaceAll('-', ' ');
}
function methodNames(result) {
  const names = [
    ...(result.functions ?? []).map((item) => item.name),
    ...(result.classes ?? []).flatMap((item) => item.methods ?? []),
  ].filter((name) => name !== 'constructor' && !name.startsWith('_'));
  return [...new Set(names)].slice(0, 7).join('、');
}
function fileSummary(filePath, result) {
  const topic = label(filePath);
  const ops = methodNames(result);
  if (filePath.endsWith('/services/__init__.py')) return '定义 Web services Python 包入口，供路由和运行时模块导入服务实现。';
  if (/\/tests?\//.test(filePath) || filePath.includes('/test/')) {
    return `验证${topic}的核心契约、边界条件与失败路径${ops ? `，覆盖 ${ops}` : ''}。`;
  }
  if (filePath.endsWith('/web/app.py')) return '创建并配置 FastAPI 应用，注册中间件、生命周期钩子和各业务路由。';
  if (filePath.endsWith('/web/engine.py')) return '协调 Web 端智能体请求、会话状态和生成流程，为 FastAPI 路由提供统一执行引擎。';
  if (filePath.includes('/web/routes/')) return `定义${topic} FastAPI 路由，处理 ${ops || '相关请求'} 并把业务执行委托给服务层。`;
  if (filePath.includes('/web/services/')) return `实现${topic}服务，负责 ${ops || '核心业务处理'} 及运行时边界。`;
  if (filePath.endsWith('/env.ts')) return '使用 schema 集中校验后端环境变量，规范数据库、认证、队列、对象存储和外部服务配置。';
  if (filePath.includes('/workers/')) return `实现${topic}，消费队列作业并协调 ${ops || '任务执行、状态更新和失败处理'}。`;
  if (filePath.endsWith('.controller.ts')) return `提供${topic}的 NestJS HTTP 接口，覆盖 ${ops || '主要操作'} 并执行认证与权限边界。`;
  if (filePath.endsWith('.service.ts') || filePath.endsWith('.publisher.ts')) return `实现${topic}，负责 ${ops || '核心领域操作'} 及持久化一致性。`;
  if (filePath.endsWith('.dto.ts')) return `定义${topic}请求 DTO，集中声明字段校验和 API 契约。`;
  if (filePath.endsWith('.module.ts')) return `组装${topic}相关 providers、controllers 与依赖的 NestJS 模块。`;
  if (filePath.endsWith('.guard.ts')) return `实现${topic} guard，在请求进入业务处理前执行认证或授权。`;
  if (filePath.endsWith('.interceptor.ts')) return `实现${topic} interceptor，在请求生命周期中采集和传播上下文。`;
  if (filePath.endsWith('.middleware.ts')) return `实现${topic} middleware，为请求设置并传播标准上下文。`;
  if (filePath.endsWith('.decorator.ts')) return `定义${topic} decorator，把声明式元数据写入 NestJS 路由。`;
  return `实现${topic}相关基础设施与业务规则，覆盖 ${ops || '主要运行逻辑'}。`;
}

function symbolSummary(name, filePath, kind, item) {
  const topic = label(filePath);
  if (kind === 'class') {
    if (filePath.includes('/test/')) return `组织${topic}的测试状态、依赖替身和断言辅助逻辑。`;
    if (name.endsWith('Dto')) {
      const fields = (item.properties ?? []).join('、');
      return `定义并校验${topic}${fields ? `的 ${fields} 字段` : '请求字段'}。`;
    }
    if (name.endsWith('Module')) return `组装${topic}相关依赖的 NestJS 模块。`;
    if (name.endsWith('Controller')) return `暴露${topic}的 HTTP 接口并委托领域服务。`;
    if (name.endsWith('Guard')) return `在请求进入业务逻辑前执行${topic}校验。`;
    if (name.endsWith('Interceptor')) return `在请求生命周期中处理${topic}上下文。`;
    if (name.endsWith('Middleware')) return `为每个请求应用${topic}处理。`;
    if (name.endsWith('Worker')) return `消费队列作业并协调${topic}的执行、状态和失败恢复。`;
    if (name.endsWith('Error') || name.endsWith('Exception')) return `表示${topic}处理中的结构化失败并携带诊断上下文。`;
    return `封装${topic}的状态与操作，提供 ${((item.methods ?? []).filter((m) => m !== 'constructor').slice(0, 5).join('、') || name)} 能力。`;
  }
  if (name.startsWith('test_')) return `验证${topic}场景中的 ${name.slice(5)} 行为和边界条件。`;
  const verbs = [
    ['create', '创建'], ['build', '构建'], ['load', '加载'], ['save', '保存'], ['read', '读取'], ['write', '写入'],
    ['list', '列出'], ['get', '获取'], ['fetch', '获取'], ['update', '更新'], ['delete', '删除'], ['remove', '移除'],
    ['run', '执行'], ['execute', '执行'], ['process', '处理'], ['handle', '处理'], ['dispatch', '分派'], ['publish', '发布'],
    ['validate', '校验'], ['assert', '断言'], ['check', '检查'], ['classify', '分类'], ['resolve', '解析'], ['normalize', '规范化'],
    ['parse', '解析'], ['serialize', '序列化'], ['map', '映射'], ['compute', '计算'], ['calculate', '计算'], ['record', '记录'],
    ['start', '启动'], ['stop', '停止'], ['cancel', '取消'], ['retry', '重试'], ['recover', '恢复'], ['ensure', '确保'],
  ];
  const plain = name.replace(/^_+/, '').toLowerCase();
  const match = verbs.find(([prefix]) => plain.startsWith(prefix));
  const action = match?.[1] ?? '处理';
  return `${action}${topic}中的 ${name} 逻辑，并返回可供调用方使用的稳定结果。`;
}

function complexity(lines) { return lines < 50 ? 'simple' : lines <= 200 ? 'moderate' : 'complex'; }
function domainTag(filePath) {
  if (filePath.includes('risk')) return 'risk-control';
  if (filePath.includes('supplier')) return 'supplier-evidence';
  if (filePath.includes('agent-run')) return 'agent-runtime';
  if (filePath.includes('automation')) return 'automation';
  if (filePath.includes('audit')) return 'audit';
  if (filePath.includes('queue') || filePath.includes('worker')) return 'queue';
  if (filePath.includes('auth') || filePath.includes('permission') || filePath.includes('rbac')) return 'security';
  return 'domain-logic';
}
function tags(filePath, name, type) {
  const python = filePath.endsWith('.py');
  const test = /\/tests?\//.test(filePath) || filePath.includes('/test/');
  const domain = domainTag(filePath);
  if (test) return ['test', python ? 'pytest' : 'jest', domain];
  if (type === 'function') {
    if (filePath.includes('/routes/')) return ['api-handler', 'fastapi', domain];
    return [python ? 'python' : 'typescript', 'utility', domain];
  }
  if (type === 'class') {
    if (name.endsWith('Dto')) return ['data-model', 'validation', 'api-contract'];
    if (name.endsWith('Module')) return ['nestjs-module', 'dependency-injection', 'configuration'];
    if (name.endsWith('Controller')) return ['api-handler', 'nestjs', domain];
    if (name.endsWith('Guard')) return ['guard', 'security', 'nestjs'];
    if (name.endsWith('Worker')) return ['worker', 'queue', domain];
    return ['service', python ? 'python' : 'nestjs', domain];
  }
  if (filePath.includes('/routes/')) return ['api-handler', 'fastapi', domain];
  if (filePath.includes('/services/')) return ['service', 'python', domain];
  if (filePath.includes('/workers/')) return ['worker', 'queue', domain];
  if (filePath.endsWith('.module.ts')) return ['nestjs-module', 'configuration', 'dependency-injection'];
  if (filePath.endsWith('.dto.ts')) return ['data-model', 'validation', 'api-contract'];
  return [python ? 'python' : 'typescript', 'backend', domain];
}

const resultByPath = new Map(extraction.results.map((entry) => [entry.path, entry]));
const nodes = [];
const edges = [];
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result) throw new Error(`Missing result ${file.path}`);
  const fileId = `file:${file.path}`;
  const fileNode = {
    id: fileId, type: 'file', name: path.posix.basename(file.path), filePath: file.path,
    summary: fileSummary(file.path, result), tags: tags(file.path, '', 'file'), complexity: complexity(result.nonEmptyLines),
  };
  if (file.path.endsWith('.py')) fileNode.languageNotes = file.path.includes('/test/') || file.path.includes('/tests/')
    ? '使用 pytest fixtures、monkeypatch 和断言隔离外部服务与状态边界。'
    : file.path.includes('/routes/') ? '使用 FastAPI 路由与类型化请求模型连接 HTTP 层和服务层。' : '使用 Python 类型提示与小型 helper 组合运行时服务。';
  nodes.push(fileNode);
  for (const imported of batch.batchImportData[file.path] ?? []) edges.push({ source: fileId, target: `file:${imported}`, type: 'imports', direction: 'forward', weight: 0.7 });
  for (const fn of result.functions ?? []) {
    const exported = (result.exports ?? []).some((entry) => entry.name === fn.name);
    const lineCount = fn.endLine - fn.startLine + 1;
    if (lineCount < 10 && !exported) continue;
    const id = `function:${file.path}:${fn.name}`;
    nodes.push({ id, type: 'function', name: fn.name, filePath: file.path, lineRange: [fn.startLine, fn.endLine], summary: symbolSummary(fn.name, file.path, 'function', fn), tags: tags(file.path, fn.name, 'function'), complexity: complexity(lineCount) });
    edges.push({ source: fileId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exported) edges.push({ source: fileId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
  for (const cls of result.classes ?? []) {
    const exported = (result.exports ?? []).some((entry) => entry.name === cls.name);
    const lineCount = cls.endLine - cls.startLine + 1;
    if ((cls.methods?.length ?? 0) < 2 && lineCount < 20 && !exported) continue;
    const id = `class:${file.path}:${cls.name}`;
    nodes.push({ id, type: 'class', name: cls.name, filePath: file.path, lineRange: [cls.startLine, cls.endLine], summary: symbolSummary(cls.name, file.path, 'class', cls), tags: tags(file.path, cls.name, 'class'), complexity: complexity(lineCount) });
    edges.push({ source: fileId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (exported) edges.push({ source: fileId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

const expectedImports = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
const importEdges = edges.filter((edge) => edge.type === 'imports').length;
if (importEdges !== expectedImports) throw new Error(`Import mismatch ${importEdges}/${expectedImports}`);
if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Duplicate node IDs');
if (edges.some((edge) => edge.source === edge.target)) throw new Error('Self edge');
const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedFiles = [...batch.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const filesPerPart = Math.ceil(sortedFiles.length / partCount);
const written = [];
for (let part = 1; part <= partCount; part += 1) {
  const partFiles = sortedFiles.slice((part - 1) * filesPerPart, part * filesPerPart).map((entry) => entry.path);
  const fileSet = new Set(partFiles);
  const partNodes = nodes.filter((node) => fileSet.has(node.filePath));
  const nodeIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => nodeIds.has(edge.source));
  const allowedTargets = new Set(partFiles.flatMap((filePath) => [
    ...(batch.batchImportData[filePath] ?? []), ...(batch.neighborMap[filePath] ?? []).map((entry) => entry.path),
  ]).map((filePath) => `file:${filePath}`));
  for (const edge of partEdges) if (!nodeIds.has(edge.target) && !allowedTargets.has(edge.target)) throw new Error(`Invalid target in ${batchIndex}/${part}: ${edge.target}`);
  const outputName = partCount === 1 ? `batch-${batchIndex}.json` : `batch-${batchIndex}-part-${part}.json`;
  const outputPath = path.join(uaDir, 'intermediate', outputName);
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  written.push({ outputName, nodes: partNodes.length, edges: partEdges.length });
}
console.log(JSON.stringify({ batchIndex, totalNodes: nodes.length, totalEdges: edges.length, importEdges, expectedImports, parts: written, filesSkipped: extraction.filesSkipped }, null, 2));
