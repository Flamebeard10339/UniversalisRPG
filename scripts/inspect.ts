import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspect } from 'node:util';

// What `npm run probe` is for the DSL load path, for everything else: run an
// expression against this repository's own module resolution, print what it
// evaluates to, and leave nothing on disk. Three sessions ended in a
// throwaway `.ts` inside the worktree — twice rendering a `scripts/` view
// over a store the real one cannot contain, once calling wrapText/wrapUnder/
// packGreedy on six inputs — because a file in the session scratchpad cannot
// resolve the repo's relative imports and `npx tsx -e` with an import is not
// dependable.

const repoRoot = path.resolve(import.meta.dirname, '..');

const usage = [
  'Usage: npm run inspect -- "<expression>"',
  '       npm run inspect -- -            (read the source from stdin)',
  '',
  'Runs under the repository\'s own module resolution and prints the result.',
  'Reach a module with `load`, whose specifier is relative to the repo root:',
  '',
  '  npm run inspect -- "(await load(\'scripts/tasks/render.ts\')).wrapText(\'a b c\', 3)"',
  '',
  'An expression is printed; a body of statements is run and its `return`',
  'value printed, so a multi-line survey goes in through stdin unchanged.',
  'A promise is awaited. Nothing is written anywhere.',
].join('\n');

// The one way in. A specifier is relative to the repo root rather than to
// this file, because that is how a caller thinks about the tree — and it is
// the whole reason a scratchpad file could not do this job.
export function loaderFor(root: string): (specifier: string) => Promise<unknown> {
  return (specifier: string) => import(pathToFileURL(path.resolve(root, specifier)).href) as Promise<unknown>;
}

// A string is the thing itself and prints as itself; everything else prints
// as its structure, undepth-limited, because a truncated answer to "what is
// in here" is the question asked again.
export function format(value: unknown): string {
  if (typeof value === 'string') return value;
  return inspect(value, { depth: null, maxArrayLength: null, maxStringLength: null, colors: false });
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (load: (specifier: string) => Promise<unknown>) => Promise<unknown>;

// Expression first, then statements. Which one the caller wrote is decidable
// by trying, and a flag to declare it would be a flag nobody remembers: the
// six-input case is an expression and the render-a-view case is a body, and
// both arrive through the same command.
export function compile(source: string): { run: (load: (specifier: string) => Promise<unknown>) => Promise<unknown> } | { error: string } {
  try {
    return { run: new AsyncFunction('load', `return (${source}\n);`) };
  } catch {
    // Fall through: not an expression.
  }
  try {
    return { run: new AsyncFunction('load', source) };
  } catch (error) {
    return { error: `the source is neither an expression nor a body of statements: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (argument === undefined || argument === '--help' || argument === '-h') {
    console.error(usage);
    process.exit(2);
  }

  const source = argument === '-' ? readFileSync(0, 'utf8') : argument;
  const compiled = compile(source);
  if ('error' in compiled) {
    console.error(compiled.error);
    process.exit(2);
  }

  try {
    console.log(format(await compiled.run(loaderFor(repoRoot))));
  } catch (error) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) void main();
