import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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

// The two effects, taken as parameters so the decisions below can be tested
// without a working tree or a test run.
export interface FileStore {
  read(file: string): string;
  write(file: string, text: string): void;
}

export interface TestRun {
  failed: number;
  // Counted separately from total, which includes skips: a `-t` name that
  // matches nothing skips everything, and failed + passed is the only number
  // that says whether any test actually ran.
  passed: number;
  total: number;
  // Files that failed as files. A file that could not be collected reports here
  // and not in `failed`, so a mutation that does not build looks like a clean
  // run of whatever else collected.
  filesFailed: number;
  failures: string[];
  raw: string;
}

export type RunTests = (tests: readonly string[] | undefined, test?: string) => TestRun;

export interface Baseline {
  failed: number;
  total: number;
  ran: number;
  failures: string[];
}

// Looked up rather than handed over as a map, so a scope nobody reaches is never
// measured — including the whole suite, which only an escalation needs. Every
// call must happen while the tree is unmutated; runMutations is what guarantees
// that, by asking before it writes.
export type BaselineFor = (tests: readonly string[] | undefined, test?: string) => Baseline | undefined;

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
  // Present when the run could list the tree's paths before and after. Gained
  // paths are reported and left in place: a run that silently removed files
  // would be a worse tool than one that silently left them.
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
    if (entry.test !== undefined && (typeof entry.test !== 'string' || entry.test === '')) throw new Error(`${at}: test must be the name of one test, as a non-empty string`);
    if (entry.test !== undefined && entry.tests === undefined) throw new Error(`${at}: test names a test by name, so tests must name the file it lives in`);
    if (entry.all !== undefined && typeof entry.all !== 'boolean') throw new Error(`${at}: all must be true or false`);
    if (entry.note !== undefined && typeof entry.note !== 'string') throw new Error(`${at}: note must be a string`);
    return { ...(entry as unknown as Mutation) };
  });
}

// The whole tally, not the exit code: a run that exits non-zero because it
// collected nothing has not killed anything.
export function parseVitestTally(output: string): { failed: number; passed: number; total: number; filesFailed: number } | null {
  const files = [...output.matchAll(/^[ \t]*Test Files[ \t]+(.+)$/gm)];
  const filesFailed = files.length === 0 ? 0 : Number(/(\d+) failed/.exec(files[files.length - 1][1])?.[1] ?? 0);
  const matches = [...output.matchAll(/^[ \t]*Tests[ \t]+(.+)$/gm)];
  if (matches.length === 0) return null;
  const summary = matches[matches.length - 1][1];
  if (/no tests/i.test(summary)) return { failed: 0, passed: 0, total: 0, filesFailed };
  const total = /\((\d+)\)/.exec(summary);
  if (total === null) return null;
  return { failed: Number(/(\d+) failed/.exec(summary)?.[1] ?? 0), passed: Number(/(\d+) passed/.exec(summary)?.[1] ?? 0), total: Number(total[1]), filesFailed };
}

