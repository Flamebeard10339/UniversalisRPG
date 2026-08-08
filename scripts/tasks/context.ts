import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { appendEvents, eventsPathFor, type EventOp, type TaskEvent } from '../lib/eventLog';
import * as git from '../lib/git';
import { duplicateClauseIds, parseSpecDoc } from '../lib/specDoc';
import { loadManifest, ManifestError, owningSystem, systemNames as manifestSystemNames, type Manifest } from '../lib/systems';
import { CLOSING_STATES, DEFAULT_STORE_PATH, loadStoreTolerantly, parseStore, saveStore, type CheckIssue, type Task } from '../lib/taskStore';

// `--actor` is not here: a global flag is accepted by every command, and a
// read command that accepted it would drop it, which is exactly the silent
// no-op c9 forbids. Every command that writes names it in its own usage.
export const GLOBAL_USAGE = 'global: [--store <path>] [--systems <path>] [--specs-dir <dir>] [--branch <name>] [--help]';

export const ACTOR_USAGE = '[--actor <name>]';

// Named once. A second spelling of this string somewhere else would be a
// second answer to "which branch is not working a spec".
export const DEFAULT_BRANCH = 'main';

export interface Config {
  storePath: string;
  eventsPath: string;
  systemsPath: string;
  specsDir: string;
  branch: string;
  actor: string | null;
}

