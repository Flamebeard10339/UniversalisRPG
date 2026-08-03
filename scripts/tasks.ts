import { pathToFileURL } from 'node:url';
import { run } from './tasks/commands';

// The entry point and nothing else. The command bodies live under
// scripts/tasks/, cut by command family; this file exists so that
// `npm run tasks`, the commit hook, and every test that spawns the CLI
// keep one stable path to invoke.
export { run };

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.argv.slice(2));
}
