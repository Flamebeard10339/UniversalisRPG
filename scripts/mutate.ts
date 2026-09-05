import { repoRoot } from './lib/repo';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createVitest, type RunnerTask, type RunnerTestFile, type Vitest } from 'vitest/node';
import os from 'node:os';
import path from 'node:path';

export interface Mutation {
  name: string;
  file: string;
  find: string;
  replace: string;
  tests?: string[];
  test?: string;
  all?: boolean;
  note?: string;
}

export interface FileStore {
  read(file: string): string;
  write(file: string, text: string): void;
}

export interface TestRun {
  failed: number;
  passed: number;
  total: number;
  filesFailed: number;
  failures: string[];
  raw: string;
}

export type RunTests = (tests: readonly string[] | undefined, test?: string) => TestRun | Promise<TestRun>;

export interface Baseline {
  failed: number;
  total: number;
  ran: number;
  failures: string[];
}

export type BaselineFor = (tests: readonly string[] | undefined, test?: string) => Baseline | undefined | Promise<Baseline | undefined>;

export type Verdict = 'KILLED' | 'SURVIVED' | 'ERROR' | 'UNSTABLE';

export interface MutationResult {
  name: string;
  verdict: Verdict;
  failed: number;
  total: number;
  scope: string;
  detail?: string;
  output?: string;
  shortfall?: number;
  unmeasured?: boolean;
  escalatedFrom?: string;
  baselineFailed?: number;
  attributed?: string[];
  unreproduced?: string[];
  confirmedAt?: string;
  flaked?: string[];
}

export interface MutationReport {
  results: MutationResult[];
  refusals: string[];
  unrestored: string[];
  treeDelta?: { gained: string[]; lost: string[] };
  ok: boolean;
}

const FIELDS = new Set(['name', 'file', 'find', 'replace', 'tests', 'test', 'all', 'note']);

