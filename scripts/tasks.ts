import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { harvestFiles, parseAuditDoc, systemForDoc } from './lib/auditImport';
import { checkCommitMessage, extractNextTrailer, isExempt } from './lib/commitContract';
import { appendEvents, EVENT_OPS, eventsPathFor, filterEvents, loadEvents, type EventOp, type TaskEvent } from './lib/eventLog';
import * as git from './lib/git';
import { appendAuditPass, clauseStandings, duplicateClauseIds, outstandingSummary, parseSpecDoc, stampClauseIds, VERDICTS, type AuditVerdict, type ProofClause, type Verdict } from './lib/specDoc';
import { checkPlan } from './lib/planCheck';
import { loadManifest, systemNames as manifestSystemNames } from './lib/systems';
import {
  checkStore,
  claimSummary,
  coldClaimIssues,
  coldClaims,
  DEFAULT_STORE_PATH,
  dependencyCycles,
  StoreError,
  type CheckIssue,
  fixNowQueue,
  isBlocked,
  KINDS,
  listQueue,
  loadStore,
  loadStoreTolerantly,
  nearMatches,
  parseStore,
  requirementStates,
  saveStore,
  unreviewedQueue,
  waitingOn,
  type Kind,
  type Severity,
  type State,
  type Task,
} from './lib/taskStore';

interface Flags {
  positional: string[];
  flags: Record<string, string>;
  // The argument list as given. `audit` alone needs it: its repeated
  // --proof/--finding flags carry an order and a scope that a flat
  // key-value map cannot hold, so it rescans them itself.
  raw: string[];
}

type FlagArity = 'value' | 'boolean';

// A command's usage string is its flag spec. Every flag it accepts is named
// in the text it prints when asked for help, so what the parser enforces
// and what the help documents cannot drift apart: a flag dropped from the
// usage stops being accepted, and one never written there was never
// reachable in the first place. A flag followed by anything that is not
// another flag takes a value; one followed by nothing takes none.
function flagArities(usage: string): Map<string, FlagArity> {
  const tokens = usage.split(/\s+/);
  const arities = new Map<string, FlagArity>();
  for (let i = 0; i < tokens.length; i++) {
    const name = /^\[?--([a-z][a-z0-9-]*)\]?$/.exec(tokens[i])?.[1];
    if (name === undefined || arities.has(name)) continue;
    const next = tokens[i + 1] ?? '';
    arities.set(name, next === '' || next.startsWith('--') || next.startsWith('[--') || next.startsWith(']') ? 'boolean' : 'value');
  }
  return arities;
}

// The same contract as flagArities, for the other half of the argument list.
// Positionals are written before flags in every usage string, so the prefix
// up to the first flag is the arity: `<id>` and `["<new title>"]` are one
// slot each, `<id>...` makes the tail unbounded, and a command whose prefix
// holds no placeholder takes none. Null means unbounded.
function positionalArity(usage: string): number | null {
  const head = usage.split('\n')[0];
  // Stop at the first flag or the first prose parenthetical, whichever comes
  // first: everything after either is describing, not declaring. A
  // `<a|b|c>` alternation names a choice among literal subcommand keywords,
  // which resolveCommand consumes before the parser sees the list, so it is
  // not a slot — counting it read `tasks spec` as taking three arguments.
  const stop = head.search(/\s(\[?--|\()/);
  const prefix = stop === -1 ? head : head.slice(0, stop);
  const slots = (prefix.match(/<[^>]+>(\.\.\.)?/g) ?? []).filter((slot) => !slot.includes('|'));
  return slots.some((slot) => slot.endsWith('...')) ? null : slots.length;
}

// `--actor` is not here: a global flag is accepted by every command, and a
// read command that accepted it would drop it, which is exactly the silent
// no-op c9 forbids. Every command that writes names it in its own usage.
const GLOBAL_USAGE = 'global: [--store <path>] [--systems <path>] [--specs-dir <dir>] [--branch <name>] [--help]';

const ACTOR_USAGE = '[--actor <name>]';

interface ParsedArgs {
  parsed: Flags;
  errors: string[];
}

// Knowing a flag's arity is what lets the parser refuse rather than guess.
// A bare `--actor` used to become the string 'true' and record a holder by
// that name; a `--order` swallowed the positional that followed it. Neither
// is decidable from the argument list alone.
function parseArgs(args: string[], arities: Map<string, FlagArity>, maxPositional: number | null): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  const errors: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const arity = arities.get(key);
    if (arity === undefined) {
      errors.push(`unknown flag: ${arg}`);
      continue;
    }
    if (arity === 'boolean') {
      flags[key] = 'true';
      continue;
    }
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) {
      errors.push(`${arg} needs a value`);
      continue;
    }
    flags[key] = value;
    i++;
  }
  if (maxPositional !== null) {
    for (const extra of positional.slice(maxPositional)) errors.push(`unexpected argument: ${JSON.stringify(extra)}`);
  }
  return { parsed: { positional, flags, raw: args }, errors };
}

interface Config {
  storePath: string;
  eventsPath: string;
  systemsPath: string;
  specsDir: string;
  branch: string;
  actor: string | null;
}

function resolveConfig(flags: Record<string, string>): Config {
  const storePath = flags.store ?? DEFAULT_STORE_PATH;
  return {
    storePath,
    eventsPath: eventsPathFor(storePath),
    systemsPath: flags.systems ?? 'docs/audits/systems.json',
    specsDir: flags['specs-dir'] ?? 'docs/specs',
    // Through the seam: this runs before every command body, so anything
    // that throws here takes every command down with it, reads included.
    branch: flags.branch ?? git.branch() ?? '(no branch)',
    actor: flags.actor ?? null,
  };
}

type EventSubject = Pick<TaskEvent, 'id' | 'system' | 'spec' | 'note'>;

// Called after the store is saved, never before: an event says what
// happened, so a write that failed must not leave one behind. `head` and the
// timestamp are resolved once per batch rather than once per record.
function recordEvents(config: Config, op: EventOp, subjects: EventSubject[]): void {
  if (subjects.length === 0) return;
  const t = new Date().toISOString();
  const head = git.head();
  appendEvents(
    subjects.map((subject) => ({ t, by: config.actor, branch: config.branch, head, op, ...subject })),
    config.eventsPath,
  );
}

// The snapshot: what the record carries now that the write has landed, which
// is what the event is a record of. Re-pointing the task later leaves this
// line saying what was true when it was written.
function subjectOf(task: Task, note: string): EventSubject {
  return { id: task.id, system: task.system, spec: task.spec, note };
}

function systemNames(config: Config): string[] {
  return manifestSystemNames(loadManifest(config.systemsPath));
}

function specFile(config: Config, spec: string): string {
  return `${config.specsDir}/${spec}.md`;
}

function usesDefaultStore(config: Config): boolean {
  return path.resolve(config.storePath) === path.resolve(DEFAULT_STORE_PATH);
}

// `git show <rev>:<path>` takes its path in `<rev>:<path>` colon syntax,
// which git resolves relative to the repo root with forward slashes only —
// unlike a `-- <path>` pathspec, it rejects an absolute Windows path outright
// ("exists on disk, but not in <rev>"). config.storePath may be absolute
// (tests pass one via --store), so normalize before every colon-syntax call.
function gitPathspec(storePath: string): string {
  return path.relative(process.cwd(), path.resolve(storePath)).split(path.sep).join('/');
}

