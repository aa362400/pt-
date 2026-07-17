import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![89, 90].includes(batchIndex)) throw new Error('Expected schema batch 89 or 90');
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

function complexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines >= 50) return 'moderate';
  return 'simple';
}

function migrationLabel(filePath) {
  const parent = path.posix.basename(path.posix.dirname(filePath));
  if (parent === 'v1-baseline') return 'v1 数据库基线';
  if (parent === 'migration-template') return '迁移模板';
  return parent.replace(/^\d+_?/, '').replaceAll('_', ' ');
}

function configSummary(filePath, sections = []) {
  if (filePath.endsWith('alertmanager.yml')) return '配置 Alertmanager 告警分组、路由、抑制和通知接收器。';
  if (filePath.includes('/grafana/dashboards/error-budget-panel.json')) return '定义 Grafana error budget 与 SLO 消耗可视化面板、查询和阈值。';
  if (filePath.includes('/grafana/dashboards/shopmate-overview.json')) return '定义 ShopMate 平台总览 Grafana dashboard，汇集 API、队列、Agent、数据库和业务健康指标。';
  if (filePath.includes('/grafana/datasources/')) return '配置 Grafana 的 Prometheus datasource 及默认连接参数。';
  if (filePath.includes('/grafana/provisioning/')) return '配置 Grafana dashboard 自动发现和文件 provisioning。';
  if (filePath.includes('/otel-collector/')) return '配置 OpenTelemetry Collector 的接收器、处理器、导出器和遥测流水线。';
  if (filePath.endsWith('metadata.json')) return '提供新 Prisma 迁移的发布负责人、风险、回滚、兼容性和验证元数据模板。';
  return `配置 ${path.posix.basename(filePath)}，包含 ${sections.length} 个顶层配置区段。`;
}

function configTags(filePath) {
  if (filePath.includes('/monitoring/')) return ['configuration', 'monitoring', 'observability', 'operations'];
  return ['configuration', 'database', 'migration', 'template'];
}

function sqlFallbackName(filePath) {
  const parent = path.posix.basename(path.posix.dirname(filePath));
  return parent === 'migration-template' ? 'migration-template' : parent;
}

const fileByPath = new Map(batch.files.map((file) => [file.path, file]));
const nodes = [];
const edges = [];
const fileNodes = new Map();
const sqlNodesByPath = new Map();

for (const result of extraction.results) {
  const file = fileByPath.get(result.path);
  const name = path.posix.basename(file.path);
  if (file.fileCategory === 'config') {
    const node = {
      id: `config:${file.path}`, type: 'config', name, filePath: file.path,
      summary: configSummary(file.path, result.sections ?? []),
      tags: configTags(file.path), complexity: complexity(result.nonEmptyLines),
    };
    nodes.push(node); fileNodes.set(file.path, node);
    continue;
  }
  if (file.fileCategory === 'infra') {
    const node = {
      id: `service:${file.path}`, type: 'service', name, filePath: file.path,
      summary: '编排 Prometheus、Grafana、Alertmanager 和 OpenTelemetry Collector 监控栈，声明网络、端口、卷和配置挂载。',
      tags: ['infrastructure', 'monitoring', 'orchestration', 'observability'],
      complexity: complexity(result.nonEmptyLines),
    };
    nodes.push(node); fileNodes.set(file.path, node);
    for (const service of result.services ?? []) {
      const child = {
        id: `service:${file.path}:${service.name}`, type: 'service', name: service.name, filePath: file.path,
        lineRange: [service.startLine, service.endLine],
        summary: `定义监控栈中的 ${service.name} 容器服务，使用 ${service.image || '声明的镜像'} 并配置相关端口。`,
        tags: ['service', 'monitoring', 'container'], complexity: complexity(service.endLine - service.startLine + 1),
      };
      nodes.push(child);
      edges.push({ source: node.id, target: child.id, type: 'related', direction: 'forward', weight: 0.5 });
    }
    continue;
  }
  if (file.fileCategory === 'data' && name.endsWith('.prisma')) {
    const node = {
      id: `schema:${file.path}`, type: 'schema', name, filePath: file.path,
      summary: '定义 ShopMate v1 Prisma 数据模型、枚举、关系、索引和数据库映射，是后端持久化层的完整类型化 schema 基线。',
      tags: ['database', 'schema-definition', 'prisma', 'data-model'],
      complexity: complexity(result.nonEmptyLines),
      languageNotes: 'Prisma schema 将应用层模型与 PostgreSQL 表、关系和复合索引保持在同一类型源中。',
    };
    nodes.push(node); fileNodes.set(file.path, node);
    continue;
  }
  if (file.fileCategory === 'data' && name.endsWith('.sql')) {
    const tableDefinitions = [
      ...new Map(
        (result.definitions ?? [])
          .filter((definition) => definition.kind === 'table')
          .map((definition) => [definition.name, definition]),
      ).values(),
    ];
    const definitions = tableDefinitions.length ? tableDefinitions : [{ name: sqlFallbackName(file.path) }];
    const list = [];
    for (const definition of definitions) {
      const node = {
        id: `table:${file.path}:${definition.name}`, type: 'table', name: definition.name, filePath: file.path,
        summary: tableDefinitions.length
          ? `在${migrationLabel(file.path)}中定义 ${definition.name} 表及其字段、约束、索引和关系。`
          : `表示${migrationLabel(file.path)} SQL 变更，调整现有表、枚举、索引、约束或数据，而不新建独立表。`,
        tags: ['database', 'migration', 'postgresql', tableDefinitions.length ? 'schema-definition' : 'schema-change'],
        complexity: complexity(result.nonEmptyLines),
      };
      if (definition.startLine) node.lineRange = [definition.startLine, definition.endLine];
      nodes.push(node); list.push(node);
    }
    sqlNodesByPath.set(file.path, list);
    fileNodes.set(file.path, list[0]);
    continue;
  }

  const node = {
    id: `file:${file.path}`, type: 'file', name, filePath: file.path,
    summary: name === 'eslint.config.mjs'
      ? '配置后端 ESLint TypeScript 规则、解析器、忽略目录和格式化约束。'
      : `实现 ${name} 相关项目能力。`,
    tags: ['configuration', 'linting', 'typescript', 'code-quality'],
    complexity: complexity(result.nonEmptyLines),
  };
  nodes.push(node); fileNodes.set(file.path, node);
}

