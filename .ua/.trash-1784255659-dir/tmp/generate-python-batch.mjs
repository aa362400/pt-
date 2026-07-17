import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![13, 14, 15].includes(batchIndex)) throw new Error('Expected batch index 13, 14, or 15');
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
  'analyst.py': '商品与素材分析 Agent',
  'base_agent.py': '子 Agent 基类与公共执行契约',
  'blackboard.py': '多 Agent 共享黑板、会话状态和持久化',
  'consistency_adapter.py': '产品视觉一致性评分适配',
  'consistency_agent.py': '产品视觉一致性守卫 Agent',
  'executor.py': '任务执行 Agent 与工具调用编排',
  'generator.py': '电商视觉方案生成 Agent',
  'layout.py': '版式设计 Agent',
  'observer.py': '运行观察、主动诊断和任务监督 Agent',
  'orchestrator.py': '多 Agent 意图识别、模型选择和任务编排大脑',
  'pipeline.py': '带循环边的 Agent 执行流水线',
  'planner.py': '目标分解、计划校验和逐步执行',
  'protocol.py': 'Agent 消息、任务和报告协议',
  'qa.py': '生成结果质量验收 Agent',
  'registry.py': 'Agent 能力注册表',
  'researcher.py': '网页与商品信息研究 Agent',
  'telemetry.py': 'Agent 运行遥测',
  'toolkit.py': 'Agent 可调用业务工具集合',
  'tools_registry.py': '工具注册、输入校验、审计和默认电商工具',
  'agent_lifecycle.py': 'Agent 生命周期状态机',
  'browse_url.py': '静态或浏览器渲染的网页抓取',
  'fetch_url.py': '安全远程 URL 与本地商品图片获取',
  'knowledge_base.py': '组织级 Markdown 知识库',
  'memory_store.py': '经验记忆审阅、持久化和召回',
  'metrics.py': 'API 与 Agent 调用指标采集',
  'platform_knowledge_sync.py': '平台数据到本地知识库的全量和增量同步',
  'proxy_client.py': '平台代理能力发现与受控调用',
  'resilient.py': '重试、限流和熔断韧性机制',
  'runtime_migration.py': '旧运行目录到新运行目录的兼容迁移',
  'runtime_paths.py': '运行时数据、缓存和日志路径解析',
  'user_memory.py': '用户偏好记忆读取与更新',
  'utils.py': '图像、文件、路径、JSON 和任务运行的通用工具',
  'web_search.py': '多来源网络搜索与结果归一化',
  'working_memory.py': '会话工作记忆、任务上下文和状态持久化',
  'judge_calibration.py': '视觉评审器分数校准与阈值分析',
  'mcp_server.py': '跨境电商 Agent 的 MCP 工具服务入口',
  'ab_test_runner.py': '生成策略 A/B 实验执行与指标比较',
  'analyze_product.py': '商品图片、卖点和视觉需求分析',
  'compliance_checker.py': '电商平台素材合规检测',
  'consistency_checker.py': '商品主体和生成图的一致性检测',
  'emotion_scorer.py': '电商视觉情绪感染力评分',
  'generate_batch.py': '多平台电商设计图批量生成流水线',
  'identity_qa.py': '商品身份与关键特征保持验收',
  'layout_engine.py': '电商画面版式计算和元素布局',
  'localization.py': '文案、币种和区域视觉本地化',
  'multi_engine_bridge.py': '多图像生成引擎统一调用和回退',
  'platform_adapter.py': '不同电商平台规格和素材规则适配',
  'region_scenes.py': '目标区域与文化场景配置',
  'run_review_learning.py': '评审反馈学习任务启动',
  'run_suggestions.py': '主动建议生成任务启动',
  'scene_creator.py': '商品场景方案创建',
  'scene_matcher.py': '商品、受众和使用场景匹配',
  'style_pipeline.py': '品牌与平台视觉风格处理流水线',
  'subject_lock.py': '商品主体锁定和身份特征保护',
  'sync_knowledge.py': '平台知识同步任务启动',
  'visual_similarity.py': '图像感知哈希和视觉相似度分析',
  'event_subscriber.py': '平台事件订阅和 Agent 任务触发',
  'review_learning.py': '人工评审反馈学习和规则沉淀',
  'scheduler.py': '周期任务调度和运行控制',
  'suggestion_engine.py': '基于事件、记忆和指标的主动建议',
  'test_agent_lifecycle_contract.py': 'Agent 生命周期契约',
  'test_agent_regressions.py': 'Agent 历史回归场景',
  'test_analyze_supervision.py': '商品分析任务监督',
  'test_autonomy_platform.py': '平台侧自主执行能力',
  'test_autonomy_runtime.py': 'Agent 自主运行时行为',
  'test_biz_tools_p3.py': '第三阶段电商业务工具',
  'test_blackboard.py': '共享黑板状态',
  'test_browse_url_security.py': '网页浏览安全边界',
  'test_commerce_agent.py': '跨境电商 Agent 端到端能力',
  'test_consistency_adapter.py': '一致性适配器',
  'test_consistency_agent.py': '一致性守卫 Agent',
  'test_consistency_checker.py': '视觉一致性检测器',
  'test_crossborder_mcp_tools.py': '跨境电商 MCP 工具',
  'test_fetch_url.py': '安全 URL 和图片获取',
  'test_global_product_discovery.py': '全球商品发现',
  'test_hd_export_housekeeping.py': '高清导出文件清理',
  'test_identity_qa.py': '商品身份验收',
  'test_job_queue_state_machine.py': '作业队列状态机',
  'test_judge_calibration.py': '视觉评审器校准',
  'test_mcp_tool_policy.py': 'MCP 工具策略门禁',
  'test_memory_store.py': '经验记忆存储',
  'test_multi_agent_architecture.py': '多 Agent 架构协作',
  'test_observer_proactive.py': '观察 Agent 主动行为',
  'test_opportunity.py': '机会识别和建议',
  'test_orchestrator_llm.py': 'LLM 编排器',
  'test_ozon_pricing.py': 'Ozon 定价分析',
  'test_path_security.py': '运行路径安全边界',
};