function dirtyStoreIssue(config: Config): CheckIssue | null {
  if (!usesDefaultStore(config)) return null;
  const result = spawnSync('git', ['status', '--porcelain', '--', config.storePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if ((result.status ?? 1) !== 0 || result.stdout.trim() === '') return null;
  return {
    level: 'warning',
    message: `${config.storePath} has uncommitted task-state changes; commit them before cleanup/reset, or another session may miss working-tree-only state`,
  };
}

function warnIfStoreDirty(config: Config): void {
  const issue = dirtyStoreIssue(config);
  if (issue) console.warn(`warning: ${issue.message}`);
}

const CLOSING_STATES: State[] = ['done', 'declined'];

function workingTreeOnlyIssues(config: Config, tasks: Task[]): CheckIssue[] {
  if (!usesDefaultStore(config)) return [];
  const committedText = spawnSync('git', ['show', `HEAD:${gitPathspec(config.storePath)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if ((committedText.status ?? 1) !== 0) return [];
  let committed: Task[];
  try {
    committed = parseStore(committedText.stdout, `${config.storePath}@HEAD`);
  } catch {
    return [];
  }

  const committedById = new Map(committed.map((task) => [task.id, task]));
  const issues: CheckIssue[] = [];
  for (const task of tasks) {
    const before = committedById.get(task.id);
    if (!before || before.state === task.state) continue;
    const closing = CLOSING_STATES.includes(task.state) && !CLOSING_STATES.includes(before.state);
    issues.push({
      level: closing ? 'error' : 'warning',
      message: `${task.id} is ${task.state} only in the working tree (committed state: ${before.state})`,
    });
  }
  return issues;
}

// A read answers with the rest of the store rather than refusing over one
// line it could not parse, and says so afterwards rather than instead — the
// note has to follow the answer to be a footer, and every read has several
// return paths, so `run` flushes it once at the boundary.
const skippedStoreLines: string[] = [];

function readStore(config: Config): Task[] {
  const { tasks, skipped } = loadStoreTolerantly(config.storePath);
  skippedStoreLines.push(...skipped);
  return tasks;
}

function flushSkippedStoreLines(): void {
  if (skippedStoreLines.length === 0) return;
  console.log('');
  console.log(`skipped ${skippedStoreLines.length} unparseable store line(s) — everything above is the rest of the store:`);
  for (const message of skippedStoreLines) console.log(`  ${message}`);
  console.log('write commands refuse until these parse, because saving would delete them; `tasks doctor` reports them and they are fixed by hand');
  skippedStoreLines.length = 0;
}

function saveStoreAndWarn(tasks: Task[], config: Config): void {
  saveStore(tasks, config.storePath);
  warnIfStoreDirty(config);
}

// "the spec whose branch is checked out" — a branch not named after any spec
// file has no active spec, and `--spec` on a read command overrides this.
function currentSpec(config: Config): string | null {
  return existsSync(specFile(config, config.branch)) ? config.branch : null;
}

interface ActiveSpec {
  spec: string | null;
  // Null only when the caller named the spec outright. Every other route
  // here is an inference, and c8 permits an inferred default argument only
  // on the condition that the output says so and says what from.
  note: string | null;
}

// The resume half of the branch-name lookup: when the branch matches no
// spec file — as happened on this branch for five commits while the spec
// lived at a name the branch had since moved past — and exactly one spec
// file has open members in the store, treat that as the active spec rather
// than stranding a cold session with no queue and no signal anything is
// wrong.
function resolveActiveSpec(config: Config, tasks: Task[], explicit: string | undefined): ActiveSpec {
  if (explicit !== undefined) return { spec: explicit, note: null };
  const strict = currentSpec(config);
  if (strict !== null) return { spec: strict, note: `spec inferred from the branch name: ${strict} — ${specFile(config, strict)} exists` };

  const candidates = new Set<string>();
  for (const task of tasks) {
    if ((task.state !== 'open' && task.state !== 'in-progress') || task.spec === null) continue;
    if (existsSync(specFile(config, task.spec))) candidates.add(task.spec);
  }
  if (candidates.size === 1) {
    const [spec] = candidates;
    return { spec, note: `spec inferred from the store: ${spec} — no ${specFile(config, config.branch)}, and ${spec} is the only spec with open members` };
  }
  // Two candidates is exactly as ambiguous as none, but it is not as empty:
  // naming both is what lets a caller pick one with --spec instead of
  // rediscovering the contest.
  if (candidates.size > 1) {
    return { spec: null, note: `spec contested: no ${specFile(config, config.branch)}, and ${candidates.size} specs have open members — ${[...candidates].sort().join(', ')}. Pass --spec to pick one` };
  }
  return { spec: null, note: null };
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function uniqueId(base: string, taken: Set<string>): string {
  if (base !== '' && !taken.has(base)) return base;
  const stem = base === '' ? 'task' : base;
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n++;
  return `${stem}-${n}`;
}

const today = (): string => new Date().toISOString().slice(0, 10);

function splitList(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
}

// Every requirement is printed with why it does or does not hold the task
// up, because "BLOCKED" alone sent readers to the store to find out which
// edge it meant and whether that edge was still live.
function requiresLine(task: Task, byId: Map<string, Task>): string {
  return `requires: ${requirementStates(task, byId)
    .map((requirement) => `${requirement.id} (${requirement.status})`)
    .join(', ')}`;
}

type Detail = 'row' | 'brief' | 'full';

interface RowStyle {
  // Prefixes the row and indents its continuation lines, so a bullet, a
  // list indent and a bare row are the same rendering at three margins.
  indent?: string;
  note?: string;
  withFiles?: boolean;
}

function taskTag(task: Task): string {
  return [task.kind, task.state, task.severity].filter(Boolean).join('/');
}

// The whole prose field on one line, cut at a character budget: store text
// carries no line breaks of its own, so a summary that shortens by line
// shortens nothing.
function summarize(text: string): string {
  return truncateLine(text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0).join(' '));
}

// The one rendering of a task, at the three verbosities anything asking for
// one has ever needed: a `row` for a queue or a member list, a `brief`
// record whose prose is summarized, and the `full` record. Every command
// that shows a task goes through here, so a field added to a task appears
// everywhere a task appears, and `[kind/state/severity]` means the same
// thing in all of them.
function renderTask(task: Task, byId: Map<string, Task>, detail: Detail, style: RowStyle = {}): string[] {
  const blocked = isBlocked(task, byId) ? '  BLOCKED' : '';
  const claim = claimSummary(task, today());

  if (detail === 'row') {
    const indent = style.indent ?? '';
    const note = style.note ? `  ${style.note}` : '';
    const rows = [`${indent}${task.id}  [${taskTag(task)}]${blocked}  ${task.system ?? '(no system)'}  ${task.title}${note}${claim ? `  ${claim}` : ''}`];
    if (style.withFiles && task.files.length > 0) rows.push(`${' '.repeat(indent.length)}    ${task.files.join('   ')}`);
    return rows;
  }

  const prose = detail === 'full' ? (text: string): string => text : summarize;
  const lines = [`${task.id}  [${taskTag(task)}]${blocked}`, task.title];
  if (task.system) lines.push(`system: ${task.system}`);
  lines.push(`spec: ${task.spec ?? '(deferred)'}`);
  if (task.requires.length > 0) lines.push(requiresLine(task, byId));
  if (task.files.length > 0) lines.push(`files: ${task.files.join(', ')}`);
  if (task.writes.length > 0) lines.push(`writes: ${task.writes.join(', ')}`);
  if (task.produces.length > 0) lines.push(`produces: ${task.produces.join(', ')}`);
  if (task.deliverable || task.evidence) lines.push('');
  if (task.deliverable) lines.push(`deliverable: ${prose(task.deliverable)}`);
  if (task.evidence) lines.push(`evidence: ${prose(task.evidence)}`);
  if (task.source) lines.push(`source: ${task.source.spec} pass ${task.source.pass}`);
  if (task.reason) lines.push(`reason: ${prose(task.reason)}`);
  if (task.closed) lines.push(`closed: ${task.closed}`);
  if (task.closedCommit) lines.push(`closedCommit: ${task.closedCommit}`);
  if (claim) lines.push(claim);
  return lines;
}

function printTask(task: Task, byId: Map<string, Task>, detail: Detail): void {
  for (const line of renderTask(task, byId, detail)) console.log(line);
}

function printRow(task: Task, byId: Map<string, Task>, style: RowStyle = {}): void {
  for (const line of renderTask(task, byId, 'row', style)) console.log(line);
}

// A read answers the question it was asked even when the id resolves to
// nothing — "no such task" plus the five nearest ids is an answer, and exits
// 0. A write has nothing to write to, so the same text is an error.
function reportUnknownIds(ids: string[], tasks: Task[], emit: (line: string) => void): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  emit(`no such task${ids.length === 1 ? '' : '(s)'}: ${ids.join(', ')}`);
  for (const id of ids) {
    const near = nearMatches(id, tasks);
    if (near.length === 0) {
      emit(`  ${id}: no near match among ${tasks.length} record(s) — \`tasks list\` or \`tasks search <term>\` to browse`);
      continue;
    }
    emit(`  ${id} — did you mean:`);
    for (const task of near) for (const line of renderTask(task, byId, 'row', { indent: '    ' })) emit(line);
  }
}

function refuseUnknownIds(ids: string[], tasks: Task[]): void {
  reportUnknownIds(ids, tasks, (line) => console.error(line.startsWith(' ') ? line : `error: ${line}`));
  process.exitCode = 1;
}

function knownSpecs(config: Config): string[] {
  if (!existsSync(config.specsDir)) return [];
  return readdirSync(config.specsDir)
    .filter((entry) => entry.endsWith('.md') && statSync(`${config.specsDir}/${entry}`).isFile())
    .map((entry) => entry.replace(/\.md$/, ''));
}

// The same read/write split reportUnknownIds and refuseUnknownIds already
// make for task ids, applied to spec slugs — c1 against c2. "No such spec,
// here are the ones that exist" is an answer to what a read asked, and the
// answer was already being written before the exit code disagreed with it.
// A write has nothing to write to, so the identical text is an error.
function reportUnknownSpec(config: Config, slug: string, emit: (line: string) => void): void {
  const specs = knownSpecs(config);
  emit(`no such spec: ${slug}`);
  emit(specs.length === 0 ? `  no spec files in ${config.specsDir}` : `  specs in ${config.specsDir}: ${specs.join(', ')}`);
}

function refuseUnknownSpec(config: Config, slug: string): void {
  reportUnknownSpec(config, slug, (line) => console.error(line.startsWith(' ') ? line : `error: ${line}`));
  process.exitCode = 1;
}

function specIssues(config: Config): CheckIssue[] {
  return knownSpecs(config)
    .flatMap((spec) => {
      const doc = parseSpecDoc(readFileSync(specFile(config, spec), 'utf8'));
      return duplicateClauseIds(doc.proofClauses).map((id) => ({
        level: 'error' as const,
        message: `${spec} tags more than one proof clause [c${id}] — a clause id names exactly one clause`,
      }));
    });
}

// The one repair with exactly one correct answer. A record outside a
// closing state is not closed, so a close date on it describes a close that
// was undone, and clearing it is not a choice between defensible fixes.
// Everything else this scan finds has several — a missing decline reason, an
// unresolved requirement, a cycle, a duplicate id — and a doctor that picks
// one of them is worse than one that describes them all.
function repairStore(tasks: Task[]): Array<{ task: Task; message: string }> {
  const repaired: Array<{ task: Task; message: string }> = [];
  for (const task of tasks) {
    if (CLOSING_STATES.includes(task.state) || (task.closed === null && task.closedCommit === null)) continue;
    repaired.push({ task, message: `${task.id} is ${task.state}: cleared its close date (${task.closed ?? 'none'}) and closing commit (${task.closedCommit ?? 'none'})` });
    task.closed = null;
    task.closedCommit = null;
  }
  return repaired;
}

function cmdDoctor(args: Flags): void {
  const config = resolveConfig(args.flags);
  const { tasks, skipped } = loadStoreTolerantly(config.storePath);
  const dirtyIssue = dirtyStoreIssue(config);
  const issues = [
    ...checkStore(tasks, systemNames(config), (spec) => existsSync(specFile(config, spec))),
    ...closedCommitIssues(tasks),
    ...coldClaimIssues(tasks, today()),
    ...workingTreeOnlyIssues(config, tasks),
    ...specIssues(config),
    ...(dirtyIssue ? [dirtyIssue] : []),
  ];

  let repaired: Array<{ task: Task; message: string }> = [];
  if (args.flags.fix === 'true') {
    if (skipped.length > 0) console.log(`--fix declined to write: ${skipped.length} line(s) did not parse, and saving would delete them`);
    else {
      repaired = repairStore(tasks);
      if (repaired.length > 0) {
        saveStoreAndWarn(tasks, config);
        recordEvents(config, 'doctor-fix', repaired.map((entry) => subjectOf(entry.task, entry.message)));
      }
    }
  }

  if (issues.length > 0) {
    console.log(`${issues.length} issue(s) — reported, not enforced:`);
    for (const issue of issues) console.log(`  [${issue.level}] ${issue.message}`);
  }
  if (repaired.length > 0) {
    console.log(`repaired ${repaired.length}:`);
    for (const entry of repaired) console.log(`  ${entry.message}`);
  } else if (issues.length > 0 && args.flags.fix !== 'true') {
    console.log('none of these has exactly one correct repair; `--fix` clears a close date left on a record that is not closed, and nothing else');
  }

  const errors = issues.filter((issue) => issue.level === 'error').length;
  console.log(`${tasks.length} task(s), ${errors} error(s), ${issues.length - errors} warning(s), ${skipped.length} unparseable line(s)`);

  // The only condition that exits non-zero. A store that will not parse is
  // malformed input, not a disagreement about the work — and it is the one
  // state a later write would destroy rather than merely disagree with.
  if (skipped.length > 0) {
    for (const message of skipped) console.error(`error: ${message}`);
    console.error(`error: ${config.storePath} does not parse — the only condition doctor fails on`);
    process.exitCode = 1;
  }
}

// `--commit` is a revspec at the CLI boundary, and a revspec is not a fact —
// `HEAD~2` names a different commit after every later commit. Resolve to the
// full 40-char SHA it means right now, so what lands in the store is a fact
// forever after. Unresolvable is refused because there is no sha to write;
// unreachable is recorded, because which commits this checkout can see is
// not a fact about the record.
function resolveCommit(value: string): string {
  const sha = git.resolveCommit(value);
  if (sha === null) throw new Error(`--commit does not resolve to a commit: ${value}`);
  if (!git.isAncestor(sha, 'HEAD')) console.warn(`warning: --commit is not reachable from HEAD: ${value} — recorded, and \`tasks doctor\` reports it until it is`);
  return sha;
}

function closedCommitIssues(tasks: Task[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const task of tasks) {
    if (!task.closedCommit) continue;
    if (!git.isAncestor(task.closedCommit, 'HEAD')) issues.push({ level: 'warning', message: `${task.id} closed by a commit not reachable from HEAD: ${task.closedCommit}` });
  }
  return issues;
}

// Shared by add and edit: the two places content fields are accepted from a
// human by hand rather than produced by a state-transition verb or the
// auditor. Only values that name nothing in their own enumeration are
// refused — an id is checked against the store by reportUnresolvedRequires,
// which records it either way.
function validateContentFields(config: Config, flags: Record<string, string>): string | null {
  if (flags.severity !== undefined && !['high', 'medium', 'low'].includes(flags.severity)) {
    return 'error: --severity must be high, medium or low';
  }
  if (flags.system !== undefined && !systemNames(config).includes(flags.system)) {
    return `error: --system not in systems.json: ${flags.system}`;
  }
  return null;
}

function reportUnresolvedRequires(task: Task, tasks: Task[]): void {
  const known = new Set(tasks.map((candidate) => candidate.id));
  const unresolved = task.requires.filter((id) => !known.has(id));
  if (unresolved.length === 0) return;
  console.log(`recorded ${unresolved.length} requirement(s) no record answers to: ${unresolved.join(', ')} — they hold the task until the record exists, and \`tasks doctor\` reports them until it does`);
}

function cmdAdd(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const title = args.positional[0];
  if (!title) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const kind = (args.flags.kind as Kind | undefined) ?? 'task';
  if (kind !== 'task' && kind !== 'finding' && kind !== 'question') {
    console.error(`error: --kind must be task, finding or question (undelivered tasks are only created by \`audit\`)`);
    process.exitCode = 1;
    return;
  }
  if (kind === 'finding' && !args.flags.deliverable) {
    console.error('error: --deliverable is required for --kind finding — a finding must say what fixing it would mean');
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
  const validationError = validateContentFields(config, args.flags);
  if (validationError) {
    console.error(validationError);
    process.exitCode = 1;
    return;
  }

  const taken = new Set(tasks.map((task) => task.id));
  const id = args.flags.id ?? uniqueId(slugify(title), taken);
  if (taken.has(id)) {
    console.error(`error: id already exists: ${id}`);
    process.exitCode = 1;
    return;
  }

  // A finding always needs triage, so it starts unreviewed and outside any
  // spec regardless of how it entered the store; a hand-written task is
  // already a vetted decision and starts open.
  const state: State = kind === 'finding' ? 'unreviewed' : 'open';
  const spec = kind === 'finding' ? null : (args.flags.spec ?? null);

  const task: Task = {
    id,
    title,
    kind,
    state,
    severity: (args.flags.severity as Severity | undefined) ?? null,
    system: args.flags.system ?? null,
    spec,
    clause: null,
    requires: splitList(args.flags.requires),
    writes: splitList(args.flags.writes),
    produces: splitList(args.flags.produces),
    files: splitList(args.flags.files),
    deliverable: args.flags.deliverable ?? null,
    evidence: args.flags.evidence ?? null,
    source: null,
    reason: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
  };
  tasks.push(task);
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'add', [subjectOf(task, `added as ${task.kind}/${task.state}: ${truncateLine(task.title, 80)}`)]);
  console.log(`added ${id} [${task.kind}/${task.state}]`);
  reportUnresolvedRequires(task, tasks);
}

function cmdEdit(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    refuseUnknownIds([id], tasks);
    return;
  }

  const validationError = validateContentFields(config, args.flags);
  if (validationError) {
    console.error(validationError);
    process.exitCode = 1;
    return;
  }

  const title = args.flags.title ?? args.positional[1];
  const changes: string[] = [];

  if (title !== undefined) {
    task.title = title;
    changes.push('title');
  }
  if (args.flags.deliverable !== undefined) {
    task.deliverable = args.flags.deliverable;
    changes.push('deliverable');
  }
  if (args.flags.evidence !== undefined) {
    task.evidence = args.flags.evidence;
    changes.push('evidence');
  }
  if (args.flags.severity !== undefined) {
    task.severity = args.flags.severity as Severity;
    changes.push('severity');
  }
  if (args.flags.system !== undefined) {
    task.system = args.flags.system;
    changes.push('system');
  }
  if (args.flags.files !== undefined) {
    task.files = splitList(args.flags.files);
    changes.push('files');
  }
  if (args.flags.requires !== undefined) {
    task.requires = splitList(args.flags.requires);
    changes.push('requires');
  }
  if (args.flags.writes !== undefined) {
    task.writes = splitList(args.flags.writes);
    changes.push('writes');
  }
  if (args.flags.produces !== undefined) {
    task.produces = splitList(args.flags.produces);
    changes.push('produces');
  }

  if (changes.length === 0) {
    console.log(`${id}: nothing to change`);
    return;
  }

  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'edit', [subjectOf(task, `edited ${changes.join(', ')}`)]);
  console.log(`edited ${id}: ${changes.join(', ')}`);
  reportUnresolvedRequires(task, tasks);
}

