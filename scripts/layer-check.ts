import { readFileSync } from 'node:fs';
import { checkLayers, LAYERS, SOURCE_TREES } from './lib/layers';
import { sourceFiles } from './lib/sourceFiles';

const files = SOURCE_TREES.flatMap((tree) => sourceFiles(tree));
const { edges, violations, unlayered } = checkLayers(files, (file) => readFileSync(file, 'utf8'));

console.log(`${files.length} source file(s) read under ${SOURCE_TREES.join(' and ')}; ${edges} cross-file imports checked across ${LAYERS.length} layers (${LAYERS.join(' < ')}).`);

if (violations.length > 0) {
  console.error(`\n${violations.length} import(s) point upward. A layer may import the layers below it and itself, never above:`);
  for (const violation of violations) console.error(`  ${violation.from} -> ${violation.to}`);
  console.error('Fix the import, or move the code: a file that needs something from above usually holds two layers’ work.');
}

if (unlayered.length > 0) {
  console.error(`\n${unlayered.length} source file(s) belong to no declared root, so no import of theirs is read in either direction:`);
  for (const file of unlayered) console.error(`  ${file}`);
  console.error('Put each under a layer root in ROOTS, or name it in OUTSIDE_STACK to declare it deliberately outside the stack (scripts/lib/layers.ts).');
}

if (violations.length + unlayered.length > 0) process.exit(1);

console.log('Every source file belongs to a layer, and every import points downward.');
