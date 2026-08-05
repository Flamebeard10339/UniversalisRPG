import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { regionView } from '../lib/architecture';
import { harvestFiles, parseAuditDoc, systemForDoc } from '../lib/auditImport';
import * as git from '../lib/git';
import { appendAuditPass, clauseStandings, duplicateClauseIds, outstandingSummary, parseSpecDoc, stampClauseIds, VERDICTS, type AuditVerdict, type ProofClause, type Verdict } from '../lib/specDoc';
import { priorArt } from '../lib/producers';
import { loadStore, type Severity, type Task } from '../lib/taskStore';
import { architecture, ownership, printPriorArt } from './architectureCmds';
import type { Flags } from './cli';
import { readStore, recordEvents, type Config, refuseUnknownSpec, reportUnknownSpec, resolveActiveSpec, resolveConfig, saveStoreAndWarn, slugify, specFile, subjectOf, today, uniqueId } from './context';
import { activePrompter } from './prompt';
import { printRow, truncateLine } from './render';

// The migration path only, for the legacy documents under docs/audits/ and
// any new report written as one. Findings under `## H1` / `## M2` / `## L3`
// become unreviewed tasks; every other heading shape in those docs is a
// superseded or reconciliation format and is silently left unimported.
export function cmdImport(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const docPath = args.positional[0];
  if (!docPath) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(docPath)) {
    console.error(`error: no such file: ${docPath}`);
    process.exitCode = 1;
    return;
  }

  const basename = path.basename(docPath).replace(/\.md$/, '');
  const system = systemForDoc(basename);
  const findings = parseAuditDoc(readFileSync(docPath, 'utf8'));

  const tasks = loadStore(config.storePath);
  const taken = new Set(tasks.map((task) => task.id));
  const created: Task[] = [];
  let imported = 0;
  let skipped = 0;
  for (const finding of findings) {
    const id = `${basename}-${finding.code.toLowerCase()}`;
    if (taken.has(id)) {
      skipped++;
      continue;
    }
    const task: Task = {
      id,
      title: finding.title,
      kind: 'finding',
      state: 'unreviewed',
      severity: finding.severity,
      system,
      spec: null,
      clause: null,
      requires: [],
      writes: [],
      discharges: [],
      grant: null,
      produces: [],
      files: [`${docPath}#${finding.code}`, ...harvestFiles(finding.body, existsSync)],
      deliverable: null,
      evidence: finding.body,
      source: null,
      reason: null,
      closed: null,
      closedCommit: null,
      claimed: null,
      claimedBy: null,
      extra: null,
    };
    tasks.push(task);
    taken.add(id);
    created.push(task);
    imported++;
  }
  saveStoreAndWarn(tasks, config);
  recordEvents(
    config,
    'import',
    created.map((task) => subjectOf(task, `imported from ${docPath} as ${task.severity ?? 'unrated'} finding ${truncateLine(task.title, 60)}`)),
  );

  const skippedNote = skipped > 0 ? ` (${skipped} already present, skipped)` : '';
  const systemNote = system === null && findings.length > 0 ? ' — no system mapping for this doc name, system left null' : '';
  console.log(`imported ${imported} finding(s) from ${docPath}${skippedNote}${systemNote}`);
}

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