function storeStateAt(config: Config, commit: string, id: string): State | null {
  const result = spawnSync('git', ['show', `${commit}:${gitPathspec(config.storePath)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if ((result.status ?? 1) !== 0) return null;
  try {
    return parseStore(result.stdout, `${config.storePath}@${commit}`).find((task) => task.id === id)?.state ?? null;
  } catch {
    return null;
  }
}

// "What implemented this" for a task whose `closedCommit` is null (H6:
// `done` cannot record it, since it does not exist yet) — a best-effort
// answer read off history rather than a fact written at close-time, so
// `show` labels it "derived" and callers must not treat it as `closedCommit`.
// Walks commits touching the store newest-first and returns the most recent
// one where this id's state is `done` and its predecessor's is not — i.e.
// the commit that flipped the record. One git log plus a parse per commit,
// so it is called for a single task on demand and never for a whole queue.
function deriveClosingCommit(config: Config, id: string): string | null {
  const log = spawnSync('git', ['log', '--format=%H', '--', config.storePath], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if ((log.status ?? 1) !== 0) return null;
  const commits = log.stdout.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  for (let i = 0; i < commits.length; i++) {
    if (storeStateAt(config, commits[i], id) !== 'done') continue;
    const previous = commits[i + 1];
    if (previous === undefined || storeStateAt(config, previous, id) !== 'done') return commits[i];
  }
  return null;
}

function cmdShow(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = readStore(config);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    reportUnknownIds([id], tasks, (line) => console.log(line));
    return;
  }
  printTask(task, new Map(tasks.map((candidate) => [candidate.id, candidate])), 'full');
  if (task.state === 'done' && task.closedCommit === null) {
    const derived = deriveClosingCommit(config, id);
    console.log(derived ? `closedCommit (derived): ${derived}` : 'closedCommit: (none recorded, and none could be derived from git history)');
  }
}

const LIST_STATES: State[] = ['unreviewed', 'open', 'in-progress', 'done', 'declined'];

// The only verb that reads the whole store rather than one spec's fix-now
// queue, which is how a `spec: null` finding is reachable at all.
function cmdSearch(args: Flags, usage: string): void {
  const term = args.positional[0];
  if (!term) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  runList(args, term);
}

function cmdList(args: Flags): void {
  runList(args, undefined);
}

const SEARCH_FIELDS: Array<[label: string, read: (task: Task) => string | null]> = [
  ['id', (task) => task.id],
  ['title', (task) => task.title],
  ['system', (task) => task.system],
  ['deliverable', (task) => task.deliverable],
  ['evidence', (task) => task.evidence],
];

function matchingFields(task: Task, text: string): string[] {
  const term = text.toLowerCase();
  return SEARCH_FIELDS.filter(([, read]) => (read(task) ?? '').toLowerCase().includes(term)).map(([label]) => label);
}

function runList(args: Flags, text: string | undefined): void {
  const config = resolveConfig(args.flags);
  const flags = args.flags;

  const state = flags.state as State | undefined;
  if (state !== undefined && !LIST_STATES.includes(state)) {
    console.error(`error: --state must be one of ${LIST_STATES.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const severity = flags.severity as Severity | undefined;
  if (severity !== undefined && !['high', 'medium', 'low'].includes(severity)) {
    console.error('error: --severity must be high, medium or low');
    process.exitCode = 1;
    return;
  }
  const kind = flags.kind as Kind | undefined;
  if (kind !== undefined && !KINDS.includes(kind)) {
    console.error(`error: --kind must be one of ${KINDS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const tasks = readStore(config);
  const activeSpec = resolveActiveSpec(config, tasks, flags.spec);
  if (activeSpec.note) console.log(activeSpec.note);

  const queue = listQueue(tasks, {
    state,
    severity,
    system: flags.system,
    spec: flags.spec,
    deferred: flags.deferred === 'true',
    kind,
    text,
  });

  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of queue) {
    printRow(task, byId, { note: text === undefined ? undefined : `(matches: ${matchingFields(task, text).join(', ')})` });
  }

  const counts: Record<State, number> = { unreviewed: 0, open: 0, 'in-progress': 0, done: 0, declined: 0 };
  for (const task of queue) counts[task.state]++;
  console.log(`${queue.length} task(s) — unreviewed: ${counts.unreviewed}, open: ${counts.open}, in-progress: ${counts['in-progress']}, done: ${counts.done}, declined: ${counts.declined}`);
}

function cmdNext(args: Flags): void {
  const config = resolveConfig(args.flags);
  const tasks = readStore(config);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  if (activeSpec.note) console.log(activeSpec.note);
  const spec = activeSpec.spec;
  // A resolved spec of null means "no active spec", not "match deferred
  // tasks" — those two must not collapse into the same query.
  if (spec === null) {
    console.log('no active spec for this branch, and no --spec given');
    return;
  }
  const filter = { system: args.flags.system, severity: args.flags.severity as Severity | undefined };
  const queue = fixNowQueue(tasks, spec, filter);
  const cold = coldClaims(tasks, spec, today(), filter);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const print = (task: Task): void => printTask(task, byId, args.flags.full === 'true' ? 'full' : 'brief');

  // A cold claim is handed out, not released: the record stays in-progress
  // and keeps its holder, and what the caller gets is who to ask. Open work
  // still comes first — offering held work ahead of free work would put two
  // agents on one task for no reason.
  if (queue.length === 0) {
    if (cold.length > 0) {
      console.log(`no open, unblocked tasks in spec ${spec}, and ${cold.length} claim(s) there have gone cold — the coldest is offered here rather than left invisible:`);
      print(cold[0]);
      console.log(`nothing was released and nothing was reassigned: \`tasks start ${cold[0].id} --actor <you>\` takes it over, \`tasks stop ${cold[0].id}\` returns it to the queue`);
      return;
    }
    console.log(`no open, unblocked tasks in spec ${spec}`);
    explainEmptyQueue(tasks, spec, { system: args.flags.system, severity: args.flags.severity });
    return;
  }
  print(queue[0]);
  if (cold.length > 0) {
    console.log('');
    console.log(`${cold.length} cold claim(s) in ${spec}, not offered ahead of open work:`);
    for (const task of cold) printRow(task, byId, { indent: '- ' });
  }
}

// Grades a dispatch set before anyone works it. Everything it reports is
// decidable from the records alone, so the cost of asking is one command and
// the answer arrives while the decomposition is still cheap to change — which
// is the only moment any of these findings is worth having.
//
// It reports and exits 0, like every other read. A planner who sees "3 of 4
// tasks write one file" and dispatches anyway has made an informed call, and
// c2 leaves that call to them.
function cmdPlan(args: Flags): void {
  const config = resolveConfig(args.flags);
  const tasks = readStore(config);
  const byId = new Map(tasks.map((task) => [task.id, task]));

  let plan: Task[];
  if (args.positional.length > 0) {
    // Deduped: a plan is a set. Pairing the argument list instead would
    // report a task overlapping itself, producing what it produces twice,
    // and not requiring itself — five defects for one real task.
    const named = [...new Set(args.positional)];
    const unknown = named.filter((id) => !byId.has(id));
    if (unknown.length > 0) reportUnknownIds(unknown, tasks, (line) => console.log(line));
    plan = named.map((id) => byId.get(id)).filter((task): task is Task => task !== undefined);
  } else {
    const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
    if (activeSpec.note) console.log(activeSpec.note);
    if (activeSpec.spec === null) {
      console.log('no active spec for this branch, and no ids or --spec given — `tasks plan <id>...` grades a set directly');
      return;
    }
    // What a planner would actually hand out: the spec's live work, held
    // and unheld alike. A blocked member is included on purpose — "this
    // starts blocked" is one of the answers worth having.
    plan = tasks.filter((task) => task.spec === activeSpec.spec && (task.state === 'open' || task.state === 'in-progress'));
    console.log(`plan taken from spec ${activeSpec.spec}: its ${plan.length} open and in-progress member(s)`);
  }

  if (plan.length === 0) {
    console.log('nothing to grade — name the ids to dispatch, or add members to the spec');
    return;
  }

  const report = checkPlan(plan, tasks);
  console.log(`plan: ${plan.length} task(s), ${plan.length - report.ungranted} with a write grant this check can read`);
  for (const task of plan) printRow(task, byId, { indent: '  ' });
  console.log('');

  if (report.findings.length === 0) {
    console.log('no overlap, no unstated dependency, no duplicated interface.');
    if (report.ungranted > 0) console.log(`${report.ungranted} task(s) have no grant this check could read, so that answer covers less than it looks like it does.`);
    return;
  }

  for (const finding of report.findings) console.log(`  [${finding.level}] ${finding.message}`);
  console.log('');
  const defects = report.findings.filter((finding) => finding.level === 'defect').length;
  console.log(`${report.findings.length} finding(s) — ${defects} defect, ${report.findings.length - defects} note. Reported, not enforced: whether to dispatch is yours.`);
}

// An empty queue has causes that look identical from outside — no members,
// every member closed, every member held by a live requirement, a
// requirement naming no record, or a ring of members holding each other —
// and the caller's next move differs for each.
function explainEmptyQueue(tasks: Task[], spec: string, filter: { system?: string; severity?: string }): void {
  const members = tasks.filter((task) => task.spec === spec);
  if (members.length === 0) {
    console.log(`${spec} has no member tasks — \`tasks spec add ${spec} <id>...\` puts work in it`);
    return;
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const open = members.filter((task) => task.state === 'open');
  const blocked = open.filter((task) => isBlocked(task, byId));

  if (open.length === 0) {
    const counts = new Map<State, number>();
    for (const member of members) counts.set(member.state, (counts.get(member.state) ?? 0) + 1);
    console.log(`all ${members.length} member(s) are accounted for — ${[...counts].map(([state, count]) => `${state}: ${count}`).join(', ')}`);
    return;
  }

  const narrowed = [filter.system && `--system ${filter.system}`, filter.severity && `--severity ${filter.severity}`].filter(Boolean).join(' ');
  if (blocked.length < open.length) console.log(narrowed === '' ? `${open.length - blocked.length} open, unblocked member(s) exist but none reached this queue` : `${open.length - blocked.length} open, unblocked member(s) exist but none match ${narrowed}`);

  if (blocked.length === 0) return;
  console.log(`${blocked.length} open member(s) are waiting on a requirement:`);
  // Named with their status, not just their ids: a requirement no record
  // answers to holds the task exactly as hard as a live one and is fixed
  // completely differently — one is waiting, the other is a typo. `next` is
  // the command an agent opens with, so collapsing them here is where a
  // mistyped id would go unexplained for as long as it took someone to run
  // `show` or `doctor` on a task the queue had stopped mentioning.
  for (const task of blocked) {
    const held = requirementStates(task, byId).filter((requirement) => requirement.status === 'waiting' || requirement.status === 'missing');
    console.log(`- ${task.id} waits on ${held.map((requirement) => `${requirement.id} (${requirement.status})`).join(', ')}`);
  }

  const memberIds = new Set(members.map((task) => task.id));
  const cycles = dependencyCycles(tasks).filter((cycle) => cycle.some((id) => memberIds.has(id)));
  for (const cycle of cycles) console.log(`these block each other and someone must break the cycle: ${cycle.join(' -> ')}`);
}

// `in-progress` is the only state that means someone is holding the record,
// so every move out of it releases the claim. A record that kept its holder
// through `done` would be reported cold forever, on finished work.
function releaseClaim(task: Task, to: State): string[] {
  if (to === 'in-progress' || task.claimed === null) return [];
  const released = claimSummary(task, today());
  task.claimed = null;
  task.claimedBy = null;
  return [`released the claim: ${released}`];
}

// Every state verb moves a record and reports what the move displaced, so
// that no transition is silent about the state it overwrote. Leaving a
// closing state un-closes the record: its close date and closing commit
// describe a close that no longer holds. The reason survives — it says why
// the record was closed then, which stays true of the period it covers, and
// is the only trace a reopened decline leaves.
function transition(task: Task, to: State): string[] {
  const from = task.state;
  task.state = to;
  const notes = releaseClaim(task, to);
  if (from === to) return [...notes, `it was already ${to}`];
  if (!CLOSING_STATES.includes(from)) return [...notes, `was ${from}`];
  const kept = task.reason ? `, keeping its ${from} reason: ${task.reason}` : '';
  const closed = task.closed ? ` (closed ${task.closed})` : '';
  task.closed = null;
  task.closedCommit = null;
  return [...notes, `reopened a ${from} record${closed}${kept}`];
}

function cmdStart(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    refuseUnknownIds([id], tasks);
    return;
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waiting = waitingOn(task, byId);
  const displaced = claimSummary(task, today());
  const notes = transition(task, 'in-progress');
  // Not derived from git or the OS: every agent here commits as the same
  // user, so an identity taken from the machine would distinguish nothing
  // while reading as though someone had asserted it. Unclaimed by name is
  // the honest record, and the time is what coldness actually needs.
  const actor = config.actor;
  task.claimed = today();
  task.claimedBy = actor;
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'start', [subjectOf(task, ['started', ...notes].join('; '))]);
  console.log(`started ${id}`);
  if (displaced !== null) console.log(`took over a claim: ${displaced} — the previous claim is replaced, not merged`);
  for (const note of notes) console.log(note);
  console.log(claimSummary(task, today()));
  if (actor === null) console.log(`no --actor given: the claim is recorded with no holder named — pass --actor <name> so a cold claim says who to ask`);
  if (waiting.length > 0) console.log(`started while still waiting on ${waiting.join(', ')} — the requirement stands, the claim is recorded anyway`);
}

function cmdStop(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    refuseUnknownIds([id], tasks);
    return;
  }
  const notes = transition(task, 'open');
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'stop', [subjectOf(task, ['stopped', ...notes].join('; '))]);
  console.log(`stopped ${id}`);
  for (const note of notes) console.log(note);
}

