#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const projectRoot = process.argv[2];
const gitCommitHash = process.argv[3];
const uaDir = path.join(projectRoot, '.ua');
const scan = JSON.parse(fs.readFileSync(path.join(uaDir, 'intermediate', 'scan-result.json'), 'utf8'));
const input = {
  projectRoot,
  sourceFilePaths: scan.files.map((file) => file.path),
  gitCommitHash,
};
fs.writeFileSync(path.join(uaDir, 'intermediate', 'fingerprint-input.json'), JSON.stringify(input, null, 2));
process.stdout.write(`Fingerprint input: ${input.sourceFilePaths.length} files\n`);