// The `Failed Tests` section, which is the only place a run says *which* test
// failed. A line with no ` > ` is a file that never collected, named without a
// test inside it, and is already reported as `filesFailed`. Colour codes are
// stripped rather than assumed absent: they appear whenever a caller's
// environment forces them, and a name carrying one matches nothing.
export function parseFailedTests(output: string): string[] {
  const named: string[] = [];
  for (const match of output.replace(/\u001b\[[0-9;]*m/g, '').matchAll(/^\s*FAIL\s+(\S+ > .*\S)\s*$/gm)) {
    if (!named.includes(match[1])) named.push(match[1]);
  }
  return named;
}

// Which stream the tally is read from is a decision, so it is data here rather
// than a line inside the spawn wrapper where no test can reach it. vitest writes
// its summary to stdout and its failure detail to stderr; a test printing a
// tally-shaped line of its own must not be able to win, and the same reasoning
// keeps the names off stdout.
export function tallyOf(streams: { stdout: string; stderr: string }): TestRun {
  const raw = `${streams.stdout}${streams.stderr}`;
  const tally = parseVitestTally(streams.stdout);
  if (tally === null) throw new Error(`could not read a test tally out of the run\n${outputTail(raw)}`);
  const failures = parseFailedTests(streams.stderr);
  // Fewer names than failures is the one direction that costs a verdict: a
  // reporter this cannot read would attribute a kill to whatever it did name.
  // More is ordinary — a suite whose hook threw is named here while its tests
  // are counted as skipped rather than failed.
  if (failures.length < tally.failed) {
    throw new Error(`the run reported ${tally.failed} failing test(s) and named ${failures.length} of them, so no verdict could be attributed to a test\n${outputTail(raw)}`);
  }
  return { ...tally, failures, raw };
}

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

// The refusal a find miss is worth. "does not contain the find text" is true
// and useless: it cost three separate sessions two rounds each, twice on line
// endings — one file CRLF on disk, one LF, both messages identical and `cat
// -A` through git-bash showing LF for both — and once on escaping, a heredoc
// turning `\t` into a literal tab before it reached the JSON. All three are
// invisible in the manifest and obvious the moment the nearest line is put
// beside what was asked for, which the checker already has open. Scored on
// the longest shared run of characters rather than on words, because the
// drift that causes this is inside a line, not between lines.
function nearestLine(text: string, find: string): { line: string; number: number } | null {
  const needle = find.split('\n')[0].trim();
  if (needle === '') return null;
  const lines = text.split('\n');
  let best: { line: string; number: number; score: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const score = sharedRun(lines[i], needle);
    if (best === null || score > best.score) best = { line: lines[i], number: i + 1, score };
  }
  // Half the needle is the floor: below it the "nearest" line is a coincidence
  // of punctuation, and printing one would send a reader to the wrong place.
  return best === null || best.score * 2 < needle.length ? null : { line: best.line, number: best.number };
}

// The longest substring the two share, computed over the shorter one's
// windows. Both sides here are one line of source, so the quadratic walk is
// bounded by a line length and runs once per refused mutation.
function sharedRun(a: string, b: string): number {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  for (let size = short.length; size > 0; size--) {
    for (let start = 0; start + size <= short.length; start++) {
      if (long.includes(short.slice(start, start + size))) return size;
    }
  }
  return 0;
}

// Whitespace and line endings are what the eye cannot see and what the miss is
// usually made of, so they are spelled out rather than printed as themselves.
// Leading runs as well as trailing: a find text copied without its indentation
// misses for a reason that is invisible until the two lines are put one above
// the other and the margin is drawn.
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
  // A file that fails as a file while no test fails did not run: vitest counts a
  // collection failure on `Test Files` only, so the tests that did collect would
  // otherwise read as a clean sweep of a suite that never assembled.
  if (run.filesFailed > 0 && run.failed === 0) return errored(`${run.filesFailed} test file(s) failed to collect — the mutation may not build`);

  // Against the tests the baseline saw fail, not against how many. A count
  // corrects for a tree that was already red; it cannot tell a test the
  // mutation broke from a test that was going to fail during this run anyway.
  const wasFailing = baseline?.failed ?? 0;
  const before = new Set(baseline?.failures ?? []);
  const attributed = run.failures.filter((name) => !before.has(name));
  if (attributed.length === 0 && run.failed > wasFailing) {
    return errored(`${run.failed} test(s) failed against ${wasFailing} in this scope's baseline, and not one of them is a test the baseline saw pass — a count going up is not a kill`);
  }
  const shortfall = baseline !== undefined && run.total < baseline.total ? baseline.total - run.total : undefined;
  // A test the baseline saw fail and this run saw pass changed in the one
  // direction breaking a line cannot explain. Suppressed when tests stopped
  // running, where the same shape means only that the mutation stopped
  // collecting the file it was in.
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

// Files rather than the test names they came from: `-t` takes a regex over the
// whole suite, and the file the run already named is both narrower and exact.
export const filesOf = (tests: readonly string[]): string[] => [...new Set(tests.map((name) => name.split(' > ')[0]))].sort();

// A failure that did not happen again, on the same tree with the same mutant on
// disk, is reported and never resolved — the tool refuses to present it as
// fact, and what to do about it is the auditor's.
export function confirmKill(result: MutationResult, run: TestRun, baseline: Baseline | undefined, scope: string): MutationResult {
  const attributed = result.attributed ?? [];
  const before = new Set(baseline?.failures ?? []);
  const again = attributed.filter((name) => run.failures.includes(name) && !before.has(name));
  if (again.length > 0) return { ...result, attributed: again, confirmedAt: scope };
  return { ...result, verdict: 'UNSTABLE', attributed: undefined, unreproduced: attributed, confirmedAt: scope };
}

const WHOLE_SUITE: readonly string[] | undefined = undefined;

// The scopes a survivor still has to face, in the order it faces them: a named
// test widens to the file it lives in, a file to the whole suite.
const ladderAbove = (mutation: Mutation): Pick<Mutation, 'tests' | 'test'>[] => {
  const rungs: Pick<Mutation, 'tests' | 'test'>[] = [];
  if (mutation.test !== undefined) rungs.push({ tests: mutation.tests });
  if (mutation.tests !== undefined && mutation.tests.length > 0) rungs.push({ tests: WHOLE_SUITE });
  return rungs;
};

export function runMutations(mutations: readonly Mutation[], files: FileStore, runTests: RunTests, baselineFor?: BaselineFor, tree?: () => readonly string[]): MutationReport {
  const originals = new Map<string, string>();
  const refusals = refusalsFor(mutations, files, originals);
  if (refusals.length > 0) return { results: [], refusals, unrestored: [], ok: false };

  // Before the first test runs, not merely the first write: a test can write
  // files whether or not a mutant is on disk, and this run owns both.
  let before: readonly string[] | undefined;
  try {
    before = tree?.();
  } catch {
    before = undefined;
  }

  // Memoized here as well as by the caller, so however many mutations share a
  // scope or escalate into one, the run asks for its baseline once — and never
  // asks for a scope nothing reaches.
  const baselines = new Map<string, Baseline | undefined>();
  const baselineAt = (scope: Pick<Mutation, 'tests' | 'test'>): Baseline | undefined => {
    const key = scopeOf(scope);
    if (!baselines.has(key)) baselines.set(key, baselineFor?.(scope.tests, scope.test));
    return baselines.get(key);
  };

  // A named test its own scope never ran is a typo, not a measurement: the run
  // would skip everything and call the mutation SURVIVED.
  for (const mutation of mutations) {
    if (mutation.test === undefined) continue;
    const baseline = baselineAt(mutation);
    if (baseline !== undefined && baseline.ran === 0) refusals.push(`${mutation.name}: no test named "${mutation.test}" ran in ${scopeOf({ tests: mutation.tests })} — the name must match a test that exists there`);
  }
  if (refusals.length > 0) return { results: [], refusals, unrestored: [], ok: false };

  const touched = new Set<string>();
  const restoreFailures = new Set<string>();

  // Mutate, measure, put back. Every baseline is taken by the caller BEFORE this
  // is entered, because a baseline measured with the mutant on disk is not a
  // baseline — it is a second reading of the same thing.
  const around = (mutation: Mutation, scope: string, measure: () => MutationResult): MutationResult => {
    const original = originals.get(mutation.file)!;
    touched.add(mutation.file);
    files.write(mutation.file, applyTo(original, mutation));
    try {
      return measure();
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

  const results = mutations.map((mutation) => {
    const baseline = baselineAt(mutation);
    return around(mutation, scopeOf(mutation), () => verdictOf(mutation, scopeOf(mutation), runTests(mutation.tests, mutation.test), baseline));
  });

  // Escalation is a second phase rather than a nested run, so every wider
  // baseline is taken on a clean tree too — and only when something survived a
  // narrower rung, which is what keeps a narrow scope cheap. A verdict keeps
  // every scope it climbed through.
  for (let index = 0; index < results.length; index++) {
    for (const rung of ladderAbove(mutations[index])) {
      if (results[index].verdict !== 'SURVIVED') break;
      const mutation = mutations[index];
      const baseline = baselineAt(rung);
      const scope = scopeOf(rung);
      const from = results[index];
      const escalatedFrom = from.escalatedFrom === undefined ? from.scope : `${from.escalatedFrom} -> ${from.scope}`;
      results[index] = { ...around(mutation, scope, () => verdictOf(mutation, scope, runTests(rung.tests, rung.test), baseline)), escalatedFrom };
    }
  }

  // Every kill faces the same bar however wide the scope that produced it, so
  // widening the scope cannot widen what counts as one. A kill found wider than
  // its named tests' own files is re-measured there, where a failure that
  // needed a contended run stops appearing; one already found there is measured
  // twice, which is the same tree answering the same question.
  for (let index = 0; index < results.length; index++) {
    const found = results[index];
    if (found.verdict !== 'KILLED' || found.attributed === undefined) continue;
    const rung: Pick<Mutation, 'tests' | 'test'> = { tests: filesOf(found.attributed) };
    const baseline = baselineAt(rung);
    const scope = scopeOf(rung);
    results[index] = { ...around(mutations[index], scope, () => confirmKill(found, runTests(rung.tests, rung.test), baseline, scope)), escalatedFrom: found.escalatedFrom };
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

  // The mutation targets are proven byte-identical above; this is the rest of
  // the tree, which the restore cannot reach because it never captured it.
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
  // Indented per line, not per refusal: a refusal that quotes the file spans
  // several lines, and only the first would otherwise sit under the heading.
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
  '    "tests": ["src/x.test.ts"], "test": "<one test\'s name>", "all": false,',
  '    "note": "what this breaks" }',
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

// The captured bytes live in this process, which is the design's strength — git
// cannot discard uncommitted work it never sees — and its single point of
// failure. The journal is the same bytes on disk, so a killed run is recoverable
// by the next one.
export interface Journal {
  root: string;
  pid: number;
  startedAt: string;
  // The commit the captured bytes were read at, or null on a journal written
  // before this field existed — which reads as unknown, not as a match.
  head: string | null;
  files: Record<string, string>;
}

// null when this is not a git checkout, or git cannot answer. Both read as
// "nothing says the tree has not moved", which `recoveryStanding` treats as a
// reason to report rather than restore.
export function headOf(root: string): string | null {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return result.status === 0 && typeof result.stdout === 'string' && result.stdout.trim() !== '' ? result.stdout.trim() : null;
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
  return {
    root: journal.root,
    pid: journal.pid,
    startedAt: typeof journal.startedAt === 'string' ? journal.startedAt : '',
    head: typeof journal.head === 'string' && journal.head !== '' ? journal.head : null,
    files: journal.files as Record<string, string>,
  };
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

// Recovery writes bytes over files nobody asked it to touch, which is only
// right while the tree is still the one they were read from. `stale` is the
// refusal to guess: the bytes may be a mid-write tree worth rescuing or a
// journal nobody cleaned up, nothing here distinguishes those, and restoring
// the wrong one reverts committed work.
export type RecoveryStanding = { kind: 'recover' } | { kind: 'stale'; reason: string };

export function recoveryStanding(journal: Pick<Journal, 'head'>, head: string | null): RecoveryStanding {
  if (journal.head === null) return { kind: 'stale', reason: 'it records no commit, so nothing says the tree is still the one its bytes were read from' };
  if (head === null) return { kind: 'stale', reason: `it was captured at ${journal.head.slice(0, 7)} and this checkout could not be asked what it is on now` };
  if (journal.head !== head) return { kind: 'stale', reason: `it was captured at ${journal.head.slice(0, 7)} and this tree is on ${head.slice(0, 7)} — restoring it would revert whatever landed in between` };
  return { kind: 'recover' };
}

// What a run owes its tree on the way out, whichever exit it takes: every file
// it captured back as it found it. Returns the ones it could not put back,
// which are the only reason to keep a journal.
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

// Resolved the way node resolves it, not by joining a path onto the repo root.
// A worktree under `.claude/worktrees/` has no `node_modules` of its own, so
// the join named a file that does not exist while `npx vitest` and `npm test`
// in the same tree worked — node's own resolution walks up to the main
// checkout. Every mutation in that worktree returned "could not read a test
// tally out of the run", twelve of twelve, and the run said nothing about why.
// scripts/lib/tsxCli.ts is the in-repo pattern, written for this exact reason.
// Asked of the package rather than assumed: `vitest/vitest.mjs` is not an
// exported subpath, so the CLI's location comes from the `bin` field of the
// package.json that resolution found.
export function resolveVitest(): { cli: string } | { missing: string } {
  try {
    const manifest = createRequire(import.meta.url).resolve('vitest/package.json');
    const bin = (JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string, string> }).bin;
    const entry = typeof bin === 'string' ? bin : bin?.vitest;
    if (entry === undefined) return { missing: `${manifest} declares no vitest bin` };
    const cli = path.resolve(path.dirname(manifest), entry);
    return existsSync(cli) ? { cli } : { missing: `${manifest} names ${entry} as its bin, and ${cli} is not there` };
  } catch (error) {
    return { missing: (error as Error).message };
  }
}

function main(): void {
  const manifestPath = process.argv[2];
  if (manifestPath === undefined || manifestPath === '--help' || manifestPath === '-h') {
    console.error(usage);
    process.exit(2);
  }

  // Before the manifest, the journal and the baselines: a run that cannot
  // start the test command can only report every mutation as an error, and
  // saying so once beats saying it once per mutation with a stack attached.
  const vitest = resolveVitest();
  if ('missing' in vitest) {
    console.error(`vitest could not be resolved from ${import.meta.filename}, so no mutation could be measured — ${vitest.missing}`);
    console.error('Run `npm install` in the checkout this tree resolves against. Nothing was mutated.');
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

  // Take the journal as a lock before reading anything, so two runs cannot both
  // decide the tree is theirs. It starts empty because nothing is mutated yet.
  const stamp = { root: repoRoot, pid: process.pid, startedAt: new Date().toISOString(), head: headOf(repoRoot) };
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

  // Restoring the tree and forgetting the journal are one act, in one place,
  // because every exit between here and the report owes both. A file that
  // cannot be put back keeps the journal, which is the one thing it is for.
  const putBack = (): void => {
    if (putBackAll(captured, (file) => readFileSync(path.resolve(repoRoot, file), 'utf8'), (file, text) => writeFileSync(path.resolve(repoRoot, file), text, 'utf8')).length === 0) {
      rmSync(JOURNAL, { force: true });
    }
  };
  process.on('exit', putBack);
  process.on('SIGINT', () => process.exit(130));
  process.on('SIGTERM', () => process.exit(143));

  // -t takes a regex and the manifest names text, so the name's own characters
  // are escaped rather than read as a pattern.
  const runTests: RunTests = (tests, test) => {
    const name = test === undefined ? [] : ['-t', test.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')];
    // The failure detail is now what a verdict is attributed to, so the buffer
    // it arrives in is sized for a whole suite going red rather than for the
    // twelve lines a tail prints.
    const result = spawnSync(process.execPath, [vitest.cli, 'run', '--configLoader', 'runner', ...(tests ?? []), ...name], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
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
  const measured = new Map<string, Baseline | undefined>();
  const baselineFor: BaselineFor = (tests, test) => {
    const key = scopeOf({ tests: tests === undefined ? undefined : [...tests], test });
    if (!measured.has(key)) {
      console.error(`measuring the unmutated baseline for ${key}...`);
      try {
        const run = runTests(tests, test);
        measured.set(key, { failed: run.failed, total: run.total, ran: run.failed + run.passed, failures: run.failures });
      } catch (error) {
        console.error(`  no baseline for ${key} — ${outputTail((error as Error).message, 1)}`);
        measured.set(key, undefined);
      }
    }
    return measured.get(key);
  };

  // Tracked plus untracked-unignored: the paths a test could add or remove
  // that anyone would later notice.
  const tree = (): readonly string[] => {
    const listing = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, encoding: 'utf8' });
    if (listing.error) throw listing.error;
    if (listing.status !== 0) throw new Error(listing.stderr || 'git ls-files failed');
    return (listing.stdout ?? '').split('\n').filter((line) => line !== '');
  };

  const report = runMutations(mutations, files, runTests, baselineFor, tree);
  console.log(formatReport(report));
  // The journal goes in `putBack`, which this exit runs — one place, so the
  // success path cannot be the only one that cleans up.
  process.exit(report.ok ? 0 : 1);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
