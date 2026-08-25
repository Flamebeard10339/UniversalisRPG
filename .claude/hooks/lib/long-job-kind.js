// What kind of long-running job a command is — "test", "dev", or nothing.
// Run directly it prints the kind of the command in argv[2]; imported it hands
// the same two questions to whoever asks.
//
// The npm script names are read out of package.json rather than listed here. A
// script added next month is classified by what it invokes, so this file never
// has to learn its name and the guard cannot fall behind the scripts it guards.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = path.join(import.meta.dirname, '..', '..', '..');

// What holds the machine, by the binary that holds it. `vite build` finishes on
// its own and is not one of these; a dev server and a suite both run until
// something stops them.
export function kindOfBody(body) {
  if (/\bvitest\b/.test(body)) return 'test';
  if (/\bvite\b(?!\s+build)/.test(body)) return 'dev';
  return '';
}

function scriptKinds() {
  try {
    const { scripts = {} } = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    return new Map(
      Object.entries(scripts)
        .map(([name, body]) => [name, kindOfBody(String(body))])
        .filter(([, kind]) => kind !== ''),
    );
  } catch {
    return new Map();
  }
}

// Only an invocation the shell would actually run counts: the start of the
// line, or just past a pipe, a separator or an `&&`, allowing for `VAR=1` in
// front. Without this, `grep "npm run dev" docs/` reads as starting a dev
// server, and a guard that blocks a command for quoting the thing it guards is
// one people learn to route around.
const AT_COMMAND = String.raw`(?:^|[|&;(\n])\s*(?:\w+=\S*\s+)*`;
const started = (body, command) => new RegExp(`${AT_COMMAND}${body}`).test(command);

export function kindOf(command) {
  const kinds = scriptKinds();

  // `npm run <name>`, and `npm test` / `npm t`, which name the `test` script
  // without the word run.
  for (const [name, kind] of kinds) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (started(String.raw`npm\s+(?:run|run-script)\s+${escaped}\b`, command)) return kind;
  }
  if (kinds.has('test') && started(String.raw`npm\s+(?:test|t)\b`, command)) return kinds.get('test');

  // The binaries invoked directly, past npx or node_modules/.bin.
  const direct = String.raw`(?:npx\s+)?(?:[\w./\\-]*[/\\])?`;
  if (started(`${direct}vitest\\b`, command)) return 'test';
  if (started(`${direct}vite\\b(?!\\s+build)`, command)) return 'dev';
  return '';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(kindOf(process.argv[2] ?? ''));
}
