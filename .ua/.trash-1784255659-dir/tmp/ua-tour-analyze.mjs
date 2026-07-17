import fs from 'node:fs';
const [inputPath, outputPath] = process.argv.slice(2);
try {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const nodes = input.nodes, byId = new Map(nodes.map((n) => [n.id, n])), ids = new Set(byId.keys());
  const edges = input.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const fanIn = Object.fromEntries(nodes.map((n) => [n.id, 0])), fanOut = Object.fromEntries(nodes.map((n) => [n.id, 0]));
  for (const e of edges) { fanOut[e.source] += 1; fanIn[e.target] += 1; }
  const ranking = (map, field) => nodes.map((n) => ({ id: n.id, [field]: map[n.id], name: n.name })).sort((a, b) => b[field] - a[field] || a.id.localeCompare(b.id)).slice(0, 20);
  const fanOutValues = nodes.map((n) => fanOut[n.id]).sort((a, b) => a - b), fanInValues = nodes.map((n) => fanIn[n.id]).sort((a, b) => a - b);
  const out90 = fanOutValues[Math.floor(fanOutValues.length * 0.9)] ?? 0, in25 = fanInValues[Math.floor(fanInValues.length * 0.25)] ?? 0;
  const entryRe = /^(index|main|app|server)\.(ts|tsx|js|jsx|py)$|^(__main__|manage|wsgi|asgi|run)\.py$|^(Application|Main)\.java$|^Program\.cs$|^config\.ru$|^index\.php$|^App\.swift$|^Application\.kt$|^main\.(go|rs|cpp|c)$/i;
  const candidates = [];
  for (const n of nodes) {
    let score = 0; const p = n.filePath.replaceAll('\\', '/'), depth = p.split('/').length;
    if (n.type === 'document' && n.name === 'README.md' && depth === 1) score += 5;
    else if (n.type === 'document' && /\.md$/i.test(n.name) && depth === 1) score += 2;
    if (n.type === 'file' && entryRe.test(n.name)) { score += 3; if (depth <= 2) score += 1; if (fanOut[n.id] >= out90) score += 1; if (fanIn[n.id] <= in25) score += 1; }
    if (score) candidates.push({ id: n.id, score, name: n.name, summary: n.summary, fanOut: fanOut[n.id], fanIn: fanIn[n.id] });
  }
  candidates.sort((a, b) => b.score - a.score || b.fanOut - a.fanOut || a.id.localeCompare(b.id));
  const start = candidates.find((c) => byId.get(c.id)?.type === 'file');
  const allowed = new Set(['imports', 'calls']), adjacency = new Map();
  for (const e of edges) if (allowed.has(e.type)) (adjacency.get(e.source) ?? adjacency.set(e.source, []).get(e.source)).push(e.target);
  const order = [], depthMap = {}, byDepth = {};
  if (start) { const q = [start.id]; depthMap[start.id] = 0; while (q.length) { const id = q.shift(), d = depthMap[id]; order.push(id); (byDepth[d] ??= []).push(id); for (const t of adjacency.get(id) ?? []) if (depthMap[t] === undefined) { depthMap[t] = d + 1; q.push(t); } } }
  const inventory = (types) => nodes.filter((n) => types.includes(n.type)).map((n) => ({ id: n.id, name: n.name, type: n.type, summary: n.summary }));
  const rel = new Map(); for (const e of edges.filter((e) => allowed.has(e.type))) rel.set(`${e.source}\0${e.target}`, true);
  const pairs = []; for (const key of rel.keys()) { const [a, b] = key.split('\0'); if (a < b && rel.has(`${b}\0${a}`)) pairs.push([a, b]); }
  const clusters = pairs.slice(0, 10).map((pair) => ({ nodes: pair, edgeCount: edges.filter((e) => pair.includes(e.source) && pair.includes(e.target)).length }));
  const result = {
    scriptCompleted: true,
    entryPointCandidates: candidates.slice(0, 5),
    fanInRanking: ranking(fanIn, 'fanIn'), fanOutRanking: ranking(fanOut, 'fanOut'),
    bfsTraversal: { startNode: start?.id ?? null, order, depthMap, byDepth },
    nonCodeFiles: { documentation: inventory(['document']), infrastructure: inventory(['service', 'pipeline', 'resource']), data: inventory(['table', 'schema', 'endpoint']), config: inventory(['config']) },
    clusters,
    layers: { count: input.layers.length, list: input.layers.map(({ id, name, description }) => ({ id, name, description })) },
    nodeSummaryIndex: Object.fromEntries(nodes.map((n) => [n.id, { name: n.name, type: n.type, summary: n.summary }])),
    totalNodes: nodes.length, totalEdges: input.edges.length, fileLevelEdges: edges.length,
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
} catch (error) { console.error(error.stack || error); process.exit(1); }
