#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2];
const commitHash = process.argv[3];
const uaDir = path.join(projectRoot, '.ua');
const intermediate = path.join(uaDir, 'intermediate');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const fragment = readJson(path.join(intermediate, 'assembled-graph.json'));
const scan = readJson(path.join(intermediate, 'scan-result.json'));
let layers = readJson(path.join(intermediate, 'layers.json'));
let tour = readJson(path.join(intermediate, 'tour.json'));

if (!Array.isArray(layers)) layers = Array.isArray(layers.layers) ? layers.layers : [];
if (!Array.isArray(tour)) tour = Array.isArray(tour.steps) ? tour.steps : [];

const nodeIds = new Set(fragment.nodes.map((node) => node.id));
const prefixes = /^(file|config|document|service|pipeline|table|schema|resource|endpoint):/;
const kebab = (value) => String(value || 'unnamed')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'unnamed';
const normalizeRefs = (refs) => (Array.isArray(refs) ? refs : [])
  .map((ref) => typeof ref === 'object' && ref ? ref.id : ref)
  .filter(Boolean)
  .map((ref) => prefixes.test(ref) ? ref : `file:${ref}`)
  .filter((ref) => nodeIds.has(ref));

layers = layers.map((layer) => ({
  id: layer.id || `layer:${kebab(layer.name)}`,
  name: layer.name || '未命名层',
  description: layer.description || '未提供层说明。',
  nodeIds: normalizeRefs(layer.nodeIds ?? layer.nodes),
}));

tour = tour.map((step, index) => ({
  order: Number.isInteger(step.order) ? step.order : index + 1,
  title: step.title || `步骤 ${index + 1}`,
  description: step.description || step.whyItMatters || '未提供步骤说明。',
  nodeIds: normalizeRefs(step.nodeIds ?? step.nodesToInspect),
  ...(typeof step.languageLesson === 'string' ? { languageLesson: step.languageLesson } : {}),
})).sort((a, b) => a.order - b.order);

const errors = [];
layers.forEach((layer, index) => {
  for (const field of ['id', 'name', 'description']) {
    if (!layer[field]) errors.push(`Layer[${index}] missing ${field}`);
  }
  if (!Array.isArray(layer.nodeIds)) errors.push(`Layer[${index}] nodeIds is not an array`);
});
tour.forEach((step, index) => {
  for (const field of ['order', 'title', 'description']) {
    if (step[field] === undefined || step[field] === null || step[field] === '') {
      errors.push(`Tour[${index}] missing ${field}`);
    }
  }
  if (!Array.isArray(step.nodeIds) || step.nodeIds.length === 0) {
    errors.push(`Tour[${index}] nodeIds is empty or invalid`);
  }
});

if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exit(1);
}

const graph = {
  version: '1.0.0',
  project: {
    name: scan.name,
    languages: scan.languages,
    frameworks: scan.frameworks,
    description: scan.description,
    analyzedAt: new Date().toISOString(),
    gitCommitHash: commitHash,
  },
  nodes: fragment.nodes,
  edges: fragment.edges,
  layers,
  tour,
};

fs.writeFileSync(path.join(intermediate, 'assembled-graph.json'), JSON.stringify(graph, null, 2));
process.stdout.write(`Assembled graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${layers.length} layers, ${tour.length} tour steps\n`);
