import { repoRoot } from './lib/repo';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspect } from 'node:util';


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

export function loaderFor(root: string): (specifier: string) => Promise<unknown> {
  return (specifier: string) => import(pathToFileURL(path.resolve(root, specifier)).href) as Promise<unknown>;
}

export function format(value: unknown): string {
  if (typeof value === 'string') return value;
  return inspect(value, { depth: null, maxArrayLength: null, maxStringLength: null, colors: false });
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => (load: (specifier: string) => Promise<unknown>) => Promise<unknown>;

export function compile(source: string): { run: (load: (specifier: string) => Promise<unknown>) => Promise<unknown> } | { error: string } {
  try {
    return { run: new AsyncFunction('load', `return (${source}\n);`) };
  } catch {
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