export function parseManifest(text: string): Mutation[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`the manifest is not JSON: ${(error as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('the manifest must be a list of mutations');
  if (parsed.length === 0) throw new Error('the manifest is an empty list, so there is nothing to measure');
  return mutationsFrom(parsed);
}

export function mutationsFrom(entries: readonly unknown[]): Mutation[] {
  const names = new Set<string>();
  return entries.map((raw, index) => {
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
    if (typeof entry.replace !== 'string') throw new Error(`${at}: replace is required, and may be empty to delete what find matched`);
    if (entry.tests !== undefined && (!Array.isArray(entry.tests) || entry.tests.length === 0 || entry.tests.some((each) => typeof each !== 'string'))) {
      throw new Error(`${at}: tests must be a non-empty list of strings, or absent to measure against the whole suite`);
    }
    if (entry.test !== undefined && (typeof entry.test !== 'string' || entry.test === '')) throw new Error(`${at}: test must be the name of one test, as a non-empty string`);
    if (entry.test !== undefined && entry.tests === undefined) throw new Error(`${at}: test names a test by name, so tests must name the file it lives in`);
    if (entry.all !== undefined && typeof entry.all !== 'boolean') throw new Error(`${at}: all must be true or false`);
    if (entry.note !== undefined && typeof entry.note !== 'string') throw new Error(`${at}: note must be a string`);
    return { ...(entry as unknown as Mutation) };
  });
}

const BY_BEING_THERE = 'all';
const MAY_BE_GIVEN_TWICE = 'tests';

export function oneMutationFrom(args: readonly string[]): Mutation[] {
  const given = new Map<string, string[]>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!flag.startsWith('--')) throw new Error(`${flag} is not a flag — every part of a mutation is given as --<field>. Takes: ${flagList()}`);
    const field = flag.slice(2);
    if (!FIELDS.has(field)) throw new Error(`--${field} is not something a mutation has. Takes: ${flagList()}`);
    const values = given.get(field) ?? [];
    if (field === BY_BEING_THERE) {
      given.set(field, values);
      continue;
    }
    const value = args[index + 1];
    given.set(field, value === undefined ? values : [...values, value]);
    index++;
  }

  const entry: Record<string, unknown> = {};
  for (const [field, values] of given) {
    entry[field] = field === BY_BEING_THERE ? true : field === MAY_BE_GIVEN_TWICE ? values : values[0];
  }
  entry.name ??= entry.file ?? 'the mutation asked for';
  return mutationsFrom([entry]);
}

const flagList = (): string => [...FIELDS].map((field) => `--${field}`).join(', ');

export function outputTail(raw: string, lines = 12): string {
  return raw.split('\n').filter((line) => line.trim() !== '').slice(-lines).join('\n');
}

export function escapesRoot(root: string, file: string): boolean {
  const relative = path.relative(root, path.resolve(root, file));
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative);
}

export const scopeOf = (mutation: Pick<Mutation, 'tests' | 'test'>): string => {
  const files = mutation.tests && mutation.tests.length > 0 ? mutation.tests.join(', ') : 'whole suite';
  return mutation.test === undefined ? files : `${files} "${mutation.test}"`;
};

const occurrences = (text: string, find: string): number => text.split(find).length - 1;

function nearestLine(text: string, find: string): { line: string; number: number } | null {
  const needle = find.split('\n')[0].trim();
  if (needle === '') return null;
  const lines = text.split('\n');
  let best: { line: string; number: number; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const score = sharedRun(lines[i], needle);
    if (best === null || score > best.score) best = { line: lines[i], number: i + 1, score };
  }
  return best === null || best.score * 2 < needle.length ? null : { line: best.line, number: best.number };
}

function sharedRun(a: string, b: string): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  for (let size = short.length; size > 0; size--) {
    for (let start = 0; start + size <= short.length; start++) {
      if (long.includes(short.slice(start, start + size))) return size;
    }
  }
  return 0;
}

export function visibleWhitespace(text: string): string {
  return text
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/^ +| +$/g, (run) => '·'.repeat(run.length));
}

export function findMissRefusal(name: string, file: string, text: string, find: string): string {
  const near = nearestLine(text, find);
  if (near === null) return `${name}: ${file} does not contain the find text, and no line in it comes close — check the file, not the text`;
  return [
    `${name}: ${file} does not contain the find text. The nearest line is ${file}:${near.number} —`,
    `  asked for: ${visibleWhitespace(find.split('\n')[0])}`,
    `  file has:  ${visibleWhitespace(near.line)}`,
    '  A difference you cannot see here is a line ending or a tab your shell rewrote before the manifest was written.',
  ].join('\n');
}

export const applyTo = (text: string, mutation: Pick<Mutation, 'find' | 'replace'>): string => text.split(mutation.find).join(mutation.replace);

export function refusalsFor(mutations: readonly Mutation[], files: FileStore, originals = new Map<string, string>()): string[] {
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
    if (found === 0) refusals.push(findMissRefusal(mutation.name, mutation.file, text, mutation.find));
    else if (found > 1 && !mutation.all) refusals.push(`${mutation.name}: the find text appears ${found} times in ${mutation.file} — narrow it, or set "all": true to mutate every one`);
  }
  return refusals;
}

function verdictOf(mutation: Mutation, scope: string, run: TestRun, baseline: Baseline | undefined): MutationResult {
  const errored = (detail: string): MutationResult => ({ name: mutation.name, verdict: 'ERROR', failed: 0, total: 0, scope, detail, output: outputTail(run.raw) });
  if (run.total === 0) return errored('the run reported no tests — the mutation may not build');
  if (run.filesFailed > 0 && run.failed === 0) return errored(`${run.filesFailed} test file(s) failed to collect — the mutation may not build`);

  const wasFailing = baseline?.failed ?? 0;
  const before = new Set(baseline?.failures ?? []);
  const attributed = run.failures.filter((name) => !before.has(name));
  if (attributed.length === 0 && run.failed > wasFailing) {
    return errored(`${run.failed} test(s) failed against ${wasFailing} in this scope's baseline, and not one of them is a test the baseline saw pass — a count going up is not a kill`);
  }
  const shortfall = baseline !== undefined && run.total < baseline.total ? baseline.total - run.total : undefined;
  const flaked = shortfall === undefined ? [...before].filter((name) => !run.failures.includes(name)) : [];
  return {
    name: mutation.name,
    verdict: attributed.length > 0 ? 'KILLED' : 'SURVIVED',
    failed: run.failed,
    total: run.total,
    scope,
    attributed: attributed.length > 0 ? attributed : undefined,
    flaked: flaked.length > 0 ? flaked : undefined,
    shortfall,
    unmeasured: baseline === undefined,
    baselineFailed: wasFailing > 0 ? wasFailing : undefined,
  };
}

