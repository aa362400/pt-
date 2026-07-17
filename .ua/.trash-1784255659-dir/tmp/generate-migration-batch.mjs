import fs from 'node:fs';
import path from 'node:path';

const batchIndex = Number(process.argv[2]);
if (batchIndex < 61 || batchIndex > 70) throw new Error('Expected migration batch 61 through 70');
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

const specs = {
  61: {
    targets: ['supplier_quote_evidence'],
    summary: '新增不可变供应商报价证据，记录租户、候选、报价、变体、物流、哈希和有效期，并配置唯一索引、外键、RLS 与写后不可变触发器。',
  },
  62: {
    targets: ['supplier_image_search_evidence'],
    summary: '新增供应商以图搜货证据，绑定组织、工作区、研究运行和候选，保存源图、报价、匹配结果与抓取快照，并强化关联实体和来源健康证据的租户一致性。',
  },
  63: {
    targets: ['supplier_quote_evidence'],
    summary: '强化供应商报价证据的工作区作用域键，回填并设为非空，替换去重索引并增加跨组织、工作区、运行和候选的一致性约束。',
  },
  64: {
    targets: ['candidate_economics_evidence', 'candidate_economics_evaluations', 'candidate_economics_evaluation_inputs', 'product_launches', 'listing_publish_snapshots', 'external_submissions'],
    summary: '建立候选经济证据、可信评估和评估输入关系，将通过的评估证明绑定到商品发布、Listing 快照和外部提交，并实施索引、外键、RLS 与不可变保护。',
  },
  65: {
    targets: ['listing_publish_snapshots', 'external_submissions'],
    summary: '强化发布经济证明数据库门禁，要求 VERIFIED/PASS 评估具备完整不可变输入、有效利润阈值和未过期证据，阻止快照或外部提交绑定空壳评估。',
  },
  66: {
    targets: ['listing_publish_snapshots', 'product_risk_records'],
    summary: '要求 v3 发布快照同时携带候选级和最终 Listing 级签名风险放行证据，校验 HMAC 形状、主体绑定、时效和不可变风险记录。',
  },
  67: {
    targets: ['product_research_runs'],
    summary: '把每日选品运行的 candidateLimit 数据库默认值从 300 调整为 10，使未显式指定的批次采用更保守的候选规模。',
  },
  68: {
    targets: ['organization_agent_controls', 'product_research_runs', 'automation_runs'],
    summary: '新增持久化组织 Agent 控制状态，并为选品运行和自动化运行加入控制修订与检查点字段，以支持暂停、停止、恢复和跨进程协调。',
  },
  69: {
    targets: ['product_research_runs', 'automation_runs'],
    summary: '校验自动化运行状态枚举约束，并为选品运行和自动化运行增加面向控制检查点与恢复扫描的复合索引。',
  },
  70: {
    targets: ['product_research_runs'],
    summary: '为每日选品 worker 增加持久、单调的执行 fence，包括租约所有者、到期时间、执行 epoch 约束和租约扫描索引。',
  },
};

const spec = specs[batchIndex];

function complexity(nonEmptyLines) {
  if (nonEmptyLines > 200) return 'complex';
  if (nonEmptyLines >= 50) return 'moderate';
  return 'simple';
}

function sqlNotes(source) {
  const notes = [];
  if (/ROW LEVEL SECURITY/i.test(source)) notes.push('RLS');
  if (/CREATE (?:OR REPLACE )?FUNCTION|CREATE TRIGGER/i.test(source)) notes.push('PL/pgSQL trigger');
  if (/lock_timeout/i.test(source)) notes.push('显式锁超时');
  if (/FORWARD_ONLY/i.test(source)) notes.push('仅前向回滚策略');
  return notes.length ? `该 PostgreSQL 迁移采用${notes.join('、')}控制上线安全边界。` : undefined;
}

const resultByName = new Map(extraction.results.map((result) => [path.posix.basename(result.path), result]));
const metadata = resultByName.get('metadata.json');
const migration = resultByName.get('migration.sql');
const rollback = resultByName.get('rollback.sql');
if (!metadata || !migration || !rollback) throw new Error(`Batch ${batchIndex} is missing a migration artifact`);

const extractedTables = (migration.definitions ?? [])
  .filter((definition) => definition.kind === 'table')
  .map((definition) => definition.name);
