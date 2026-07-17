import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![86, 87, 88].includes(batchIndex)) throw new Error('Expected mixed content batch 86, 87, or 88');
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
  'cookie_jar.example.json': '浏览器会话 Cookie jar 示例配置',
  'beauty_premium.json': '美妆高级质感场景模板',
  'digital_in_use.json': '数码产品使用场景模板',
  'fashion_lifestyle.json': '时尚生活方式场景模板',
  'food_lifestyle.json': '食品生活方式场景模板',
  'home_lifestyle.json': '家居生活方式场景模板',
  'sports_action.json': '运动动作场景模板',
  'dom_check.js': 'Agent Web UI DOM 冒烟检查',
  'locustfile.py': 'Agent API Locust 负载测试',
  'album.py': '生成图片相册读取与元数据整理',
  'caption_overlay.py': '图片文案叠加与字体布局',
  'competitor_watch.py': '竞品监控快照与变化检测',
  'ctr_estimator.py': 'Listing 素材 CTR 估算',
  'listing_bundle.py': 'Listing 发布资料包生成',
  'listing_pack.py': 'Listing 文案与图片包整理',
  'listing_rules.py': '平台 Listing 规则校验',
  'product_pool.py': '候选商品池管理',
  'research_evidence.py': 'Ozon 商品研究与趋势证据采集',
  'agent.css': 'Agent Web 工作台视觉样式',
  'api.js': '浏览器端 API 请求封装',
  'boot.js': 'Agent Web 应用启动',
  'flows.js': '前端任务流、进度和结果交互',
  'intent.js': '用户意图输入与快捷动作',
  'render.js': 'Agent Web 状态、卡片和结果渲染',
  'session.js': '浏览器会话、历史和恢复',
  'state.js': '前端集中状态容器',
  'upload.js': '商品图片上传',
  'index.html': 'Agent Web 单页应用壳层',
  'build_windows.ps1': 'Windows 桌面安装包构建',
  'desktop_launcher.py': '桌面版 Agent 服务启动与浏览器打开',
  'ProductImageAgent.iss': 'Inno Setup Windows 安装器',
  'ProductImageAgent.spec': 'PyInstaller 桌面可执行文件构建',
  'wiki_update.py': 'Wiki 收件箱增量整理与索引更新',
  'agent-tasks.contract.json': 'Agent 任务状态、事件和回调共享契约',
  'query-performance.md': '后端查询性能、索引和执行计划指南',
};

function complexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines >= 50) return 'moderate';
  return 'simple';
}

function isTestPath(filePath) {
  return /(^|\/)tests?\/|(^|\/)test_[^/]+\.(py|js|ts)$/i.test(filePath);
}

function subject(filePath) {
  const name = path.posix.basename(filePath);
  return subjects[name] ?? name.replace(/\.(py|js|css|html|md|json|ps1|iss|spec)$/, '').replace(/^test_/, '').replaceAll('_', ' ').replaceAll('-', ' ');
}

function fileNodeIdentity(file) {
  const name = path.posix.basename(file.path);
  if (file.fileCategory === 'config') return { id: `config:${file.path}`, type: 'config' };
  if (file.fileCategory === 'docs') return { id: `document:${file.path}`, type: 'document' };
  return { id: `file:${file.path}`, type: 'file' };
}

function fileSummary(file, result) {
  const name = path.posix.basename(file.path);
  const value = subject(file.path);
  if (file.fileCategory === 'config') {
    if (file.path.includes('/templates/scenes/')) return `定义${value}的默认画面描述、构图、氛围和适用商品类别，供场景匹配与批量生成复用。`;
    return `提供${value}，以版本化 JSON 固化运行示例或跨语言数据契约。`;
  }
  if (file.fileCategory === 'docs') {
    const sections = result.sections?.length ?? 0;
    return `记录${value}，包含 ${sections} 个结构化章节，作为项目研究、运营或维护知识的入口。`;
  }
  if (name === '.gitkeep') return '保留空的 Wiki 来源目录，使附件或待处理资料目录能被 Git 跟踪。';
  if (isTestPath(file.path)) return `覆盖${value}的自动化测试，验证关键成功路径、失败边界、证据门禁和回归行为。`;
  if (file.path.includes('/web/services/')) return `实现${value}服务，为 Web 路由提供可复用的业务处理和持久化能力。`;
  if (file.path.includes('/web/static/js/')) return `实现${value}浏览器模块，驱动 Agent Web 工作台的交互、状态和结果呈现。`;
  if (name.endsWith('.css')) return `定义${value}，覆盖布局、组件、状态反馈和响应式展示。`;
  if (name.endsWith('.html')) return `提供${value}，声明页面结构、资源挂载点和核心交互容器。`;
  if (file.path.includes('/packaging/')) return `实现${value}配置或入口，用于构建、安装和启动 Windows 桌面版。`;
  return `实现${value}相关能力。`;
}

