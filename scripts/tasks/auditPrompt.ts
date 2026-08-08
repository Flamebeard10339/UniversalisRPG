import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { regionView } from '../lib/architecture';
import * as git from '../lib/git';
import { clauseStandings, outstandingSummary, parseSpecDoc, type ProofClause } from '../lib/specDoc';
import { priorArt } from '../lib/producers';
import { FAULTS, type Task } from '../lib/taskStore';
import { architecture, ownership, printPriorArt } from './architectureCmds';
import { AUDITOR_LESSONS, printLessons } from './briefLessons';
import type { Flags } from './cli';
import { readStore, type Config, currentSpec, knownSpecs, reportUnknownSpec, resolveConfig, specFile } from './context';
import { declaredSpecs, storeDiff } from './mergeReady';
import { printRow, truncateLine } from './render';

// A prompt without a resolvable diff range cannot do its job — the two
// git calls are kept apart so a base-branch typo and a detached-HEAD
// failure are reported as what each actually is, and neither is allowed
// to fall back to a placeholder that still exits 0.
export function resolveDiffRange(baseBranch: string, emit: (line: string) => void): { base: string; head: string } | null {
  const base = git.mergeBase(baseBranch);
  if (base === null) {
    emit(`could not resolve a merge-base between HEAD and ${baseBranch}`);
    return null;
  }
  const head = git.head();
  if (head === null) {
    emit('could not resolve HEAD');
    return null;
  }
  return { base, head };
}

// Null from the seam is "this checkout could not answer", which every caller
// here renders rather than throwing over — a brief missing its diff stat is
// worth more than no brief.
function diffChangedFiles(range: string): string[] {
  return git.changedFiles(range) ?? [];
}

