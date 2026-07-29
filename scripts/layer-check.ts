import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { importedPaths, LAYERS, layerOf, pointsUpward, ROOTS } from './lib/layers';
import { posix, sourceFiles } from './lib/sourceFiles';

interface Violation {
  from: string;
  to: string;
}

const violations: Violation[] = [];
let edges = 0;

for (const layer of LAYERS) {
  for (const file of sourceFiles(ROOTS[layer])) {
    for (const target of importedPaths(file, readFileSync(file, 'utf8'))) {
      const targetLayer = layerOf(target);
      if (targetLayer === null) continue;
      edges++;
      if (pointsUpward(layer, targetLayer)) violations.push({ from: posix(relative(process.cwd(), file)), to: target });
    }
  }
}

for (const violation of violations) console.error(`${violation.from} -> ${violation.to}`);

console.log(`${edges} cross-file imports checked across ${LAYERS.length} layers (${LAYERS.join(' < ')}).`);

if (violations.length > 0) {
  console.error(
    `\n${violations.length} import(s) point upward. A layer may import the layers below it and itself, never above.\n` +
      `Fix the import, or move the code: a file that needs something from above usually holds two layers' work.`,
  );
  process.exit(1);
}

console.log('Every import points downward.');
