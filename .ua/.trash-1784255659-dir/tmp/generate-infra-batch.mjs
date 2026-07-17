import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (![38, 39, 40].includes(batchIndex)) throw new Error('Expected infrastructure batch 38, 39, or 40');
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

function projectLabel(filePath) {
  if (filePath.startsWith('后端/')) return 'NestJS 后端';
  if (filePath.startsWith('智能体前端/')) return 'React 智能体前端';
  return '电商视觉一致性 Python Agent';
}

function fileSummary(filePath) {
  const name = path.posix.basename(filePath);
  const project = projectLabel(filePath);
  if (name === '.dockerignore') return `限定${project}的 Docker build context，排除依赖、构建产物、密钥、测试和运行时文件。`;
  if (name === 'docker-compose.yml' && filePath.startsWith('后端/')) return '定义后端本地开发所需的 PostgreSQL 16 与 Redis 7 服务、持久卷、端口和健康检查。';
  if (name === 'docker-compose.yml') return '编排电商视觉一致性 Agent 及其运行依赖，声明容器构建、环境、卷、端口和健康检查。';
  if (name === 'Dockerfile' && filePath.startsWith('后端/')) return '使用 Node 24 Alpine 多阶段构建 NestJS 后端，生成 Prisma client，以非 root 用户运行迁移与服务，并暴露 3000 端口和健康检查。';
  if (name === 'Dockerfile' && filePath.startsWith('智能体前端/')) return '构建 React/Vite 智能体前端的生产静态资源，并在精简运行镜像中提供 Web 服务。';
  return '构建电商视觉一致性 Python Agent 的运行镜像，安装依赖并配置受控入口和运行目录。';
}

function fileTags(filePath) {
  const name = path.posix.basename(filePath);
  if (name === '.dockerignore') return ['containerization', 'build-context', 'security'];
  if (name === 'docker-compose.yml') return ['orchestration', 'infrastructure', 'local-development'];
  return ['containerization', 'infrastructure', 'deployment', 'multi-stage-build'];
}

function languageNotes(filePath, result) {
  const name = path.posix.basename(filePath);
  if (name === 'Dockerfile' && (result.services ?? []).length > 1) return '采用多阶段 Docker build 分离编译依赖和运行时内容，以缩小攻击面与镜像体积。';
  if (name === 'docker-compose.yml') return '通过声明式 healthcheck 和持久卷提高本地依赖的可观察性与重启稳定性。';
  return undefined;
}

const nodes = [];
const edges = [];
const resultByPath = new Map(extraction.results.map((result) => [result.path, result]));

for (const result of extraction.results) {
  const name = path.posix.basename(result.path);
  const parent = {
    id: `service:${result.path}`,
    type: 'service',
    name,
    filePath: result.path,
    summary: fileSummary(result.path),
    tags: fileTags(result.path),
    complexity: complexity(result.nonEmptyLines),
  };
  const notes = languageNotes(result.path, result);
  if (notes) parent.languageNotes = notes;
  nodes.push(parent);

  for (const service of result.services ?? []) {
    const child = {
      id: `service:${result.path}:${service.name}`,
      type: 'service',
      name: service.name,
      filePath: result.path,
      summary: service.ports?.length
        ? `构建 ${service.image || '容器镜像'} 的 ${service.name} 阶段，并为运行时暴露 ${service.ports.join(', ')} 端口。`
        : `使用 ${service.image || '基础镜像'} 执行 ${service.name} 构建阶段，准备后续运行镜像所需产物。`,
      tags: service.ports?.length ? ['container', 'runtime-stage', 'deployment'] : ['container', 'build-stage', 'build-system'],
      complexity: complexity(service.endLine - service.startLine + 1),
      lineRange: [service.startLine, service.endLine],
    };
    nodes.push(child);
    edges.push({ source: parent.id, target: child.id, type: 'related', direction: 'forward', weight: 0.5 });
  }

  const stages = result.services ?? [];
  if (stages.length > 1) {
    for (let index = 1; index < stages.length; index += 1) {
      edges.push({
        source: `service:${result.path}:${stages[index].name}`,
        target: `service:${result.path}:${stages[index - 1].name}`,
        type: 'depends_on',
        direction: 'forward',
        weight: 0.6,
      });
    }
  }
}

const dockerfilePath = batch.files.find((file) => path.posix.basename(file.path) === 'Dockerfile')?.path;
const ignorePath = batch.files.find((file) => path.posix.basename(file.path) === '.dockerignore')?.path;
const composePath = batch.files.find((file) => path.posix.basename(file.path) === 'docker-compose.yml')?.path;
if (dockerfilePath && ignorePath) {
  edges.push({ source: `service:${ignorePath}`, target: `service:${dockerfilePath}`, type: 'configures', direction: 'forward', weight: 0.6 });
}
if (dockerfilePath && composePath) {
  edges.push({ source: `service:${composePath}`, target: `service:${dockerfilePath}`, type: 'depends_on', direction: 'forward', weight: 0.6 });
}

const importExpected = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
if (importExpected !== 0) throw new Error(`Unexpected imports in infra batch ${batchIndex}`);
const ids = new Set(nodes.map((node) => node.id));
if (ids.size !== nodes.length) throw new Error('Duplicate node IDs detected');
for (const node of nodes) {
  if (!node.summary || !Array.isArray(node.tags) || node.tags.length < 3) throw new Error(`Invalid node ${node.id}`);
}
for (const edge of edges) {
  if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error(`Invalid local edge ${edge.source} -> ${edge.target}`);
  if (edge.source === edge.target) throw new Error(`Self edge ${edge.source}`);
}

const outputPath = `${uaDir}/intermediate/batch-${batchIndex}.json`;
fs.writeFileSync(outputPath, `${JSON.stringify({ nodes, edges }, null, 2)}\n`, 'utf8');
JSON.parse(fs.readFileSync(outputPath, 'utf8'));
console.log(JSON.stringify({ batchIndex, partCount: 1, nodeCount: nodes.length, edgeCount: edges.length, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