export function resolveConfig(flags: Record<string, string>): Config {
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

export type EventSubject = Pick<TaskEvent, 'id' | 'system' | 'spec' | 'note'>;

// Called after the store is saved, never before: an event says what
// happened, so a write that failed must not leave one behind. `head` and the
// timestamp are resolved once per batch rather than once per record.
export function recordEvents(config: Config, op: EventOp, subjects: EventSubject[]): void {
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
export function subjectOf(task: Task, note: string): EventSubject {
  return { id: task.id, system: task.system, spec: task.spec, note };
}

export function systemNames(config: Config): string[] {
  return manifestSystemNames(loadManifest(config.systemsPath));
}

// The other half of the same manifest: which system owns a given path, for
// the callers comparing that against what a record says about itself. A
// manifest that will not parse costs this answer and nothing else — every
// caller is reporting, and none of them may fail a write over it.
export function pathOwner(config: Config): (path: string) => string | null {
  if (!existsSync(config.systemsPath)) return () => null;
  let manifest: Manifest;
  try {
    manifest = loadManifest(config.systemsPath);
  } catch (error) {
    if (!(error instanceof ManifestError)) throw error;
    return () => null;
  }
  return (path) => owningSystem(manifest, path);
}

export function specFile(config: Config, spec: string): string {
  return `${config.specsDir}/${spec}.md`;
}

export function usesDefaultStore(config: Config): boolean {
  return path.resolve(config.storePath) === path.resolve(DEFAULT_STORE_PATH);
}

export function dirtyStoreIssue(config: Config): CheckIssue | null {
  if (!usesDefaultStore(config)) return null;
  const dirty = git.dirtyPaths(config.storePath);
  if (dirty === null || dirty.length === 0) return null;
  return {
    level: 'warning',
    message: `${config.storePath} has uncommitted task-state changes; commit them before cleanup/reset, or another session may miss working-tree-only state`,
  };
}

// The warning exists for uncommitted state a session left behind, not for
// the write a session is making on purpose — fired on every write it was
// measured at six-for-six and eight-for-eight across two recorded sessions,
// which is how a real warning becomes invisible. So it fires only when the
// store's uncommitted state predates the writing session by a margin, and
// at most once per process. An actively-writing session keeps the mtime
// fresh and stays silent; `tasks doctor` still reports dirtiness
// unconditionally, which is where the pre-cleanup check belongs.
const STALE_DIRTY_MS = 30 * 60 * 1000;
let warnedStoreDirty = false;

function warnIfStoreDirtyAndStale(config: Config): void {
  if (warnedStoreDirty) return;
  if (dirtyStoreIssue(config) === null) return;
  let mtimeMs: number;
  try {
    mtimeMs = statSync(config.storePath).mtimeMs;
  } catch {
    return;
  }
  if (Date.now() - mtimeMs < STALE_DIRTY_MS) return;
  console.warn(`warning: ${config.storePath} has uncommitted task-state changes from an earlier session; commit them before cleanup/reset, or another session may miss working-tree-only state`);
  warnedStoreDirty = true;
}

export { CLOSING_STATES };

export function workingTreeOnlyIssues(config: Config, tasks: Task[]): CheckIssue[] {
  if (!usesDefaultStore(config)) return [];
  const committedText = git.fileAt('HEAD', config.storePath);
  if (committedText === null) return [];
  let committed: Task[];
  try {
    committed = parseStore(committedText, `${config.storePath}@HEAD`);
  } catch {
    return [];
  }

  const committedById = new Map(committed.map((task) => [task.id, task]));
  const issues: CheckIssue[] = [];
  for (const task of tasks) {
    const before = committedById.get(task.id);
    if (!before || before.state === task.state) continue;
    const closing = CLOSING_STATES.includes(task.state) && !CLOSING_STATES.includes(before.state);
    // A warning even for a closing state: between `tasks done` and the
    // commit that carries the store change this is the documented order of
    // work, and an error that fires on the correct workflow trains readers
    // to skip errors. The incident it guards — a worker's tree-cleanup
    // discarding recorded closes — is still named, just not cried wolf over.
    issues.push({
      level: 'warning',
      message: `${task.id} is ${task.state} only in the working tree (committed state: ${before.state})${closing ? ' — commit the store change, or a cleanup/reset discards this close silently' : ''}`,
    });
  }
  return issues;
}

// A read answers with the rest of the store rather than refusing over one
// line it could not parse, and says so afterwards rather than instead — the
// note has to follow the answer to be a footer, and every read has several
// return paths, so `run` flushes it once at the boundary.
const skippedStoreLines: string[] = [];

export function readStore(config: Config): Task[] {
  const { tasks, skipped } = loadStoreTolerantly(config.storePath);
  skippedStoreLines.push(...skipped);
  return tasks;
}

// The store is versioned with the code, so every query is scoped to whatever
// ref this working tree holds — and after a `git checkout main` a search for
// a branch's records answers `0 task(s)`, which is indistinguishable from
// "those records are gone". Said only when the answer is empty, because that
// is the only moment the two look alike.
export function reportStoreScope(config: Config, total: number): void {
  console.log(`nothing matched. This read is scoped to ${config.storePath} as ${config.branch} has it — ${total} record(s) in the whole file.`);
  console.log(`A record written on another branch is not in this one until that branch merges; \`git log --oneline -- ${config.storePath}\` is what this checkout can see.`);
}

export function flushSkippedStoreLines(): void {
  if (skippedStoreLines.length === 0) return;
  console.log('');
  console.log(`skipped ${skippedStoreLines.length} unparseable store line(s) — everything above is the rest of the store:`);
  for (const message of skippedStoreLines) console.log(`  ${message}`);
  console.log('write commands refuse until these parse, because saving would delete them; `tasks doctor` reports them and they are fixed by hand');
  skippedStoreLines.length = 0;
}

// A record leaving the store, and the reason it left. Both halves travel
// together because a caller able to declare one without the other is exactly
// the gap this pair exists to close: `saveStore` refuses an undeclared drop,
// and declaring it here is what writes the event, so there is no order of
// calls that removes a record and logs nothing.
export interface Removal {
  task: Task;
  reason: string;
}

// The staleness check reads the pre-write state, so it runs before the
// save: after it, the mtime is this write's own and the question is gone.
export function saveStoreAndWarn(tasks: Task[], config: Config, removals: Removal[] = []): void {
  warnIfStoreDirtyAndStale(config);
  saveStore(
    tasks,
    config.storePath,
    removals.map(({ task }) => task.id),
  );
  recordEvents(
    config,
    'remove',
    removals.map(({ task, reason }) => subjectOf(task, `removed from the store: ${reason}`)),
  );
}

// "the spec whose branch is checked out" — a branch not named after any spec
// file has no active spec, and `--spec` on a read command overrides this.
export function currentSpec(config: Config): string | null {
  return existsSync(specFile(config, config.branch)) ? config.branch : null;
}

export interface ActiveSpec {
  spec: string | null;
  // Null only when the caller named the spec outright. Every other route
  // here is an inference, and c8 permits an inferred default argument only
  // on the condition that the output says so and says what from.
  note: string | null;
}

// The candidates a caller can see once neither `--spec` nor the branch name
// answers: every spec with an open or in-progress member, for a branch that
// might be about to work one of them. Named whether there are zero, one or
// many — the shape route 5 always used for "many" is what every caller gets
// now, because a confident wrong answer is what this function used to give
// and a reader must learn the same thing whether one spec is live or none.
function openSpecCandidates(config: Config, tasks: Task[]): string[] {
  const candidates = new Set<string>();
  for (const task of tasks) {
    if ((task.state !== 'open' && task.state !== 'in-progress') || task.spec === null) continue;
    if (existsSync(specFile(config, task.spec))) candidates.add(task.spec);
  }
  return [...candidates].sort();
}

function unresolvedSpecNote(config: Config, tasks: Task[]): string {
  const branchFile = specFile(config, config.branch);
  const candidates = openSpecCandidates(config, tasks);
  if (candidates.length === 0) return `no active spec: no ${branchFile}, and no spec has open members. Pass --spec to name one`;
  if (candidates.length === 1) return `spec not given: no ${branchFile}, and 1 spec has open members — ${candidates[0]}. Pass --spec to use it`;
  return `spec contested: no ${branchFile}, and ${candidates.length} specs have open members — ${candidates.join(', ')}. Pass --spec to pick one`;
}

export function resolveActiveSpec(config: Config, tasks: Task[], explicit: string | undefined): ActiveSpec {
  if (explicit !== undefined) return { spec: explicit, note: null };
  const strict = currentSpec(config);
  if (strict !== null) return { spec: strict, note: `spec inferred from the branch name: ${strict} — ${specFile(config, strict)} exists` };

  // The default branch is never working a spec, so anything guessed here
  // would be a guess about a branch the caller is not on — and the guess
  // lands on whichever spec is slowest to retire, which is exactly the one
  // whose clauses describe deleted machinery. `--spec` still works here,
  // because that is asked for rather than guessed.
  if (config.branch === DEFAULT_BRANCH) return { spec: null, note: null };

  // Every route past this point used to guess — the event log's most recent
  // write, then the store's lone open-member spec — and each guess is the
  // shape of a recorded incident: a stray `note` event inheriting a spec tag,
  // and a legitimate audit charged to an archived record. Naming the
  // candidates and refusing to pick among them is the whole remedy; nothing
  // here determines an answer on its own.
  return { spec: null, note: unresolvedSpecNote(config, tasks) };
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function uniqueId(base: string, taken: Set<string>): string {
  if (base !== '' && !taken.has(base)) return base;
  const stem = base === '' ? 'task' : base;
  let n = 2;
  while (taken.has(`${stem}-${n}`)) n++;
  return `${stem}-${n}`;
}

export const today = (): string => new Date().toISOString().slice(0, 10);

export function splitList(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : [];
}

export function knownSpecs(config: Config): string[] {
  if (!existsSync(config.specsDir)) return [];
  return readdirSync(config.specsDir)
    .filter((entry) => {
      try {
        return entry.endsWith('.md') && statSync(`${config.specsDir}/${entry}`).isFile();
      } catch {
        return false;
      }
    })
    .map((entry) => entry.replace(/\.md$/, ''));
}

// The same read/write split reportUnknownIds and refuseUnknownIds make for
// task ids, applied to spec slugs — c1 against c2. "No such spec, here are
// the ones that exist" is an answer to what a read asked; a write has
// nothing to write to, so the identical text is an error.
export function reportUnknownSpec(config: Config, slug: string, emit: (line: string) => void): void {
  const specs = knownSpecs(config);
  emit(`no such spec: ${slug}`);
  emit(specs.length === 0 ? `  no spec files in ${config.specsDir}` : `  specs in ${config.specsDir}: ${specs.join(', ')}`);
}

export function refuseUnknownSpec(config: Config, slug: string): void {
  reportUnknownSpec(config, slug, (line) => console.error(line.startsWith(' ') ? line : `error: ${line}`));
  process.exitCode = 1;
}

// A spec file that will not read or parse is reported as that, not thrown
// as a raw ENOENT from inside a scan over files the scan itself listed.
export function specIssues(config: Config): CheckIssue[] {
  return knownSpecs(config).flatMap((spec): CheckIssue[] => {
    let text: string;
    try {
      text = readFileSync(specFile(config, spec), 'utf8');
    } catch (error) {
      return [{ level: 'warning' as const, message: `${spec}: could not read ${specFile(config, spec)}: ${error instanceof Error ? error.message : String(error)}` }];
    }
    return duplicateClauseIds(parseSpecDoc(text).proofClauses).map((id) => ({
      level: 'error' as const,
      message: `${spec} tags more than one proof clause [c${id}] — a clause id names exactly one clause`,
    }));
  });
}

// `--commit` is a revspec at the CLI boundary, and a revspec is not a fact —
// `HEAD~2` names a different commit after every later commit. Resolve to the
// full 40-char SHA it means right now, so what lands in the store is a fact
// forever after. Unresolvable is refused because there is no sha to write;
// unreachable is recorded, because which commits this checkout can see is
// not a fact about the record.
export function resolveCommit(value: string): string {
  const sha = git.resolveCommit(value);
  if (sha === null) throw new Error(`--commit does not resolve to a commit: ${value}`);
  if (!git.isAncestor(sha, 'HEAD')) console.warn(`warning: --commit is not reachable from HEAD: ${value} — recorded, and \`tasks doctor\` reports it until it is`);
  return sha;
}

export function closedCommitIssues(tasks: Task[]): CheckIssue[] {
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
export function validateContentFields(config: Config, flags: Record<string, string>): string | null {
  if (flags.severity !== undefined && !['high', 'medium', 'low'].includes(flags.severity)) {
    return 'error: --severity must be high, medium or low';
  }
  if (flags.system !== undefined && !systemNames(config).includes(flags.system)) {
    return `error: --system not in systems.json: ${flags.system}`;
  }
  return null;
}