function slug(filePath) {
  return path.posix.basename(filePath).replace(/^test_/, '').replace(/\.[^.]+$/, '').replaceAll('_', '-').toLowerCase();
}

function fileTags(file) {
  const name = path.posix.basename(file.path);
  const tag = slug(file.path);
  if (file.fileCategory === 'config') return ['configuration', 'template', 'ecommerce', tag];
  if (file.fileCategory === 'docs') return ['documentation', 'knowledge-base', 'research', tag];
  if (isTestPath(file.path)) return ['test', 'pytest', 'regression', tag];
  if (file.fileCategory === 'script') return ['script', 'packaging', 'windows', tag];
  if (name.endsWith('.css')) return ['markup', 'css', 'frontend', tag];
  if (name.endsWith('.html')) return ['markup', 'html', 'frontend', tag];
  if (file.path.includes('/web/static/js/')) return ['frontend', 'browser', 'javascript', tag];
  if (file.path.includes('/web/services/')) return ['service', 'web-backend', 'ecommerce', tag];
  if (file.path.includes('/packaging/')) return ['build-system', 'packaging', 'desktop', tag];
  return ['utility', 'python', 'ecommerce', tag];
}

function classSummary(name, filePath) {
  if (name.endsWith('Error')) return `表示${subject(filePath)}中的特定失败状态。`;
  if (isTestPath(filePath)) return `组织${subject(filePath)}的一组共享夹具、场景和断言。`;
  return `封装${subject(filePath)}的核心状态、算法和协作行为。`;
}

function functionSummary(name, filePath) {
  const label = name.replace(/^_+/, '').replaceAll('_', ' ');
  if (name.startsWith('test_')) return `验证${subject(filePath)}中的“${label.replace(/^test /, '')}”场景及预期边界。`;
  if (name === 'main') return `执行${subject(filePath)}入口流程并报告结果。`;
  if (/^(load|read|get|list|fetch|search|collect|poll)/i.test(name)) return `读取并规范化${subject(filePath)}所需的 ${label} 数据。`;
  if (/^(create|build|render|generate|make|apply)/i.test(name)) return `构建${subject(filePath)}中的 ${label} 结果。`;
  if (/^(validate|check|verify|is|has|safe)/i.test(name)) return `校验${subject(filePath)}的 ${label} 条件和安全边界。`;
  return `实现${subject(filePath)}中的 ${label} 处理逻辑。`;
}

function supplementedPowerShellFunctions(file) {
  if (file.language !== 'powershell') return [];
  const lines = fs.readFileSync(`${root}/${file.path}`, 'utf8').split(/\r?\n/);
  const results = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^\s*function\s+([A-Za-z_][\w-]*)\s*\{/i.exec(lines[index]);
    if (!match) continue;
    let depth = 0;
    let endLine = index + 1;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      depth += (lines[cursor].match(/\{/g) ?? []).length;
      depth -= (lines[cursor].match(/\}/g) ?? []).length;
      endLine = cursor + 1;
      if (depth === 0 && cursor > index) break;
    }
    results.push({ name: match[1], startLine: index + 1, endLine });
  }
  return results;
}

const fileByPath = new Map(batch.files.map((file) => [file.path, file]));
const nodes = [];
const edges = [];
const fileNodeByPath = new Map();