const classSummaries = {
  AnalystAgent: '分析商品、素材和任务上下文，生成可供规划与执行阶段消费的结构化洞察。',
  BaseSubAgent: '定义子 Agent 的身份、消息处理和统一执行接口。',
  SharedBlackboard: '维护多 Agent 共享会话状态、任务、发现、产物和持久化同步。',
  ConsistencyAdapter: '统一调用视觉一致性评估后端并规范化评分响应。',
  ConsistencyGuardAgent: '在生成流程中评估并约束商品主体一致性。',
  ExecutorAgent: '根据计划选择工具、执行任务、处理失败并回写共享状态。',
  GeneratorAgent: '把分析和规划结果转换为可执行的电商视觉生成方案。',
  LayoutAgent: '根据商品、文案和平台约束生成版式建议。',
  ObserverAgent: '监视任务、工具和业务信号，主动发现异常并触发后续动作。',
  OrchestratorBrain: '使用规则与 LLM 解析意图、选择模型并决定多 Agent 调度策略。',
  Pipeline: '按步骤和循环边执行 Agent 流水线，并传递共享上下文。',
  Step: '描述流水线中的单个可执行步骤。',
  LoopEdge: '描述流水线步骤之间带条件和次数限制的循环边。',
  AgentMessage: '表示 Agent 之间传递的任务、报告和追踪元数据。',
  QAAgent: '对生成产物执行质量检查并给出通过、修订或失败结论。',
  CapabilityRegistry: '注册 Agent 能力并按任务需求进行查询匹配。',
  ResearcherAgent: '选择静态抓取或浏览器渲染来收集商品与网页研究证据。',
  Telemetry: '记录 Agent 事件、耗时、错误和任务关联信息。',
  NullTelemetry: '提供无副作用的遥测空实现。',
  AgentToolkit: '封装 Agent 可调用的电商分析、生成和平台操作能力。',
  MetricsTracker: '累计调用耗时、成功率和错误等运行指标。',
  RateLimiter: '使用时间窗口控制调用频率并暴露限流状态。',
  CircuitBreaker: '根据连续失败和恢复窗口阻断不健康的下游调用。',
};

function complexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines >= 50) return 'moderate';
  return 'simple';
}

function subject(filePath) {
  const name = path.posix.basename(filePath);
  return subjects[name] ?? name.replace(/\.py$/, '').replaceAll('_', ' ');
}

function isTestPath(filePath) {
  return /(^|\/)tests?\/|(^|\/)test_[^/]+\.py$/i.test(filePath);
}

function fileSummary(filePath) {
  const name = path.posix.basename(filePath);
  const value = subject(filePath);
  if (name === '__init__.py') {
    const packageName = path.posix.basename(path.posix.dirname(filePath));
    return `聚合 ${packageName} Python 包的公开接口，便于上层按稳定入口导入核心能力。`;
  }
  if (isTestPath(filePath)) return `覆盖${value}的自动化测试，验证关键成功路径、失败边界与回归行为。`;
  if (filePath.includes('/agent/scripts/')) return `提供${value}的可执行脚本与核心处理流程，供批处理、命令行或 Agent 工具链调用。`;
  if (filePath.includes('/agent/agents/')) return `实现${value}，参与电商视觉多 Agent 系统的分析、规划、执行或质量控制。`;
  if (filePath.includes('/agent/common/')) return `提供${value}的共享基础能力，供 Agent、服务和脚本复用。`;
  if (filePath.includes('/agent/services/')) return `实现${value}后台服务，连接平台事件、周期任务或反馈闭环。`;
  if (filePath.includes('/agent/evals/')) return `实现${value}评测流程，用于量化质量、校准判断和比较策略。`;
  if (name === 'mcp_server.py') return '注册跨境电商研究、关键词、Listing、利润、视觉生成和平台代理等 MCP 工具，并实施运行策略与错误映射。';
  return `实现${value}相关能力。`;
}

function subjectTag(filePath) {
  return path.posix.basename(filePath).replace(/^test_/, '').replace(/\.py$/, '').replaceAll('_', '-').toLowerCase();
}

function fileTags(filePath) {
  const tag = subjectTag(filePath);
  if (isTestPath(filePath)) return ['test', 'regression', 'pytest', tag];
  if (path.posix.basename(filePath) === '__init__.py') return ['entry-point', 'barrel', 'python-package'];
  if (filePath.includes('/agent/scripts/')) return ['script', 'automation', 'ecommerce', tag];
  if (filePath.includes('/agent/agents/')) return ['agent', 'multi-agent', 'ecommerce', tag];
  if (filePath.includes('/agent/services/')) return ['service', 'automation', 'event-driven', tag];
  if (filePath.includes('/agent/evals/')) return ['evaluation', 'calibration', 'quality', tag];
  if (path.posix.basename(filePath) === 'mcp_server.py') return ['entry-point', 'mcp', 'tool-server', 'ecommerce'];
  return ['utility', 'shared-infrastructure', 'python', tag];
}

function classSummary(name, filePath) {
  if (classSummaries[name]) return classSummaries[name];
  if (name.endsWith('Error') || name.endsWith('Exception')) return `表示${subject(filePath)}流程中的特定失败状态，便于调用方实施精确恢复或错误映射。`;
  if (name.endsWith('Agent')) return `实现${subject(filePath)}角色，并通过统一 Agent 协议参与协作。`;
  if (name.endsWith('Registry')) return `维护${subject(filePath)}的注册项、查询和调用映射。`;
  if (name.endsWith('Config') || name.endsWith('Options')) return `封装${subject(filePath)}的可验证运行配置。`;
  return `封装${subject(filePath)}的核心状态、算法和协作行为。`;
}

