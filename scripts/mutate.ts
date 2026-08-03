import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
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

// Looked up rather than handed over as a map, so a scope nobody reaches is never
// measured — including the whole suite, which only an escalation needs.
export type BaselineFor = (tests: readonly string[] | undefined) => number | undefined;

export type Verdict = 'KILLED' | 'SURVIVED' | 'ERROR';

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
  const total = /\((\d+)\)/.exec(summary);
  if (total === null) return null;
  return { failed: Number(/(\d+) failed/.exec(summary)?.[1] ?? 0), total: Number(total[1]) };
}

// Which stream the tally is read from is a decision, so it is data here rather
// than a line inside the spawn wrapper where no test can reach it. vitest writes
// its summary to stdout and its failure detail to stderr; a test printing a
// tally-shaped line of its own must not be able to win.
export function tallyOf(streams: { stdout: string; stderr: string }): TestRun {
  const raw = `${streams.stdout}${streams.stderr}`;
  const tally = parseVitestTally(streams.stdout);
  if (tally === null) throw new Error(`could not read a test tally out of the run\n${outputTail(raw)}`);
  return { ...tally, raw };
}

export function outputTail(raw: string, lines = 12): string {
  return raw.split('\n').filter((line) => line.trim() !== '').slice(-lines).join('\n');
}

export function escapesRoot(root: string, file: string): boolean {
  const relative = path.relative(root, path.resolve(root, file));
  return relative === '' || relative.startsWith('..') || path.isAbsolute(relative);
}

export const scopeOf = (mutation: Pick<Mutation, 'tests'>): string => (mutation.tests && mutation.tests.length > 0 ? mutation.tests.join(', ') : 'whole suite');

const occurrences = (text: string, find: string): number => text.split(find).length - 1;

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
    if (found === 0) refusals.push(`${mutation.name}: ${mutation.file} does not contain the find text`);
    else if (found > 1 && !mutation.all) refusals.push(`${mutation.name}: the find text appears ${found} times in ${mutation.file} — narrow it, or set "all": true to mutate every one`);
  }
  return refusals;
}

function verdictOf(mutation: Mutation, run: TestRun, baseline: number | undefined): MutationResult {
  const scope = scopeOf(mutation);
  if (run.total === 0) return { name: mutation.name, verdict: 'ERROR', failed: 0, total: 0, scope, detail: 'the run reported no tests — the mutation may not build', output: outputTail(run.raw) };
  const verdict: Verdict = run.failed > 0 ? 'KILLED' : 'SURVIVED';
  const shortfall = baseline !== undefined && run.total < baseline ? baseline - run.total : undefined;
  return { name: mutation.name, verdict, failed: run.failed, total: run.total, scope, shortfall, unmeasured: baseline === undefined };
}

const WHOLE_SUITE: readonly string[] | undefined = undefined;

// A SURVIVED measured against a few files is not a claim about the suite, and
// re-running only the survivors is what makes a narrow scope affordable: a
// mutation that dies at file scope has already been caught by something, and
// nothing wider needs asking.
function measure(mutation: Mutation, runTests: RunTests, baselineFor: BaselineFor | undefined): MutationResult {
  const narrow = verdictOf(mutation, runTests(mutation.tests), baselineFor?.(mutation.tests));
  if (narrow.verdict !== 'SURVIVED' || mutation.tests === undefined || mutation.tests.length === 0) return narrow;
  const wide = verdictOf({ ...mutation, tests: undefined }, runTests(WHOLE_SUITE), baselineFor?.(WHOLE_SUITE));
  return { ...wide, escalatedFrom: narrow.scope };
}

