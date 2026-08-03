import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Mutation {
  name: string;
  file: string;
  find: string;
  replace: string;
  tests?: string[];
  all?: boolean;
  note?: string;
}

// The two effects, taken as parameters so the decisions below can be tested
// without a working tree or a test run.
export interface FileStore {
  read(file: string): string;
  write(file: string, text: string): void;
}

export interface TestRun {
  failed: number;
  total: number;
  raw: string;
}

export type RunTests = (tests: readonly string[] | undefined) => TestRun;

export type Verdict = 'KILLED' | 'SURVIVED' | 'ERROR';

export interface MutationResult {
  name: string;
  verdict: Verdict;
  failed: number;
  total: number;
  scope: string;
  detail?: string;
}

export interface MutationReport {
  results: MutationResult[];
  refusals: string[];
  unrestored: string[];
  ok: boolean;
}

const FIELDS = new Set(['name', 'file', 'find', 'replace', 'tests', 'all', 'note']);

export function parseManifest(text: string): Mutation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`the manifest is not JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('the manifest must be a list of mutations');
  if (parsed.length === 0) throw new Error('the manifest is an empty list, so there is nothing to measure');

  const names = new Set<string>();
  return parsed.map((raw, index) => {
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`entry ${index + 1} is not an object`);
    const entry = raw as Record<string, unknown>;
    const at = typeof entry.name === 'string' && entry.name !== '' ? entry.name : `entry ${index + 1}`;
    if (typeof entry.name !== 'string' || entry.name === '') throw new Error(`${at}: name is required, and is how every verdict is reported`);
    if (names.has(entry.name)) throw new Error(`${entry.name}: two mutations share this name, so their verdicts could not be told apart`);
    names.add(entry.name);
    for (const key of Object.keys(entry)) if (!FIELDS.has(key)) throw new Error(`${at}: unknown field ${key}. Takes: ${[...FIELDS].join(', ')}`);
    for (const key of ['file', 'find'] as const) {
      if (typeof entry[key] !== 'string' || entry[key] === '') throw new Error(`${at}: ${key} is required and must be a non-empty string`);
    }
    // Empty is the point: deleting the text you found is the most direct way to
    // ask whether anything was checking it.
    if (typeof entry.replace !== 'string') throw new Error(`${at}: replace is required, and may be empty to delete what find matched`);
    if (entry.tests !== undefined && (!Array.isArray(entry.tests) || entry.tests.length === 0 || entry.tests.some((each) => typeof each !== 'string'))) {
      throw new Error(`${at}: tests must be a non-empty list of strings, or absent to measure against the whole suite`);
    }
    if (entry.all !== undefined && typeof entry.all !== 'boolean') throw new Error(`${at}: all must be true or false`);
    if (entry.note !== undefined && typeof entry.note !== 'string') throw new Error(`${at}: note must be a string`);
    return { ...(entry as unknown as Mutation) };
  });
}

// The whole tally, not the exit code: a run that exits non-zero because it
// collected nothing has not killed anything.
export function parseVitestTally(output: string): { failed: number; total: number } | null {
  const matches = [...output.matchAll(/^[ \t]*Tests[ \t]+(.+)$/gm)];
  if (matches.length === 0) return null;
  const summary = matches[matches.length - 1][1];
  if (/no tests/i.test(summary)) return { failed: 0, total: 0 };
  return { failed: Number(/(\d+) failed/.exec(summary)?.[1] ?? 0), total: Number(/\((\d+)\)/.exec(summary)?.[1] ?? 0) };
}

const scopeOf = (mutation: Mutation): string => (mutation.tests && mutation.tests.length > 0 ? mutation.tests.join(', ') : 'whole suite');

const occurrences = (text: string, find: string): number => text.split(find).length - 1;

// split/join rather than String.replace, whose replacement string reads `$&`
// and `$'` as instructions. Source code is full of both.
const applyTo = (text: string, mutation: Mutation): string => text.split(mutation.find).join(mutation.replace);

function refuse(mutations: readonly Mutation[], files: FileStore, originals: Map<string, string>): string[] {
  const refusals: string[] = [];
  for (const mutation of mutations) {
    if (!originals.has(mutation.file)) {
      try {
        originals.set(mutation.file, files.read(mutation.file));
      } catch (error) {
        refusals.push(`${mutation.name}: cannot read ${mutation.file} — ${(error as Error).message}`);
        continue;
      }
    }
    const text = originals.get(mutation.file)!;
    if (mutation.find === mutation.replace) {
      refusals.push(`${mutation.name}: find and replace are identical, so this would measure nothing`);
      continue;
    }
    const found = occurrences(text, mutation.find);
    if (found === 0) refusals.push(`${mutation.name}: ${mutation.file} does not contain the find text`);
    else if (found > 1 && !mutation.all) refusals.push(`${mutation.name}: the find text appears ${found} times in ${mutation.file} — narrow it, or set "all": true to mutate every one`);
  }
  return refusals;
}

function verdictOf(mutation: Mutation, run: TestRun): MutationResult {
  const scope = scopeOf(mutation);
  // A run that collected nothing says nothing about the suite. Reading it as
  // KILLED would credit the tests for a failure they never produced.
  if (run.total === 0) return { name: mutation.name, verdict: 'ERROR', failed: 0, total: 0, scope, detail: 'the run reported no tests — the mutation may not build' };
  const verdict: Verdict = run.failed > 0 ? 'KILLED' : 'SURVIVED';
  return { name: mutation.name, verdict, failed: run.failed, total: run.total, scope };
}

