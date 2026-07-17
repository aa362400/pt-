import fs from 'node:fs';
import path from 'node:path';

const [inputPath, outputPath] = process.argv.slice(2);
try {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const nodes = input.fileNodes;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const segments = nodes.map((node) => node.filePath.replaceAll('\\', '/').split('/'));
  let common = [];
  if (segments.length) {
    for (let index = 0; index < Math.min(...segments.map((s) => s.length)); index += 1) {
      const value = segments[0][index];
      if (segments.every((s) => s[index] === value)) common.push(value); else break;
    }
  }
  if (common.length && nodes.some((node) => node.filePath.split('/').length === common.length)) common = [];
  const groupOf = (node) => {
    const parts = node.filePath.replaceAll('\\', '/').split('/');
    const rest = parts.slice(common.length);
    return rest.length > 1 ? rest[0] : 'root';
  };
  const directoryGroups = {}, nodeTypeGroups = {};
  for (const node of nodes) {
    (directoryGroups[groupOf(node)] ??= []).push(node.id);
    (nodeTypeGroups[node.type] ??= []).push(node.id);
  }
  const importEdges = input.importEdges.filter((e) => byId.has(e.source) && byId.has(e.target));
  const allEdges = input.allEdges.filter((e) => byId.has(e.source) && byId.has(e.target));
  const fanIn = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const fanOut = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  const pairCounts = new Map(), groupInternal = {}, groupTotal = {}, groupImports = {}, groupImportedBy = {};
  for (const group of Object.keys(directoryGroups)) { groupInternal[group] = 0; groupTotal[group] = 0; groupImports[group] = new Set(); groupImportedBy[group] = new Set(); }
  for (const edge of importEdges) {
    fanOut[edge.source] += 1; fanIn[edge.target] += 1;
    const a = groupOf(byId.get(edge.source)), b = groupOf(byId.get(edge.target));
    pairCounts.set(`${a}\0${b}`, (pairCounts.get(`${a}\0${b}`) ?? 0) + 1);
    groupTotal[a] += 1; if (a !== b) groupTotal[b] += 1;
    if (a === b) groupInternal[a] += 1; else { groupImports[a].add(b); groupImportedBy[b].add(a); }
  }
  const cross = new Map();
  for (const edge of allEdges) {
    const a = byId.get(edge.source).type, b = byId.get(edge.target).type, key = `${a}\0${b}\0${edge.type}`;
    cross.set(key, (cross.get(key) ?? 0) + 1);
  }
  const patterns = {
    api: /^(routes?|api|controllers?|endpoints?|handlers?|routers?|blueprints?)$/i,
    service: /^(services?|core|lib|domain|logic|internal|signals?|jobs?|channels?)$/i,
    data: /^(models?|db|data|persistence|repository|entities|migrations?|sql|database|schema)$/i,
    ui: /^(components?|views?|pages?|ui|layouts?|screens?|assets?|static|public)$/i,
    utility: /^(utils?|helpers?|common|shared|tools?|pkg)$/i,
    config: /^(config|constants|env|settings|management|commands)$/i,
    test: /^(__tests__|tests?|specs?)$/i,
    types: /^(types?|interfaces?|schemas?|contracts?|dtos?|dto|request|response)$/i,
    documentation: /^(docs?|documentation|wiki)$/i,
    infrastructure: /^(deploy|deployment|infra|infrastructure|k8s|kubernetes|helm|charts|terraform|tf|docker|nginx|release|scripts)$/i,
    'ci-cd': /^(\.github|\.gitlab|\.circleci)$/i,
  };
  const patternMatches = {};
  for (const group of Object.keys(directoryGroups)) patternMatches[group] = Object.entries(patterns).find(([, re]) => re.test(group))?.[0] ?? 'unclassified';
  const interGroupImports = [...pairCounts].filter(([key]) => key.split('\0')[0] !== key.split('\0')[1]).map(([key, count]) => { const [from, to] = key.split('\0'); return { from, to, count }; });
  const reverse = new Map(interGroupImports.map((x) => [`${x.from}\0${x.to}`, x.count]));
  const dependencyDirection = [];
  const seen = new Set();
  for (const row of interGroupImports) {
    const pair = [row.from, row.to].sort().join('\0'); if (seen.has(pair)) continue; seen.add(pair);
    const ab = reverse.get(`${row.from}\0${row.to}`) ?? 0, ba = reverse.get(`${row.to}\0${row.from}`) ?? 0;
    dependencyDirection.push(ab >= ba ? { dependent: row.from, dependsOn: row.to, count: ab } : { dependent: row.to, dependsOn: row.from, count: ba });
  }
  const filePaths = nodes.map((n) => n.filePath);
  const infraFiles = filePaths.filter((p) => /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*|k8s|kubernetes|infra|nginx|\.github\/workflows)/i.test(p));
  const migrationFiles = filePaths.filter((p) => /migrations?|\.sql$/i.test(p));
  const schemaFiles = nodes.filter((n) => ['schema', 'table'].includes(n.type) || /schema\.(prisma|sql|graphql|json)$/i.test(n.filePath)).map((n) => n.filePath);
  const dataModelFiles = filePaths.filter((p) => /(models?|entities|contracts?|dto|schema)\//i.test(p) || /\.(dto|contract)\./i.test(p));
  const apiHandlerFiles = nodes.filter((n) => n.tags?.includes('api-handler') || /(controller|routes?)\.(ts|py)$/i.test(n.filePath)).map((n) => n.filePath);
  const groups = Object.keys(directoryGroups), docs = new Set(nodes.filter((n) => n.type === 'document').map(groupOf));
  const result = {
    scriptCompleted: true,
    commonPrefix: common.join('/'),
    directoryGroups,
    nodeTypeGroups,
    groupAdjacency: Object.fromEntries(groups.map((g) => [g, { importsFrom: [...groupImports[g]], importedBy: [...groupImportedBy[g]] }])),
    crossCategoryEdges: [...cross].map(([key, count]) => { const [fromType, toType, edgeType] = key.split('\0'); return { fromType, toType, edgeType, count }; }),
    interGroupImports,
    intraGroupDensity: Object.fromEntries(groups.map((g) => [g, { internalEdges: groupInternal[g], totalEdges: groupTotal[g], density: groupTotal[g] ? groupInternal[g] / groupTotal[g] : 0 }])),
    patternMatches,
    deploymentTopology: { hasDockerfile: filePaths.some((p) => /Dockerfile/i.test(p)), hasCompose: filePaths.some((p) => /docker-compose/i.test(p)), hasK8s: filePaths.some((p) => /(^|\/)(k8s|kubernetes)(\/|$)/i.test(p)), hasTerraform: filePaths.some((p) => /\.tf(vars)?$/i.test(p)), hasCI: filePaths.some((p) => /\.github\/workflows/i.test(p)), infraFiles },
    dataPipeline: { schemaFiles, migrationFiles, dataModelFiles, apiHandlerFiles },
    docCoverage: { groupsWithDocs: docs.size, totalGroups: groups.length, coverageRatio: groups.length ? docs.size / groups.length : 0, undocumentedGroups: groups.filter((g) => !docs.has(g)) },
    dependencyDirection,
    fileStats: { totalFileNodes: nodes.length, filesPerGroup: Object.fromEntries(groups.map((g) => [g, directoryGroups[g].length])), nodeTypeCounts: Object.fromEntries(Object.entries(nodeTypeGroups).map(([k, v]) => [k, v.length])) },
    fileFanIn: fanIn,
    fileFanOut: fanOut,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
} catch (error) { console.error(error.stack || error); process.exit(1); }