// The five determinations `done` used to refuse an undelivered task on,
// reported beside the close instead of preventing it, so a clause closed
// against an unmet verdict leaves a record of what its spec's latest pass
// actually said at the moment it closed.
function clauseStanding(config: Config, task: Task): string {
  if (!task.spec) return 'it names no spec, so no audit pass can speak to it';
  if (task.clause === null) return 'it names no proof clause';
  const path_ = specFile(config, task.spec);
  if (!existsSync(path_)) return `its spec file is missing: ${path_}`;
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  if (!doc.proofClauses.some((candidate) => candidate.id === task.clause)) return `proof clause ${task.clause} is no longer in ${path_}`;
  const latest = doc.auditPasses[doc.auditPasses.length - 1];
  if (!latest) return `${task.spec} has no recorded audit pass`;
  const status = latest.verdicts.find((candidate) => candidate.clause === task.clause)?.status ?? 'unknown';
  const nobodyLooked = status === 'unknown' ? ' — nobody graded it, which is not the same as unmet' : '';
  return `proof clause ${task.clause} is ${status} in the latest audit pass (pass ${latest.pass})${nobodyLooked}`;
}

function cmdDone(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    refuseUnknownIds([id], tasks);
    return;
  }
  let closedCommit: string | null = null;
  if (args.flags.commit !== undefined) {
    try {
      closedCommit = resolveCommit(args.flags.commit);
    } catch (error) {
      console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waiting = waitingOn(task, byId);
  const alreadyDone = task.state === 'done';
  const notes = transition(task, 'done');
  // A second `done` does not restate the close date: the first close is
  // when it happened, and only a commit the first close could not name yet
  // is new information.
  if (!alreadyDone) {
    task.closed = today();
    task.closedCommit = closedCommit;
  } else if (closedCommit !== null) {
    task.closedCommit = closedCommit;
  }
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'done', [subjectOf(task, ['done', ...notes, ...(task.closedCommit ? [`closing commit ${task.closedCommit}`] : []), ...(waiting.length > 0 ? [`${waiting.length} requirement(s) still open: ${waiting.join(', ')}`] : [])].join('; '))]);
  console.log(`done ${id}`);
  for (const note of notes) console.log(note);
  if (task.kind === 'undelivered') console.log(`clause standing at close: ${clauseStanding(config, task)}`);
  if (alreadyDone) console.log(`the recorded close date stands: ${task.closed ?? 'undated'}`);
  if (waiting.length > 0) console.log(`closed with ${waiting.length} requirement(s) still open: ${waiting.join(', ')}`);
}