// A read of the repository the brief is being generated in. Null is "this
// checkout could not answer", which every caller here renders rather than
// throwing over — a brief missing its diff stat is worth more than no brief.
function gitRead(args: string[]): string | null {
  try {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function diffChangedFiles(range: string): string[] {
  const output = gitRead(['diff', '--name-only', range])?.trim() ?? '';
  return output === '' ? [] : output.split('\n');
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
  else printPriorArt(priorArt(arch.manifest, tasks, owned));
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
export type TargetResolution =
  | { state: 'found'; file: string; name: string }
  | { state: 'moved'; file: string; name: string; foundIn: string[] }
  | { state: 'no-such-file'; file: string; name: string }
  | { state: 'nowhere'; file: string; name: string }
  | { state: 'unsearchable'; file: string; name: string };

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
export function resolveTarget(target: string, read: (file: string) => string | null = readIfPresent, search: (name: string) => string[] | null = suiteFilesFor): TargetResolution | null {
  const parsed = /^vitest\s+(\S+)\s+"(.*)"\s*$/.exec(target);
  if (parsed === null) return null;
  const [, file, name] = parsed;
  const text = read(file);
  if (text === null) return { state: 'no-such-file', file, name };
  if (testTitles(text).includes(name)) return { state: 'found', file, name };
  const elsewhere = search(name);
  if (elsewhere === null) return { state: 'unsearchable', file, name };
  return elsewhere.length > 0 ? { state: 'moved', file, name, foundIn: elsewhere } : { state: 'nowhere', file, name };
}

export function unresolvedTarget(target: string, read: (file: string) => string | null = readIfPresent, search: (name: string) => string[] | null = suiteFilesFor): string | null {
  const resolution = resolveTarget(target, read, search);
  if (resolution === null || resolution.state === 'found') return null;
  if (resolution.state === 'no-such-file') return `   <-- names no file in this checkout: ${resolution.file}`;
  if (resolution.state === 'moved') return `   <-- moved: this test is in ${resolution.foundIn.join(', ')}, not in ${resolution.file}`;
  if (resolution.state === 'unsearchable') return `   <-- ${resolution.file} has no test by this name, and the suite could not be listed to say whether it moved`;
  return `   <-- no test by this name exists anywhere in the suite, and \`vitest -t\` would skip every test and exit 0`;
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
const AUDIT_TOOLS: Array<[string, string]> = [
  ['npm run tasks -- merge-ready', 'the whole merge gate — tsc, tests, layer-check, audit-status, doctor, byte check — in one run'],
  ['npm run mutate -- <manifest.json>', 'breaks a named line, runs the tests it names, restores from bytes it captured, and reports what the suite failed to notice'],
  ['npm run probe -- <source>... [--show <kind>.<id>] [--round-trip] [--each]', 'asks the DSL load path a question without building a runner for it; --each surveys a table of variants split on ---'],
  ['npm run inspect -- "<expression>"', 'evaluates against the repo\'s own module resolution and leaves no file behind, which is what a scratch .ts was for'],
  ['npm run play', 'interactive REPL over startSession/view/apply; # test sections authored from it are the regression format'],
  ['npm run session-timing', 'where a session\'s wall clock actually went'],
  ['npm run tasks -- where <path>', 'what system owns a path, what concept claims it, and every task that ever named it'],
];

export interface Commit {
  sha: string;
  subject: string;
  files: string[];
}

// `%x00` opens each record, so a subject containing a newline cannot be read
// as the start of the file list under it.
export function parseCommitLog(raw: string): Commit[] {
  return raw
    .split('\0')
    .map((record) => record.replace(/^\n+/, '').trimEnd())
    .filter((record) => record !== '')
    .map((record) => {
      const [header, ...files] = record.split('\n');
      const space = header.indexOf(' ');
      return {
        sha: space === -1 ? header : header.slice(0, space),
        subject: space === -1 ? '' : header.slice(space + 1),
        files: files.map((file) => file.trim()).filter((file) => file !== ''),
      };
    });
}

export interface MutationEntry {
  name: string;
  file: string;
  find: string;
  replace: string;
  tests: string[];
  test: string;
  note: string;
}

// A comment, an import or a declaration measures the compiler when deleted,
// and a line that opens a block takes its closing brace with it. Both come
// back as ERROR — a verdict that says the mutation did not build, not that
// the suite missed it, which is the one verdict a generated entry can afford
// least.
const SKIP_MUTATING = /^(\/\/|\*|import |export (type|interface|function|const)|function |interface |type |\})|[{([]$/;

// The lines this branch added that deleting would be felt, longest first.
// Comments, imports and punctuation are excluded because deleting one
// measures the compiler rather than the suite, and a line the file carries
// twice is excluded because `mutate` refuses an ambiguous find rather than
// guessing which one it meant. Several are returned rather than one, so a
// spec with twelve targets mutates twelve different lines instead of the
// same line twelve times.
export function breakableAddedLines(diff: string, source: string | null): string[] {
  if (source === null) return [];
  const added = diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1).trim());
  return [...new Set(added)]
    .filter((line) => line.length > 12 && /[a-z]/i.test(line) && !SKIP_MUTATING.test(line) && source.split(line).length === 2)
    .sort((a, b) => b.length - a.length);
}

// `parseManifest` refuses a manifest as a whole, so one entry the brief could
// not complete would cost the auditor the entire run. An unresolved target is
// left out and said out loud instead — the omission is information, and the
// nineteen entries beside it still run.
export const UNRETARGETED = '<<< replace this with a line from the file above that this clause is about >>>';

// `find` is the one field nothing here can derive. The brief knows the file
// a clause's task wrote and every line this branch added to it, and nothing
// that says which of those lines the clause's own test is about — pass 2
// measured what filling it in anyway produced: eleven entries sharing five
// lines of WARNING prose and note templates, nine green kills, every one of
// them escalated past the test whose clause it claimed to prove.
//
// So it is left unfilled, in a form `mutate` already refuses: `refusalsFor`
// stops the whole run on a find text the file does not contain, and prints
// the nearest line beside what was asked for. A manifest that refuses until
// the auditor has aimed it cannot hand back a green run that proves nothing.
// The lines that were being guessed from are carried in `note` instead,
// which is what makes retargeting a paste rather than a rewrite.
export function mutationManifest(
  clauses: Array<{ id: number; targets: string[] }>,
  resolve: (target: string) => TargetResolution | null,
  candidates: (clause: number) => Array<{ file: string; find: string }>,
): { entries: MutationEntry[]; omitted: string[] } {
  const entries: MutationEntry[] = [];
  const omitted: string[] = [];
  for (const clause of clauses) {
    for (const target of clause.targets) {
      const resolution = resolve(target);
      if (resolution === null) continue;
      if (resolution.state !== 'found' && resolution.state !== 'moved') {
        omitted.push(`c${clause.id}: ${target} — ${resolution.state === 'no-such-file' ? 'names no file in this checkout' : resolution.state === 'nowhere' ? 'no test by this name exists anywhere' : 'the suite could not be listed to place it'}`);
        continue;
      }
      const suggestions = candidates(clause.id);
      if (suggestions.length === 0) {
        omitted.push(`c${clause.id}: ${target} — this branch's diff has no line under it that deleting would measure`);
        continue;
      }
      const file = resolution.state === 'moved' ? resolution.foundIn[0] : resolution.file;
      const name = `c${clause.id} ${resolution.name}`;
      // `parseManifest` refuses two mutations sharing a name, since their
      // verdicts could not be told apart — so a clause naming one test twice
      // costs the run rather than repeating an entry.
      if (entries.some((entry) => entry.name === name)) continue;
      entries.push({
        name,
        file: suggestions[0].file,
        find: UNRETARGETED,
        replace: '',
        tests: [file],
        test: resolution.name,
        note: `paste one of these over find — lines c${clause.id} added, whichever its test is about: ${suggestions.slice(0, 6).map((suggestion) => JSON.stringify(suggestion.find)).join(' | ')}`,
      });
    }
  }
  return { entries, omitted };
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
  branchSpec: string | null;
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
}

export function slugStanding(standing: SlugStanding): SlugVerdict {
  const lines = slugStandingLines(standing);
  const branchOwnsSlug = standing.branchSpec === standing.slug;
  return { lines, rangeIsThisSlugs: branchOwnsSlug && !standing.lastPassMerged };
}

export function slugStandingLines(standing: SlugStanding): string[] {
  const lines: string[] = [];
  if (standing.branchSpec !== null && standing.branchSpec !== standing.slug) {
    lines.push(
      `WARNING: this branch is working ${standing.branchSpec}, not ${standing.slug}. The diff range above is ${standing.branch}'s, so ${standing.slug}'s clauses below would be graded against a diff that does not contain their implementation. Audit ${standing.branchSpec}, or run this on the branch that owns ${standing.slug}.`,
    );
  } else if (standing.branchSpec === null) {
    lines.push(`Nothing relates ${standing.slug} to ${standing.branch}: no spec file named for the branch, and no store or event-log record of this branch working a spec. The range above is this branch's whatever ${standing.slug} promised.`);
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
    `${count} entry(ies). \`name\`, \`file\`, \`tests\` and \`test\` are derived: each entry runs the test its clause names, in the file that test actually lives in.`,
    `\`find\` is yours, one paste per entry. Every entry ships \`${UNRETARGETED}\`, which is not in the file, so \`mutate\` refuses the run and names each entry you have not aimed yet — a manifest cannot come back green until you have.`,
    'Each entry\'s `note` carries the lines this branch added under that clause. Paste the one its test is about over `find`; the rest of the entry is already right.',
  ];
}

// Written outside the worktree, because the brief is a read of the
// repository and a generated file left in it would show up as the branch's
// own work. The path is named so `npm run mutate -- <it>` is a copy away.
function writeMutationManifest(slug: string, clauses: ProofClause[], members: Task[], changed: string[], range: string, diffIsForeign: boolean): void {
  if (diffIsForeign) {
    console.log(`No mutation manifest: the diff above is not ${slug}'s, so every line it could break belongs to work these clauses do not describe.`);
    return;
  }
  const sources = changed.filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts') && existsSync(file));
  const cached = new Map<number, Array<{ file: string; find: string }>>();
  const candidates = (clause: number): Array<{ file: string; find: string }> => {
    if (!cached.has(clause)) {
      const claimed = members.filter((task) => task.discharges.includes(clause)).flatMap((task) => [...task.writes, ...task.files].map((entry) => entry.split(/[:#]/)[0]));
      // A file the clause's own task named comes first, since a line from it
      // is a line that clause is answerable for; the rest of the diff after.
      const ordered = [...sources.filter((file) => claimed.includes(file)), ...sources.filter((file) => !claimed.includes(file))];
      // One file's lines, not every file's: `file` is a single field, so a
      // suggestion from a second file would need two edits rather than the
      // one paste the entry promises.
      const first = ordered.find((file) => breakableAddedLines(gitRead(['diff', '-U0', range, '--', file]) ?? '', readIfPresent(file)).length > 0);
      cached.set(clause, first === undefined ? [] : breakableAddedLines(gitRead(['diff', '-U0', range, '--', first]) ?? '', readIfPresent(first)).map((find) => ({ file: first, find })));
    }
    return cached.get(clause)!;
  };

  const { entries, omitted } = mutationManifest(
    clauses.map((clause) => ({ id: clause.id, targets: clause.proofTargets ?? [] })),
    (target) => resolveTarget(target),
    candidates,
  );
  console.log('Mutation manifest — the scaffold, wired to the tests above and refusing to run until you aim it:');
  if (entries.length === 0) {
    console.log('- none — no proof target on this spec resolved to a test with a line of this branch under it');
  } else {
    const manifestPath = path.join(os.tmpdir(), `mutations-${slug}.json`);
    writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
    for (const line of manifestNotes(entries.length, manifestPath)) console.log(`  ${line}`);
  }
  for (const line of omitted) console.log(`- omitted: ${line}`);
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
  console.log(`Diff range: ${base}..${head}`);
  const standing = slugStanding({
    slug,
    branch: config.branch,
    branchSpec: resolveActiveSpec(config, tasks, undefined).spec,
    base,
    lastPassHead: latest?.head ?? null,
    lastPassMerged: latest?.head !== undefined && latest.head !== '(unresolved)' && git.isAncestor(latest.head, base),
  });
  for (const line of standing.lines) {
    console.log('');
    console.log(line);
  }
  console.log('');
  console.log('Do not assume the implementation approach is correct. Read the spec deliverable, the latest audit pass if any, and the diff above. Verify each proof clause independently.');
  console.log('');
  console.log('The audit answers two questions, and the second cannot be reached clause by clause:');
  console.log('1. Is every promised clause delivered, with evidence that runs?');
  console.log('2. Is anything worse than before this branch? Clause-by-clause verification cannot see a regression, because each clause looks fine in isolation — diff the behavior, not the promise.');
  console.log('');
  console.log('Look specifically for:');
  for (const item of AUDIT_CHECKLIST) console.log(`- ${item}`);
  console.log('');
  console.log('Required commands (all must pass; `npm run tasks -- merge-ready` runs them together):');
  console.log('- npm run tasks -- merge-ready');
  console.log('');
  console.log('Log any tool friction — task tool, audit tool, harness — in .planning/agent-feedback/tool-friction.md');
  console.log('');
  console.log('Tools an auditor may reach for:');
  for (const [command, does] of AUDIT_TOOLS) console.log(`- ${command}\n    ${does}`);
  console.log('');
  console.log('Commits in this range:');
  const commits = parseCommitLog(gitRead(['log', '--format=%x00%h %s', '--name-only', `${base}..${head}`]) ?? '');
  if (commits.length === 0) console.log('- none');
  for (const commit of commits) console.log(`- ${commit.sha} ${commit.subject}\n    ${commit.files.join(', ') || 'no files'}`);
  console.log('');
  console.log('Diff stat:');
  console.log(gitRead(['diff', '--stat', `${base}..${head}`])?.trimEnd() || '(none)');
  console.log('');
  console.log('Relevant files:');
  if (relevantFiles.length === 0) console.log('- none');
  for (const file of relevantFiles) console.log(`- ${file}`);
  console.log('');
  printOwnership(config, tasks, relevantFiles);
  console.log('');
  if (doc.decisionsSection !== '') {
    console.log(`${slug}'s own decisions — settled arguments, not open ones:`);
    console.log(doc.decisionsSection.split('\n').slice(1).join('\n').trim());
    console.log('');
  }
  const standings = clauseStandings(doc.proofClauses, latest?.verdicts);
  console.log('Proof clauses:');
  for (const clause of doc.proofClauses) {
    console.log(`- [c${clause.id}] ${clause.text}`);
    const standing = standings.find((verdict) => verdict.clause === clause.id)!;
    console.log(`  latest verdict: ${standing.status}${standing.status === 'unknown' ? ' — nobody has graded this clause' : standing.evidence ? ` — ${standing.evidence}` : ''}`);
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
  writeMutationManifest(slug, doc.proofClauses, members, relevantFiles, `${base}..${head}`, !standing.rangeIsThisSlugs);
  console.log('');
  console.log('For every clause with a proof target, confirm the target exists and fails under a meaningful mutation or reproduction before accepting it as proof. `npm run mutate -- <manifest.json>` is the tool; `npm run probe` asks the DSL load path questions without a scratch runner.');
  console.log('Do not treat green tests as proof unless they are tied to the clause they discharge.');
  console.log('');
  console.log('Deliver your results into the store, not into a report nobody reads:');
  console.log(`- verdicts: \`tasks audit ${slug} --proof N=met|unmet|unknown --evidence N="..." ...\` — met requires evidence the next pass can re-run; unmet means you checked and it fails; ungraded clauses are recorded unknown.`);
  console.log(`- findings: file them in the same \`tasks audit\` call (--finding "..." --severity ... --system "..." --deliverable "..." --evidence "..."), or write the report under docs/audits/ and \`tasks import <doc>\`. Every finding needs both halves: what is broken, and what fixing it would mean.`);
  console.log(`- \`tasks audit ${slug}\` with findings and no --proof flags files the findings without recording a pass, so filing late findings never erases recorded verdicts.`);
  console.log('If you write a report document, archive it under docs/audits/ before the session ends — but the store is the record of note.');
  console.log('');
  console.log('Report each clause as met, unmet or unknown. `met` carries the evidence that backs it and the tool refuses it without one; `unmet` means you checked and it fails; `unknown` means nobody looked, and reporting it as unmet instead hides that nothing was verified.');
  console.log('You file findings; you never promote them. Triage is a separate step with a separate actor, and its rule differs by pass: a branch\'s own first-pass findings are promoted without a walk, so a HIGH you file here will be scheduled without anyone asking you again; from pass 2 on, promotion extends what the spec already owes and waits for a human. Say plainly which of yours you believe this branch must not merge without.');
}

interface AuditFinding {
  title: string;
  severity: Severity | null;
  system: string | null;
  files: string[];
  deliverable: string | null;
  evidence: string | null;
}

interface AuditArgs {
  slug: string | null;
  configFlags: Record<string, string>;
  baseBranch: string;
  proofs: Map<number, Verdict>;
  evidence: Map<number, string>;
  errors: string[];
  // Files named for an unmet proof clause — where the undelivered task
  // this pass creates for it should tell the next session to start.
  clauseFiles: Map<number, string[]>;
  findings: AuditFinding[];
}

const CONFIG_FLAG_NAMES = new Set(['store', 'systems', 'specs-dir', 'branch', 'actor']);

// The clause-scoped `N=value` shape --proof, --file and --evidence share
// before any --finding opens. One parser for it: the two `--evidence`
// branches used to each carve the `N=` prefix off by hand, and drifted.
function clauseScoped(raw: string): { clause: number; value: string } | null {
  const eq = raw.indexOf('=');
  if (eq <= 0) return null;
  const clause = Number(raw.slice(0, eq));
  return Number.isFinite(clause) ? { clause, value: raw.slice(eq + 1) } : null;
}

// Repeated --proof/--evidence/--finding flags need a dedicated scanner: the
// generic parseArgs collapses a repeated flag to its last value, and a
// --finding's --severity/--system/--file belong to whichever --finding
// came most recently, which a flat key-value map cannot express.
//
// --file and --evidence are overloaded by position: while no --finding has
// been seen yet they are clause-scoped and take the same `N=value` shape as
// --proof (`--file 2=src/save.ts:88`); once a --finding is open they attach
// to that finding instead and take a bare value.
export function parseAuditArgs(args: string[]): AuditArgs {
  const configFlags: Record<string, string> = {};
  let baseBranch = 'main';
  const proofs = new Map<number, Verdict>();
  const evidence = new Map<number, string>();
  const errors: string[] = [];
  const clauseFiles = new Map<number, string[]>();
  const findings: AuditFinding[] = [];
  let slug: string | null = null;
  let current: AuditFinding | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      if (slug === null) slug = arg;
      continue;
    }
    const key = arg.slice(2);
    const value = args[i + 1];
    i++;
    if (CONFIG_FLAG_NAMES.has(key)) {
      configFlags[key] = value ?? '';
    } else if (key === 'base-branch') {
      baseBranch = value ?? 'main';
    } else if (key === 'proof') {
      const [clause, status] = (value ?? '').split('=');
      if (!VERDICTS.includes(status as Verdict)) errors.push(`--proof ${value ?? ''} names no verdict — a clause is met, unmet or unknown`);
      else proofs.set(Number(clause), status as Verdict);
    } else if (key === 'evidence') {
      const scoped = clauseScoped(value ?? '');
      if (scoped !== null) evidence.set(scoped.clause, scoped.value);
      else if (current === null) errors.push(`--evidence ${value ?? ''} names no clause — before any --finding, evidence is clause-scoped and takes the same N="..." shape as --proof`);
      else if (current.evidence !== null) errors.push(`finding "${current.title}" already has evidence`);
      else current.evidence = value ?? '';
    } else if (key === 'finding') {
      current = { title: value ?? '', severity: null, system: null, files: [], deliverable: null, evidence: null };
      findings.push(current);
    } else if (key === 'file' && current === null) {
      const scoped = clauseScoped(value ?? '');
      if (scoped === null) errors.push(`--file ${value ?? ''} names no clause — before any --finding, a file is clause-scoped and takes the same N=path:line shape as --proof`);
      else clauseFiles.set(scoped.clause, [...(clauseFiles.get(scoped.clause) ?? []), scoped.value]);
    } else if (current === null) {
      errors.push(`--${key} describes a finding, and no --finding has been opened yet — put it after the --finding it belongs to`);
    } else if (key === 'severity') {
      current.severity = value as Severity;
    } else if (key === 'system') {
      current.system = value ?? null;
    } else if (key === 'deliverable') {
      current.deliverable = value ?? null;
    } else if (key === 'file') {
      current.files.push(value ?? '');
    } else {
      errors.push(`unknown flag --${key} after --finding ${JSON.stringify(current.title)} — a finding takes --severity, --system, --deliverable, --evidence and --file`);
    }
  }
  return { slug, configFlags, baseBranch, proofs, evidence, errors, clauseFiles, findings };
}

// The same flags, off a file, because a full pass does not fit on a command
// line. Twelve --proof/--evidence pairs carrying test names, mutation
// verdicts and probe output ran past the Windows 8191-character limit in two
// separate sessions — roughly 13k characters over nine clauses and five
// findings, refused as "The command line is too long", nothing run — and the
// pass after it compressed its evidence to fit. The command asks for
// evidence a next pass can re-run and then rationed how much of it there was
// room for; only the transport moves, and the parser below is the same one.
//
// A line opening with `--` is a flag and everything after the first space is
// its value; any other line continues the value above it, which is what lets
// a clause's evidence be a paragraph. Blank lines and `#` at column zero are
// skipped, so a file can be annotated.
export function parseAuditFile(text: string, label: string): { argv: string[]; errors: string[] } {
  const argv: string[] = [];
  const errors: string[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\r$/, '').trimEnd();
    if (line.trim() === '' || line.startsWith('#')) return;
    if (line.startsWith('--')) {
      const space = line.indexOf(' ');
      argv.push(space === -1 ? line : line.slice(0, space), space === -1 ? '' : line.slice(space + 1));
      return;
    }
    if (argv.length === 0) {
      errors.push(`${label}:${index + 1}: a value line before any flag — every line here either opens a flag with -- or continues the one above it`);
      return;
    }
    argv[argv.length - 1] = `${argv[argv.length - 1]}\n${line}`;
  });
  return { argv, errors };
}

// `--args-from` is consumed here rather than by parseAuditArgs, which would
// have to know about a flag that is not part of a pass.
function readAuditFile(raw: string[]): { argv: string[]; rest: string[]; errors: string[] } {
  const at = raw.indexOf('--args-from');
  if (at === -1) return { argv: [], rest: raw, errors: [] };
  const path_ = raw[at + 1];
  const rest = [...raw.slice(0, at), ...raw.slice(at + 2)];
  if (path_ === undefined || path_.startsWith('--')) return { argv: [], rest, errors: ['--args-from needs a path to a file of audit flags'] };
  let text: string;
  try {
    text = readFileSync(path_, 'utf8');
  } catch (error) {
    return { argv: [], rest, errors: [`--args-from could not read ${path_}: ${error instanceof Error ? error.message : String(error)}`] };
  }
  const parsed = parseAuditFile(text, path_);
  return { argv: parsed.argv, rest, errors: parsed.errors };
}

export const AUDIT_USAGE =
  `usage: tasks audit <spec> [--args-from <file>] [--base-branch main] [--actor <name>] [--proof N=met|unmet|unknown ...] [--evidence N="..." ... (required for every met clause)] [--file N=path:line ...] [--finding "..." --severity high|medium|low --system "<name>" --deliverable "..." --evidence "..." [--file path:line ...]]...  (a file of the same flags, one per line, with any unprefixed line continuing the value above it — which is how a pass carrying evidence specific enough to re-run gets past the command-line length limit. With no --proof flags and no findings, walks the clauses interactively; findings with no --proof flags are filed without recording a pass, so late findings never reset verdicts; a clause left ungraded is recorded unknown, never unmet)`;

// Stops at the first clause the answerer walks away from rather than
// looping on an exhausted stdin, and the caller grades the rest `unknown` —
// a half-finished walk graded nothing, which is exactly what unknown says.
async function walkClausesInteractively(clauses: ProofClause[]): Promise<AuditVerdict[]> {
  const prompter = activePrompter();
  const verdicts: AuditVerdict[] = [];
  for (const clause of clauses) {
    console.log(`\nclause ${clause.id}: ${clause.text}`);
    let status: Verdict | null = null;
    while (status === null && !prompter.exhausted()) {
      const answer = (await prompter.ask('met/unmet/unknown? ')).trim().toLowerCase();
      if (VERDICTS.includes(answer as Verdict)) status = answer as Verdict;
      else if (!prompter.exhausted()) console.log('type "met", "unmet" or "unknown"');
    }
    if (status === null) break;
    // A met verdict is a completion claim, so it is held until the claim
    // names something the next auditor can re-run; unmet and unknown claim
    // nothing and an empty answer records nothing.
    let evidenceText: string | null = null;
    while (evidenceText === null && !prompter.exhausted()) {
      evidenceText = (await prompter.ask(status === 'met' ? 'evidence (required for met): ' : 'evidence (optional): ')).trim() || null;
      if (status !== 'met') break;
      if (evidenceText === null && !prompter.exhausted()) console.log('a met verdict needs evidence the next pass can re-run');
    }
    if (status === 'met' && evidenceText === null) break;
    verdicts.push({ clause: clause.id, status, evidence: evidenceText });
  }
  prompter.close();
  return verdicts;
}

function buildFindingTask(finding: AuditFinding, slug: string, pass: number, taken: Set<string>): Task {
  const id = uniqueId(slugify(`${slug}-pass${pass}-${finding.title}`), taken);
  return {
    id,
    title: finding.title,
    kind: 'finding',
    state: 'unreviewed',
    severity: finding.severity,
    system: finding.system,
    spec: null,
    clause: null,
    requires: [],
    writes: [],
    discharges: [],
    grant: null,
    produces: [],
    files: finding.files,
    deliverable: finding.deliverable,
    evidence: finding.evidence,
    source: { spec: slug, pass },
    reason: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
  };
}

function refuseInvalidFindings(findings: AuditFinding[]): boolean {
  for (const finding of findings) {
    if (!finding.severity || !['high', 'medium', 'low'].includes(finding.severity)) {
      console.error(`error: finding "${finding.title}" needs --severity high|medium|low`);
      process.exitCode = 1;
      return true;
    }
    if (!finding.deliverable) {
      console.error(`error: finding "${finding.title}" needs --deliverable "..." — a finding must say what fixing it would mean`);
      process.exitCode = 1;
      return true;
    }
    // Triage shows both halves and decides on both: a finding with no
    // evidence reaches the human as a proposed fix to a problem they have
    // to take on faith, which is the one thing triage cannot do.
    if (!finding.evidence) {
      console.error(`error: finding "${finding.title}" needs --evidence "..." — a finding must say what is broken, not only what fixing it would mean`);
      process.exitCode = 1;
      return true;
    }
  }
  return false;
}

// The only way a finding enters the store.
export async function cmdAudit(args: Flags, usage: string): Promise<void> {
  const fromFile = readAuditFile(args.raw);
  if (fromFile.errors.length > 0) {
    console.error(`error: ${fromFile.errors[0]}`);
    process.exitCode = 1;
    return;
  }
  // The file's flags first and the command line's after, so a `--base-branch`
  // typed beside `--args-from` still wins: the transport did not change
  // which argument is the more specific one.
  const parsed = parseAuditArgs([...fromFile.argv, ...fromFile.rest]);
  if (!parsed.slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (parsed.errors.length > 0) {
    console.error(`error: ${parsed.errors[0]}`);
    process.exitCode = 1;
    return;
  }
  const config = resolveConfig(parsed.configFlags);
  const slug = parsed.slug;
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    refuseUnknownSpec(config, slug);
    return;
  }

  // Findings with no verdicts record no pass: a pass is a statement about
  // the branch's clauses, and the standing reads from the latest pass only —
  // so an all-unknown pass created as a side effect of filing findings
  // erased real verdicts, twice, on the branch that recorded the friction.
  if (parsed.proofs.size === 0 && parsed.findings.length > 0) {
    if (refuseInvalidFindings(parsed.findings)) return;
    const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
    const against = doc.auditPasses.length === 0 ? 1 : doc.auditPasses[doc.auditPasses.length - 1].pass;
    const tasks = loadStore(config.storePath);
    const taken = new Set(tasks.map((task) => task.id));
    const created: Task[] = [];
    for (const finding of parsed.findings) {
      const task = buildFindingTask(finding, slug, against, taken);
      tasks.push(task);
      taken.add(task.id);
      created.push(task);
    }
    saveStoreAndWarn(tasks, config);
    recordEvents(config, 'audit', created.map((task) => subjectOf(task, `recorded unreviewed by ${slug} against pass ${against}: ${truncateLine(task.title, 60)}`)));
    console.log(`${created.length} finding(s) recorded, unreviewed, against pass ${against} — no pass appended, so recorded clause verdicts stand`);
    return;
  }

  // Stamped before anything is recorded, so this pass names ids the spec
  // file already carries rather than ids it is about to be given.
  const original = readFileSync(path_, 'utf8');
  const text = stampClauseIds(original);
  const doc = parseSpecDoc(text);
  // Both of these are the state of the spec *document* disagreeing with the
  // write, not malformed CLI input, and doctor already reports the second
  // at exit 0. Refusing meant a typo in a heading stopped an auditor filing
  // findings at all — a gate failing closed on a disagreement.
  if (doc.proofClauses.length === 0) {
    console.warn(`warning: ${slug}'s ## Deliverable has no Proof: clauses — recording a pass that grades nothing`);
  }
  const duplicates = duplicateClauseIds(doc.proofClauses);
  if (duplicates.length > 0) {
    console.warn(`warning: ${slug} tags more than one proof clause [c${duplicates[0]}] — a verdict for it cannot say which one it graded; \`tasks doctor\` reports this until the tags are unique`);
  }

  // A verdict for a clause the spec does not have is a typo, and silently
  // dropping it turned `--proof 99=met` into a recorded pass that graded
  // nothing — superseding real verdicts, since the standing reads from the
  // latest pass only. Refused by name, the way an unscoped --evidence is.
  const clauseIds = new Set(doc.proofClauses.map((clause) => clause.id));
  const unmatched = [...parsed.proofs.keys()].filter((id) => !clauseIds.has(id));
  if (unmatched.length > 0) {
    const shown = unmatched.map((id) => (Number.isNaN(id) ? '(not a number)' : `c${id}`)).join(', ');
    const known = doc.proofClauses.map((clause) => `c${clause.id}`).join(', ') || '(none)';
    console.error(`error: --proof names no clause in ${slug}: ${shown} — its clauses are ${known}. Nothing was recorded`);
    process.exitCode = 1;
    return;
  }

  // Whichever route graded the clauses, the ones it did not reach are
  // `unknown` rather than missing: a pass that says nothing about a clause
  // is a pass that nobody ran on it, and that is a fact worth recording.
  const graded =
    parsed.proofs.size === 0 && parsed.findings.length === 0
      ? await walkClausesInteractively(doc.proofClauses)
      : doc.proofClauses.filter((clause) => parsed.proofs.has(clause.id)).map((clause) => ({ clause: clause.id, status: parsed.proofs.get(clause.id)!, evidence: parsed.evidence.get(clause.id) ?? null }));

  // A walk abandoned before its first verdict — an exhausted stdin, a
  // caller with no TTY — used to record a full all-unknown pass, which is
  // the same verdict-wiping trap the findings-only route closed. A pass
  // that graded zero clauses is not a pass.
  if (doc.proofClauses.length > 0 && graded.length === 0) {
    console.error('error: this pass graded no clause, and recording it would reset every recorded verdict to unknown. Pass --proof N=met|unmet|unknown, or file findings without proofs — they append no pass');
    process.exitCode = 1;
    return;
  }
  const verdicts = clauseStandings(doc.proofClauses, graded);
  const ungraded = verdicts.filter((verdict) => verdict.status === 'unknown').map((verdict) => `c${verdict.clause}`);

  const unevidenced = verdicts.filter((verdict) => verdict.status === 'met' && !verdict.evidence);
  if (unevidenced.length > 0) {
    console.error(`error: ${unevidenced.map((verdict) => `clause ${verdict.clause} is met with no evidence`).join('; ')} — pass --evidence N="..." naming what you checked, so the next pass can re-run it`);
    process.exitCode = 1;
    return;
  }

  if (refuseInvalidFindings(parsed.findings)) return;

  const passNumber = doc.auditPasses.length + 1;
  // A range this checkout cannot compute is recorded as unresolved rather
  // than refused or invented.
  const range = resolveDiffRange(parsed.baseBranch, (line) => console.warn(`warning: ${line} — recording the pass with an unresolved range`));
  const base = range?.base ?? '(unresolved)';
  const head = range?.head ?? '(unresolved)';

  const tasks = loadStore(config.storePath);
  const taken = new Set(tasks.map((task) => task.id));

  const created: Array<{ task: Task; note: string }> = [];
  let undeliveredCreated = 0;
  for (const verdict of verdicts) {
    if (verdict.status !== 'unmet') continue;
    const baseId = `${slug}-clause-${verdict.clause}`;
    if (tasks.some((task) => task.id === baseId && task.state === 'open')) continue;
    const id = taken.has(baseId) ? `${baseId}-pass-${passNumber}` : baseId;
    const clauseText = doc.proofClauses.find((clause) => clause.id === verdict.clause)?.text ?? '';
    const undelivered: Task = {
      id,
      title: `Unmet deliverable clause ${verdict.clause}: ${clauseText}`,
      kind: 'undelivered',
      state: 'open',
      severity: 'high',
      system: null,
      spec: slug,
      clause: verdict.clause,
      requires: [],
      writes: [],
      discharges: [],
      grant: null,
      produces: [],
      files: parsed.clauseFiles.get(verdict.clause) ?? [],
      deliverable: clauseText,
      evidence: verdict.evidence,
      source: { spec: slug, pass: passNumber },
      reason: null,
      closed: null,
      closedCommit: null,
      claimed: null,
      claimedBy: null,
      extra: null,
    };
    tasks.push(undelivered);
    taken.add(id);
    created.push({ task: undelivered, note: `created by ${slug} pass ${passNumber} for unmet clause ${verdict.clause}` });
    undeliveredCreated++;
  }

  let findingsCreated = 0;
  for (const finding of parsed.findings) {
    const task = buildFindingTask(finding, slug, passNumber, taken);
    tasks.push(task);
    taken.add(task.id);
    created.push({ task, note: `recorded unreviewed by ${slug} pass ${passNumber}: ${truncateLine(finding.title, 60)}` });
    findingsCreated++;
  }

  saveStoreAndWarn(tasks, config);
  writeFileSync(path_, appendAuditPass(text, { pass: passNumber, date: today(), base, head, verdicts }), 'utf8');
  // The pass itself is the event with no task — a pass that graded every
  // clause met creates no record, and is still the thing someone asks the
  // log about when they ask what was decided about this spec.
  recordEvents(config, 'audit', [
    { id: null, system: null, spec: slug, note: `recorded pass ${passNumber} against ${head.slice(0, 7)}: ${outstandingSummary(verdicts)}` },
    ...created.map((entry) => subjectOf(entry.task, entry.note)),
  ]);

  console.log(`recorded pass ${passNumber} for ${slug}: ${outstandingSummary(verdicts)}`);
  if (text !== original) console.log(`tagged ${slug}'s proof clauses [cN] — the tag is the clause's identity, so keep it when you reword or reorder`);
  if (undeliveredCreated > 0) console.log(`${undeliveredCreated} undelivered task(s) created for unmet clauses`);
  if (ungraded.length > 0) console.log(`${ungraded.length} clause(s) recorded unknown — nobody graded them: ${ungraded.join(', ')}. No undelivered task was created, because an ungraded clause is not a broken promise`);
  if (findingsCreated > 0) console.log(`${findingsCreated} finding(s) recorded, unreviewed`);
}
