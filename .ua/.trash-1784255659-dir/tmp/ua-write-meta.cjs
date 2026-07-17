#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const projectRoot = process.argv[2];
const gitCommitHash = process.argv[3];
const analyzedFiles = Number(process.argv[4]);
const uaDir = path.join(projectRoot, '.ua');
const meta = {
  lastAnalyzedAt: new Date().toISOString(),
  gitCommitHash,
  version: '1.0.0',
  analyzedFiles,
};
fs.writeFileSync(path.join(uaDir, 'meta.json'), JSON.stringify(meta, null, 2));
process.stdout.write(`Metadata written for ${analyzedFiles} files\n`);