export const filesOf = (tests: readonly string[]): string[] => [...new Set(tests.map((name) => name.split(' > ')[0]))].sort();

export function confirmKill(result: MutationResult, run: TestRun, baseline: Baseline | undefined, scope: string): MutationResult {
  const attributed = result.attributed ?? [];
  const before = new Set(baseline?.failures ?? []);
  const again = attributed.filter((name) => run.failures.includes(name) && !before.has(name));
  if (again.length > 0) return { ...result, attributed: again, confirmedAt: scope };
  return { ...result, verdict: 'UNSTABLE', attributed: undefined, unreproduced: attributed, confirmedAt: scope };
}

const WHOLE_SUITE: readonly string[] | undefined = undefined;

const ladderAbove = (mutation: Mutation): Pick<Mutation, 'tests' | 'test'>[] => {
  const rungs: Pick<Mutation, 'tests' | 'test'>[] = [];
  if (mutation.test !== undefined) rungs.push({ tests: mutation.tests });
  if (mutation.tests !== undefined && mutation.tests.length > 0) rungs.push({ tests: WHOLE_SUITE });
  return rungs;
};

export async function runMutations(mutations: readonly Mutation[], files: FileStore, runTests: RunTests, baselineFor?: BaselineFor, tree?: () => readonly string[]): Promise<MutationReport> {
  const originals = new Map<string, string>();
  const refusals = refusalsFor(mutations, files, originals);
  if (refusals.length > 0) return { results: [], refusals, unrestored: [], ok: false };

  let before: readonly string[] | undefined;
  try {
    before = tree?.();
  } catch {
    before = undefined;
  }

  const baselines = new Map<string, Baseline | undefined>();
  const baselineAt = async (scope: Pick<Mutation, 'tests' | 'test'>): Promise<Baseline | undefined> => {
    const key = scopeOf(scope);
    if (!baselines.has(key)) baselines.set(key, await baselineFor?.(scope.tests, scope.test));
    return baselines.get(key);
  };

  for (const mutation of mutations) {
    if (mutation.test === undefined) continue;
    const baseline = await baselineAt(mutation);
    if (baseline !== undefined && baseline.ran === 0) refusals.push(`${mutation.name}: no test named "${mutation.test}" ran in ${scopeOf({ tests: mutation.tests })} — the name must match a test that exists there`);
  }
  if (refusals.length > 0) return { results: [], refusals, unrestored: [], ok: false };

  const touched = new Set<string>();
  const restoreFailures = new Set<string>();

  const around = async (mutation: Mutation, scope: string, measure: () => MutationResult | Promise<MutationResult>): Promise<MutationResult> => {
    const original = originals.get(mutation.file)!;
    touched.add(mutation.file);
    files.write(mutation.file, applyTo(original, mutation));
    try {
      return await measure();
    } catch (error) {
      return { name: mutation.name, verdict: 'ERROR', failed: 0, total: 0, scope, detail: (error as Error).message };
    } finally {
      try {
        files.write(mutation.file, original);
      } catch {
        restoreFailures.add(mutation.file);
      }
    }
  };

  const results: MutationResult[] = [];
  for (const mutation of mutations) {
    const baseline = await baselineAt(mutation);
    results.push(await around(mutation, scopeOf(mutation), async () => verdictOf(mutation, scopeOf(mutation), await runTests(mutation.tests, mutation.test), baseline)));
  }

  for (let index = 0; index < results.length; index++) {
    for (const rung of ladderAbove(mutations[index])) {
      if (results[index].verdict !== 'SURVIVED') break;
      const mutation = mutations[index];
      const baseline = await baselineAt(rung);
      const scope = scopeOf(rung);
      const from = results[index];
      const escalatedFrom = from.escalatedFrom === undefined ? from.scope : `${from.escalatedFrom} -> ${from.scope}`;
      results[index] = { ...(await around(mutation, scope, async () => verdictOf(mutation, scope, await runTests(rung.tests, rung.test), baseline))), escalatedFrom };
    }
  }

  for (let index = 0; index < results.length; index++) {
    const found = results[index];
    if (found.verdict !== 'KILLED' || found.attributed === undefined) continue;
    const rung: Pick<Mutation, 'tests' | 'test'> = { tests: filesOf(found.attributed) };
    const baseline = await baselineAt(rung);
    const scope = scopeOf(rung);
    results[index] = { ...(await around(mutations[index], scope, async () => confirmKill(found, await runTests(rung.tests, rung.test), baseline, scope))), escalatedFrom: found.escalatedFrom };
  }

  const unrestored: string[] = [];
  for (const file of touched) {
    let current: string | null = null;
    try {
      current = files.read(file);
    } catch {
      current = null;
    }
    if (current !== originals.get(file) || restoreFailures.has(file)) unrestored.push(file);
  }

  let treeDelta: { gained: string[]; lost: string[] } | undefined;
  if (before !== undefined) {
    try {
      const after = tree!();
      const had = new Set(before);
      const has = new Set(after);
      treeDelta = { gained: after.filter((file) => !had.has(file)), lost: before.filter((file) => !has.has(file)) };
    } catch {
      treeDelta = undefined;
    }
  }

  return { results, refusals, unrestored, treeDelta, ok: unrestored.length === 0 && results.every((result) => result.verdict === 'KILLED') };
}