export function runMutations(mutations: readonly Mutation[], files: FileStore, runTests: RunTests): MutationReport {
  const originals = new Map<string, string>();
  const refusals = refuse(mutations, files, originals);
  if (refusals.length > 0) return { results: [], refusals, unrestored: [], ok: false };

  const results: MutationResult[] = [];
  const touched = new Set<string>();
  for (const mutation of mutations) {
    const original = originals.get(mutation.file)!;
    touched.add(mutation.file);
    files.write(mutation.file, applyTo(original, mutation));
    try {
      results.push(verdictOf(mutation, runTests(mutation.tests)));
    } catch (error) {
      results.push({ name: mutation.name, verdict: 'ERROR', failed: 0, total: 0, scope: scopeOf(mutation), detail: (error as Error).message });
    } finally {
      files.write(mutation.file, original);
    }
  }

  // Not trust — proof. The restore above is the only thing standing between a
  // mutation run and a corrupted working tree, so the run reports whether it
  // actually happened.
  const unrestored: string[] = [];
  for (const file of touched) {
    let current: string | null = null;
    try {
      current = files.read(file);
    } catch {
      current = null;
    }
    if (current !== originals.get(file)) unrestored.push(file);
  }

  return { results, refusals, unrestored, ok: unrestored.length === 0 && results.every((result) => result.verdict === 'KILLED') };
}

const ORDER: Record<Verdict, number> = { SURVIVED: 0, ERROR: 1, KILLED: 2 };

export function formatReport(report: MutationReport): string {
  if (report.refusals.length > 0) return ['applied nothing — the manifest was refused:', ...report.refusals.map((refusal) => `  ${refusal}`)].join('\n');

  const sorted = [...report.results].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  const width = Math.max(0, ...sorted.map((result) => result.name.length));
  const lines = sorted.map((result) => {
    const measure = result.verdict === 'ERROR' ? (result.detail ?? 'errored') : `${result.failed} failed of ${result.total}`;
    return `${result.name.padEnd(width)}  ${result.verdict.padEnd(8)}  ${measure}  [${result.scope}]`;
  });

  const survived = sorted.filter((result) => result.verdict === 'SURVIVED');
  const errored = sorted.filter((result) => result.verdict === 'ERROR').length;
  lines.push('', `${sorted.length - survived.length - errored} killed, ${survived.length} survived, ${errored} errored`);
  if (survived.length > 0) lines.push(`A survivor is the finding: ${survived.map((result) => result.name).join(', ')} changed behaviour and its scope stayed green.`);
  if (report.unrestored.length > 0) lines.push('', `NOT RESTORED: ${report.unrestored.join(', ')} — check the working tree before anything else.`);
  return lines.join('\n');
}

const repoRoot = path.join(import.meta.dirname, '..');

const usage = [
  'Usage: npm run mutate -- <manifest.json>',
  '',
  'Applies each mutation in turn, runs the tests it names, restores the file, and',
  'reports which mutations the suite failed to notice. Exits non-zero when any',
  'mutation survived, errored, or could not be put back.',
  '',
  'A manifest is a list of:',
  '  { "name": "c6", "file": "src/x.ts", "find": "<exact text>", "replace": "<text>",',
  '    "tests": ["src/x.test.ts"], "all": false, "note": "what this breaks" }',
  '',
  'tests is optional; without it the mutation is measured against the whole suite,',
  'which is what a SURVIVED verdict needs to mean anything.',
  '',
  'The mutated file is wrong on disk for as long as its tests take to run. Nothing',
  'else should be reading the tree during a run.',
].join('\n');

function main(): void {
  const manifestPath = process.argv[2];
  if (manifestPath === undefined || manifestPath === '--help' || manifestPath === '-h') {
    console.error(usage);
    process.exit(2);
  }

  let mutations: Mutation[];
  try {
    mutations = parseManifest(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }

  // Captured on first read, which happens during validation before anything is
  // written — so this is the pre-mutation content even if the run dies mid-way.
  const captured = new Map<string, string>();
  const files: FileStore = {
    read(file: string): string {
      const text = readFileSync(path.resolve(repoRoot, file), 'utf8');
      if (!captured.has(file)) captured.set(file, text);
      return text;
    },
    write(file: string, text: string): void {
      writeFileSync(path.resolve(repoRoot, file), text, 'utf8');
    },
  };

  const putBack = (): void => {
    for (const [file, text] of captured) {
      try {
        if (readFileSync(path.resolve(repoRoot, file), 'utf8') !== text) writeFileSync(path.resolve(repoRoot, file), text, 'utf8');
      } catch {
        // Nothing useful to do from an exit handler; the report says which
        // files were touched.
      }
    }
  };
  process.on('exit', putBack);
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));

  const runTests: RunTests = (tests) => {
    const result = spawnSync(process.execPath, [path.join(repoRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--configLoader', 'runner', ...(tests ?? [])], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const raw = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    const tally = parseVitestTally(raw);
    if (tally === null) throw new Error(`could not read a test tally out of the run${result.error ? `: ${result.error.message}` : ''}`);
    return { ...tally, raw };
  };

  const report = runMutations(mutations, files, runTests);
  console.log(formatReport(report));
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
