import fs from 'node:fs';
import path from 'node:path';
const i = Number(process.argv[2]);
if (i < 41 || i > 50) throw new Error('Expected 41..50');
const root = 'G:/平台/.ua';
const raw = JSON.parse(fs.readFileSync(path.join(root, 'intermediate', 'batches.json'), 'utf8'));
const batch = (raw.batches ?? raw).find((x) => x.batchIndex === i);
const ext = JSON.parse(fs.readFileSync(path.join(root, 'tmp', `ua-file-extract-results-${i}.json`), 'utf8'));
if (!ext.scriptCompleted || ext.results.length !== batch.files.length) throw new Error('Incomplete extraction');
const byPath = new Map(ext.results.map((x) => [x.path, x]));
function complexity(n) { return n < 50 ? 'simple' : n <= 200 ? 'moderate' : 'complex'; }
function nodeType(f) {
  if (f.fileCategory === 'docs') return 'document';
  if (f.fileCategory === 'config') return 'config';
  if (f.fileCategory === 'infra') return f.path.includes('.github/workflows/') ? 'pipeline' : 'service';
  return 'file';
}
function id(type, p) { return `${type}:${p}`; }
function summary(f, r) {
  const first = r.sections?.[0]?.heading;
  const count = r.sections?.length ?? 0;
  if (f.path.includes('.github/workflows/full-stack-ci')) return 'GitHub Actions 全栈 CI，执行后端与前端依赖安装、静态检查、测试和构建门禁。';
  if (f.path.includes('ozon-readonly-e2e')) return 'GitHub Actions Ozon 只读端到端验证流程，按手动或计划触发运行真实只读集成检查。';
  if (f.path.includes('security-scans')) return 'GitHub Actions 安全扫描流程，执行 secrets、依赖与代码安全检查并阻断高风险结果。';
  if (f.path.endsWith('.sql')) return '只读验证候选商品 economics 数据语义，检查成本、利润、证据链和迁移后的字段一致性，不修改数据库。';
  if (f.path === 'docker-compose.local-server.yml') return '编排本机服务器所需的数据库、Redis、后端、前端、Python Agent 和反向代理服务及持久卷。';
  if (f.path === 'docker-compose.prod.yml') return '定义生产容器编排、健康检查、网络、持久化和最小公网暴露边界。';
  if (f.path === '.env.local-server.example') return '提供本机服务器环境变量模板，覆盖数据库、认证、队列、Agent、存储和外部平台配置。';
  if (f.path === '.gitleaks.toml') return '配置 Gitleaks secrets 扫描规则、允许项和仓库安全门禁。';
  if (f.path.includes('acceptance-evidence.json')) return '记录本机服务器验收命令、检查结果和证据状态，作为可机器读取的验收快照。';
  if (f.path.includes('manifest.json')) return '定义 ShopMate Ozon 证据采集浏览器扩展的权限、页面、content scripts 和主机范围。';
  if (f.path.endsWith('package.json')) return '定义浏览器扩展包元数据与本地脚本。';
  if (f.path.endsWith('options.html')) return '提供浏览器扩展配置页面的静态 HTML 结构。';
  if (f.path.endsWith('popup.html')) return '提供浏览器扩展弹窗的采集状态与操作界面结构。';
  if (f.path.endsWith('styles.css')) return '定义浏览器扩展弹窗和配置页面的共享视觉样式。';
  if (f.path.includes('agent-lifecycle-v2.json')) return '定义智能体生命周期 v2 的状态、终态、事件和允许迁移，作为跨运行时状态机契约。';
  if (f.path.includes('agent-tasks.contract.json')) return '定义平台与外部智能体之间的任务传输、请求和结果契约，覆盖各类电商任务 schema。';
  if (f.path.includes('semantic-concept-key-vectors.json')) return '提供语义概念键向量词典，用于跨组件对齐业务概念与同义表达。';
  if (f.fileCategory === 'docs') return `文档“${first ?? path.posix.basename(f.path)}”${count ? `包含 ${count} 个结构化章节` : ''}，记录相关目标、实施规则、证据与验收结论。`;
  return `配置文件 ${path.posix.basename(f.path)} 管理项目运行或工具行为。`;
}
function tags(f, type) {
  if (type === 'pipeline') return ['ci-cd', 'github-actions', 'automation'];
  if (type === 'service') return ['infrastructure', 'containerization', 'orchestration'];
  if (type === 'document') {
    if (f.path.includes('/ops/')) return ['documentation', 'operations', 'runbook'];
    if (f.path.includes('acceptance') || f.path.includes('验收')) return ['documentation', 'acceptance', 'evidence'];
    return ['documentation', 'architecture', 'planning'];
  }
  if (type === 'config') return ['configuration', f.path.includes('contracts/') ? 'api-contract' : 'build-system', 'governance'];
  if (f.path.endsWith('.sql')) return ['database', 'validation', 'migration'];
  if (f.fileCategory === 'markup') return ['frontend', 'browser-extension', 'markup'];
  return ['configuration', 'browser-extension', 'frontend'];
}
const nodes = batch.files.map((f) => {
  const r = byPath.get(f.path); if (!r) throw new Error(`Missing ${f.path}`);
  const type = nodeType(f);
  return { id: id(type, f.path), type, name: path.posix.basename(f.path), filePath: f.path, summary: summary(f, r), tags: tags(f, type), complexity: complexity(r.nonEmptyLines), ...(f.fileCategory === 'docs' && (r.sections?.length ?? 0) > 20 ? { languageNotes: 'Markdown 使用多级标题组织阶段、证据、门禁和验收标准。' } : {}) };
});
const edges = [];
const imports = batch.files.reduce((s, f) => s + (batch.batchImportData[f.path] ?? []).length, 0);
if (imports !== 0) throw new Error(`Unexpected imports ${imports}`);
if (new Set(nodes.map((x) => x.id)).size !== nodes.length) throw new Error('Duplicate IDs');
const out = path.join(root, 'intermediate', `batch-${i}.json`);
fs.writeFileSync(out, `${JSON.stringify({ nodes, edges }, null, 2)}\n`, 'utf8');
const check = JSON.parse(fs.readFileSync(out, 'utf8'));
if (check.nodes.length !== batch.files.length) throw new Error('Coverage mismatch');
console.log(JSON.stringify({ batchIndex: i, output: `batch-${i}.json`, nodes: nodes.length, edges: 0, filesSkipped: ext.filesSkipped }, null, 2));