const monitoringCompose = batch.files.find((file) => file.path.endsWith('docker-compose.monitoring.yml'));
if (monitoringCompose) {
  const composeNode = fileNodes.get(monitoringCompose.path);
  for (const file of batch.files.filter((item) => item.fileCategory === 'config' && item.path.includes('/monitoring/'))) {
    edges.push({ source: fileNodes.get(file.path).id, target: composeNode.id, type: 'configures', direction: 'forward', weight: 0.6 });
  }
}

const baselineSql = batch.files.find((file) => file.path.endsWith('/baselines/v1-baseline/migration.sql'));
const baselineSchema = batch.files.find((file) => file.path.endsWith('/baselines/v1-baseline/schema.prisma'));
if (baselineSql && baselineSchema) {
  const baselineTables = sqlNodesByPath.get(baselineSql.path) ?? [];
  const schemaNode = fileNodes.get(baselineSchema.path);
  for (const tableNode of baselineTables) {
    edges.push({ source: schemaNode.id, target: tableNode.id, type: 'defines_schema', direction: 'forward', weight: 0.8 });
  }
}

const templateMetadata = batch.files.find((file) => file.path.endsWith('/migration-template/metadata.json'));
const templateRollback = batch.files.find((file) => file.path.endsWith('/migration-template/rollback.sql'));
if (templateMetadata && templateRollback) {
  edges.push({ source: fileNodes.get(templateMetadata.path).id, target: fileNodes.get(templateRollback.path).id, type: 'configures', direction: 'forward', weight: 0.6 });
}

const importExpected = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
if (importExpected !== 0) throw new Error(`Unexpected imports in batch ${batchIndex}`);
for (const file of batch.files) if (!nodes.some((node) => node.filePath === file.path)) throw new Error(`Missing file ${file.path}`);
const ids = new Set(nodes.map((node) => node.id));
if (ids.size !== nodes.length) throw new Error('Duplicate node IDs');
for (const edge of edges) if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error(`Invalid edge ${edge.source} -> ${edge.target}`);

const partCount = Math.ceil(Math.max(nodes.length / 60, edges.length / 120));
const sortedFiles = batch.files.map((file) => file.path).sort((a, b) => a.localeCompare(b, 'zh-CN'));
const filesPerPart = Math.ceil(sortedFiles.length / partCount);
for (let index = 0; index < partCount; index += 1) {
  const partFiles = new Set(sortedFiles.slice(index * filesPerPart, (index + 1) * filesPerPart));
  const partNodes = nodes.filter((node) => partFiles.has(node.filePath));
  const partIds = new Set(partNodes.map((node) => node.id));
  const partEdges = edges.filter((edge) => partIds.has(edge.source));
  for (const edge of partEdges) {
    if (!partIds.has(edge.target)) throw new Error(`Batch ${batchIndex} part ${index + 1} has cross-part target ${edge.target}`);
  }
  const outputPath = partCount === 1
    ? `${uaDir}/intermediate/batch-${batchIndex}.json`
    : `${uaDir}/intermediate/batch-${batchIndex}-part-${index + 1}.json`;
  fs.writeFileSync(outputPath, `${JSON.stringify({ nodes: partNodes, edges: partEdges }, null, 2)}\n`, 'utf8');
  JSON.parse(fs.readFileSync(outputPath, 'utf8'));
}
console.log(JSON.stringify({ batchIndex, partCount, nodeCount: nodes.length, edgeCount: edges.length, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
