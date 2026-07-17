import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![31, 32, 33, 34, 35].includes(batchIndex)) throw new Error('Expected batch index 31 through 35');
const uaDir = 'G:/平台/.ua';
const raw = JSON.parse(fs.readFileSync(path.join(uaDir, 'intermediate', 'batches.json'), 'utf8'));
const batch = (Array.isArray(raw) ? raw : raw.batches).find((entry) => entry.batchIndex === batchIndex);
if (!batch) throw new Error(`Missing batch ${batchIndex}`);
const extraction = JSON.parse(fs.readFileSync(path.join(uaDir, 'tmp', `ua-file-extract-results-${batchIndex}.json`), 'utf8'));
if (!extraction.scriptCompleted || extraction.results.length !== batch.files.length) throw new Error(`Incomplete extraction ${batchIndex}`);

const summaries = {
  '智能体前端/src/App.tsx': '定义前端应用根组件，把页面渲染委托给 AppRouter。',
  '智能体前端/src/AppProviders.tsx': '组合认证、国际化、Toast 和其他全局 React providers，为整个应用提供共享上下文。',
  '智能体前端/src/components/ui/ErrorBoundary.tsx': '实现 React 错误边界，捕获子树渲染异常、记录诊断信息并显示可恢复的降级界面。',
  '智能体前端/src/components/ui/Toast.tsx': '提供 ToastProvider，维护短时通知队列并按类型渲染成功、错误、警告和信息提示。',
  '智能体前端/src/components/ui/toast-context.ts': '声明 Toast React Context 及其公开类型，解耦通知状态与消费组件。',
  '智能体前端/src/components/ui/toast-types.ts': '定义 Toast 消息、类型和上下文操作的 TypeScript 接口。',
  '智能体前端/src/i18n/I18nProvider.tsx': '提供国际化 React Context，维护当前语言并暴露类型化翻译函数。',
  '智能体前端/src/i18n/LanguageSwitcher.tsx': '渲染语言切换控件，通过国际化上下文更新当前 locale。',
  '智能体前端/src/i18n/index.ts': '定义支持的语言、翻译字典和国际化共享类型。',
  '智能体前端/src/i18n/useI18n.ts': '声明国际化上下文并提供 useI18n hook，确保消费者位于 I18nProvider 内。',
  '智能体前端/src/main.tsx': '作为 Vite 前端入口，把 AppProviders 和 App 挂载到 DOM 根节点。',
  '后端/src/features/files/files.controller.ts': '提供文件上传、列表、下载和删除接口，并把当前用户与工作区范围传给 FilesService。',
  '后端/src/features/files/files.dto.ts': '定义文件上传和列表查询 DTO，约束文件名、MIME、Base64 内容、用途与工作区。',
  '后端/src/features/files/files.module.ts': '组装文件控制器、服务和存储模块的 NestJS 功能模块。',
  '后端/src/features/files/files.service.ts': '在租户与所有者边界内校验、存储、查询和删除文件，并支持安全读取图片 data URL。',
  '后端/src/shared/storage/file-validator.service.ts': '校验上传大小、MIME magic bytes，并对支持的图片执行重编码以消除隐藏载荷。',
  '后端/src/shared/storage/s3-storage.service.ts': '通过 S3 兼容客户端实现对象上传、下载、删除和 URL 生成，封装 bucket 与 endpoint 配置。',
  '后端/src/shared/storage/storage.module.ts': '根据运行配置装配本地或 S3 存储 provider，并导出统一存储令牌。',
  '后端/src/shared/storage/storage.service.ts': '实现受 uploadDir 边界保护的本地文件存储，提供上传、下载、删除与公开 URL。',
  '后端/src/workers/export.worker.ts': '消费导出队列作业，生成 CSV 文件并记录完成或失败状态。',
  '后端/src/features/profit-calculator/ozon-pricing-workbook-import.service.ts': '解析 Ozon 定价 Excel 工作簿，校验表头和行值，将有效行转换为定价输入并分块计算。',
  '后端/src/features/profit-calculator/profit-calculator.controller.ts': '提供通用利润、Ozon 单条与批量定价、工作簿导入及历史记录查询接口。',
  '后端/src/features/profit-calculator/profit-calculator.dto.ts': '定义通用利润和 Ozon 定价请求 DTO，覆盖完整成本、物流、费率、重量、证据来源与持久化选项。',
  '后端/src/features/profit-calculator/profit-calculator.module.ts': '组装利润计算控制器、服务、Ozon 工作簿导入和智能体工具依赖。',
  '后端/src/features/profit-calculator/profit-calculator.service.ts': '执行通用利润与 Ozon 定价计算，校验物理输入和可信证据，并在租户边界内持久化结果。',
  '后端/test/ozon-pricing-workbook-import.spec.ts': '验证 Ozon 定价工作簿的解码、表头校验、行转换、分块计算和错误处理。',
  '后端/test/ozon-pricing.spec.ts': '验证 Ozon 定价公式、物理输入门禁、阻断原因和批量结果。',
  '后端/test/profit-calculator-tenant.spec.ts': '验证利润计算历史记录和商品关联遵守组织与工作区租户边界。',
  '后端/scripts/migrations/freeze-baseline.mjs': '冻结当前数据库 migration 基线，记录迁移清单与校验哈希供后续治理验证。',
  '后端/scripts/migrations/governance-lib.mjs': '提供 migration 治理脚本共享的路径解析、JSON 读取、SHA-256 和递归文件枚举工具。',
  '后端/scripts/migrations/register-release-migration.mjs': '把新的 release migration 注册到治理 manifest，并校验名称、顺序和基线状态。',
  '后端/scripts/migrations/resolve-baseline.mjs': '解析并确认数据库 migration 基线，更新治理 manifest 中的处置记录。',
  '后端/scripts/migrations/verify-database-drift.mjs': '调用 Prisma drift 检查并把数据库 schema 偏移转换为发布门禁结果。',
  '后端/scripts/migrations/verify-migration-governance.mjs': '验证基线、release migrations 和部署入口符合治理规则，并汇总所有阻断问题。',
  '后端/src/bootstrap/http-application.ts': '集中配置 NestJS HTTP 应用的 CORS、验证管道、异常过滤器、API 前缀和 Swagger。',
  '后端/src/instrumentation.ts': '在应用启动前初始化 OpenTelemetry instrumentation，并按环境配置启用追踪导出。',
  '后端/src/main.ts': '后端进程入口，创建 NestJS 应用、应用统一 HTTP 配置并监听目标端口。',
  '后端/src/shared/errors/filters.ts': '实现全局异常过滤器，把 NestJS、领域和未知错误转换为统一 HTTP 错误响应并记录上下文。',
  '后端/test/http-application.spec.ts': '验证 HTTP 应用统一配置，包括 CORS、全局验证、异常过滤和 API 前缀。',
};