const ORDER: Record<Verdict, number> = { SURVIVED: 0, UNSTABLE: 1, ERROR: 2, KILLED: 3 };

const nameList = (names: readonly string[], limit = 2): string => (names.length <= limit ? names.join(', ') : `${names.slice(0, limit).join(', ')} and ${names.length - limit} more`);

export function formatReport(report: MutationReport): string {
  if (report.refusals.length > 0) return ['applied nothing — the manifest was refused:', ...report.refusals.flatMap((refusal) => refusal.split('\n').map((line) => `  ${line}`))].join('\n');

  const sorted = [...report.results].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  const width = Math.max(0, ...sorted.map((result) => result.name.length));
  const lines = sorted.flatMap((result) => {
    const measured = result.verdict === 'ERROR' ? (result.detail ?? 'errored') : `${result.failed} failed of ${result.total}`;
    const shortfall = result.shortfall === undefined ? '' : `  (${result.shortfall} fewer tests ran than the unmutated baseline — they cannot have killed it)`;
    const unmeasured = result.unmeasured && result.verdict !== 'ERROR' ? '  (no baseline for this scope — the total is unchecked)' : '';
    const red = result.baselineFailed === undefined ? '' : `  (${result.baselineFailed} test(s) were already failing before this mutation)`;
    const by = result.attributed === undefined ? '' : `  killed by ${nameList(result.attributed)}, re-run at [${result.confirmedAt}] with the mutation still applied and failing there too`;
    const unreproduced = result.unreproduced === undefined ? '' : `  (${nameList(result.unreproduced)} failed here and was not attributable when re-measured at [${result.confirmedAt}] with the mutation still applied — the measurement did not repeat, so this is neither proof nor a survivor)`;
    const flaked = result.flaked === undefined ? '' : `  (${nameList(result.flaked)} failed in this scope's own baseline and passed with the mutation applied — this scope did not report the same thing twice)`;
    const scope = result.escalatedFrom === undefined ? result.scope : `${result.escalatedFrom} -> ${result.scope}`;
    const row = `${result.name.padEnd(width)}  ${result.verdict.padEnd(8)}  ${measured}  [${scope}]${by}${unreproduced}${shortfall}${unmeasured}${red}${flaked}`;
    return result.output === undefined || result.output === '' ? [row] : [row, ...result.output.split('\n').map((line) => `    | ${line}`)];
  });

  const survived = sorted.filter((result) => result.verdict === 'SURVIVED');
  const errored = sorted.filter((result) => result.verdict === 'ERROR').length;
  const unstable = sorted.filter((result) => result.verdict === 'UNSTABLE');
  const killed = sorted.filter((result) => result.verdict === 'KILLED').length;
  lines.push('', `${killed} killed, ${survived.length} survived, ${unstable.length} unstable, ${errored} errored`);
  if (survived.length > 0) lines.push(`A survivor is the finding: ${survived.map((result) => result.name).join(', ')} changed behaviour and its scope stayed green.`);
  if (unstable.length > 0) lines.push(`An unstable verdict is neither: ${unstable.map((result) => result.name).join(', ')} produced a failure that did not happen again on the same tree, so nothing here is proof of anything.`);
  if (report.treeDelta !== undefined) {
    const { gained, lost } = report.treeDelta;
    if (gained.length === 0 && lost.length === 0) lines.push('The tree gained nothing and lost nothing while this run held it.');
    if (gained.length > 0) lines.push('', `TREE GAINED: ${gained.join(', ')} — written while this run held the tree; left in place, not deleted.`);
    if (lost.length > 0) lines.push('', `TREE LOST: ${lost.join(', ')} — present before this run and gone after.`);
  }
  if (report.unrestored.length > 0) lines.push('', `NOT RESTORED: ${report.unrestored.join(', ')} — check the working tree before anything else.`);
  return lines.join('\n');
}


