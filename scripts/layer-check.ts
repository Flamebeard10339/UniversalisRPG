import { readFileSync } from 'node:fs';
import { checkLayers, layerCheckOutput, sweptFiles } from './lib/layers';
import { trackedFiles } from './lib/sourceFiles';

const files = sweptFiles(trackedFiles());
const { out, err, exitCode } = layerCheckOutput(files, checkLayers(files, (file) => readFileSync(file, 'utf8')));

for (const line of out) console.log(line);
for (const line of err) console.error(line);

process.exit(exitCode);