function classTags(name, filePath) {
  const tag = subjectTag(filePath);
  if (name.endsWith('Error') || name.endsWith('Exception')) return ['error', 'validation', tag];
  if (name.endsWith('Agent')) return ['agent', 'multi-agent', tag];
  if (isTestPath(filePath)) return ['test', 'fixture', tag];
  return ['class', 'domain-logic', tag];
}

function readableFunction(name) {
  return name.replace(/^_+/, '').replaceAll('_', ' ');
}

function functionSummary(name, filePath) {
  const label = readableFunction(name);
  if (name.startsWith('test_')) return `验证${subject(filePath)}中的“${label.replace(/^test /, '')}”场景及其预期边界。`;
  if (/^(load|_load|read|_read)/.test(name)) return `加载并规范化${subject(filePath)}所需的 ${label} 数据。`;
  if (/^(save|_save|write|_write|add_|remember)/.test(name)) return `持久化${subject(filePath)}中的 ${label} 数据并维护一致性。`;
  if (/^(validate|_validate|verify|_verify|assert|_assert|check|_check)/.test(name)) return `校验${subject(filePath)}的 ${label} 输入或运行约束，失败时返回明确错误。`;
  if (/^(resolve|_resolve|parse|_parse|normalize|_normalize|canonical|_canonical)/.test(name)) return `解析并规范化${subject(filePath)}中的 ${label} 表示。`;
  if (/^(fetch|_fetch|browse|search|recall|list_|get_|_get)/.test(name)) return `查询${subject(filePath)}所需的 ${label} 信息并返回结构化结果。`;
  if (/^(create|_create|make_|build_|_build|generate|_generate)/.test(name)) return `构建${subject(filePath)}中的 ${label} 结果或执行载荷。`;
  if (/^(sync|run|execute|decompose|call_|_call|register)/.test(name)) return `执行${subject(filePath)}的 ${label} 流程并协调相关依赖。`;
  if (name.includes('tool_')) return `实现工具注册表中的 ${label} 电商能力，并返回统一工具结果。`;
  return `实现${subject(filePath)}中的 ${label} 处理逻辑。`;
}

function functionTags(name, filePath) {
  const tag = subjectTag(filePath);
  if (name.startsWith('test_')) return ['test', 'regression', tag];
  if (name.includes('validate') || name.includes('verify') || name.includes('safe')) return ['validation', 'security', tag];
  if (name.includes('fetch') || name.includes('browse') || name.includes('search')) return ['utility', 'data-fetching', tag];
  if (name.includes('sync')) return ['automation', 'data-sync', tag];
  return ['function', 'domain-logic', tag];
}

function languageNotes(filePath) {
  const name = path.posix.basename(filePath);
  if (name === 'fetch_url.py' || name === 'browse_url.py') return '在网络访问前后都验证 URL、解析地址与响应体边界，以降低 SSRF、重定向和超大响应风险。';
  if (name === 'resilient.py') return '通过 Python decorator 把指数退避、限流和熔断策略组合到下游调用。';
  if (name === 'mcp_server.py') return '以 MCP tool 注册函数作为外部协议边界，并把内部异常转换为稳定工具响应。';
  if (isTestPath(filePath)) return '使用 pytest 风格的模块级测试函数覆盖同步与异步业务路径。';
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
    if (!targetOkay) throw new Error(`Batch ${batchIndex} part ${index + 1} has invalid target: ${edge.target}`);
  }
  const outputPath = `${uaDir}/intermediate/batch-${batchIndex}-part-${index + 1}.json`;
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}

console.log(JSON.stringify({ batchIndex, partCount, nodeCount, edgeCount, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
