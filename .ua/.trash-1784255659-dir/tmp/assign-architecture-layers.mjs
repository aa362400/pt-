import fs from 'node:fs';

const input = JSON.parse(fs.readFileSync('G:/平台/.ua/tmp/ua-arch-input.json', 'utf8'));
const buckets = {
  'layer:frontend-ui': [],
  'layer:frontend-api': [],
  'layer:backend-domain': [],
  'layer:backend-platform': [],
  'layer:external-agent': [],
  'layer:data-contracts': [],
  'layer:test-quality': [],
  'layer:infrastructure': [],
  'layer:configuration': [],
  'layer:documentation': [],
};

function assign(node) {
  const p = node.filePath.replaceAll('\\', '/');
  const lower = p.toLowerCase();
  if (node.type === 'document') return 'layer:documentation';
  if (node.type === 'config') return 'layer:configuration';
  if (['service', 'pipeline', 'resource'].includes(node.type)) return 'layer:infrastructure';
  if (['table', 'schema', 'endpoint'].includes(node.type)) return 'layer:data-contracts';
  if (/(^|\/)(test|tests|__tests__|\.pytest-tmp)(\/|$)/i.test(p) || /(^|\/)(test_.*\.py|.*\.(spec|test)\.[^.]+)$/i.test(p) || /\/k6\//i.test(p)) return 'layer:test-quality';
  if (/\.sql$/i.test(p) || /\/prisma\//i.test(p) || /(^|\/)contracts\//i.test(p) || /\.(csv|xlsx|prisma)$/i.test(p) || /\/data\//i.test(p)) return 'layer:data-contracts';
  if (/(^|\/)(\.github\/workflows|k8s|infra|nginx|release)(\/|$)/i.test(p) || /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*)$/i.test(p) || /(^|\/)scripts\//i.test(p) || /verify-platform-release\.mjs$/i.test(p)) return 'layer:infrastructure';
  if (p.startsWith('智能体前端/')) return p.includes('/src/api/') ? 'layer:frontend-api' : 'layer:frontend-ui';
  if (p.startsWith('browser-extension/')) return 'layer:frontend-ui';
  if (p.startsWith('电商设计图保持产品一致性智能体/')) return 'layer:external-agent';
  if (p.startsWith('后端/src/features/') || p.startsWith('后端/src/agents/')) return 'layer:backend-domain';
  if (p.startsWith('后端/')) return 'layer:backend-platform';
  if (lower.startsWith('public/')) return 'layer:frontend-ui';
  return 'layer:backend-platform';
}

for (const node of input.fileNodes) buckets[assign(node)].push(node.id);

const definitions = [
  ['layer:frontend-ui', '前端 UI 层', '智能体前端与浏览器扩展的路由、页面、组件、认证交互、国际化和视觉资源。'],
  ['layer:frontend-api', '前端数据访问层', '封装前端对后端业务、智能体、审批、渠道和实时事件 API 的类型化访问与数据映射。'],
  ['layer:backend-domain', '后端业务与 API 层', '承载 NestJS 领域模块、控制器与服务，覆盖商品研究、Listing、自动化、审批、渠道和企业运营能力。'],
  ['layer:backend-platform', '后端平台与共享运行时', '提供认证、租户隔离、队列、可观测性、存储、权限、Worker、CLI 与应用启动等共享运行能力。'],
  ['layer:external-agent', '外部智能体运行层', '实现 Python 电商图片智能体的 Web 路由、生成引擎、平台同步、风险门禁、知识检索与自动执行。'],
  ['layer:data-contracts', '数据与契约层', '集中数据库 schema、Prisma migrations、SQL 治理、跨运行时契约以及定价和验收数据制品。'],
  ['layer:test-quality', '测试与质量层', '覆盖后端、前端、Python 智能体、迁移、负载和安全回归测试及其执行场景。'],
  ['layer:infrastructure', '基础设施与交付层', '包含 Docker、Compose、Kubernetes、Nginx、GitHub Actions、发布脚本和云基础设施定义。'],
  ['layer:configuration', '配置与构建层', '汇总环境变量、包清单、编译器、工具链、场景模板、本地化字典和运行参数配置。'],
  ['layer:documentation', '文档与知识层', '沉淀架构、ADR、运维、安全、验收、路线图、Agent Skill、Wiki 与电商领域知识。'],
];
const layers = definitions.map(([id, name, description]) => ({ id, name, description, nodeIds: buckets[id] }));
for (const layer of layers) if (!layer.nodeIds.length) throw new Error(`Empty layer ${layer.id}`);
const assigned = layers.flatMap((layer) => layer.nodeIds);
if (assigned.length !== input.fileNodes.length || new Set(assigned).size !== assigned.length) throw new Error('Assignment count or uniqueness failure');
const inputIds = new Set(input.fileNodes.map((node) => node.id));
if (assigned.some((id) => !inputIds.has(id)) || input.fileNodes.some((node) => !assigned.includes(node.id))) throw new Error('Assignment coverage failure');
fs.writeFileSync('G:/平台/.ua/intermediate/layers.json', `${JSON.stringify(layers, null, 2)}\n`, 'utf8');
JSON.parse(fs.readFileSync('G:/平台/.ua/intermediate/layers.json', 'utf8'));
console.log(JSON.stringify(Object.fromEntries(layers.map((layer) => [layer.name, layer.nodeIds.length])), null, 2));