const usage = [
  'Usage: npm run mutate -- <manifest.json>',
  '       npm run mutate -- --file <path> --find <text> --replace <text> [--tests <path>]',
  '',
  'Applies each mutation in turn, runs the tests it names, restores the file, and',
  'reports which mutations the suite failed to notice. Exits non-zero when any',
  'mutation survived, errored, or could not be put back.',
  '',
  'A manifest is a list of:',
  '  { "name": "c6", "file": "src/x.ts", "find": "<exact text>", "replace": "<text>",',
  '    "tests": ["src/x.test.ts"], "test": "<one test\'s name>", "all": false,',
  '    "note": "what this breaks" }',
  '',
  'One mutation can be given on the command line instead, where every field above',
  'is a flag of its own name and is refused by the same rules. --tests may be',
  'given more than once, --all is asked for by being there, and --name defaults',
  'to the file. Text carrying newlines belongs in a manifest, where it escapes.',
  '',
  '  npm run mutate -- --file src/x.ts --find "!== undefined" --replace "=== undefined"',
  '',
  'With no --tests that asks the whole suite whether anything at all catches the',
  'break — the question to ask before writing a test that may already be covered,',
  'and it costs what the suite costs.',
  '',
  'tests is optional, and test narrows further to one named test inside it. Name',
  'the narrowest scope you can: a mutation that dies there is settled, and one',
  'that survives climbs automatically — a named test to its file, a file to the',
  'whole suite — so only the survivors pay for the wider runs. A SURVIVED verdict',
  'always names the widest scope it was measured against.',
  '',
  'A KILLED names the test that went from passing to failing, and is only',
  'reported once that test has failed again with the mutation still on disk and',
  'its own file as the scope. A failure that does not happen the second time is',
  'UNSTABLE: not a kill, not a survivor, and not something to read as either.',
  '',
  'The mutated file is wrong on disk for as long as its tests take to run. Nothing',
  'else should be reading the tree during a run. If a run is killed outright, the',
  'next one restores from its journal before doing anything else; a journal held',
  'by a live run makes this one refuse rather than fight it for the tree.',
  '',
  'Each test scope is measured once on the unmutated tree before anything is',
  'written, so a mutation that stops tests from being collected is reported as a',
  'shortfall rather than as a verdict over a silently smaller suite.',
].join('\n');