for (const result of extraction.results) {
  const file = fileByPath.get(result.path);
  const identity = fileNodeIdentity(file);
  const node = {
    ...identity,
    name: path.posix.basename(file.path),
    filePath: file.path,
    summary: fileSummary(file, result),
    tags: fileTags(file),
    complexity: complexity(result.nonEmptyLines),
  };
  nodes.push(node);
  fileNodeByPath.set(file.path, node);

  if (!['code', 'script'].includes(file.fileCategory)) continue;
  const exported = new Set((result.exports ?? []).map((entry) => entry.name));
  for (const item of result.classes ?? []) {
    const lineCount = item.endLine - item.startLine + 1;
    const isExported = exported.has(item.name);
    if (!isExported && (item.methods?.length ?? 0) < 2 && lineCount < 20) continue;
    const child = {
      id: `class:${file.path}:${item.name}`,
      type: 'class', name: item.name, filePath: file.path,
      lineRange: [item.startLine, item.endLine],
      summary: classSummary(item.name, file.path),
      tags: isTestPath(file.path) ? ['test', 'fixture', slug(file.path)] : ['class', 'domain-logic', slug(file.path)],
      complexity: complexity(lineCount),
    };
    nodes.push(child);
    edges.push({ source: node.id, target: child.id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (isExported) edges.push({ source: node.id, target: child.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
  const functions = [...(result.functions ?? [])];
  if (!functions.length) functions.push(...supplementedPowerShellFunctions(file));
  for (const item of functions) {
    const lineCount = item.endLine - item.startLine + 1;
    const isExported = exported.has(item.name);
    if (!isExported && lineCount < 10) continue;
    const child = {
      id: `function:${file.path}:${item.name}`,
      type: 'function', name: item.name, filePath: file.path,
      lineRange: [item.startLine, item.endLine],
      summary: functionSummary(item.name, file.path),
      tags: isTestPath(file.path) ? ['test', 'regression', slug(file.path)] : ['function', 'domain-logic', slug(file.path)],
      complexity: complexity(lineCount),
    };
    nodes.push(child);
    edges.push({ source: node.id, target: child.id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (isExported) edges.push({ source: node.id, target: child.id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}

for (const file of batch.files) {
  for (const importedPath of batch.batchImportData[file.path] ?? []) {
    edges.push({ source: fileNodeByPath.get(file.path).id, target: `file:${importedPath}`, type: 'imports', direction: 'forward', weight: 0.7 });
  }
}

for (const file of batch.files.filter((item) => item.fileCategory === 'docs' && path.posix.basename(item.path).includes('Index'))) {
  const peer = batch.files.find((item) => item.fileCategory === 'docs' && path.posix.dirname(item.path) === path.posix.dirname(file.path) && item.path !== file.path);
  if (peer) edges.push({ source: fileNodeByPath.get(file.path).id, target: fileNodeByPath.get(peer.path).id, type: 'documents', direction: 'forward', weight: 0.5 });
}

const importExpected = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
const importActual = edges.filter((edge) => edge.type === 'imports').length;
if (importActual !== importExpected) throw new Error(`Import mismatch ${importActual}/${importExpected}`);
const ids = new Set(nodes.map((node) => node.id));
if (ids.size !== nodes.length) throw new Error('Duplicate node IDs');
for (const file of batch.files) if (!nodes.some((node) => node.filePath === file.path)) throw new Error(`Missing file ${file.path}`);
for (const edge of edges) {
  if (!ids.has(edge.source)) throw new Error(`Missing source ${edge.source}`);
  if (!ids.has(edge.target) && !edge.target.startsWith('file:')) throw new Error(`Missing target ${edge.target}`);
}

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedFiles = batch.files.map((file) => file.path).sort((a, b) => a.localeCompare(b, 'zh-CN'));
const filesPerPart = Math.ceil(sortedFiles.length / partCount);
for (let index = 0; index < partCount; index += 1) {
  const partFiles = new Set(sortedFiles.slice(index * filesPerPart, (index + 1) * filesPerPart));
  const partNodes = nodes.filter((node) => partFiles.has(node.filePath));
  const partIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => partIds.has(edge.source));
  const outputPath = partCount === 1
    ? `${uaDir}/intermediate/batch-${batchIndex}.json`
    : `${uaDir}/intermediate/batch-${batchIndex}-part-${index + 1}.json`;
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}
console.log(JSON.stringify({ batchIndex, partCount, nodeCount: nodes.length, edgeCount: edges.length, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