export function runMutations(mutations: readonly Mutation[], files: FileStore, runTests: RunTests, baselineFor?: BaselineFor): MutationReport {
  const originals = new Map<string, string>();
  const refusals = refusalsFor(mutations, files, originals);
  if (refusals.length > 0) return { results: [], refusals, unrestored: [], ok: false };

  const results: MutationResult[] = [];
  const touched = new Set<string>();
  const restoreFailures = new Set<string>();
  for (const mutation of mutations) {
    const original = originals.get(mutation.file)!;
    touched.add(mutation.file);
    files.write(mutation.file, applyTo(original, mutation));
    try {
      results.push(measure(mutation, runTests, baselineFor));
    } catch (error) {
      results.push({ name: mutation.name, verdict: 'ERROR', failed: 0, total: 0, scope: scopeOf(mutation), detail: (error as Error).message });
    } finally {
      try {
        files.write(mutation.file, original);
      } catch {
        restoreFailures.add(mutation.file);
      }
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
    if (current !== originals.get(file) || restoreFailures.has(file)) unrestored.push(file);
  }

  return { results, refusals, unrestored, ok: unrestored.length === 0 && results.every((result) => result.verdict === 'KILLED') };
}

const ORDER: Record<Verdict, number> = { SURVIVED: 0, ERROR: 1, KILLED: 2 };

export function formatReport(report: MutationReport): string {
  if (report.refusals.length > 0) return ['applied nothing — the manifest was refused:', ...report.refusals.map((refusal) => `  ${refusal}`)].join('\n');

  const sorted = [...report.results].sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict]);
  const width = Math.max(0, ...sorted.map((result) => result.name.length));
  const lines = sorted.flatMap((result) => {
    const measured = result.verdict === 'ERROR' ? (result.detail ?? 'errored') : `${result.failed} failed of ${result.total}`;
    const shortfall = result.shortfall === undefined ? '' : `  (${result.shortfall} fewer tests ran than the unmutated baseline — they cannot have killed it)`;
    const unmeasured = result.unmeasured && result.verdict !== 'ERROR' ? '  (no baseline for this scope — the total is unchecked)' : '';
    const scope = result.escalatedFrom === undefined ? result.scope : `${result.escalatedFrom} -> ${result.scope}`;
    const row = `${result.name.padEnd(width)}  ${result.verdict.padEnd(8)}  ${measured}  [${scope}]${shortfall}${unmeasured}`;
    return result.output === undefined || result.output === '' ? [row] : [row, ...result.output.split('\n').map((line) => `    | ${line}`)];
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
  'tests is optional. Name a narrow scope: a mutation that dies there is settled,',
  'and one that survives is re-run against the whole suite automatically, so only',
  'the survivors pay for it. A SURVIVED verdict always names the widest scope it',
  'was measured against.',
  '',
  'The mutated file is wrong on disk for as long as its tests take to run. Nothing',
  'else should be reading the tree during a run. If a run is killed outright, the',
  'next one restores from its journal before doing anything else; a journal held',
  'by a live run makes this one refuse rather than fight it for the tree.',
  '',
  'Each distinct test scope is run once unmutated first, so a mutation that stops',
  'tests from being collected is reported as a shortfall rather than as a verdict',
  'over a silently smaller suite.',
].join('\n');

// The captured bytes live in this process, which is the design's strength — git
// cannot discard uncommitted work it never sees — and its single point of
// failure. The journal is the same bytes on disk, so a killed run is recoverable
// by the next one.
export interface Journal {
  root: string;
  pid: number;
  startedAt: string;
  files: Record<string, string>;
}

// Keyed by the tree it was captured from. One journal per machine would let a
// run in one checkout restore its bytes into another checkout's files.
export const journalPathFor = (root: string): string => path.join(os.tmpdir(), `universalis-mutate-${createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16)}.json`);

// A journal is written by a process that can die mid-write, so nothing here may
// assume it parses. Unreadable is a state to report and discard, not to crash on.
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
  return { root: journal.root, pid: journal.pid, startedAt: typeof journal.startedAt === 'string' ? journal.startedAt : '', files: journal.files as Record<string, string> };
}

// A run that has been going this long is not a run, it is a pid that got reused.
// Without it a recycled pid wedges every later run behind a permanent "busy".
export const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