export interface Journal {
  root: string;
  pid: number;
  startedAt: string;
  head: string | null;
  files: Record<string, string>;
}

export function headOf(root: string): string | null {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim() !== '' ? result.stdout.trim() : null;
}

export const journalPathFor = (root: string): string => path.join(os.tmpdir(), `universalis-mutate-${createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16)}.json`);

export function readJournal(text: string): Journal | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const journal = parsed as Partial<Journal>;
  if (typeof journal.root !== 'string' || typeof journal.pid !== 'number' || journal.files === null || typeof journal.files !== 'object' || Array.isArray(journal.files)) return null;
  if (Object.values(journal.files).some((each) => typeof each !== 'string')) return null;
  return {
    root: journal.root,
    pid: journal.pid,
    startedAt: typeof journal.startedAt === 'string' ? journal.startedAt : '',
    head: typeof journal.head === 'string' && journal.head !== '' ? journal.head : null,
    files: journal.files as Record<string, string>,
  };
}

export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const SIGNAL_REFUSED_BY_A_PROCESS_WE_DO_NOT_OWN = 'EPERM';

export function pidIsAlive(pid: number, probe: (target: number, signal: number) => void = (target, signal) => process.kill(target, signal)): boolean {
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === SIGNAL_REFUSED_BY_A_PROCESS_WE_DO_NOT_OWN;
  }
}

export function journalVerdict(journal: Pick<Journal, 'pid' | 'startedAt'>, self: number, alive: (pid: number) => boolean, now = Date.now()): 'recover' | 'busy' {
  if (typeof journal.pid !== 'number' || journal.pid === self) return 'recover';
  if (!alive(journal.pid)) return 'recover';
  const startedAt = Date.parse(journal.startedAt ?? '');
  return Number.isNaN(startedAt) || now - startedAt < STALE_AFTER_MS ? 'busy' : 'recover';
}

export interface Recovery {
  restored: string[];
  refused: string[];
}

export type RecoveryStanding = { kind: 'recover' } | { kind: 'stale'; reason: string };

export function recoveryStanding(journal: Pick<Journal, 'head'>, head: string | null): RecoveryStanding {
  if (journal.head === null) return { kind: 'stale', reason: 'it records no commit, so nothing says the tree is still the one its bytes were read from' };
  if (head === null) return { kind: 'stale', reason: `it was captured at ${journal.head.slice(0, 7)} and this checkout could not be asked what it is on now` };
  if (journal.head !== head) return { kind: 'stale', reason: `it was captured at ${journal.head.slice(0, 7)} and this tree is on ${head.slice(0, 7)} — restoring it would revert whatever landed in between` };
  return { kind: 'recover' };
}

export function putBackAll(captured: ReadonlyMap<string, string>, read: (file: string) => string, write: (file: string, text: string) => void): string[] {
  const failed: string[] = [];
  for (const [file, text] of captured) {
    try {
      if (read(file) !== text) write(file, text);
    } catch {
      failed.push(file);
    }
  }
  return failed;
}

export function recoverFrom(entries: Record<string, string>, files: FileStore, allowed: (file: string) => boolean): Recovery {
  const restored: string[] = [];
  const refused: string[] = [];
  for (const [file, text] of Object.entries(entries)) {
    if (!allowed(file)) {
      refused.push(file);
      continue;
    }
    try {
      if (files.read(file) === text) continue;
      files.write(file, text);
      restored.push(file);
    } catch {
      refused.push(file);
    }
  }
  return { restored, refused };
}

const NAME_PART = ' > ';

function namedTests(file: RunnerTestFile): { task: RunnerTask; name: string }[] {
  const walk = (task: RunnerTask, above: readonly string[]): { task: RunnerTask; name: string }[] =>
    task.type === 'suite' ? task.tasks.flatMap((child) => walk(child, [...above, task.name])) : [{ task, name: [...above, task.name].join(NAME_PART) }];
  return file.tasks.flatMap((child) => walk(child, [file.name]));
}