function complexity(lines) { return lines < 50 ? 'simple' : lines <= 200 ? 'moderate' : 'complex'; }
function isTest(filePath) { return filePath.includes('/test/'); }
function tags(filePath, name, type) {
  if (isTest(filePath)) return ['test', 'jest', filePath.includes('ozon') ? 'ozon-pricing' : 'backend'];
  if (filePath.includes('/scripts/migrations/')) return [type === 'function' ? 'utility' : 'migration', 'database', 'governance'];
  if (filePath.startsWith('智能体前端/')) {
    if (filePath.includes('/i18n/')) return [type === 'function' ? 'hook' : 'internationalization', 'react', 'frontend'];
    if (filePath.includes('toast')) return ['component', 'react', 'notification'];
    if (name === 'ErrorBoundary') return ['component', 'react', 'error-handling'];
    return ['component', 'react', 'frontend'];
  }
  if (name.endsWith('Dto')) return ['data-model', 'validation', 'api-contract'];
  if (name.endsWith('Module')) return ['nestjs-module', 'dependency-injection', 'configuration'];
  if (name.endsWith('Controller')) return ['api-handler', 'nestjs', 'tenant-scope'];
  if (name.endsWith('Worker')) return ['worker', 'queue', 'export'];
  if (filePath.includes('/storage/')) return ['storage', 'security', 'backend'];
  if (filePath.includes('profit-calculator')) return ['service', 'profit-calculation', 'ozon-pricing'];
  if (filePath.includes('/bootstrap/') || filePath.endsWith('/main.ts')) return ['entry-point', 'nestjs', 'configuration'];
  if (filePath.includes('/errors/')) return ['error-handling', 'nestjs', 'logging'];
  return ['service', 'nestjs', 'backend'];
}
function symbolSummary(name, filePath, kind, item) {
  if (kind === 'class') {
    if (name === 'ErrorBoundary') return '捕获 React 子树错误并渲染带重试能力的降级界面。';
    if (name.endsWith('Dto')) return `定义并校验 ${((item.properties ?? []).join('、') || '请求')} 字段。`;
    if (name.endsWith('Module')) return '组装并导出该功能所需的 NestJS providers 与 controllers。';
    if (name.endsWith('Controller')) return `暴露 ${name.replace('Controller', '')} 相关 HTTP 接口。`;
    if (name.endsWith('Worker')) return '消费导出队列任务并生成结果文件。';
    if (name === 'GlobalExceptionFilter') return '捕获所有应用异常并输出统一、可观测的 HTTP 错误结构。';
    return `${summaries[filePath].split('。')[0]}。`;
  }
  const special = {
    App: '渲染应用路由树的根 React 组件。', AppProviders: '按正确嵌套顺序组合应用级 React providers。',
    getToastClasses: '根据 Toast 类型选择颜色和边框样式。', ToastIcon: '根据通知类型渲染对应状态图标。',
    ToastProvider: '维护 Toast 队列并向子组件提供新增和移除通知操作。', I18nProvider: '维护当前语言并向组件树提供翻译函数。',
    LanguageSwitcher: '渲染并处理当前语言切换。', useI18n: '读取国际化上下文并校验 Provider 存在性。',
    scalar: '把工作簿单元格值规范化为可用于定价导入的标量。', logisticsValue: '从工作簿行中解析 Ozon 物流字段值。',
    workbookFixture: '生成包含定价表头和测试数据的内存 Excel 工作簿。', backendRootFromArgs: '从命令行参数解析并校验后端根目录。',
    resolveManifestPath: '解析 migration 治理 manifest 的绝对路径。', pathExists: '异步检查目标路径是否存在。',
    sha256File: '计算文件内容的 SHA-256 哈希。', readJson: '读取并解析 UTF-8 JSON 文件。', listMigrations: '枚举并排序 Prisma migration 目录。',
    resolveStoredPath: '把 manifest 中存储的相对路径解析到后端根目录。', listFilesRecursively: '递归枚举目录内所有文件并稳定排序。',
    relativePortable: '生成使用正斜杠的可移植相对路径。', verifyBaseline: '验证已冻结 migration 基线的路径、文件和哈希完整性。',
    verifyReleaseMigration: '验证 release migration 的注册、命名、顺序和内容完整性。', verifyDeploymentEntrypoints: '检查部署入口是否执行 migration 治理与数据库更新。',
    main: '执行完整 migration 治理验证并根据阻断问题设置退出码。', resolveCorsOptions: '根据环境配置解析允许来源和凭据策略。',
    configureHttpApplication: '为 NestJS 应用安装统一的 CORS、验证、错误处理、前缀和 Swagger 配置。', bootstrap: '创建并配置 NestJS 应用，然后监听配置端口。',
  };
  return special[name] ?? `实现 ${name}，为所属模块提供可复用的数据处理逻辑。`;
}
function exported(result, name, kind) {
  if ((result.exports ?? []).some((entry) => entry.name === name)) return true;
  if ((result.exports ?? []).some((entry) => entry.isDefault || entry.name === 'default')) {
    const candidates = kind === 'class' ? result.classes ?? [] : result.functions ?? [];
    return candidates.length === 1 && candidates[0].name === name;
  }
  return false;
}

