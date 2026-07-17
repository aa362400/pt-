import fs from 'node:fs';
import path from 'node:path';

const root = 'G:/平台/.ua';
const graphPath = path.join(root, 'intermediate', 'assembled-graph.json');
const reviewPath = path.join(root, 'intermediate', 'assemble-review.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

const additions = [
  {
    source: 'file:智能体前端/src/i18n/index.ts',
    target: 'config:智能体前端/src/i18n/locales/en-US.json',
    type: 'imports',
    direction: 'forward',
    weight: 0.7,
  },
  {
    source: 'file:智能体前端/src/i18n/index.ts',
    target: 'config:智能体前端/src/i18n/locales/zh-CN.json',
    type: 'imports',
    direction: 'forward',
    weight: 0.7,
  },
];

const nodeIds = new Set(graph.nodes.map((node) => node.id));
for (const edge of additions) {
  if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
    throw new Error(`Cannot restore edge with missing endpoint: ${edge.source} -> ${edge.target}`);
  }
}
const edgeKeys = new Set(graph.edges.map((edge) => `${edge.source}\0${edge.target}\0${edge.type}`));
let added = 0;
for (const edge of additions) {
  const key = `${edge.source}\0${edge.target}\0${edge.type}`;
  if (!edgeKeys.has(key)) {
    graph.edges.push(edge);
    edgeKeys.add(key);
    added += 1;
  }
}

fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
JSON.parse(fs.readFileSync(graphPath, 'utf8'));

const review = {
  fixedSectionOk: true,
  nodesRecovered: 0,
  edgesRestored: 2,
  crossBatchEdgesAdded: 0,
  typesRemapped: 0,
  complexityRemapped: 0,
  notes: [
    '71 mechanical corrections across 4030 nodes and 7303 input edges are proportionate; no systemic ID or complexity issue was reported.',
    'The two dropped frontend locale imports targeted existing config nodes rather than file nodes; both edges were restored without creating duplicate nodes.',
    'All 1416 importMap entries are now represented by imports edges when matched by filePath.',
    'The tested_by flips and semantic drops are consistent with the merge script canonicalization rules.',
  ],
};
if (added !== 2) throw new Error(`Expected to add 2 edges, added ${added}`);
fs.writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');
JSON.parse(fs.readFileSync(reviewPath, 'utf8'));
console.log(JSON.stringify({ nodes: graph.nodes.length, edges: graph.edges.length, added, review }, null, 2));