export function tallyRun(files: readonly RunnerTestFile[], unhandled: readonly unknown[] = []): TestRun {
  const tests = files.flatMap(namedTests);
  const stateOf = (each: { task: RunnerTask }): string | undefined => each.task.result?.state;
  const raw = [
    ...files.flatMap((file) => (file.result?.errors ?? []).map((error) => `${file.name}: ${error.stack ?? error.message}`)),
    ...unhandled.map((error) => String((error as Error)?.stack ?? error)),
  ].join('\n');
  return {
    failed: tests.filter((each) => stateOf(each) === 'fail').length,
    passed: tests.filter((each) => stateOf(each) === 'pass').length,
    total: tests.length,
    filesFailed: files.filter((file) => file.result?.state === 'fail').length,
    failures: tests.filter((each) => stateOf(each) === 'fail').map((each) => each.name),
    raw,
  };
}

export const asLiteralPattern = (name: string): string => name.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');

export interface WarmVitest {
  run: RunTests;
  invalidate(file: string): void;
  close(): Promise<void>;
}

export const watchedBy = (files: FileStore, invalidate: (file: string) => void): FileStore => ({
  read: (file) => files.read(file),
  write: (file, text) => {
    files.write(file, text);
    invalidate(file);
  },
});

export async function warmVitest(root: string): Promise<WarmVitest> {
  const vitest: Vitest = await createVitest('test', { root, watch: false, reporters: [{}], configLoader: 'runner' });
  return {
    run: async (tests, test) => {
      if (test === undefined) vitest.resetGlobalTestNamePattern();
      else vitest.setGlobalTestNamePattern(new RegExp(asLiteralPattern(test)));
      const specs = await vitest.globTestSpecifications(tests === undefined ? [] : [...tests]);
      const ran = new Set(specs.map((spec) => spec.moduleId));
      await vitest.runTestSpecifications(specs, true);
      return tallyRun(vitest.state.getFiles().filter((file) => ran.has(file.filepath)), vitest.state.getUnhandledErrors());
    },
    invalidate: (file) => vitest.invalidateFile(path.resolve(root, file).split(path.sep).join('/')),
    close: () => vitest.close(),
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asked = args[0];
  if (asked === undefined || asked === '--help' || asked === '-h') {
    console.error(usage);
    process.exit(2);
  }

  let mutations: Mutation[];
  try {
    mutations = asked.startsWith('--') ? oneMutationFrom(args) : parseManifest(readFileSync(asked, 'utf8'));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }

  const outside = mutations.filter((mutation) => escapesRoot(repoRoot, mutation.file));
  if (outside.length > 0) {
    console.error(`refusing to mutate outside the repository: ${outside.map((mutation) => `${mutation.name} (${mutation.file})`).join(', ')}`);
    process.exit(2);
  }

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

  const JOURNAL = journalPathFor(repoRoot);

  if (existsSync(JOURNAL)) {
    const journal = readJournal(readFileSync(JOURNAL, 'utf8'));
    if (journal === null) {
      console.error(`the journal at ${JOURNAL} is unreadable — a run was probably killed while writing it. Discarding it; check git status before trusting the tree.`);
      rmSync(JOURNAL, { force: true });
    } else if (journalVerdict(journal, process.pid, pidIsAlive) === 'busy') {
      console.error(`another mutate run (pid ${journal.pid}, started ${journal.startedAt}) is holding this tree. Wait for it, or delete ${JOURNAL} if you know it is gone.`);
      process.exit(2);
    } else if (path.resolve(journal.root) !== path.resolve(repoRoot)) {
      console.error(`the journal at ${JOURNAL} was captured from ${journal.root}, not ${repoRoot}. Leaving it alone.`);
      process.exit(2);
    } else {
      const standing = recoveryStanding(journal, headOf(repoRoot));
      if (standing.kind === 'stale') {
        console.error(`the journal at ${JOURNAL} is not this tree's to restore: ${standing.reason}.`);
        console.error(`  Nothing was written. It holds ${Object.keys(journal.files).length} file(s): ${Object.keys(journal.files).join(', ')}. Compare them against \`git diff\` and delete the journal when you have decided.`);
        process.exit(2);
      }
      const recovery = recoverFrom(journal.files, files, (file) => !escapesRoot(repoRoot, file));
      if (recovery.restored.length > 0) {
        console.error(`recovered ${recovery.restored.length} file(s) left mutated by an interrupted run at this same commit: ${recovery.restored.join(', ')}`);
        console.error('  These were overwritten with the bytes that run captured. Check `git diff` before trusting the tree.');
      } else {
        console.error('a journal from an interrupted run was found; every file in it was already correct');
      }
      if (recovery.refused.length > 0) console.error(`  refused to write outside this tree, or could not: ${recovery.refused.join(', ')}`);
      rmSync(JOURNAL, { force: true });
    }
    captured.clear();
  }

  const stamp = { root: repoRoot, pid: process.pid, startedAt: new Date().toISOString(), head: headOf(repoRoot) };
  try {
    writeFileSync(JOURNAL, JSON.stringify({ ...stamp, files: {} } satisfies Journal), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } catch (error) {
    console.error(`another mutate run took this tree first (${(error as Error).message}). Wait for it, or delete ${JOURNAL}.`);
    process.exit(2);
  }

  for (const file of new Set(mutations.map((mutation) => mutation.file))) {
    try {
      files.read(file);
    } catch {
    }
  }
  const pending = `${JOURNAL}.writing`;
  writeFileSync(pending, JSON.stringify({ ...stamp, files: Object.fromEntries(captured) } satisfies Journal), { encoding: 'utf8', mode: 0o600 });
  renameSync(pending, JOURNAL);

  const putBack = (): void => {
    if (putBackAll(captured, (file) => readFileSync(path.resolve(repoRoot, file), 'utf8'), (file, text) => writeFileSync(path.resolve(repoRoot, file), text, 'utf8')).length === 0) {
      rmSync(JOURNAL, { force: true });
    }
  };
  process.on('exit', putBack);
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));

  const refusals = refusalsFor(mutations, files);
  if (refusals.length > 0) {
    console.log(formatReport({ results: [], refusals, unrestored: [], ok: false }));
    process.exit(1);
  }

  let vitest: WarmVitest;
  try {
    vitest = await warmVitest(repoRoot);
  } catch (error) {
    console.error(`vitest could not be started from ${import.meta.filename}, so no mutation could be measured — ${(error as Error).message}`);
    console.error('Run `npm install` in the checkout this tree resolves against. Nothing was mutated.');
    process.exit(2);
  }
  const runTests: RunTests = (tests, test) => vitest.run(tests, test);
  const watched = watchedBy(files, vitest.invalidate);

  const measured = new Map<string, Baseline | undefined>();
  const baselineFor: BaselineFor = async (tests, test) => {
    const key = scopeOf({ tests: tests === undefined ? undefined : [...tests], test });
    if (!measured.has(key)) {
      console.error(`measuring the unmutated baseline for ${key}...`);
      try {
        const run = await runTests(tests, test);
        measured.set(key, { failed: run.failed, total: run.total, ran: run.failed + run.passed, failures: run.failures });
      } catch (error) {
        console.error(`  no baseline for ${key} — ${outputTail((error as Error).message, 1)}`);
        measured.set(key, undefined);
      }
    }
    return measured.get(key);
  };

  const tree = (): readonly string[] => {
    const listing = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' });
    if (listing.error) throw listing.error;
    if (listing.status !== 0) throw new Error(listing.stderr || 'git ls-files failed');
    return (listing.stdout ?? '').split('\n').filter((line) => line !== '');
  };

  const report = await runMutations(mutations, watched, runTests, baselineFor, tree);
  await vitest.close();
  console.log(formatReport(report));
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  void main().catch((error: unknown) => {
    console.error(`the run did not finish: ${(error as Error).stack ?? String(error)}`);
    process.exit(2);
  });
}