const targets = [...new Set([...extractedTables, ...spec.targets])];
const definitionByName = new Map((migration.definitions ?? []).map((definition) => [definition.name, definition]));
const nodes = [];
const edges = [];

const metadataNode = {
  id: `config:${metadata.path}`,
  type: 'config',
  name: 'metadata.json',
  filePath: metadata.path,
  summary: `记录迁移 ${path.posix.basename(path.posix.dirname(metadata.path))} 的发布编号、负责人、风险级别、回滚模式、兼容性、数据迁移和验证命令。`,
  tags: ['configuration', 'migration', 'release-metadata', 'database'],
  complexity: complexity(metadata.nonEmptyLines),
};
nodes.push(metadataNode);

const migrationNodes = new Map();
for (const tableName of targets) {
  const definition = definitionByName.get(tableName);
  const node = {
    id: `table:${migration.path}:${tableName}`,
    type: 'table',
    name: tableName,
    filePath: migration.path,
    summary: `${spec.summary} 此节点表示迁移对 ${tableName} 表的结构与约束变更。`,
    tags: ['database', 'migration', 'postgresql', 'schema-definition'],
    complexity: complexity(migration.nonEmptyLines),
  };
  if (definition) node.lineRange = [definition.startLine, definition.endLine];
  const notes = sqlNotes(fs.readFileSync(`${root}/${migration.path}`, 'utf8'));
  if (notes) node.languageNotes = notes;
  nodes.push(node);
  migrationNodes.set(tableName, node);
  edges.push({ source: metadataNode.id, target: node.id, type: 'configures', direction: 'forward', weight: 0.6 });
}

const rollbackSource = fs.readFileSync(`${root}/${rollback.path}`, 'utf8');
for (const tableName of targets) {
  const forwardOnly = /FORWARD_ONLY/i.test(rollbackSource);
  const node = {
    id: `table:${rollback.path}:${tableName}`,
    type: 'table',
    name: `${tableName}-rollback`,
    filePath: rollback.path,
    summary: forwardOnly
      ? `声明 ${tableName} 的本次强化为仅前向变更；若上线后已接受新写入，应继续前滚或从已验证备份恢复，不能削弱数据库门禁。`
      : `回滚 ${tableName} 的本次 schema 变更，恢复迁移前的列、索引、约束或表结构。`,
    tags: forwardOnly
      ? ['database', 'migration', 'forward-only', 'rollback-policy']
      : ['database', 'migration', 'rollback', 'schema-definition'],
    complexity: complexity(rollback.nonEmptyLines),
  };
  const notes = sqlNotes(rollbackSource);
  if (notes) node.languageNotes = notes;
  nodes.push(node);
  edges.push({ source: node.id, target: migrationNodes.get(tableName).id, type: 'migrates', direction: 'forward', weight: 0.7 });
}

const expectedFiles = new Set(batch.files.map((file) => file.path));
const coveredFiles = new Set(nodes.map((node) => node.filePath));
for (const filePath of expectedFiles) if (!coveredFiles.has(filePath)) throw new Error(`Missing file coverage: ${filePath}`);
const importExpected = batch.files.reduce((sum, file) => sum + (batch.batchImportData[file.path] ?? []).length, 0);
if (importExpected !== 0) throw new Error(`Unexpected imports in migration batch ${batchIndex}`);
const ids = new Set(nodes.map((node) => node.id));
if (ids.size !== nodes.length) throw new Error('Duplicate node IDs detected');
for (const node of nodes) {
  if (!node.summary || !Array.isArray(node.tags) || node.tags.length < 3) throw new Error(`Invalid node ${node.id}`);
}
for (const edge of edges) {
  if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error(`Invalid edge ${edge.source} -> ${edge.target}`);
  if (edge.source === edge.target) throw new Error(`Self edge ${edge.source}`);
}

const outputPath = `${uaDir}/intermediate/batch-${batchIndex}.json`;
fs.writeFileSync(outputPath, `${JSON.stringify({ nodes, edges }, null, 2)}\n`, 'utf8');
JSON.parse(fs.readFileSync(outputPath, 'utf8'));
console.log(JSON.stringify({ batchIndex, partCount: 1, nodeCount: nodes.length, edgeCount: edges.length, importExpected, filesSkipped: extraction.filesSkipped ?? [] }));