// EPERM means the process exists and is not ours, which is the most alive a pid
// can be. Only ESRCH is "gone". The probe is a parameter so that distinction is
// reachable without spawning a process to not own.
export function pidIsAlive(pid: number, probe: (target: number, signal: number) => void = (target, signal) => process.kill(target, signal)): boolean {
  try {
    probe(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// A journal left by a run that is still going is not wreckage to clean up, it is
// another process's only copy of the truth.
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

// `allowed` is the same containment the manifest goes through. Journal keys are
// data this process never validated, and they are acted on before anything else.
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

  const outside = mutations.filter((mutation) => escapesRoot(repoRoot, mutation.file));
  if (outside.length > 0) {
    console.error(`refusing to mutate outside the repository: ${outside.map((mutation) => `${mutation.name} (${mutation.file})`).join(', ')}`);
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
      const recovery = recoverFrom(journal.files, files, (file) => !escapesRoot(repoRoot, file));
      console.error(recovery.restored.length > 0 ? `recovered ${recovery.restored.length} file(s) left mutated by an interrupted run: ${recovery.restored.join(', ')}` : 'a journal from an interrupted run was found; every file in it was already correct');
      if (recovery.refused.length > 0) console.error(`  refused to write outside this tree, or could not: ${recovery.refused.join(', ')}`);
      rmSync(JOURNAL, { force: true });
    }
    captured.clear();
  }

  // Take the journal as a lock before reading anything, so two runs cannot both
  // decide the tree is theirs. It starts empty because nothing is mutated yet.
  const stamp = { root: repoRoot, pid: process.pid, startedAt: new Date().toISOString() };
  try {
    writeFileSync(JOURNAL, JSON.stringify({ ...stamp, files: {} } satisfies Journal), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  } catch (error) {
    console.error(`another mutate run took this tree first (${(error as Error).message}). Wait for it, or delete ${JOURNAL}.`);
    process.exit(2);
  }

  // Read every target before the first write, so the journal holds the
  // pre-mutation content of everything this run can touch.
  for (const file of new Set(mutations.map((mutation) => mutation.file))) {
    try {
      files.read(file);
    } catch {
      // runMutations refuses it by name a moment later, with a better message.
    }
  }
  // Written aside and renamed over, so a kill mid-write cannot leave a half
  // journal where a whole one is expected.
  const pending = `${JOURNAL}.writing`;
  writeFileSync(pending, JSON.stringify({ ...stamp, files: Object.fromEntries(captured) } satisfies Journal), { encoding: 'utf8', mode: 0o600 });
  renameSync(pending, JOURNAL);

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
    if (result.error) throw new Error(`the test command did not run: ${result.error.message}`);
    return tallyOf({ stdout: result.stdout ?? '', stderr: result.stderr ?? '' });
  };

  // Before the baselines, not after: refusalsFor needs only the files, and the
  // baselines are the most expensive thing in the run. Spending them on a
  // manifest already known to be unusable is pure loss.
  const refusals = refusalsFor(mutations, files);
  if (refusals.length > 0) {
    console.log(formatReport({ results: [], refusals, unrestored: [], ok: false }));
    process.exit(1);
  }

  // Measured on first use and remembered, so a run pays for the scopes it
  // actually reaches. An escalation is what asks for the whole suite, and most
  // runs never need it.
  const measured = new Map<string, number | undefined>();
  const baselineFor: BaselineFor = (tests) => {
    const key = scopeOf({ tests: tests === undefined ? undefined : [...tests] });
    if (!measured.has(key)) {
      console.error(`measuring the unmutated baseline for ${key}...`);
      try {
        measured.set(key, runTests(tests).total);
      } catch (error) {
        console.error(`  no baseline for ${key} — ${outputTail((error as Error).message, 1)}`);
        measured.set(key, undefined);
      }
    }
    return measured.get(key);
  };

  const report = runMutations(mutations, files, runTests, baselineFor);
  console.log(formatReport(report));
  if (report.unrestored.length === 0) rmSync(JOURNAL, { force: true });
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
