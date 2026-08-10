import { runLayerCheck } from './lib/layers';

const { out, err, exitCode } = runLayerCheck();

for (const line of out) console.log(line);
for (const line of err) console.error(line);

process.exit(exitCode);