function cmdDecline(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  const reason = args.flags.reason;
  if (!id || !reason) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    refuseUnknownIds([id], tasks);
    return;
  }
  const notes = transition(task, 'declined');
  task.reason = reason;
  task.closed = today();
  task.closedCommit = null;
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'decline', [subjectOf(task, [`declined: ${truncateLine(reason, 120)}`, ...notes].join('; '))]);
  console.log(`declined ${id}`);
  for (const note of notes) console.log(note);
  if (task.kind === 'undelivered') console.log(`this was ${task.spec ?? 'a spec'}'s outstanding promise on clause ${task.clause ?? '(none named)'} — declining it abandons the clause, it does not discharge it`);
}

const SPEC_SCAFFOLD = (slug: string): string => `# ${slug}

## Deliverable

<one paragraph: what this branch promises>

Proof:

- <a checkable clause>

## Decisions

## Open questions

None.
`;

function cmdSpecNew(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (existsSync(path_)) {
    console.error(`error: spec already exists: ${path_}`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(config.specsDir, { recursive: true });
  writeFileSync(path_, SPEC_SCAFFOLD(slug), 'utf8');
  console.log(`created ${path_} — fill in ## Deliverable before opening the branch's first audit`);
}

function cmdSpecAdd(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  const ids = args.positional.slice(1);
  if (!slug || ids.length === 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    refuseUnknownSpec(config, slug);
    return;
  }
  const tasks = loadStore(config.storePath);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    refuseUnknownIds(missing, tasks);
    return;
  }
  const latePass = ids.map((id) => byId.get(id)!).filter((task) => (task.source?.pass ?? 0) >= 2);
  const from = new Map(ids.map((id) => [id, byId.get(id)!.spec]));
  for (const id of ids) byId.get(id)!.spec = slug;
  saveStoreAndWarn(tasks, config);
  recordEvents(
    config,
    'spec-add',
    ids.map((id) => subjectOf(byId.get(id)!, `moved into spec ${slug} from ${from.get(id) ?? '(deferred)'}`)),
  );
  console.log(`added ${ids.length} task(s) to ${slug}`);
  if (latePass.length > 0) console.log(`${latePass.length} of those came from a pass 2 or later audit, which extends what ${slug} owes: ${latePass.map((task) => `${task.id} (pass ${task.source!.pass})`).join(', ')}`);
}

function cmdSpecShow(args: Flags, usage: string): void {
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
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  console.log(doc.deliverableSection);
  console.log('');
  console.log(`${doc.auditPasses.length} audit pass(es) recorded`);
  for (const pass of doc.auditPasses) {
    console.log(`  pass ${pass.pass} (${pass.date}): ${outstandingSummary(pass.verdicts)}`);
  }
  // The passes above are what each pass said; this is where the spec stands
  // now, which differs whenever a clause was added after the last one.
  const latest = doc.auditPasses[doc.auditPasses.length - 1];
  console.log(`clause standing (${latest ? `latest pass ${latest.pass}` : 'no audit pass recorded'}): ${outstandingSummary(clauseStandings(doc.proofClauses, latest?.verdicts))}`);
  console.log('');

  const tasks = readStore(config);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const members = specMembers(tasks.filter((task) => task.spec === slug), args.flags.order === 'true');
  console.log(`${members.length} member(s):`);
  for (const member of members) printRow(member, byId, { indent: '  ' });
}

function specMembers(members: Task[], ordered: boolean): Task[] {
  if (!ordered) return members;
  const byId = new Map(members.map((task) => [task.id, task]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: Task[] = [];

  function visit(task: Task): void {
    if (visited.has(task.id) || visiting.has(task.id)) return;
    visiting.add(task.id);
    for (const requirement of task.requires) {
      const dep = byId.get(requirement);
      if (dep) visit(dep);
    }
    visiting.delete(task.id);
    visited.add(task.id);
    result.push(task);
  }

  for (const task of members) visit(task);
  return result;
}

function cmdSpecDone(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    refuseUnknownSpec(config, slug);
    return;
  }
  const tasks = loadStore(config.storePath);
  const members = tasks.filter((task) => task.spec === slug);
  const stragglers = members.filter((task) => task.state !== 'done' && task.state !== 'declined');

  if (stragglers.length > 0 && args.flags['defer-open'] === 'true') {
    for (const straggler of stragglers) straggler.spec = null;
    saveStoreAndWarn(tasks, config);
    // The spec named is the one the record just left, not the null it now
    // carries: `tasks log --spec <slug>` has to be the whole membership
    // history of that spec, and a departure is part of it.
    recordEvents(
      config,
      'spec-defer',
      stragglers.map((straggler) => ({ ...subjectOf(straggler, `deferred out of spec ${slug} when it closed, still ${straggler.state}`), spec: slug })),
    );
    console.log(`deferred ${stragglers.length} straggler(s) out of ${slug}: ${stragglers.map((task) => task.id).join(', ')}`);
  }

  const reloaded = loadStore(config.storePath);
  const stillOpen = reloaded.filter((task) => task.spec === slug && task.state !== 'done' && task.state !== 'declined');
  if (stillOpen.length > 0) {
    console.log(`${slug} is not done — ${stillOpen.length} member(s) are neither done nor declined:`);
    const byId = new Map(reloaded.map((task) => [task.id, task]));
    for (const task of stillOpen) printRow(task, byId, { indent: '- ' });
    return;
  }
  console.log(`${slug} is done: every member is done or declined`);
}

// The demotion counterpart to `spec add`: nothing else sets `spec` back to
// null for named ids. `spec done --defer-open` sweeps every open member at
// once; this targets specific ones without waiting for the spec to close.
function cmdSpecRemove(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  const ids = args.positional.slice(1);
  if (!slug || ids.length === 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    refuseUnknownSpec(config, slug);
    return;
  }
  const tasks = loadStore(config.storePath);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    refuseUnknownIds(missing, tasks);
    return;
  }
  const notMembers = ids.filter((id) => byId.get(id)!.spec !== slug);
  const undelivered = ids.filter((id) => byId.get(id)!.kind === 'undelivered');
  const from = new Map(ids.map((id) => [id, byId.get(id)!.spec]));
  for (const id of ids) byId.get(id)!.spec = null;
  saveStoreAndWarn(tasks, config);
  recordEvents(
    config,
    'spec-remove',
    ids.map((id) => ({ ...subjectOf(byId.get(id)!, `removed from spec ${slug}, and now names none`), spec: from.get(id) ?? slug })),
  );
  console.log(`removed ${ids.length} task(s) from ${slug}`);
  if (notMembers.length > 0) console.log(`${notMembers.length} of those named a different spec, or none, and now name none: ${notMembers.join(', ')}`);
  if (undelivered.length > 0) console.log(`${undelivered.length} of those were ${slug}'s outstanding promises — the clauses they name are now tracked by no spec: ${undelivered.join(', ')}`);
}

// The migration path only, for the 22 legacy documents under docs/audits/.
// Findings under `## H1` / `## M2` / `## L3` become unreviewed tasks; every
// other heading shape in those docs (Tier N, HIGH/MEDIUM/LOW, Findings) is a
// superseded or reconciliation format and is silently left unimported.
function cmdImport(args: Flags, usage: string): void {
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
// to fall back to a placeholder that still exits 0 (M9).
function resolveDiffRange(baseBranch: string, emit: (line: string) => void): { base: string; head: string } | null {
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

function diffChangedFiles(range: string): string[] {
  try {
    const output = execFileSync('git', ['diff', '--name-only', range], { encoding: 'utf8' }).trim();
    return output === '' ? [] : output.split('\n');
  } catch {
    return [];
  }
}

function requiredCommands(): string[] {
  return ['npm test', 'npx tsc --noEmit', 'npm run layer-check', 'npm run tasks -- doctor'];
}

function cmdAuditPrompt(args: Flags, usage: string): void {
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
  // the range. `handoff --base-branch <bad>` already reported the identical
  // condition at exit 0, which is the evidence this refusal was avoidable
  // rather than intrinsic.
  const range = resolveDiffRange(baseBranch, (line) => console.log(line));
  if (range === null) return;
  const { base, head } = range;

  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  const tasks = readStore(config);
  const members = tasks.filter((task) => task.spec === slug);
  const latest = doc.auditPasses[doc.auditPasses.length - 1];

  const relevantFiles = [...new Set([...members.flatMap((task) => task.files), ...diffChangedFiles(`${base}..${head}`)])].sort();
  const noTargetCount = doc.proofClauses.filter((clause) => (clause.proofTargets ?? []).length === 0).length;

  console.log(`You are auditing ${slug} on branch ${config.branch}.`);
  console.log(`Spec: ${path_}`);
  console.log(`Diff range: ${base}..${head}`);
  console.log('');
  console.log('Read the spec deliverable, the latest audit pass if any, and the diff above. Verify each proof clause independently.');
  console.log('');
  console.log('Required commands (all must pass):');
  for (const command of requiredCommands()) console.log(`- ${command}`);
  console.log('');
  console.log('Relevant files:');
  if (relevantFiles.length === 0) console.log('- none');
  for (const file of relevantFiles) console.log(`- ${file}`);
  console.log('');
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
      for (const target of targets) console.log(`  proof: ${target}`);
      console.log('  has a proof target — pure logic/API shape: temporarily remove, invert, or scale the behavior it proves and confirm it fails for the right reason before accepting it.');
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
  console.log('For every clause with a proof target, confirm the target exists and fails under a meaningful mutation or reproduction before accepting it as proof.');
  console.log('For pure domain logic and API layers, prefer mutation testing: temporarily remove, invert, or scale the behavior the test claims to prove and confirm the named proof fails for the right reason.');
  console.log('For UI work, inspect behavior and add or run smoke tests after the implementation has settled.');
  console.log('');
  console.log('Report each clause as met, unmet or unknown. `met` carries the evidence that backs it and the tool refuses it without one; `unmet` means you checked and it fails; `unknown` means nobody looked, and reporting it as unmet instead hides that nothing was verified.');
  console.log('Report findings with severity, system, files, evidence, and deliverable; and any proof target that is missing, skipped, too broad, or non-specific.');
  console.log('Do not treat green tests as proof unless they are tied to the clause they discharge.');
  console.log('Promotion is the human triager\'s call at any pass — you file findings, you do not schedule them. Say plainly which of yours you believe this branch must not merge without.');
}

const EVIDENCE_INDENT = '          ';
const EVIDENCE_WRAP_WIDTH = 78 - EVIDENCE_INDENT.length;

// Greedy word wrap: text written through `add`/`edit` carries no line
// breaks of its own, so without this every finding's evidence or
// deliverable prints as one unbroken line — true of all twelve findings
// currently in the store.
function wrapText(text: string, width: number): string[] {
  if (text.length <= width) return [text];
  const wrapped: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (candidate.length > width && current !== '') {
      wrapped.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  wrapped.push(current);
  return wrapped;
}

function truncateLine(text: string, max = 100): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function printEvidence(evidence: string | null, maxLines = 12): void {
  if (!evidence) return;
  const lines = evidence.split('\n').flatMap((line) => wrapText(line, EVIDENCE_WRAP_WIDTH));
  for (const line of lines.slice(0, maxLines)) console.log(`${EVIDENCE_INDENT}${line}`);
  if (lines.length > maxLines) console.log(`${EVIDENCE_INDENT}… (${lines.length - maxLines} more line(s), see \`tasks show\`)`);
}

// A human, not the auditor, assigns state — this is the only place that
// happens. promote/defer/decline all persist immediately, not just on quit,
// so a queue this long survives an interrupted session.
async function cmdTriage(args: Flags): Promise<void> {
  const config = resolveConfig(args.flags);
  const tasks = loadStore(config.storePath);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  const spec = activeSpec.spec;
  if (activeSpec.note) console.log(activeSpec.note);
  const queue = unreviewedQueue(tasks);
  if (queue.length === 0) {
    console.log('no unreviewed findings');
    return;
  }
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  // rl.question()'s once('line') listener drops any line that arrives before
  // the next question() call registers it — real under piped/batched input,
  // where every answer can already be buffered before we ask for the first
  // one. The async iterator's internal queue does not have that race.
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? 'q' : next.value;
  };

  const total = queue.length;
  outer: for (let i = 0; i < queue.length; i++) {
    const task = queue[i];
    // Redirect re-displays this same task and asks again rather than
    // advancing, so displaying and deciding is a loop, not a single pass.
    while (true) {
      console.log('');
      // c9's one printer, not a fifth bespoke one. The hand-rolled row
      // collapsed severity to an initial and dropped the id entirely, so a
      // human triaging could not copy an id out of the pane to `tasks show`
      // it — which is the one thing this pane makes you want to do.
      console.log(`[${i + 1}/${total}]`);
      printRow(task, byId, { indent: '  ', withFiles: true });
      console.log('');
      console.log('evidence — what is broken:');
      printEvidence(task.evidence);
      console.log('');
      console.log('deliverable — the proposed fix:');
      if (task.deliverable) printEvidence(task.deliverable);
      else console.log('          no proposed fix recorded');
      console.log('');
      console.log('[1] promote   [2] defer   [3] decline   [4] redirect   [s] skip   [q] save and quit');

      const answer = (await ask('> ')).trim().toLowerCase();
      if (answer === 'q') break outer;
      if (answer === '' || answer === 's') break;

      let decision: string;
      if (answer === '1') {
        if (spec === null) {
          console.log('no active spec to promote into — pass --spec, skipping');
          break;
        }
        if ((task.source?.pass ?? 0) >= 2) console.log(`promoting a pass ${task.source!.pass} finding, which extends what ${spec} owes`);
        task.state = 'open';
        task.spec = spec;
        decision = `promoted into spec ${spec}`;
      } else if (answer === '2') {
        task.state = 'open';
        task.spec = null;
        decision = 'deferred: opened outside every spec';
      } else if (answer === '3') {
        const reason = (await ask('reason: ')).trim();
        if (reason === '') {
          console.log('a reason is required to decline — skipping');
          break;
        }
        task.state = 'declined';
        task.reason = reason;
        task.closed = today();
        decision = `declined: ${truncateLine(reason, 120)}`;
      } else if (answer === '4') {
        const replacement = (await ask('replacement deliverable: ')).trim();
        if (replacement === '') {
          console.log('empty — redirect cancelled');
          continue;
        }
        task.deliverable = replacement;
        saveStoreAndWarn(tasks, config);
        recordEvents(config, 'triage', [subjectOf(task, `redirected the deliverable to: ${truncateLine(replacement, 120)}`)]);
        continue;
      } else {
        console.log('unrecognised input, skipping');
        break;
      }
      saveStoreAndWarn(tasks, config);
      recordEvents(config, 'triage', [subjectOf(task, decision)]);
      break;
    }
  }
  rl.close();

  const remaining = tasks.filter((task) => task.state === 'unreviewed').length;
  console.log(`\n${remaining} unreviewed finding(s) left`);
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

// Repeated --proof/--evidence/--finding flags need a dedicated scanner: the
// generic parseArgs collapses a repeated flag to its last value, and a
// --finding's --severity/--system/--file belong to whichever --finding
// came most recently, which a flat key-value map cannot express.
//
// --file and --evidence are overloaded by position: while no --finding has
// been seen yet they are clause-scoped and take the same `N=value` shape as
// --proof (`--file 2=src/save.ts:88`); once a --finding is open they attach
// to that finding instead and take a bare value.
function parseAuditArgs(args: string[]): AuditArgs {
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
    } else if (key === 'evidence' && current) {
      const raw = value ?? '';
      const eq = raw.indexOf('=');
      if (eq > 0 && Number.isFinite(Number(raw.slice(0, eq)))) {
        evidence.set(Number(raw.slice(0, eq)), raw.slice(eq + 1));
      } else if (current.evidence !== null) {
        errors.push(`finding "${current.title}" already has evidence`);
      } else {
        current.evidence = raw;
      }
    } else if (key === 'evidence') {
      const eq = (value ?? '').indexOf('=');
      evidence.set(Number((value ?? '').slice(0, eq)), (value ?? '').slice(eq + 1));
    } else if (key === 'finding') {
      current = { title: value ?? '', severity: null, system: null, files: [], deliverable: null, evidence: null };
      findings.push(current);
    } else if (key === 'file' && current === null) {
      const eq = (value ?? '').indexOf('=');
      if (eq === -1) errors.push(`--file ${value ?? ''} names no clause — before any --finding, a file is clause-scoped and takes the same N=path:line shape as --proof`);
      else {
        const clause = Number((value ?? '').slice(0, eq));
        clauseFiles.set(clause, [...(clauseFiles.get(clause) ?? []), (value ?? '').slice(eq + 1)]);
      }
    } else if (current === null) {
      errors.push(`--${key} describes a finding, and no --finding has been opened yet — put it after the --finding it belongs to`);
    } else if (key === 'severity') {
      current.severity = value as Severity;
    } else if (key === 'system') {
      current.system = value ?? null;
    } else if (key === 'deliverable') {
      current.deliverable = value ?? null;
    } else {
      current.files.push(value ?? '');
    }
  }
  return { slug, configFlags, baseBranch, proofs, evidence, errors, clauseFiles, findings };
}

const AUDIT_USAGE =
  `usage: tasks audit <spec> [--base-branch main] ${ACTOR_USAGE} [--proof N=met|unmet|unknown ...] [--evidence N="..." ... (required for every met clause)] [--file N=path:line ...] [--finding "..." --severity high|medium|low --system "<name>" --deliverable "..." --evidence "..." [--file path:line ...]]...  (with no --proof flags, walks the clauses interactively; a clause left ungraded is recorded unknown, never unmet)`;

// Stops at the first clause the answerer walks away from rather than
// looping on an exhausted stdin, and the caller grades the rest `unknown` —
// a half-finished walk graded nothing, which is exactly what unknown says.
async function walkClausesInteractively(clauses: ProofClause[]): Promise<AuditVerdict[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  let exhausted = false;
  const ask = async (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    if (next.done) exhausted = true;
    return next.done ? '' : next.value;
  };

  const verdicts: AuditVerdict[] = [];
  for (const clause of clauses) {
    console.log(`\nclause ${clause.id}: ${clause.text}`);
    let status: Verdict | null = null;
    while (status === null && !exhausted) {
      const answer = (await ask('met/unmet/unknown? ')).trim().toLowerCase();
      if (VERDICTS.includes(answer as Verdict)) status = answer as Verdict;
      else if (!exhausted) console.log('type "met", "unmet" or "unknown"');
    }
    if (status === null) break;
    // A met verdict is a completion claim, so it is held until the claim
    // names something the next auditor can re-run; unmet and unknown claim
    // nothing and an empty answer records nothing.
    let evidenceText: string | null = null;
    while (evidenceText === null && !exhausted) {
      evidenceText = (await ask(status === 'met' ? 'evidence (required for met): ' : 'evidence (optional): ')).trim() || null;
      if (status !== 'met') break;
      if (evidenceText === null && !exhausted) console.log('a met verdict needs evidence the next pass can re-run');
    }
    if (status === 'met' && evidenceText === null) break;
    verdicts.push({ clause: clause.id, status, evidence: evidenceText });
  }
  rl.close();
  return verdicts;
}

// The only way a finding enters the store.
async function cmdAudit(args: Flags, usage: string): Promise<void> {
  const parsed = parseAuditArgs(args.raw);
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
  // Stamped before anything is recorded, so this pass names ids the spec
  // file already carries rather than ids it is about to be given.
  const original = readFileSync(path_, 'utf8');
  const text = stampClauseIds(original);
  const doc = parseSpecDoc(text);
  // Both of these are the state of the spec *document* disagreeing with the
  // write, not malformed CLI input, and doctor already reports the second
  // at exit 0. Refusing meant a typo in a heading stopped an auditor filing
  // findings at all — a gate failing closed on a disagreement, which is the
  // shape this branch exists to remove. Reported, and the pass is recorded.
  if (doc.proofClauses.length === 0) {
    console.warn(`warning: ${slug}'s ## Deliverable has no Proof: clauses — recording a pass that grades nothing`);
  }
  const duplicates = duplicateClauseIds(doc.proofClauses);
  if (duplicates.length > 0) {
    console.warn(`warning: ${slug} tags more than one proof clause [c${duplicates[0]}] — a verdict for it cannot say which one it graded; \`tasks doctor\` reports this until the tags are unique`);
  }

  // Whichever route graded the clauses, the ones it did not reach are
  // `unknown` rather than missing: a pass that says nothing about a clause
  // is a pass that nobody ran on it, and that is a fact worth recording.
  const graded =
    parsed.proofs.size === 0 && parsed.findings.length === 0
      ? await walkClausesInteractively(doc.proofClauses)
      : doc.proofClauses.filter((clause) => parsed.proofs.has(clause.id)).map((clause) => ({ clause: clause.id, status: parsed.proofs.get(clause.id)!, evidence: parsed.evidence.get(clause.id) ?? null }));
  const verdicts = clauseStandings(doc.proofClauses, graded);
  const ungraded = verdicts.filter((verdict) => verdict.status === 'unknown').map((verdict) => `c${verdict.clause}`);

  const unevidenced = verdicts.filter((verdict) => verdict.status === 'met' && !verdict.evidence);
  if (unevidenced.length > 0) {
    console.error(`error: ${unevidenced.map((verdict) => `clause ${verdict.clause} is met with no evidence`).join('; ')} — pass --evidence N="..." naming what you checked, so the next pass can re-run it`);
    process.exitCode = 1;
    return;
  }

  for (const finding of parsed.findings) {
    if (!finding.severity || !['high', 'medium', 'low'].includes(finding.severity)) {
      console.error(`error: finding "${finding.title}" needs --severity high|medium|low`);
      process.exitCode = 1;
      return;
    }
    if (!finding.deliverable) {
      console.error(`error: finding "${finding.title}" needs --deliverable "..." — a finding must say what fixing it would mean`);
      process.exitCode = 1;
      return;
    }
    // Triage shows both halves and decides on both: a finding with no
    // evidence reaches the human as a proposed fix to a problem they have
    // to take on faith, which is the one thing triage cannot do.
    if (!finding.evidence) {
      console.error(`error: finding "${finding.title}" needs --evidence "..." — a finding must say what is broken, not only what fixing it would mean`);
      process.exitCode = 1;
      return;
    }
  }

  const passNumber = doc.auditPasses.length + 1;
  // A range this checkout cannot compute is recorded as unresolved rather
  // than refused or invented. c8 permits git as evidence by sha; it does
  // not permit a refusal derived from git, and `(unresolved)` says exactly
  // what happened — the same answer c3 requires of a clause nobody graded.
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
    const id = uniqueId(slugify(`${slug}-pass${passNumber}-${finding.title}`), taken);
    const task: Task = {
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
      produces: [],
      files: finding.files,
      deliverable: finding.deliverable,
      evidence: finding.evidence,
      source: { spec: slug, pass: passNumber },
      reason: null,
      closed: null,
      closedCommit: null,
      claimed: null,
      claimedBy: null,
      extra: null,
    };
    tasks.push(task);
    taken.add(id);
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

const COMMIT_SEP = '\x1e';
const FIELD_SEP = '\x1f';

interface FoundTrailer {
  trailer: string;
  sha: string;
  distance: number;
}

type BranchCommitRange =
  | { kind: 'range'; range: string; count: number }
  | { kind: 'empty'; range: null; count: 0 }
  | { kind: 'unknown'; range: null; count: 0 };

// The branch's own commits, or null when that range can't be built or is
// empty — the latter being the base branch itself, where "this branch's
// work" is the whole history and the unscoped walk is the right one.
function branchCommitRange(baseBranch: string): BranchCommitRange {
  const mergeBase = git.mergeBase(baseBranch);
  if (mergeBase === null) return { kind: 'unknown', range: null, count: 0 };
  const count = git.commitCount(`${mergeBase}..HEAD`);
  if (count === null) return { kind: 'unknown', range: null, count: 0 };
  return count === 0 ? { kind: 'empty', range: null, count } : { kind: 'range', range: `${mergeBase}..HEAD`, count };
}

// Only the last commit's Next: is meant to be live, but a mechanical or
// fixup commit can carry none at all — walk back to the most recent commit
// that actually has one.
//
// Stopping at the merge-base is the difference between "nothing to resume
// yet" and a confident pointer at another branch's plan: a branch whose
// first commit carries no trailer has nothing of its own to find, and
// walking past its base reaches whatever the previous branch was planning
// next. The commit cap stays as a bound on the scan, not on the reach.
const DEFAULT_HANDOFF_SCAN_CAP = 20;

function findLatestNextTrailer(range: string | null, maxCommits: number): FoundTrailer | null {
  let log: string;
  try {
    log = execFileSync('git', ['log', `-${maxCommits}`, `--format=%H${FIELD_SEP}%B${COMMIT_SEP}`, ...(range === null ? [] : [range])], { encoding: 'utf8' });
  } catch {
    return null;
  }
  const commits = log.split(COMMIT_SEP).filter((entry) => entry.trim().length > 0);
  for (let distance = 0; distance < commits.length; distance++) {
    const sepIndex = commits[distance].indexOf(FIELD_SEP);
    const sha = commits[distance].slice(0, sepIndex).trim();
    const message = commits[distance].slice(sepIndex + 1);
    const trailer = extractNextTrailer(message);
    if (trailer !== null) return { trailer, sha, distance };
  }
  return null;
}

// Fixed header (branch, trailer, spec, proof clauses) plus 2 lines per
// queue member is what proof clause 6's 40-line cap is measured against —
// 8 keeps that total comfortably under it even at a full clause list.
const HANDOFF_QUEUE_CAP = 8;

// The first command of a cold session.
function cmdHandoff(args: Flags, usage: string): void {
  const scanCap = args.flags['scan-cap'] === undefined ? DEFAULT_HANDOFF_SCAN_CAP : Number(args.flags['scan-cap']);
  // `git log -<n>` takes this straight, so a non-number reaches git as NaN
  // and a negative one reaches it as a flag: both make the walk silently
  // scan something other than what was asked for.
  if (!Number.isInteger(scanCap) || scanCap < 1) {
    console.error(`error: --scan-cap must be a whole number of commits, at least 1: ${args.flags['scan-cap']}`);
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const config = resolveConfig(args.flags);
  console.log(`branch: ${config.branch}`);

  const baseBranch = args.flags['base-branch'] ?? 'main';
  const branchRange = branchCommitRange(baseBranch);
  const found = branchRange.kind === 'range' ? findLatestNextTrailer(branchRange.range, scanCap) : null;
  if (branchRange.kind === 'unknown') {
    console.log(`(could not find the branch point for ${baseBranch}; Next trailer scan skipped)`);
  } else if (found === null) {
    console.log(branchRange.kind === 'empty' ? `(no Next: trailer yet on this branch — nothing recorded since it left ${baseBranch})` : branchRange.count > scanCap ? `(no Next: trailer found in the last ${scanCap} branch commits)` : `(no Next: trailer yet on this branch; no Next: trailer found in ${branchRange.count} branch commit${branchRange.count === 1 ? '' : 's'} since it left ${baseBranch})`);
  } else {
    if (found.distance > 0) console.log(`(from ${found.sha.slice(0, 7)}, ${found.distance} commit${found.distance === 1 ? '' : 's'} back)`);
    console.log(found.trailer);
  }
  console.log('');

  const tasks = readStore(config);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  if (activeSpec.note) console.log(activeSpec.note);
  const spec = activeSpec.spec;
  if (spec === null) {
    console.log(`spec: none — no ${specFile(config, config.branch)}, and no --spec given`);
    return;
  }
  const path_ = specFile(config, spec);
  console.log(`spec: ${spec} (${path_})`);
  if (!existsSync(path_)) {
    console.log(`spec file missing: ${path_}`);
    return;
  }
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  console.log('');
  // The proof clauses, not the whole ## Deliverable section: the section's
  // prose never changes between runs, and what a cold session needs from
  // it — what the branch still owes — is exactly what the clauses are.
  const standings = clauseStandings(doc.proofClauses, doc.auditPasses[doc.auditPasses.length - 1]?.verdicts);
  for (const standing of standings) console.log(`  ${standing.clause}. [${standing.status}] ${truncateLine(doc.proofClauses.find((clause) => clause.id === standing.clause)!.text)}`);
  console.log('');

  const byId = new Map(tasks.map((task) => [task.id, task]));
  const inProgress = tasks.filter((task) => task.spec === spec && task.state === 'in-progress');
  if (inProgress.length > 0) {
    console.log(`${inProgress.length} in-progress task(s):`);
    for (const task of inProgress.slice(0, HANDOFF_QUEUE_CAP)) printRow(task, byId, { indent: '- ' });
    if (inProgress.length > HANDOFF_QUEUE_CAP) console.log(`… ${inProgress.length - HANDOFF_QUEUE_CAP} more in progress`);
    console.log('');
  }

  const queue = fixNowQueue(tasks, spec);
  console.log(`${queue.length} open fix-now task(s):`);
  const shown = queue.slice(0, HANDOFF_QUEUE_CAP);
  for (const task of shown) printRow(task, byId, { indent: '- ', withFiles: true });
  // fixNowQueue is already severity-ordered, so truncating here drops the
  // least urgent — the queue can otherwise print 2 lines per member and
  // blow proof clause 6's 40-line cap as the store grows.
  if (queue.length > shown.length) {
    console.log(`… ${queue.length - shown.length} more, see \`tasks list --spec ${spec}\``);
  }
}

// The two writes that touch no task state. A decision is its own op rather
// than a note by convention, because "what was decided about this" has to be
// answerable without a text-matching heuristic.
function recordStandaloneEvent(op: 'note' | 'decision') {
  return (args: Flags, usage: string): void => {
    const config = resolveConfig(args.flags);
    const note = args.positional[0];
    if (!note) {
      console.error(usage);
      process.exitCode = 1;
      return;
    }
    // The one refusal, and it is malformed input: the whole log depends on
    // one event being one line, and prose in a record is what made `next`
    // cost thirty lines to call.
    if (/[\r\n]/.test(note)) {
      console.error(`error: a ${op} is one line — this one has ${note.split(/\r\n|\r|\n/).length}. Record the summary here and leave the prose in the commit message or the spec`);
      process.exitCode = 1;
      return;
    }
    const validationError = validateContentFields(config, args.flags);
    if (validationError) {
      console.error(validationError);
      process.exitCode = 1;
      return;
    }

    const id = args.flags.id ?? null;
    const tasks = id === null ? [] : readStore(config);
    const task = id === null ? undefined : tasks.find((candidate) => candidate.id === id);
    const subject: EventSubject = {
      id,
      system: args.flags.system ?? task?.system ?? null,
      spec: args.flags.spec ?? task?.spec ?? null,
      note,
    };
    recordEvents(config, op, [subject]);

    console.log(`recorded a ${op} against ${id ?? `${subject.system ?? 'no system'}/${subject.spec ?? 'no spec'}`} in ${config.eventsPath}`);
    // An event about a record that does not exist yet is still a fact
    // somebody asserted, so it is recorded and reported, never refused.
    if (id !== null && task === undefined) console.log(`no record answers to ${id} — the ${op} is recorded against that id anyway, and \`tasks log --id ${id}\` finds it`);
    // The spec file may since have been renamed or deleted, and an event
    // about a spec that no longer exists is exactly what a log is for; a
    // system name is drawn from a manifest that is authoritative right now,
    // which is why validateContentFields refuses that one.
    if (subject.spec !== null && !existsSync(specFile(config, subject.spec))) console.log(`no spec file at ${specFile(config, subject.spec)} — recorded against that slug anyway`);
  };
}

function renderEventLine(event: TaskEvent): string {
  return [`${event.t.slice(0, 19)}Z`, event.op, event.id ?? '(no task)', `${event.system ?? '(no system)'} / ${event.spec ?? '(no spec)'}`, event.by ?? '(unnamed)', event.note].join('  ');
}

// c12, answered from the log alone: joining to present-day state would
// rewrite history every time a record is re-pointed, which is the whole
// reason each event snapshots its own system and spec.
function cmdLog(args: Flags): void {
  const config = resolveConfig(args.flags);
  const op = args.flags.op;
  if (op !== undefined && !EVENT_OPS.includes(op as EventOp)) {
    console.error(`error: --op must be one of ${EVENT_OPS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const { events, skipped } = loadEvents(config.eventsPath);
  const filter = { id: args.flags.id, system: args.flags.system, spec: args.flags.spec, op, text: args.positional[0] };
  const matched = filterEvents(events, filter);
  for (const event of matched) console.log(renderEventLine(event));

  const asked = Object.entries(filter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => (key === 'text' ? `"${value as string}"` : `--${key} ${value as string}`));
  // An empty log and a filter that matched nothing are different answers to
  // different questions, and collapsing them tells a caller their query was
  // wrong when the log is simply new.
  if (events.length === 0) console.log(`no events recorded yet in ${config.eventsPath}`);
  else if (matched.length === 0) console.log(`no event matches ${asked.join(' ')} — ${events.length} event(s) in ${config.eventsPath}`);
  else console.log(`${matched.length} of ${events.length} event(s)${asked.length > 0 ? ` matching ${asked.join(' ')}` : ''}`);

  if (skipped.length > 0) {
    console.log(`skipped ${skipped.length} unreadable event line(s) — everything above is the rest of the log:`);
    for (const message of skipped) console.log(`  ${message}`);
  }
}

// Driven by .claude/hooks/commit-msg, which supplies what only git knows:
// whether MERGE_HEAD/REVERT_HEAD exist, and the staged file list.
function cmdCheckCommitMessage(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const msgFile = args.positional[0];
  if (!msgFile) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const message = readFileSync(msgFile, 'utf8');
  const subject = message.split('\n')[0] ?? '';
  const manifest = loadManifest(config.systemsPath);
  const exempt = isExempt(subject, { isMergeOrRevert: args.flags['merge-or-revert'] === 'true', changedFiles: splitList(args.flags.files) }, manifest);
  if (exempt) return;

  const reason = checkCommitMessage(message);
  if (reason) {
    console.error(`commit-msg: ${reason}`);
    console.error('every commit needs a body saying what was done. Use `tasks handoff` or `tasks next` for resumability; an optional Next: trailer is only a breadcrumb. --no-verify to bypass.');
    process.exitCode = 1;
  }
}

const USAGE = 'usage: npm run tasks -- <doctor|add|edit|show|list|search|next|plan|start|stop|done|decline|import|triage|note|decision|log|spec|audit|audit-prompt|handoff> ...';

interface Command {
  usage: string;
  run: (args: Flags, usage: string) => void | Promise<void>;
}

// `tasks spec` names no subcommand and no slug, so it is a misuse; `tasks
// spec --help` and `tasks spec help` are answered before this by the help
// path every command shares.
function refuseBareSpec(_args: Flags, usage: string): void {
  console.error(usage);
  process.exitCode = 1;
}

const SPEC_COMMANDS: Record<string, Command> = {
  new: { usage: 'usage: tasks spec new <slug>', run: cmdSpecNew },
  add: { usage: `usage: tasks spec add <slug> <id>... ${ACTOR_USAGE}`, run: cmdSpecAdd },
  remove: { usage: `usage: tasks spec remove <slug> <id>... ${ACTOR_USAGE}`, run: cmdSpecRemove },
  show: { usage: 'usage: tasks spec show <slug> [--order]', run: cmdSpecShow },
  done: { usage: `usage: tasks spec done <slug> [--defer-open] ${ACTOR_USAGE}`, run: cmdSpecDone },
};

const SPEC_USAGE = `usage: tasks spec <new|add|remove|show|done> ...  (\`tasks spec <slug>\` is short for \`tasks spec show <slug>\`)\n${Object.values(SPEC_COMMANDS)
  .map((command) => `  ${command.usage}`)
  .join('\n')}`;

const COMMANDS: Record<string, Command> = {
  doctor: { usage: `usage: tasks doctor [--fix] ${ACTOR_USAGE}`, run: cmdDoctor },
  add: {
    usage: `usage: tasks add "<title>" [--kind task|finding|question] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--files a.ts:12,b.ts] [--requires id1,id2] [--writes src/a.ts,src/b/] [--produces \"policy module\"] [--deliverable "..." (required for --kind finding)] [--evidence "..."] [--id <id>] ${ACTOR_USAGE}`,
    run: cmdAdd,
  },
  edit: {
    usage: `usage: tasks edit <id> ["<new title>"] [--title "..."] [--deliverable "..."] [--evidence "..."] [--severity high|medium|low] [--system "<name>"] [--files a.ts:12,b.ts] [--requires id1,id2] [--writes src/a.ts,src/b/] [--produces \"policy module\"] ${ACTOR_USAGE}  (content only: state, spec, kind and reason are moved by start/stop/done/decline/spec add, never by edit)`,
    run: cmdEdit,
  },
  show: { usage: 'usage: tasks show <id>', run: cmdShow },
  list: {
    usage: 'usage: tasks list [--state unreviewed|open|in-progress|done|declined] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--kind task|finding|undelivered|question] [--deferred]',
    run: cmdList,
  },
  search: {
    usage: 'usage: tasks search <term> [--state unreviewed|open|in-progress|done|declined] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--kind task|finding|undelivered|question] [--deferred]',
    run: cmdSearch,
  },
  plan: { usage: 'usage: tasks plan [<id>...] [--spec <slug>]  (grades a dispatch set for overlap, unstated dependencies and duplicated interfaces; runs no workers and refuses nothing)', run: cmdPlan },
  next: { usage: 'usage: tasks next [--spec <slug>] [--system "<name>"] [--severity high|medium|low] [--full]', run: cmdNext },
  start: { usage: `usage: tasks start <id> ${ACTOR_USAGE}`, run: cmdStart },
  stop: { usage: `usage: tasks stop <id> ${ACTOR_USAGE}`, run: cmdStop },
  done: { usage: `usage: tasks done <id> [--commit <revspec>] ${ACTOR_USAGE}  (default: none — the closing commit does not exist yet when \`done\` runs; see \`tasks show\` for a derived one)`, run: cmdDone },
  decline: { usage: `usage: tasks decline <id> --reason "..." ${ACTOR_USAGE}`, run: cmdDecline },
  import: { usage: `usage: tasks import <audit-doc> ${ACTOR_USAGE}`, run: cmdImport },
  triage: { usage: `usage: tasks triage [--spec <slug>] ${ACTOR_USAGE}`, run: cmdTriage },
  note: { usage: `usage: tasks note "<one line>" [--id <id>] [--system "<name>"] [--spec <slug>] ${ACTOR_USAGE}  (appends to the event log; the store is untouched)`, run: recordStandaloneEvent('note') },
  decision: { usage: `usage: tasks decision "<one line>" [--id <id>] [--system "<name>"] [--spec <slug>] ${ACTOR_USAGE}  (a decision is its own op, so \`tasks log --op decision\` needs no text matching)`, run: recordStandaloneEvent('decision') },
  log: { usage: 'usage: tasks log [<text>] [--id <id>] [--system "<name>"] [--spec <slug>] [--op add|edit|start|stop|done|decline|triage|import|audit|spec-add|spec-remove|spec-defer|doctor-fix|note|decision]  (every filter given is ANDed, and all of them are answered from the log alone)', run: cmdLog },
  spec: { usage: SPEC_USAGE, run: refuseBareSpec },
  audit: { usage: AUDIT_USAGE, run: cmdAudit },
  'audit-prompt': { usage: 'usage: tasks audit-prompt <spec> [--base-branch main]', run: cmdAuditPrompt },
  handoff: { usage: 'usage: tasks handoff [--spec <slug>] [--base-branch main] [--scan-cap <commits>]', run: cmdHandoff },
  'check-commit-msg': { usage: 'usage: tasks check-commit-msg <msg-file> [--merge-or-revert] [--files a,b,c]', run: cmdCheckCommitMessage },
};

interface Resolved {
  command: Command;
  args: string[];
}

// `spec` is the one command with subcommands, and an unrecognised one is a
// slug: `tasks spec <slug>` is short for `tasks spec show <slug>`, so the
// token stays a positional rather than being consumed.
function resolveCommand(name: string, rest: string[]): Resolved | null {
  if (name !== 'spec') {
    const command = COMMANDS[name];
    return command === undefined ? null : { command, args: rest };
  }
  const sub = rest[0];
  if (sub === 'help') return { command: COMMANDS.spec, args: ['--help', ...rest.slice(1)] };
  if (sub === undefined || sub.startsWith('--')) return { command: COMMANDS.spec, args: rest };
  const command = SPEC_COMMANDS[sub];
  return command === undefined ? { command: SPEC_COMMANDS.show, args: rest } : { command, args: rest.slice(1) };
}

function printRootHelp(): void {
  console.log(USAGE);
  for (const command of Object.values(COMMANDS)) console.log(`  ${command.usage.split('\n')[0]}`);
  console.log(GLOBAL_USAGE);
  console.log('`tasks <command> --help` prints that command\'s flags; a flag not named there is an error, never a silent no-op');
}

// A malformed docs/tasks.jsonl is reported as `path:line` and a non-zero
// exit by every command, from one boundary here rather than a try/catch in
// each store-reading command — which is where eight of them were missing.
function reportStoreErrors<T>(work: () => T): T | void {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

// c9's boundary: nothing runs until the arguments are understood. An
// unrecognised flag is an error naming it, a flag that needs a value and
// was given none is refused rather than defaulted, and `--help` answers on
// every command and subcommand — all before the command body, so no
// command can answer a question it did not understand.
export function run(argv: string[]): void | Promise<void> {
  const [name, ...rest] = argv;
  if (name === undefined || name === 'help' || name === '--help' || name === '-h') {
    printRootHelp();
    return;
  }
  if (name === 'check') {
    console.error('error: `check` is now `doctor` — the same scan, reporting what it finds instead of exiting 1 over it. It fails only on a store that will not parse.');
    process.exitCode = 1;
    return;
  }

  const resolved = resolveCommand(name, rest);
  if (resolved === null) {
    console.error(`unknown command: ${name}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }
  const { command } = resolved;
  const arities = new Map([...flagArities(GLOBAL_USAGE), ...flagArities(command.usage)]);
  const { parsed, errors } = parseArgs(resolved.args, arities, positionalArity(command.usage));
  if (errors.length > 0) {
    for (const message of errors) console.error(`error: ${message}`);
    console.error(command.usage);
    process.exitCode = 1;
    return;
  }
  if (parsed.flags.help === 'true') {
    console.log(command.usage);
    console.log(GLOBAL_USAGE);
    return;
  }

  return reportStoreErrors(() => {
    const result = command.run(parsed, command.usage);
    if (result instanceof Promise) return result.catch((error) => reportStoreErrors(() => { throw error; })).finally(flushSkippedStoreLines);
    flushSkippedStoreLines();
    return result;
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.argv.slice(2));
}