// `tasks where`, run once over the whole path list rather than once per path
// — which is what both measured auditors did by hand. The manifest is the
// only thing that can fail here, and it costs this answer and nothing else.
function printOwnership(config: Config, tasks: Task[], paths: string[]): void {
  let arch: ReturnType<typeof architecture>;
  try {
    arch = architecture(config);
  } catch (error) {
    console.log(`Ownership unanswered: ${config.systemsPath} — ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  console.log('Who owns each changed path:');
  if (paths.length === 0) console.log('- none');
  const owned: string[] = [];
  for (const file of paths) {
    const view = regionView(arch.manifest, arch.tree, arch.modules, file);
    if (view.owners.length > 0) owned.push(file);
    console.log(`- ${file} — ${ownership(arch.manifest, view)}`);
  }
  console.log('');
  // Prior art over the owned paths only. Every branch writes the store and
  // the event log, so asking what has claimed those returns most of the
  // store — an answer whose length is the reason nobody reads it.
  if (owned.length === 0) console.log('No prior art to answer: no changed path is owned by a system.');
  else printPriorArt(priorArt(arch.manifest, tasks, owned), { collapseClosed: true });
}

// What the auditor is told to look for. Lives here, not in CLAUDE.md:
// hand-copied briefs are what trained agents to fabricate their own, so the
// one authoritative checklist is the one the tool prints.
const AUDIT_CHECKLIST = [
  'a simpler existing pattern that should have been reused;',
  'scope drift;',
  'CI, test, coverage, lint, type, or security weakening;',
  'unmet acceptance criteria;',
  'duplicated utilities or domain concepts;',
  'architecture-boundary violations;',
  'tests that repeat the implementation\'s assumptions;',
  'missing edge cases;',
  'public API, data, security, performance, or rollback risks;',
  'cross-system effects;',
  'comments that restate self-documenting code;',
];

// A `proof: vitest <file> "<name>"` target naming a test that does not exist
// is worse than no target: `vitest -t "<no such name>"` skips every test and
// exits 0, so an auditor following the brief gets a green run that asserted
// nothing. Measured at 40 of 49 targets on this spec's own first pass. The
// title is a string literal in the file, so a text search answers without
// running the suite — this is a read printed beside the target, not a gate.
//
// `found` and `moved` are the only states a manifest entry comes from; every
// other state is a reason recorded rather than a test resolved, so the state
// carries what `describeResolution` needs to say what would resolve it and
// nothing this brief has to guess at.
export type TargetResolution =
  | { state: 'found'; file: string; name: string }
  | { state: 'moved'; file: string; name: string; foundIn: string[] }
  | { state: 'no-such-file'; file: string }
  | { state: 'nowhere'; file: string; name: string }
  | { state: 'unsearchable'; file: string; name: string }
  | { state: 'no-tests'; file: string }
  | { state: 'unparseable'; target: string };

// A target's file list is either bare and space-separated or the whole list
// wrapped in one pair of backticks — the shape `audit-splits-at-its-seam` c2
// itself writes two paths in, and the shape a spec written as markdown reaches
// for on its own. A stray quote or backtick inside the remainder means the
// quoted-name form was attempted and malformed, not a file list, so it is
// left unparsed rather than guessed at.
function parseFileList(remainder: string): string[] | null {
  const wrapped = /^`([^`]*)`$/.exec(remainder.trim());
  const body = (wrapped ? wrapped[1] : remainder).trim();
  if (body === '' || /["`]/.test(body)) return null;
  return body.split(/\s+/);
}

// A title the named file does not carry is not yet an absence: the suite
// split moved tests between files without renaming one of them, so the title
// is far more often somewhere else than gone. The wide search that answers
// that costs a vitest run, so it is an escalation — reached only once the
// named file's own source has already failed to settle it, the same bargain
// mutate strikes between a narrow scope and a wide one.
//
// A file the checkout does not have settles the target on its own: the
// target has to be rewritten either way, and that is the more useful thing
// to say than where the title happens to live now.
function resolveNamedTarget(file: string, name: string, read: (file: string) => string | null, search: (name: string) => string[] | null): TargetResolution {
  const text = read(file);
  if (text === null) return { state: 'no-such-file', file };
  if (testTitles(text).includes(name)) return { state: 'found', file, name };
  const elsewhere = search(name);
  if (elsewhere === null) return { state: 'unsearchable', file, name };
  return elsewhere.length > 0 ? { state: 'moved', file, name, foundIn: elsewhere } : { state: 'nowhere', file, name };
}

// Naming a file means naming its tests: every title `testTitles` finds in it
// is a resolution of its own, so a clause pointing at a whole file is proven
// by breaking any one of them. A file with none is not a silent success —
// nothing here can tell "nobody has written a test yet" from "the wrong file
// was named" — so it reports the same way an absent file does.
function resolveFileTests(file: string, read: (file: string) => string | null): TargetResolution[] {
  const text = read(file);
  if (text === null) return [{ state: 'no-such-file', file }];
  const titles = testTitles(text);
  return titles.length > 0 ? titles.map((name) => ({ state: 'found' as const, file, name })) : [{ state: 'no-tests', file }];
}

// A target that does not open with `vitest` is not this function's concern —
// `command ...` targets are real and outside c1/c2's corpus, which is scoped
// to lines whose value begins `vitest` — so it resolves to nothing rather
// than to a reported failure. Every target that does open with `vitest`
// resolves to at least one entry in the array this returns: a target this
// brief cannot place is `unparseable` rather than dropped, which is the
// difference between this function and the one it replaced.
export function resolveTarget(target: string, read: (file: string) => string | null = readIfPresent, search: (name: string) => string[] | null = suiteFilesFor): TargetResolution[] {
  const trimmed = target.trim();
  if (!/^vitest(\s|$)/.test(trimmed)) return [];
  const named = /^vitest\s+(\S+)\s+"(.*)"\s*$/.exec(trimmed);
  if (named !== null) return [resolveNamedTarget(named[1], named[2], read, search)];
  const files = parseFileList(trimmed.slice('vitest'.length));
  if (files === null) return [{ state: 'unparseable', target }];
  return files.flatMap((file) => resolveFileTests(file, read));
}

// The one place every failure sentence is written, so the display note beside
// a clause's target and the manifest's omitted line say the same thing rather
// than drifting into two descriptions of one fact. Each branch names the form
// that would resolve, which is the property c3 holds this function to —
// `found` carries no such sentence, and is never passed one.
export function describeResolution(resolution: Exclude<TargetResolution, { state: 'found' }>): string {
  switch (resolution.state) {
    case 'moved':
      return `moved: this test is in ${resolution.foundIn.join(', ')}, not in ${resolution.file}`;
    case 'no-such-file':
      return `names no file in this checkout: ${resolution.file} — write a target naming a file this checkout has`;
    case 'nowhere':
      return 'no test by this name exists anywhere in the suite, and `vitest -t` would skip every test and exit 0 — quote the exact title of a test that exists, or drop the quotes to name every test in the file';
    case 'unsearchable':
      return `${resolution.file} has no test by this name, and the suite could not be listed to say whether it moved — quote the title exactly as it is written in the file`;
    case 'no-tests':
      return `${resolution.file} declares no tests — name a file that has at least one \`it(...)\`, or drop it from the target`;
    case 'unparseable':
      return 'does not match a form this brief can resolve — write `vitest <file> "<test name>"` to name one test, or `vitest <file> [<file> ...]` (optionally wrapped in one pair of backticks) to name every test in one or more files';
  }
}

export function unresolvedTarget(target: string, read: (file: string) => string | null = readIfPresent, search: (name: string) => string[] | null = suiteFilesFor): string | null {
  const notes = resolveTarget(target, read, search)
    .filter((resolution) => resolution.state !== 'found')
    .map((resolution) => `   <-- ${describeResolution(resolution as Exclude<TargetResolution, { state: 'found' }>)}`);
  return notes.length > 0 ? notes.join('\n') : null;
}

// `vitest list --json` is the authoritative answer to which file a title
// lives in, and the only one that stays right when a title is built rather
// than written out. It costs a suite load, so the whole index is read once
// and every later target answers from memory — including the failure, which
// is cached as a failure so a checkout that cannot list is not asked again
// per target.
let suiteIndex: Map<string, string[]> | null | undefined;

export function suiteFilesFor(name: string, list: () => string | null = runVitestList): string[] | null {
  if (suiteIndex === undefined) suiteIndex = indexSuiteTitles(list());
  return suiteIndex === null ? null : (suiteIndex.get(name) ?? []);
}

// The `name` vitest reports is the whole describe chain; the leaf after the
// last separator is what an `it` was named, which is what a `proof:` target
// quotes.
export function indexSuiteTitles(json: string | null): Map<string, string[]> | null {
  if (json === null) return null;
  let entries: Array<{ name?: string; file?: string }>;
  try {
    entries = JSON.parse(json);
  } catch {
    return null;
  }
  if (!Array.isArray(entries)) return null;
  const index = new Map<string, string[]>();
  for (const entry of entries) {
    if (typeof entry?.name !== 'string' || typeof entry.file !== 'string') continue;
    const leaf = entry.name.split(' > ').pop()!;
    const file = path.relative(process.cwd(), entry.file).split(path.sep).join('/');
    const files = index.get(leaf) ?? [];
    if (!files.includes(file)) files.push(file);
    index.set(leaf, files);
  }
  return index;
}

function runVitestList(): string | null {
  // shell: npx is a .cmd shim on Windows, unreachable without one.
  const result = spawnSync('npx vitest list --json', { shell: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0 || typeof result.stdout !== 'string') return null;
  const start = result.stdout.indexOf('[');
  return start === -1 ? null : result.stdout.slice(start);
}

// Titles only, never the whole file. Searching the text made an `expect(...)`
// argument and a comment read as a resolved target — the pass-1 defect
// surviving through the guard installed against it, and failing in the one
// direction that hides recurrence.
//
// Backslashes are dropped from the captured title because a title with an
// apostrophe is written `'doctor\'s name'` in the source and is
// `doctor's name` at runtime; a check that called those missing would be the
// false alarm that teaches readers to skip it.
// The optional `(...)` between the name and the title is `it.each([…])`,
// whose title sits in a second call.
export function testTitles(text: string): string[] {
  return [...text.matchAll(/\bit(?:\.\w+)*\s*(?:\([^()'"`]*\)\s*)?\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map((match) => match[2].replace(/\\/g, ''));
}

// The list of tools is checked against the file it was copied from, so it
// cannot quietly outlive a renamed script.
function packageScripts(): Record<string, string> | null {
  const text = readIfPresent('package.json');
  if (text === null) return null;
  try {
    const scripts = (JSON.parse(text) as { scripts?: Record<string, string> }).scripts;
    return scripts && typeof scripts === 'object' ? scripts : null;
  } catch {
    return null;
  }
}

function readIfPresent(file: string): string | null {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

// Each of these is the answer to a question an auditor asks, and none was
// discoverable from a brief that expects them to be used — pass 1 grepped
// package.json to find out what existed.
const AUDIT_TOOLS: Array<{ script: string; command: string; does: string }> = [
  { script: 'tasks', command: 'npm run tasks -- merge-ready', does: 'the whole merge gate — tsc, tests, layer-check, audit-status, doctor, byte check — in one run' },
  { script: 'mutate', command: 'npm run mutate -- <manifest.json>', does: 'breaks a named line, runs the tests it names, restores from bytes it captured, and reports what the suite failed to notice' },
  { script: 'probe', command: 'npm run probe -- <source>... [--show <kind>.<id>] [--round-trip] [--each]', does: 'asks the DSL load path a question without building a runner for it; --each surveys a table of variants split on ---' },
  { script: 'inspect', command: 'npm run inspect -- "<expression>"', does: 'evaluates against the repo\'s own module resolution and leaves no file behind, which is what a scratch .ts was for' },
  { script: 'play', command: 'npm run play', does: 'interactive REPL over startSession/view/apply; # test sections authored from it are the regression format' },
  { script: 'session-timing', command: 'npm run session-timing', does: 'where a session\'s wall clock actually went' },
  { script: 'tasks', command: 'npm run tasks -- where <path>', does: 'what system owns a path, what concept claims it, and every task that ever named it' },
];

// Checked against package.json rather than asserted, because both measured
// auditors read package.json themselves rather than trust this list — and a
// list that has gone stale is worse than one an auditor has to look up, since
// nothing announces the staleness.
export function toolLines(scripts: Record<string, string> | null): string[] {
  return AUDIT_TOOLS.map((tool) => {
    const missing = scripts !== null && scripts[tool.script] === undefined;
    return `- ${tool.command}${missing ? `   <-- package.json has no "${tool.script}" script; this entry is stale` : ''}\n    ${tool.does}`;
  });
}

// What `mutate` prints back, said here so it is read beside the manifest
// rather than looked up. Both passes went to scripts/mutate.ts for it; pass 2
// read the whole file.
const MUTATE_VERDICTS = [
  'A verdict is attributed to a named test, never to a count. A kill is one named test that passed on the unmutated tree and failed with the line broken — the row prints its name, and a row that names no test is not a kill.',
  'KILLED — that named test failed with the line broken, and failed again when the run re-measured it with the mutation still applied at its own file. That second measurement is what makes it a fact rather than a number that moved.',
  'SURVIVED — no test went from passing to failing. Nothing was watching that line; that is the finding.',
  'UNSTABLE — a test failed with the line broken and did not fail again on the same tree with the same mutant. The measurement did not repeat, so it is neither proof nor a survivor. Read it as "this scope cannot answer", not as either verdict, and say so rather than re-running until it picks a side.',
  'ERROR — the mutation did not build, no test ran, or the run\'s failures could not be named. Says nothing about the suite; retarget and run it again.',
  'Scope escalates: the one named `test`, then its `tests` file, then the whole suite — and the scope column reports the chain it walked. `"<a test>" -> <a file>` means that named test survived and something else killed it, which is not that clause proving itself. Widening the scope cannot widen what counts as a kill: a wider run is judged on the same named tests, re-run at their own files, so an unrelated failure the whole suite happened to produce cannot become this clause\'s proof.',
];

export interface MutationEntry {
  name: string;
  file: string;
  find: string;
  replace: string;
  tests: string[];
  test: string;
}

// `parseManifest` refuses a manifest as a whole, so one entry the brief could
// not complete would cost the auditor the entire run. An unresolved target is
// left out and said out loud instead — the omission is information, and the
// nineteen entries beside it still run.
export const UNAIMED_FILE = '<<< the file this clause is implemented in >>>';
export const UNRETARGETED = '<<< the line in that file this clause is about >>>';

// `name`, `tests` and `test` come from the resolution and are facts. Which
// line a clause is about is not derivable from anything this has read, so the
// manifest offers no guess: `file` and `find` are sentinels in a form `mutate`
// refuses — `refusalsFor` cannot read the file, and would not find the text if
// it could — and an entry nobody has aimed stops by name before a baseline
// runs.
export function mutationManifest(
  clauses: Array<{ id: number; targets: string[] }>,
  resolve: (target: string) => TargetResolution[],
): { entries: MutationEntry[]; omitted: string[] } {
  const entries: MutationEntry[] = [];
  const omitted: string[] = [];
  for (const clause of clauses) {
    for (const target of clause.targets) {
      // `resolve` returns one entry per non-`vitest` target: nothing here
      // to omit or enter, because c1/c2's corpus is targets whose value
      // begins `vitest` and this one's does not. A `vitest` target always
      // returns at least one resolution — found, moved, or a named reason —
      // so nothing reaching this loop from that prefix can vanish silently.
      for (const resolution of resolve(target)) {
        if (resolution.state !== 'found' && resolution.state !== 'moved') {
          omitted.push(`c${clause.id}: ${target} — ${describeResolution(resolution)}`);
          continue;
        }
        const file = resolution.state === 'moved' ? resolution.foundIn[0] : resolution.file;
        const name = `c${clause.id} ${resolution.name}`;
        // `parseManifest` refuses two mutations sharing a name, since their
        // verdicts could not be told apart — so a clause naming one test twice
        // (directly, or across two files a `vitest <a> <b>` target names)
        // costs the run rather than repeating an entry.
        if (entries.some((entry) => entry.name === name)) continue;
        entries.push({ name, file: UNAIMED_FILE, find: UNRETARGETED, replace: '', tests: [file], test: resolution.name });
      }
    }
  }
  return { entries, omitted };
}

// The pass file, written for the same reason the manifest is: two recorded
// passes each spent a call learning this format — one running `tasks audit`
// bare to read its usage, one grepping `parseAuditFile` — and the third did
// not, because the brief had started naming `--args-from` inline. A skeleton
// carrying one line per clause removes the format from the brief entirely.
//
// Every value ships empty, and an empty `--proof` is refused by name, so an
// unfilled file stops the same way an unaimed manifest does.
export function auditArgsSkeleton(slug: string, clauses: ProofClause[], pass: number): string {
  const lines = [
    `# Pass ${pass} on ${slug}. Fill in every value, then run:`,
    `#   npm run tasks -- audit ${slug} --args-from <this file>`,
    '# One flag per line. A line that does not open with -- continues the value above it,',
    '# which is how a clause\'s evidence can be a paragraph. `#` at column zero is a comment.',
    '',
    '# met | unmet | unknown | deferred. `met` needs evidence the next pass can re-run and is',
    '# refused without one; `unmet` means you checked and it fails; `unknown` means nobody looked;',
    '# `deferred` means you checked, it fails, and the goal this brief printed still holds without',
    '# it — refused with no reason, and converts the clause into a tracked undelivered record.',
    '',
  ];
  for (const clause of clauses) {
    lines.push(`# [c${clause.id}] ${truncateLine(clause.text.replace(/\s+/g, ' '), 100)}`);
    lines.push(`--proof ${clause.id}=`);
    lines.push(`--evidence ${clause.id}=`);
    lines.push('');
  }
  lines.push('# One block per finding, uncommented. A finding needs both halves: what is broken');
  lines.push('# (--evidence) and what fixing it would mean (--deliverable), and it names what is');
  lines.push('# at fault: the tooling, the contract that briefed the work, or nobody — nobody being');
  lines.push('# a real answer, for a question no one could have answered when the work was briefed.');
  lines.push('# --finding ');
  lines.push('# --severity high|medium|low');
  lines.push('# --system ');
  lines.push(`# --fault ${FAULTS.join('|')}`);
  lines.push('# --file ');
  lines.push('# --deliverable ');
  lines.push('# --evidence ');
  return `${lines.join('\n')}\n`;
}

// The diff range is the branch's and the clause list is the slug's, and
// nothing used to relate the two. On `tasks-roadmap` all eleven slugs in
// `docs/specs/` printed the identical range, so the slug chose only which
// promises were printed beside an unrelated diff — a brief an auditor cannot
// tell apart from a correct one, which is what makes it worse than a missing
// feature. Both facts it needs were already in hand.
export interface SlugStanding {
  slug: string;
  branch: string;
  // Every spec this branch is known to relate to — the union of the
  // branch-name route (a spec file matching the branch's own name) and the
  // branch's own store diff, the same set `merge-ready` grades. Null only
  // when both are silent: no spec file matches the branch name, and the
  // diff could not be read at all, which must not be read as "declares
  // nothing" any more than merge-ready reads it that way.
  declaredSpecs: string[] | null;
  base: string;
  lastPassHead: string | null;
  lastPassMerged: boolean;
}

// `rangeIsThisSlugs` is the fact, `lines` is how it is said. A caller that
// has to decide something — the manifest, which has no business being built
// out of another branch's lines — reads the fact. Deciding it by matching
// the word WARNING in this function's prose put a guard's behaviour under a
// reword, and missed the third standing, which makes the same claim without
// the word.
export interface SlugVerdict {
  lines: string[];
  rangeIsThisSlugs: boolean;
  // Not the negation of the above. A branch working another spec, or a spec
  // that merged before this branch began, is a diff known to be somebody
  // else's; a branch nothing relates to the slug is a diff nobody can place.
  // Both refuse a pass, and a caller that says which is which must not read
  // the second as the first.
  rangeIsUnrelated: boolean;
}

export function slugStanding(standing: SlugStanding): SlugVerdict {
  const lines = slugStandingLines(standing);
  const branchOwnsSlug = standing.declaredSpecs !== null && standing.declaredSpecs.includes(standing.slug);
  // A branch this checkout knows declares *something* — a non-empty set —
  // is the only case that can positively contradict the slug, whether by
  // naming a different spec or by a pass recorded before this branch began.
  // An empty or unreadable set has nothing to contradict it with, so it
  // stays "nobody can place this diff" rather than becoming "known to be
  // somebody else's".
  const positivelyKnown = standing.declaredSpecs !== null && standing.declaredSpecs.length > 0;
  return {
    lines,
    rangeIsThisSlugs: branchOwnsSlug && !standing.lastPassMerged,
    rangeIsUnrelated: positivelyKnown && (!branchOwnsSlug || standing.lastPassMerged),
  };
}

export function slugStandingLines(standing: SlugStanding): string[] {
  const lines: string[] = [];
  if (standing.declaredSpecs === null) {
    lines.push(
      `Could not tell whether ${standing.slug} relates to ${standing.branch}: no spec file matches the branch name, and this branch's own store diff could not be read, so its declared specs cannot be determined. The range above is still this branch's.`,
    );
  } else if (!standing.declaredSpecs.includes(standing.slug)) {
    lines.push(
      standing.declaredSpecs.length === 0
        ? `Nothing relates ${standing.slug} to ${standing.branch}: no spec file matches the branch name, and this branch's own store diff declares no spec. The range above is still this branch's; nothing here says it is ${standing.slug}'s.`
        : `WARNING: this branch is working ${standing.declaredSpecs.join(', ')}, not ${standing.slug}. The diff range above is ${standing.branch}'s, so ${standing.slug}'s clauses below would be graded against a diff that does not contain their implementation. Audit ${standing.declaredSpecs.length === 1 ? standing.declaredSpecs[0] : 'one of them'}, or run this on the branch that owns ${standing.slug}.`,
    );
  }
  if (standing.lastPassMerged && standing.lastPassHead !== null) {
    lines.push(
      `WARNING: ${standing.slug}'s last recorded audit pass was taken at ${standing.lastPassHead.slice(0, 7)}, which is already an ancestor of this range's base ${standing.base.slice(0, 7)} — ${standing.slug} merged before this branch began, so none of the work its clauses describe is in the diff above.`,
    );
  }
  return lines;
}

export function manifestNotes(count: number, manifestPath: string): string[] {
  return [
    manifestPath,
    `${count} entry(ies). \`name\`, \`tests\` and \`test\` are derived: each entry runs the test its clause names, in the file that test actually lives in.`,
    '`file` and `find` are yours, and are the whole judgement — which line a clause is about is not derivable from anything this has read, and four passes measured what a guess at it costs. Both ship as sentinels `mutate` refuses, so an entry you have not aimed stops the run by name before a baseline runs.',
    'Read the clause, find the line in the diff that makes it true, and break that. A kill by any other line is the suite noticing something, not this clause proving itself.',
  ];
}

// Both generated artifacts are the auditor's working copy the moment they
// touch one, and re-reading the brief is something an auditor does mid-pass.
// Overwriting unconditionally threw away an aimed manifest and a part-filled
// pass file, silently, with no way back. So an existing file is kept and
// named: a stale artifact is recoverable by deleting it, and an aimed one
// destroyed is not.
function writeArtifact(path_: string, contents: string): { kept: boolean } {
  if (existsSync(path_)) return { kept: true };
  writeFileSync(path_, contents, 'utf8');
  return { kept: false };
}

function keptNote(path_: string, what: string): string {
  return `This file already exists and was left alone — it is the ${what} from an earlier run of this brief, and yours if you have aimed it. Delete it to regenerate against the current diff: ${path_}`;
}

// Written outside the worktree, because the brief is a read of the repository
// and a generated file left in it would show up as the branch's own work.
// Returned rather than printed: the procedure at the top of the brief names
// this path, and it is printed before any of the data below it.
function writeMutationManifest(slug: string, clauses: ProofClause[], pass: number, diffIsForeign: boolean): { lines: string[]; path: string | null } {
  if (diffIsForeign) {
    return { lines: [`No mutation manifest: the diff above is not ${slug}'s, so every line it could break belongs to work these clauses do not describe.`], path: null };
  }
  const { entries, omitted } = mutationManifest(
    clauses.map((clause) => ({ id: clause.id, targets: clause.proofTargets ?? [] })),
    (target) => resolveTarget(target),
  );
  const lines = ['Mutation manifest — wired to the tests above, and refusing to run until you aim it:'];
  let manifestPath: string | null = null;
  if (entries.length === 0) {
    lines.push('- none — no proof target on this spec resolved to a test this brief could name');
  } else {
    // Keyed to the pass, as the pass file already was. One path for every pass
    // handed pass N+1 the *aimed* manifest pass N left behind, under a step
    // that says to aim it — an auditor who ran it as found would be measuring
    // last pass's judgement against this pass's diff and reading the kills as
    // their own.
    manifestPath = path.join(os.tmpdir(), `mutations-${slug}-pass${pass}.json`);
    const { kept } = writeArtifact(manifestPath, `${JSON.stringify(entries, null, 2)}\n`);
    // On both paths, because what the fields mean does not depend on who
    // wrote the file. The kept path used to suppress all four lines, so an
    // auditor resuming mid-pass lost the one sentence that says an escalated
    // kill is not the clause proving itself.
    for (const note of manifestNotes(entries.length, manifestPath)) lines.push(`  ${note}`);
    if (kept) lines.push(`  ${keptNote(manifestPath, 'mutation manifest')}`);
  }
  for (const line of omitted) lines.push(`- omitted: ${line}`);
  return { lines, path: manifestPath };
}

export function cmdAuditPrompt(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    reportUnknownSpec(config, slug, (line) => console.log(line));
    return;
  }

  const baseBranch = args.flags['base-branch'] ?? 'main';
  // A read answers, including when the answer is that it could not resolve
  // the range.
  const range = resolveDiffRange(baseBranch, (line) => console.log(line));
  if (range === null) return;
  const { base, head } = range;

  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  const tasks = readStore(config);
  const members = tasks.filter((task) => task.spec === slug);
  const latest = doc.auditPasses[doc.auditPasses.length - 1];

  // Locators (`path:12`, `path#H1`) are evidence on the record; what the
  // auditor opens is the path, so the union is over paths — otherwise one
  // file appears twice, once openable and once not.
  const relevantFiles = [...new Set([...members.flatMap((task) => task.files), ...diffChangedFiles(`${base}..${head}`)].map((file) => file.split(/[:#]/)[0]))].sort();
  const noTargetCount = doc.proofClauses.filter((clause) => (clause.proofTargets ?? []).length === 0).length;

  console.log(`You are auditing ${slug} on branch ${config.branch}.`);
  console.log(`Spec: ${path_}`);
  // Printed here, not left for step 1's full read, because it is what a
  // deferred verdict is judged against — an auditor deciding that in step 3
  // should not have had to open the file to find it.
  console.log(`Goal: ${doc.goal ?? `(none recorded — add a \`## Goal\` line to ${path_}; a deferral has nothing to weigh against without one)`}`);
  console.log(`Diff range: ${base}..${head}`);
  // Two signals for "does this branch relate to this slug", unioned rather
  // than chosen between: the branch-name match is retained because it is
  // correct wherever it fires, and the branch's own store diff — the same
  // set merge-ready grades — is what actually fires on a branch whose name
  // never matches a spec file, which is most of them. Neither derives *the*
  // spec to operate on; the slug came from the caller, and this only checks
  // whether it belongs to what the branch has declared.
  const diff = storeDiff(config, base, tasks);
  const diffSpecs = diff.readable ? declaredSpecs(diff.changed) : null;
  const branchNameSpec = currentSpec(config);
  const knownSpecsForBranch: string[] | null =
    diffSpecs === null && branchNameSpec === null ? null : [...new Set([...(diffSpecs ?? []), ...(branchNameSpec !== null ? [branchNameSpec] : [])])].sort();

  const standing = slugStanding({
    slug,
    branch: config.branch,
    declaredSpecs: knownSpecsForBranch,
    base,
    lastPassHead: latest?.head ?? null,
    lastPassMerged: latest?.head !== undefined && latest.head !== '(unresolved)' && git.isAncestor(latest.head, base),
  });
  for (const line of standing.lines) {
    console.log('');
    console.log(line);
  }

  // Both artifacts the procedure names are built before it is printed, so a
  // step can name the path it acts on rather than a heading further down.
  // Both are gated on the same fact for the same reason: a pass recorded
  // against a diff these clauses do not describe is the c7 defect one layer
  // down, and the manifest was gated while the pass file — which writes
  // tracked repo state — was not.
  const pass = doc.auditPasses.length + 1;
  const manifest = writeMutationManifest(slug, doc.proofClauses, pass, !standing.rangeIsThisSlugs);
  const argsPath = standing.rangeIsThisSlugs ? path.join(os.tmpdir(), `audit-${slug}-pass${pass}.txt`) : null;
  const argsKept = argsPath !== null && writeArtifact(argsPath, auditArgsSkeleton(slug, doc.proofClauses, pass)).kept;

  console.log('');
  console.log('Steps, in order. Each command names the next one when it finishes.');
  console.log('');
  // The two artifacts above are already keyed to slug and pass. Anything else
  // this auditor writes is not, and an orchestrator's instruction to prefix a
  // dispatched agent's scratch files reaches an orchestrated run and not an
  // auditor commissioned directly — which is most of them. So the brief names
  // its own prefix rather than relying on who dispatched it.
  console.log(`0. Anything you write outside the repository goes in ${os.tmpdir()} named \`audit-${slug}-pass${pass}-<what it is>\`. Concurrent auditors share that directory, and a second manifest called \`mutations.json\` overwrites somebody else's judgement rather than colliding with it.`);
  console.log('');
  console.log(`1. Read ${path_} in full. \`## Deliverable\` is the argument the clauses promise about, \`## Decisions\` are settled and not to be reopened, \`## Audit passes\` is what earlier passes found.`);
  console.log('2. Read the diff over the range above. Do not assume the implementation approach is correct; verify each clause independently.');
  console.log('3. Grade every clause under `Proof clauses:` below.');
  console.log('     met      — you have evidence the next pass can re-run. The tool refuses met without one.');
  console.log('     unmet    — you checked and it fails.');
  console.log('     unknown  — nobody looked. Recording unmet instead hides that nothing was verified.');
  console.log('     deferred — you checked, it fails, and the goal above still holds without it. Ask this before recording unmet: does the goal still hold if this clause is never met? If yes, deferred is available — never a synonym for unmet. The tool refuses it with no reason, and converts the clause into a tracked undelivered record rather than dropping it.');
  console.log(`4. Mutation-test every clause carrying a proof target. Set each entry's \`file\` and \`find\` to the line that clause is about — that judgement is the whole exercise and nothing here makes it for you — then \`npm run mutate -- <it>\`.`);
  console.log(`     ${manifest.path ?? 'no manifest was written; see `Mutation manifest:` below for why'}`);
  console.log('5. Answer the regression question: is anything worse than before this branch? Clause-by-clause verification cannot see this — each clause looks fine in isolation. Diff the behavior, not the promise.');
  console.log('6. Run `npm run tasks -- merge-ready` — tsc, tests, layer-check, audit-status, doctor and the byte check, in one invocation.');
  if (argsPath === null) {
    // Worded from the standing it was computed from. Two of the three say the
    // diff is another branch's; the third says only that nothing relates the
    // slug to this branch, and asserting more than the warning above it does
    // is how a brief teaches an auditor to trust neither half.
    console.log(`7. Do not file a pass. ${standing.rangeIsUnrelated ? `The diff above is not ${slug}'s` : `Nothing relates ${slug} to this branch, so nothing says the diff above is its`}, and a verdict taken over it would not be about these clauses — which is why no pass file was written.`);
  } else {
    console.log(`7. File the pass. This file is written with one line per clause; fill in the values and run the command in its header:`);
    console.log(`     ${argsPath}`);
    console.log(`     npm run tasks -- audit ${slug} --args-from ${argsPath}`);
    if (argsKept) console.log(`     ${keptNote(argsPath, 'pass file')}`);
  }
  console.log('8. File what this audit cost you — task tool, audit tool, harness — into the channel, with what you measured. One record per friction:');
  console.log('     npm run tasks -- add "<what cost you>" --kind finding --fault tooling|contract|nobody --deliverable "what fixing it would mean" --evidence "what you measured"');
  console.log('   Add `--breaches <lesson-handle>` when what failed was an instruction below that did not land, and use `npm run tasks -- recur <id> --note "what it cost this time"` when the channel already holds it — a recurrence is counted and a second record is not. `npm run tasks -- friction` is the query over all of it.');
  console.log('   Nothing you file here gates anything, and a fault of `nobody` is never counted as a defect. There is no markdown file to append to: prose does not aggregate, and the friction that recurs is the one that stays invisible.');
  console.log('');
  console.log('Look specifically for:');
  for (const item of AUDIT_CHECKLIST) console.log(`- ${item}`);
  console.log('');
  printLessons('What repeated passes had to learn the hard way — carry it forward:', AUDITOR_LESSONS);
  console.log('');
  console.log('You file findings; you never promote them. Triage is a separate step with a separate actor, and its rule differs by pass: a branch\'s own first-pass findings are promoted without a walk, so a HIGH you file here will be scheduled without anyone asking you again; from pass 2 on, promotion extends what the spec already owes and waits for a human. Say plainly which of yours you believe this branch must not merge without.');
  console.log('Every finding needs both halves: what is broken, and what fixing it would mean.');
  console.log('');
  console.log('Tools an auditor may reach for:');
  for (const line of toolLines(packageScripts())) console.log(line);
  console.log('');
  console.log('How to read what `mutate` prints back:');
  for (const line of MUTATE_VERDICTS) console.log(`- ${line}`);
  console.log('');
  console.log('Commits in this range:');
  const commits = git.commitLog(`${base}..${head}`) ?? [];
  if (commits.length === 0) console.log('- none');
  for (const commit of commits) console.log(`- ${commit.sha} ${commit.subject}\n    ${commit.files.join(', ') || 'no files'}`);
  console.log('');
  console.log('Diff stat:');
  console.log(git.diffStat(`${base}..${head}`) || '(none)');
  console.log('');
  console.log('Relevant files:');
  if (relevantFiles.length === 0) console.log('- none');
  for (const file of relevantFiles) console.log(`- ${file}`);
  console.log('');
  printOwnership(config, tasks, relevantFiles);
  console.log('`npm run tasks -- where <path>` answers this in full for one path — owning system, audit coverage, exports, imports across a system boundary, and every claim including the closed ones. `npm run tasks -- produces "<name>"` asks the same question by capability name rather than by path.');
  console.log('');
  // Two names, not the list: this exists so the standing above can be checked
  // against a slug this branch does not own, and one other slug proves it.
  // The full list grows with the repository and was read as inventory.
  const otherSpecs = knownSpecs(config).filter((known) => known !== slug);
  if (otherSpecs.length > 0) {
    console.log(`To check the standing above against a slug this branch does not own, run audit-prompt on one of: ${otherSpecs.slice(0, 2).join(', ')} (\`ls ${config.specsDir}\` for the rest).`);
    console.log('');
  }
  const standings = clauseStandings(doc.proofClauses, doc.auditPasses);
  console.log('Proof clauses:');
  for (const clause of doc.proofClauses) {
    console.log(`- [c${clause.id}] ${clause.text}`);
    const standing = standings.find((verdict) => verdict.clause === clause.id)!;
    console.log(`  standing: ${standing.status}${standing.status === 'unknown' ? ' — nobody has graded this clause' : standing.evidence ? ` — ${standing.evidence}` : ''}`);
    const targets = clause.proofTargets ?? [];
    if (targets.length === 0) {
      console.log('  no proof target — requires human verification: inspect the behavior directly.');
      console.log('  If this is pure domain logic or an API layer, prefer naming a `proof: vitest <file> "<test>"` or `proof: command <cmd>` target so a future pass can mutation-test it. If this is UI work, add or run smoke coverage once the implementation has settled.');
    } else {
      for (const target of targets) console.log(`  proof: ${target}${unresolvedTarget(target) ?? ''}`);
      console.log('  has a proof target — if it names pure logic or an API, temporarily remove, invert, or scale the behavior it proves and confirm it fails for the right reason before accepting it; a UI or smoke target is inspected, not mutation-tested.');
    }
  }
  console.log('');
  if (noTargetCount > 0) console.log(`${noTargetCount} of ${doc.proofClauses.length} clause(s) have no proof target and require human verification.`);
  console.log('');
  console.log(`${latest ? `Latest audit pass: pass ${latest.pass} (${latest.date})` : 'Latest audit pass: none recorded'} — ${outstandingSummary(standings)}`);
  console.log('');
  console.log('Member tasks:');
  if (members.length === 0) console.log('- none');
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of members) printRow(task, byId, { indent: '- ', withFiles: true });
  console.log('');
  for (const line of manifest.lines) console.log(line);
  console.log('');
  console.log('Do not treat green tests as proof unless they are tied to the clause they discharge.');
  console.log(`Findings filed after this pass is recorded go in on their own: \`npm run tasks -- audit ${slug}\` with findings and no --proof flags appends no pass, so a late finding never erases a recorded verdict.`);
}