const resultByPath = new Map(extraction.results.map((entry) => [entry.path, entry]));
const nodes = [], edges = [];
for (const file of batch.files) {
  const result = resultByPath.get(file.path);
  if (!result) throw new Error(`Missing result ${file.path}`);
  if (!summaries[file.path]) throw new Error(`Missing summary ${file.path}`);
  const fileId = `file:${file.path}`;
  nodes.push({ id: fileId, type: 'file', name: path.posix.basename(file.path), filePath: file.path, summary: summaries[file.path], tags: tags(file.path, '', 'file'), complexity: complexity(result.nonEmptyLines), ...(file.path.endsWith('.tsx') ? { languageNotes: '使用 TypeScript React 与 hooks 实现类型化组件和上下文组合。' } : {}) });
  for (const imported of batch.batchImportData[file.path] ?? []) edges.push({ source: fileId, target: `file:${imported}`, type: 'imports', direction: 'forward', weight: 0.7 });
  for (const fn of result.functions ?? []) {
    const isExported = exported(result, fn.name, 'function');
    const lines = fn.endLine - fn.startLine + 1;
    if (lines < 10 && !isExported) continue;
    const id = `function:${file.path}:${fn.name}`;
    nodes.push({ id, type: 'function', name: fn.name, filePath: file.path, lineRange: [fn.startLine, fn.endLine], summary: symbolSummary(fn.name, file.path, 'function', fn), tags: tags(file.path, fn.name, 'function'), complexity: complexity(lines) });
    edges.push({ source: fileId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (isExported) edges.push({ source: fileId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
  for (const cls of result.classes ?? []) {
    const isExported = exported(result, cls.name, 'class');
    const lines = cls.endLine - cls.startLine + 1;
    if ((cls.methods?.length ?? 0) < 2 && lines < 20 && !isExported) continue;
    const id = `class:${file.path}:${cls.name}`;
    nodes.push({ id, type: 'class', name: cls.name, filePath: file.path, lineRange: [cls.startLine, cls.endLine], summary: symbolSummary(cls.name, file.path, 'class', cls), tags: tags(file.path, cls.name, 'class'), complexity: complexity(lines) });
    edges.push({ source: fileId, target: id, type: 'contains', direction: 'forward', weight: 1.0 });
    if (isExported) edges.push({ source: fileId, target: id, type: 'exports', direction: 'forward', weight: 0.8 });
  }
}
const expectedImports = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
const imports = edges.filter((edge) => edge.type === 'imports').length;
if (imports !== expectedImports) throw new Error(`Import mismatch ${imports}/${expectedImports}`);
if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error('Duplicate nodes');
const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedFiles = [...batch.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const filesPerPart = Math.ceil(sortedFiles.length / partCount);
const written = [];
for (let part = 1; part <= partCount; part += 1) {
  const partFiles = sortedFiles.slice((part - 1) * filesPerPart, part * filesPerPart).map((entry) => entry.path);
  const fileSet = new Set(partFiles);
  const partNodes = nodes.filter((node) => fileSet.has(node.filePath));
  const ids = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => ids.has(edge.source));
  const allowed = new Set(partFiles.flatMap((filePath) => [...(batch.batchImportData[filePath] ?? []), ...(batch.neighborMap[filePath] ?? []).map((entry) => entry.path)]).map((filePath) => `file:${filePath}`));
  for (const edge of partEdges) if (!ids.has(edge.target) && !allowed.has(edge.target)) throw new Error(`Invalid target ${batchIndex}/${part}: ${edge.target}`);
  const outputName = partCount === 1 ? `batch-${batchIndex}.json` : `batch-${batchIndex}-part-${part}.json`;
  const outputPath = path.join(uaDir, 'intermediate', outputName);
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  written.push({ outputName, nodes: partNodes.length, edges: partEdges.length });
}
console.log(JSON.stringify({ batchIndex, totalNodes: nodes.length, totalEdges: edges.length, importEdges: imports, expectedImports, parts: written, filesSkipped: extraction.filesSkipped }, null, 2));
