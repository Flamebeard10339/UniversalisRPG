import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { harvestFiles, parseAuditDoc, systemForDoc } from './lib/auditImport';
import { checkCommitMessage, extractNextTrailer, isExempt } from './lib/commitContract';
import * as git from './lib/git';
import { checkMergeGate } from './lib/mergeGate';
import { appendAmendment, appendAuditPass, appendBaseline, duplicateClauseIds, parseSpecDoc, stampClauseIds, type AuditVerdict, type ProofClause, type Verdict } from './lib/specDoc';
import { loadManifest, systemNames as manifestSystemNames } from './lib/systems';
import {
  checkStore,
  DEFAULT_STORE_PATH,
  StoreError,
  type CheckIssue,
  fixNowQueue,
  isBlocked,
  listQueue,
  loadStore,
  parseStore,
  saveStore,
  unreviewedQueue,
  type Kind,
  type Severity,
  type State,
  type Task,
} from './lib/taskStore';

interface Flags {
  positional: string[];
  flags: Record<string, string>;
}

function parseArgs(args: string[]): Flags {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

interface Config {
  storePath: string;
  systemsPath: string;
  specsDir: string;
  branch: string;
}

function resolveConfig(flags: Record<string, string>): Config {
  return {
    storePath: flags.store ?? DEFAULT_STORE_PATH,
    systemsPath: flags.systems ?? 'docs/audits/systems.json',
    specsDir: flags['specs-dir'] ?? 'docs/specs',
    branch: flags.branch ?? execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim(),
  };
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

// c2's own comparison: `closedCommit` lives inside docs/tasks.jsonl, so a
// `git checkout -- docs/tasks.jsonl` takes a `done` mark and its
// `closedCommit` away together — a field in the reverted file cannot detect
// the file being reverted. Only diffing the working tree against the last
// *committed* version of the store can see what a discard would lose, so
// that is what this does, independently of closedCommit.
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

function saveStoreAndWarn(tasks: Task[], config: Config): void {
  saveStore(tasks, config.storePath);
  warnIfStoreDirty(config);
}

// "the spec whose branch is checked out" — a branch not named after any spec
// file has no active spec, and `--spec` on a read command overrides this.
// Used by resolveActiveSpec below for read commands, and — only as a last
// resort, after specCandidatesFromDiff finds nothing — by `check --merge`
// itself; see mergeGateSpecCandidates.
function currentSpec(config: Config): string | null {
  return existsSync(specFile(config, config.branch)) ? config.branch : null;
}

// c4's diff-based binding: the spec file(s) this branch's own diff adds or
// modifies, between the merge-base and HEAD — content-derived, so a branch
// rename cannot change the answer. Reuses diffChangedFiles's already-quiet
// git plumbing; a merge-base git itself cannot resolve reads the same as a
// diff that touches nothing.
function specCandidatesFromDiff(config: Config, baseBranch: string): string[] {
  const mergeBase = git.mergeBase(baseBranch);
  if (mergeBase === null) return [];
  const prefix = `${gitPathspec(config.specsDir)}/`;
  const slugs = new Set<string>();
  for (const file of diffChangedFiles(`${mergeBase}..HEAD`)) {
    if (file.startsWith(prefix) && file.endsWith('.md')) slugs.add(file.slice(prefix.length, -'.md'.length));
  }
  return [...slugs].sort();
}

// The merge gate's spec resolution, in priority order: an explicit --spec
// always wins; otherwise the diff decides. The name-based fallback below
// only fires when the diff touches zero spec files — it never overrides a
// diff verdict, so it cannot reintroduce the rename regression c4 exists to
// fix (a branch with open members has, by the time those members matter,
// touched its spec file at least once — to open it, amend it, or record an
// audit pass — so the diff finds it). It exists for the narrower case of a
// branch whose name already matches its spec but hasn't touched the file
// yet, which is common early in a spec's life and was the only resolution
// path before this fix.
function mergeGateSpecCandidates(config: Config, baseBranch: string, explicit: string | undefined): string[] {
  if (explicit !== undefined) return [explicit];
  const diffCandidates = specCandidatesFromDiff(config, baseBranch);
  if (diffCandidates.length > 0) return diffCandidates;
  const nameMatch = currentSpec(config);
  return nameMatch === null ? [] : [nameMatch];
}

interface ActiveSpec {
  spec: string | null;
  // Non-null exactly when `spec` was guessed rather than resolved from the
  // branch name — the caller must say so.
  note: string | null;
}

// The resume half of the branch-name lookup: when the branch matches no
// spec file — as happened on this branch for five commits while the spec
// lived at a name the branch had since moved past — and exactly one spec
// file has open members in the store, treat that as the active spec rather
// than stranding a cold session with no queue and no signal anything is
// wrong. Two or more candidates is exactly as ambiguous as zero, so both
// fall back to today's "no active spec" behaviour.
function resolveActiveSpec(config: Config, tasks: Task[], explicit: string | undefined): ActiveSpec {
  if (explicit !== undefined) return { spec: explicit, note: null };
  const strict = currentSpec(config);
  if (strict !== null) return { spec: strict, note: null };

  const candidates = new Set<string>();
  for (const task of tasks) {
    if ((task.state !== 'open' && task.state !== 'in-progress') || task.spec === null) continue;
    if (existsSync(specFile(config, task.spec))) candidates.add(task.spec);
  }
  if (candidates.size !== 1) return { spec: null, note: null };
  const [spec] = candidates;
  return { spec, note: `spec inferred: ${spec} — no docs/specs/${config.branch}.md, and ${spec} is the only spec with open members in the store` };
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

function printTask(task: Task, tasks: Task[]): void {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blocked = isBlocked(task, byId);
  const tag = [task.kind, task.state, task.severity].filter(Boolean).join('/');
  console.log(`${task.id}  [${tag}]${blocked ? '  BLOCKED' : ''}`);
  console.log(task.title);
  if (task.system) console.log(`system: ${task.system}`);
  console.log(`spec: ${task.spec ?? '(deferred)'}`);
  if (task.requires.length > 0) console.log(`requires: ${task.requires.join(', ')}`);
  if (task.files.length > 0) console.log(`files: ${task.files.join(', ')}`);
  if (task.deliverable) console.log(`\ndeliverable: ${task.deliverable}`);
  if (task.evidence) console.log(`evidence: ${task.evidence}`);
  if (task.source) console.log(`source: ${task.source.spec} pass ${task.source.pass}`);
  if (task.reason) console.log(`reason: ${task.reason}`);
  if (task.closed) console.log(`closed: ${task.closed}`);
  if (task.closedCommit) console.log(`closedCommit: ${task.closedCommit}`);
}

function preview(text: string): string {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? '';
}

function printTaskConcise(task: Task, tasks: Task[]): void {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blocked = isBlocked(task, byId);
  const tag = [task.kind, task.state, task.severity].filter(Boolean).join('/');
  console.log(`${task.id}  [${tag}]${blocked ? '  BLOCKED' : ''}`);
  console.log(task.title);
  if (task.system) console.log(`system: ${task.system}`);
  console.log(`spec: ${task.spec ?? '(deferred)'}`);
  if (task.requires.length > 0) console.log(`requires: ${task.requires.join(', ')}`);
  if (task.files.length > 0) console.log(`files: ${task.files.join(', ')}`);
  if (task.deliverable) console.log(`deliverable: ${preview(task.deliverable)}`);
  if (task.evidence) console.log(`evidence: ${preview(task.evidence)}`);
}

// null means "nothing to compare against" — merge-base lookup failed, or
// the spec file did not exist there (opened on this branch, so nothing has
// drifted).
function deliverableAtMergeBase(config: Config, spec: string, baseBranch: string): string | null {
  const mergeBase = git.mergeBase(baseBranch);
  if (mergeBase === null) return null;
  try {
    const content = execFileSync('git', ['show', `${mergeBase}:${specFile(config, spec)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return parseSpecDoc(content).deliverableSection;
  } catch {
    return null;
  }
}

// Here rather than only in the merge gate because this runs on every push,
// while the gate sees one branch's spec on a pull request.
function specIssues(config: Config, tasks: Task[]): CheckIssue[] {
  if (!existsSync(config.specsDir)) return [];
  const specsWithMembers = new Set(tasks.filter((task) => task.spec !== null).map((task) => task.spec as string));
  return readdirSync(config.specsDir)
    .filter((entry) => entry.endsWith('.md'))
    .filter((entry) => statSync(`${config.specsDir}/${entry}`).isFile())
    .flatMap((entry) => {
      const spec = entry.replace(/\.md$/, '');
      const doc = parseSpecDoc(readFileSync(`${config.specsDir}/${entry}`, 'utf8'));
      const issues: CheckIssue[] = duplicateClauseIds(doc.proofClauses).map((id) => ({
        level: 'error' as const,
        message: `${spec} tags more than one proof clause [c${id}] — a clause id names exactly one clause`,
      }));
      if (doc.baseline === null && specsWithMembers.has(spec)) {
        issues.push({ level: 'warning', message: `${spec} has member task(s) but no recorded baseline; run \`tasks spec freeze ${spec}\`` });
      }
      return issues;
    });
}

function cmdCheck(flags: Record<string, string>): void {
  const config = resolveConfig(flags);
  let tasks: Task[];
  const loadIssues: CheckIssue[] = [];
  try {
    tasks = loadStore(config.storePath);
  } catch (error) {
    tasks = [];
    loadIssues.push({ level: 'error', message: error instanceof Error ? error.message : String(error) });
  }
  const dirtyIssue = dirtyStoreIssue(config);
  const issues = [
    ...loadIssues,
    ...checkStore(tasks, systemNames(config), (spec) => existsSync(specFile(config, spec))),
    ...closedCommitIssues(tasks),
    ...workingTreeOnlyIssues(config, tasks),
    ...specIssues(config, tasks),
    ...(dirtyIssue ? [dirtyIssue] : []),
  ];
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  for (const warning of warnings) console.warn(`warning: ${warning.message}`);
  for (const error of errors) console.error(`error: ${error.message}`);
  console.log(`${tasks.length} task(s), ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length > 0) process.exitCode = 1;

  if (flags.merge !== 'true') return;

  const baseBranch = flags['base-branch'] ?? 'main';

  const specCandidates = mergeGateSpecCandidates(config, baseBranch, flags.spec);
  const resolvedSpec = specCandidates.length === 1 ? specCandidates[0] : null;
  const specPath = resolvedSpec !== null ? specFile(config, resolvedSpec) : null;
  const specExists = specPath !== null && existsSync(specPath);
  const doc = specExists ? parseSpecDoc(readFileSync(specPath!, 'utf8')) : null;

  // An amendment's archived text wins when one exists — it is the freeze's
  // only sanctioned edit path. Merge-base is the fallback for a spec that
  // has never been amended, and is a known no-op for the common case: rule
  // 1 opens one spec per branch on that branch, so it never existed at the
  // merge-base either.
  const latestAmendment = doc ? doc.amendments[doc.amendments.length - 1] : undefined;
  const deliverableBaseline = latestAmendment ? latestAmendment.deliverableText : (doc?.baseline ?? (resolvedSpec === null ? null : deliverableAtMergeBase(config, resolvedSpec, baseBranch)));

  // checkMergeGate is the only place that decides whether there is
  // anything to refuse: zero candidates passes vacuously (see its own
  // comment), so a branch whose diff touches no spec never reddens over a
  // promise it never made, no matter what other specs in the store still
  // have open members; more than one candidate is reported as an issue,
  // not resolved by guessing.
  const mergeIssues = checkMergeGate({
    specCandidates,
    specExists,
    doc,
    deliverableBaseline,
    members: resolvedSpec === null ? [] : tasks.filter((task) => task.spec === resolvedSpec),
  });

  if (specCandidates.length === 0) {
    console.log('merge gate: not applicable — no active spec for this branch, and no --spec given');
    return;
  }

  for (const issue of mergeIssues) console.error(`merge gate: ${issue}`);
  console.log(`merge gate: ${mergeIssues.length} issue(s)`);
  if (mergeIssues.length > 0) process.exitCode = 1;
}

// `--commit` is a revspec at the CLI boundary, and a revspec is not a fact —
// `HEAD~2` names a different commit after every later commit. Resolve to the
// full 40-char SHA it means right now, so what lands in the store is a fact
// forever after, and refuse anything that does not name a real, reachable
// commit rather than store it unchecked.
function resolveCommit(value: string): string {
  const resolved = spawnSync('git', ['rev-parse', '--verify', `${value}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (resolved.status !== 0) throw new Error(`--commit does not resolve to a commit: ${value}`);
  const sha = resolved.stdout.trim();
  if (!git.isAncestor(sha, 'HEAD')) throw new Error(`--commit is not reachable from HEAD: ${value}`);
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

// Shared by add and edit: the two places content fields (severity, system,
// requires) are accepted from a human by hand rather than produced by a
// state-transition verb or the auditor.
function validateContentFields(config: Config, tasks: Task[], flags: Record<string, string>): string | null {
  if (flags.severity !== undefined && !['high', 'medium', 'low'].includes(flags.severity)) {
    return 'error: --severity must be high, medium or low';
  }
  if (flags.system !== undefined && !systemNames(config).includes(flags.system)) {
    return `error: --system not in systems.json: ${flags.system}`;
  }
  const requires = splitList(flags.requires);
  if (requires.length > 0) {
    const known = new Set(tasks.map((task) => task.id));
    const missing = requires.filter((id) => !known.has(id));
    if (missing.length > 0) return `error: --requires references unknown id(s): ${missing.join(', ')}`;
  }
  return null;
}

const ADD_USAGE =
  'usage: tasks add "<title>" [--kind task|finding] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--files a.ts:12,b.ts] [--requires id1,id2] [--deliverable "..." (required for --kind finding)] [--evidence "..."] [--id <id>]';

function cmdAdd(args: Flags): void {
  const config = resolveConfig(args.flags);
  const title = args.positional[0];
  if (!title) {
    console.error(ADD_USAGE);
    process.exitCode = 1;
    return;
  }

  const kind = (args.flags.kind as Kind | undefined) ?? 'task';
  if (kind !== 'task' && kind !== 'finding') {
    console.error(`error: --kind must be task or finding (undelivered tasks are only created by \`audit\`)`);
    process.exitCode = 1;
    return;
  }
  if (kind === 'finding' && !args.flags.deliverable) {
    console.error('error: --deliverable is required for --kind finding — a finding must say what fixing it would mean');
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
  const validationError = validateContentFields(config, tasks, args.flags);
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
    files: splitList(args.flags.files),
    deliverable: args.flags.deliverable ?? null,
    evidence: args.flags.evidence ?? null,
    source: null,
    reason: null,
    closed: null,
    closedCommit: null,
    extra: null,
  };
  tasks.push(task);
  saveStoreAndWarn(tasks, config);
  console.log(`added ${id} [${task.kind}/${task.state}]`);
}

const EDIT_USAGE =
  'usage: tasks edit <id> ["<new title>"] [--title "..."] [--deliverable "..."] [--evidence "..."] [--severity high|medium|low] [--system "<name>"] [--files a.ts:12,b.ts] [--requires id1,id2]';

// Content only: id, kind, state, spec, reason, closed and source are state
// transitions owned by the other verbs, so this never touches them.
function cmdEdit(args: Flags): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(EDIT_USAGE);
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    console.error(`error: no such task: ${id}`);
    process.exitCode = 1;
    return;
  }

  const validationError = validateContentFields(config, tasks, args.flags);
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

  if (changes.length === 0) {
    console.log(`${id}: nothing to change`);
    return;
  }

  saveStoreAndWarn(tasks, config);
  console.log(`edited ${id}: ${changes.join(', ')}`);
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
// the commit that flipped the record. Only ever called from `show`: a
// history walk per task is too slow to run from `check`, which runs on
// every push.
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

function cmdShow(args: Flags): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error('usage: tasks show <id>');
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    console.error(`error: no such task: ${id}`);
    process.exitCode = 1;
    return;
  }
  printTask(task, tasks);
  if (task.state === 'done' && task.closedCommit === null) {
    const derived = deriveClosingCommit(config, id);
    console.log(derived ? `closedCommit (derived): ${derived}` : 'closedCommit: (none recorded, and none could be derived from git history)');
  }
}

const LIST_STATES: State[] = ['unreviewed', 'open', 'in-progress', 'done', 'declined'];
const LIST_KINDS: Kind[] = ['task', 'finding', 'undelivered'];

// The only verb that can read the whole store rather than one spec's
// fix-now queue — `next` refuses outside an active spec, and `spec: null`
// findings otherwise have no command that surfaces them.
function cmdSearch(args: Flags): void {
  const term = args.positional[0];
  if (!term) {
    console.error('usage: tasks search <term> [--state ...] [--severity ...] [--system ...] [--spec ...] [--deferred] [--kind ...]');
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
  if (kind !== undefined && !LIST_KINDS.includes(kind)) {
    console.error(`error: --kind must be one of ${LIST_KINDS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
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

  for (const task of queue) {
    const tag = [task.kind, task.state, task.severity].filter(Boolean).join('/');
    const matches = text === undefined ? '' : `  (matches: ${matchingFields(task, text).join(', ')})`;
    console.log(`${task.id}  [${tag}]  ${task.system ?? '(no system)'}  ${task.title}${matches}`);
  }

  const counts: Record<State, number> = { unreviewed: 0, open: 0, 'in-progress': 0, done: 0, declined: 0 };
  for (const task of queue) counts[task.state]++;
  console.log(`${queue.length} task(s) — unreviewed: ${counts.unreviewed}, open: ${counts.open}, in-progress: ${counts['in-progress']}, done: ${counts.done}, declined: ${counts.declined}`);
}

function cmdNext(args: Flags): void {
  const config = resolveConfig(args.flags);
  const tasks = loadStore(config.storePath);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  const spec = activeSpec.spec;
  // A resolved spec of null means "no active spec", not "match deferred
  // tasks" — those two must not collapse into the same query.
  if (spec === null) {
    console.log('no active spec for this branch, and no --spec given');
    return;
  }
  if (activeSpec.note) console.log(activeSpec.note);
  const queue = fixNowQueue(tasks, spec, {
    system: args.flags.system,
    severity: args.flags.severity as Severity | undefined,
  });
  if (queue.length === 0) {
    console.log(`no open, unblocked tasks in spec ${spec}`);
    return;
  }
  if (args.flags.full === 'true') printTask(queue[0], tasks);
  else printTaskConcise(queue[0], tasks);
}

function cmdStart(args: Flags): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error('usage: tasks start <id>');
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    console.error(`error: no such task: ${id}`);
    process.exitCode = 1;
    return;
  }
  if (task.state !== 'open') {
    console.error(`error: ${id} is ${task.state}, not open`);
    process.exitCode = 1;
    return;
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  if (isBlocked(task, byId)) {
    const blockers = task.requires.filter((requirement) => byId.get(requirement)?.state !== 'done');
    console.error(`error: ${id} is blocked by: ${blockers.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  task.state = 'in-progress';
  saveStoreAndWarn(tasks, config);
  console.log(`started ${id}`);
}

function cmdStop(args: Flags): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error('usage: tasks stop <id>');
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    console.error(`error: no such task: ${id}`);
    process.exitCode = 1;
    return;
  }
  if (task.state !== 'in-progress') {
    console.error(`error: ${id} is ${task.state}, not in-progress`);
    process.exitCode = 1;
    return;
  }
  task.state = 'open';
  saveStoreAndWarn(tasks, config);
  console.log(`stopped ${id}`);
}

// Rule 7 requires an unmet deliverable to be able to reach `done` — a
// blanket refusal on kind:undelivered would make the merge gate
// permanently unclosable — so this earns the close rather than blocking
// it: refuse unless the spec's LATEST recorded audit pass grades this
// task's clause `met`.
function undeliveredDoneRefusal(config: Config, task: Task): string | null {
  if (!task.spec) return 'is undelivered but has no spec to verify a pass against';
  if (task.clause === null) return 'is undelivered but names no proof clause';
  const path_ = specFile(config, task.spec);
  if (!existsSync(path_)) return `is undelivered but its spec file is missing: ${path_}`;
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  if (!doc.proofClauses.some((candidate) => candidate.id === task.clause)) return `is undelivered but proof clause ${task.clause} is no longer in ${path_}`;
  const latest = doc.auditPasses[doc.auditPasses.length - 1];
  if (!latest) return `is undelivered and ${task.spec} has no recorded audit pass`;
  const verdict = latest.verdicts.find((v) => v.clause === task.clause);
  if (!verdict || verdict.status !== 'met') return `is undelivered and proof clause ${task.clause} is not met in the latest audit pass (pass ${latest.pass})`;
  return null;
}

function cmdDone(args: Flags): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error('usage: tasks done <id> [--commit <revspec>]  (default: none — the closing commit does not exist yet when `done` runs; see `tasks show` for a derived one)');
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    console.error(`error: no such task: ${id}`);
    process.exitCode = 1;
    return;
  }
  if (task.state !== 'open' && task.state !== 'in-progress') {
    console.error(`error: ${id} is ${task.state}, not open or in-progress`);
    process.exitCode = 1;
    return;
  }
  if (task.kind === 'undelivered') {
    const refusal = undeliveredDoneRefusal(config, task);
    if (refusal) {
      console.error(`error: ${id} ${refusal}`);
      process.exitCode = 1;
      return;
    }
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  if (isBlocked(task, byId)) {
    const blockers = task.requires.filter((requirement) => byId.get(requirement)?.state !== 'done');
    console.error(`error: ${id} is blocked by: ${blockers.join(', ')}`);
    process.exitCode = 1;
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
  task.state = 'done';
  task.closed = today();
  task.closedCommit = closedCommit;
  saveStoreAndWarn(tasks, config);
  console.log(`done ${id}`);
}

function cmdDecline(args: Flags): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  const reason = args.flags.reason;
  if (!id || !reason) {
    console.error('usage: tasks decline <id> --reason "..."');
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const task = tasks.find((candidate) => candidate.id === id);
  if (!task) {
    console.error(`error: no such task: ${id}`);
    process.exitCode = 1;
    return;
  }
  if (task.kind === 'undelivered') {
    console.error(`error: ${id} is undelivered and cannot be declined`);
    process.exitCode = 1;
    return;
  }
  if (task.state !== 'unreviewed' && task.state !== 'open') {
    console.error(`error: ${id} is ${task.state}, cannot decline`);
    process.exitCode = 1;
    return;
  }
  task.state = 'declined';
  task.reason = reason;
  task.closed = today();
  task.closedCommit = null;
  saveStoreAndWarn(tasks, config);
  console.log(`declined ${id}`);
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

function cmdSpecNew(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error('usage: tasks spec new <slug>');
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

function cmdSpecAdd(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  const ids = args.positional.slice(1);
  if (!slug || ids.length === 0) {
    console.error('usage: tasks spec add <slug> <id>...');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    console.error(`error: no such task(s): ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  // Rule 6: pass 2+ findings may defer or decline, never promote. `spec add`
  // is the other door into a spec besides triage's [1], so it has to refuse
  // the same thing. Refuse the whole invocation rather than skip the
  // offending ids — this verb is non-interactive and takes a list, so
  // partial application would be worse than a refusal naming the problem.
  const unpromotable = ids.filter((id) => {
    const source = byId.get(id)!.source;
    return source !== null && source.pass >= 2;
  });
  if (unpromotable.length > 0) {
    console.error(`error: pass 2+ findings cannot be promoted — defer or decline: ${unpromotable.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  for (const id of ids) byId.get(id)!.spec = slug;
  saveStoreAndWarn(tasks, config);
  console.log(`added ${ids.length} task(s) to ${slug}`);
}

function cmdSpecShow(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error('usage: tasks spec show <slug>');
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  console.log(doc.deliverableSection);
  console.log('');
  console.log(`${doc.auditPasses.length} audit pass(es) recorded`);
  for (const pass of doc.auditPasses) {
    const met = pass.verdicts.filter((verdict) => verdict.status === 'met').length;
    console.log(`  pass ${pass.pass} (${pass.date}): ${met}/${pass.verdicts.length} clauses met`);
  }
  console.log('');

  const members = specMembers(loadStore(config.storePath).filter((task) => task.spec === slug), args.flags.order === 'true');
  console.log(`${members.length} member(s):`);
  for (const member of members) {
    console.log(`  ${member.id}  [${member.kind}/${member.state}${member.severity ? '/' + member.severity : ''}]  ${member.title}`);
  }
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

// Rule 7: an undelivered task is the branch's outstanding promise and
// cannot leave its spec by hand — `spec done --defer-open` skips it during
// a sweep, `spec remove` refuses on it outright.
const isUndelivered = (task: Task): boolean => task.kind === 'undelivered';

function cmdSpecDone(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error('usage: tasks spec done <slug> [--defer-open]');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const members = tasks.filter((task) => task.spec === slug);
  const stragglers = members.filter((task) => task.state !== 'done' && task.state !== 'declined');

  if (stragglers.length > 0 && args.flags['defer-open'] === 'true') {
    for (const straggler of stragglers) {
      if (isUndelivered(straggler)) continue;
      straggler.spec = null;
    }
    saveStoreAndWarn(tasks, config);
  }

  const stillOpen = loadStore(config.storePath).filter((task) => task.spec === slug && task.state !== 'done' && task.state !== 'declined');
  if (stillOpen.length > 0) {
    console.error(`error: ${slug} is not done — neither done nor declined: ${stillOpen.map((task) => task.id).join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${slug} is done: every member is done or declined`);
}

// The demotion counterpart to `spec add`: nothing else sets `spec` back to
// null for named ids. `spec done --defer-open` sweeps every open member at
// once; this targets specific ones without waiting for the spec to close.
function cmdSpecRemove(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  const ids = args.positional.slice(1);
  if (!slug || ids.length === 0) {
    console.error('usage: tasks spec remove <slug> <id>...');
    process.exitCode = 1;
    return;
  }
  if (!existsSync(specFile(config, slug))) {
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    console.error(`error: no such task(s): ${missing.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const notMembers = ids.filter((id) => byId.get(id)!.spec !== slug);
  if (notMembers.length > 0) {
    console.error(`error: not member(s) of ${slug}: ${notMembers.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const undelivered = ids.filter((id) => isUndelivered(byId.get(id)!));
  if (undelivered.length > 0) {
    console.error(`error: undelivered task(s) cannot be removed from a spec: ${undelivered.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  for (const id of ids) byId.get(id)!.spec = null;
  saveStoreAndWarn(tasks, config);
  console.log(`removed ${ids.length} task(s) from ${slug}`);
}

// The only sanctioned way to change a frozen ## Deliverable mid-branch:
// archive the current text under ## Amendments, dated and reasoned, then
// leave the live section for a human to edit. checkMergeGate compares
// against the latest archived copy from here on, so drift is still caught
// — it is just no longer required to close the spec and open another.
function cmdSpecAmend(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  const reason = args.flags.reason;
  if (!slug || !reason) {
    console.error('usage: tasks spec amend <slug> --reason "..."');
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }
  const text = readFileSync(path_, 'utf8');
  const doc = parseSpecDoc(text);
  // An amendment records the text a spec adopted, so the edit comes first.
  // Recording an unchanged deliverable would leave the next edit failing the
  // gate against a baseline nobody meant to set.
  const previous = doc.amendments[doc.amendments.length - 1];
  // Gaining clause tags is not a change worth adopting.
  const unchanged = (before: string): boolean => doc.deliverableSection.trim() === before.trim() || doc.deliverableSection.trim() === stampClauseIds(before).trim();
  if (previous && unchanged(previous.deliverableText)) {
    console.error(`error: ${slug}'s ## Deliverable is unchanged since the amendment of ${previous.date} — edit it first, then record what it became`);
    process.exitCode = 1;
    return;
  }
  const date = today();
  writeFileSync(path_, appendAmendment(text, { date, reason, deliverableText: doc.deliverableSection }), 'utf8');
  console.log(`amended ${slug}: recorded the current ## Deliverable as adopted (${date} — ${reason})`);
  console.log(`next: run \`tasks audit ${slug}\` to verify the new clauses`);
}

function cmdSpecFreeze(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error('usage: tasks spec freeze <slug>');
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }
  const text = readFileSync(path_, 'utf8');
  const doc = parseSpecDoc(text);
  if (doc.baseline !== null) {
    console.error(`error: ${slug} already has a frozen baseline`);
    process.exitCode = 1;
    return;
  }
  if (doc.deliverableSection.trim() === '') {
    console.error(`error: ${slug}'s ## Deliverable is empty`);
    process.exitCode = 1;
    return;
  }
  writeFileSync(path_, appendBaseline(text, doc.deliverableSection), 'utf8');
  console.log(`froze ${slug}'s current ## Deliverable as its opening baseline`);
}

function cmdSpec(args: Flags): void {
  const [sub, ...rest] = args.positional;
  const subArgs: Flags = { positional: rest, flags: args.flags };
  if (sub && !['new', 'add', 'remove', 'show', 'done', 'amend', 'freeze'].includes(sub)) return cmdSpecShow({ positional: [sub, ...rest], flags: args.flags });
  switch (sub) {
    case 'new':
      return cmdSpecNew(subArgs);
    case 'add':
      return cmdSpecAdd(subArgs);
    case 'remove':
      return cmdSpecRemove(subArgs);
    case 'show':
      return cmdSpecShow(subArgs);
    case 'done':
      return cmdSpecDone(subArgs);
    case 'amend':
      return cmdSpecAmend(subArgs);
    case 'freeze':
      return cmdSpecFreeze(subArgs);
    default:
      console.error(`usage: tasks spec <new|add|remove|show|done|amend|freeze> ...`);
      process.exitCode = 1;
  }
}

// The migration path only, for the 22 legacy documents under docs/audits/.
// Findings under `## H1` / `## M2` / `## L3` become unreviewed tasks; every
// other heading shape in those docs (Tier N, HIGH/MEDIUM/LOW, Findings) is a
// superseded or reconciliation format and is silently left unimported.
function cmdImport(args: Flags): void {
  const config = resolveConfig(args.flags);
  const docPath = args.positional[0];
  if (!docPath) {
    console.error('usage: tasks import <audit-doc>');
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
      files: [`${docPath}#${finding.code}`, ...harvestFiles(finding.body, existsSync)],
      deliverable: null,
      evidence: finding.body,
      source: null,
      reason: null,
      closed: null,
      closedCommit: null,
      extra: null,
    };
    tasks.push(task);
    taken.add(id);
    imported++;
  }
  saveStoreAndWarn(tasks, config);

  const skippedNote = skipped > 0 ? ` (${skipped} already present, skipped)` : '';
  const systemNote = system === null && findings.length > 0 ? ' — no system mapping for this doc name, system left null' : '';
  console.log(`imported ${imported} finding(s) from ${docPath}${skippedNote}${systemNote}`);
}

// A prompt without a resolvable diff range cannot do its job — the two
// git calls are kept apart so a base-branch typo and a detached-HEAD
// failure are reported as what each actually is, and neither is allowed
// to fall back to a placeholder that still exits 0 (M9).
function resolveDiffRange(baseBranch: string): { base: string; head: string } | null {
  const base = git.mergeBase(baseBranch);
  if (base === null) {
    console.error(`error: could not resolve a merge-base between HEAD and ${baseBranch}`);
    return null;
  }
  const head = git.head();
  if (head === null) {
    console.error('error: could not resolve HEAD');
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

function requiredCommands(slug: string): string[] {
  return ['npm test', 'npx tsc --noEmit', 'npm run layer-check', 'npm run tasks -- check', `npm run tasks -- check --merge --spec ${slug}`];
}

function cmdAuditPrompt(args: Flags): void {
  const config = resolveConfig(args.flags);
  const slug = args.positional[0];
  if (!slug) {
    console.error('usage: tasks audit-prompt <spec> [--base-branch main]');
    process.exitCode = 1;
    return;
  }
  const path_ = specFile(config, slug);
  if (!existsSync(path_)) {
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }

  const baseBranch = args.flags['base-branch'] ?? 'main';
  const range = resolveDiffRange(baseBranch);
  if (range === null) {
    process.exitCode = 1;
    return;
  }
  const { base, head } = range;

  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  const tasks = loadStore(config.storePath);
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
  for (const command of requiredCommands(slug)) console.log(`- ${command}`);
  console.log('');
  console.log('Relevant files:');
  if (relevantFiles.length === 0) console.log('- none');
  for (const file of relevantFiles) console.log(`- ${file}`);
  console.log('');
  console.log('Proof clauses:');
  for (const clause of doc.proofClauses) {
    console.log(`- [c${clause.id}] ${clause.text}`);
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
  console.log(latest ? `Latest audit pass: pass ${latest.pass} (${latest.date}), ${latest.verdicts.filter((verdict) => verdict.status === 'met').length}/${latest.verdicts.length} met` : 'Latest audit pass: none recorded');
  console.log('');
  console.log('Member tasks:');
  if (members.length === 0) console.log('- none');
  for (const task of members) {
    console.log(`- ${task.id} [${task.severity ?? '?'}] ${task.system ?? '(no system)'} ${task.title}`);
    if (task.files.length > 0) console.log(`  files: ${task.files.join(', ')}`);
  }
  console.log('');
  console.log('For every clause with a proof target, confirm the target exists and fails under a meaningful mutation or reproduction before accepting it as proof.');
  console.log('For pure domain logic and API layers, prefer mutation testing: temporarily remove, invert, or scale the behavior the test claims to prove and confirm the named proof fails for the right reason.');
  console.log('For UI work, inspect behavior and add or run smoke tests after the implementation has settled.');
  console.log('');
  console.log('Report clause verdicts as met/unmet with one-sentence evidence; findings with severity, system, files, evidence, and deliverable; and any proof target that is missing, skipped, too broad, or non-specific.');
  console.log('Do not promote pass-2+ findings. Do not treat green tests as proof unless they are tied to the clause they discharge.');
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
      const severityTag = task.severity ? task.severity[0].toUpperCase() : '?';
      console.log('');
      console.log(`[${i + 1}/${total}]  ${severityTag}  ${task.system ?? '(no system)'}   ${task.title}`);
      if (task.files.length > 0) console.log(`          ${task.files.join('   ')}`);
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

      if (answer === '1') {
        if (spec === null) {
          console.log('no active spec to promote into — pass --spec, skipping');
          break;
        }
        // Rule 6: pass 2 and later may defer or decline a finding, never
        // promote — the only rule that terminates the audit-fix loop.
        if (task.source !== null && task.source.pass >= 2) {
          console.log(`pass ${task.source.pass} findings cannot be promoted — defer or decline, skipping`);
          break;
        }
        task.state = 'open';
        task.spec = spec;
      } else if (answer === '2') {
        task.state = 'open';
        task.spec = null;
      } else if (answer === '3') {
        const reason = (await ask('reason: ')).trim();
        if (reason === '') {
          console.log('a reason is required to decline — skipping');
          break;
        }
        task.state = 'declined';
        task.reason = reason;
        task.closed = today();
      } else if (answer === '4') {
        const replacement = (await ask('replacement deliverable: ')).trim();
        if (replacement === '') {
          console.log('empty — redirect cancelled');
          continue;
        }
        task.deliverable = replacement;
        saveStoreAndWarn(tasks, config);
        continue;
      } else {
        console.log('unrecognised input, skipping');
        break;
      }
      saveStoreAndWarn(tasks, config);
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

const CONFIG_FLAG_NAMES = new Set(['store', 'systems', 'specs-dir', 'branch']);

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
      proofs.set(Number(clause), status as Verdict);
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
    } else if (key === 'severity' && current) {
      current.severity = value as Severity;
    } else if (key === 'system' && current) {
      current.system = value ?? null;
    } else if (key === 'deliverable' && current) {
      current.deliverable = value ?? null;
    } else if (key === 'file' && current) {
      current.files.push(value ?? '');
    } else if (key === 'file') {
      const eq = (value ?? '').indexOf('=');
      if (eq === -1) continue;
      const clause = Number((value ?? '').slice(0, eq));
      const filePath = (value ?? '').slice(eq + 1);
      const existing = clauseFiles.get(clause) ?? [];
      existing.push(filePath);
      clauseFiles.set(clause, existing);
    }
  }
  return { slug, configFlags, baseBranch, proofs, evidence, errors, clauseFiles, findings };
}

const AUDIT_USAGE =
  'usage: tasks audit <spec> [--proof N=met|unmet ...] [--evidence N="..." ...] [--file N=path:line ...] [--finding "..." --severity high|medium|low --system "<name>" --deliverable "..." --evidence "..." [--file path:line ...]]...  (with no --proof flags, walks the clauses interactively)';

async function walkClausesInteractively(clauses: ProofClause[]): Promise<AuditVerdict[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? '' : next.value;
  };

  const verdicts: AuditVerdict[] = [];
  for (const clause of clauses) {
    console.log(`\nclause ${clause.id}: ${clause.text}`);
    let status: Verdict | null = null;
    while (status === null) {
      const answer = (await ask('met/unmet? ')).trim().toLowerCase();
      if (answer === 'met' || answer === 'unmet') status = answer;
      else console.log('type "met" or "unmet"');
    }
    // Evidence is askable on met too, not only unmet — a measurement
    // backing a completion claim is worth keeping, and staying optional
    // (an empty answer records nothing) costs a human one keystroke.
    const evidenceText = (await ask('evidence (optional): ')).trim() || null;
    verdicts.push({ clause: clause.id, status, evidence: evidenceText });
  }
  rl.close();
  return verdicts;
}

// The only way a finding enters the store. Every frozen proof clause must
// carry a verdict before findings are accepted — an unanswered clause
// refuses the whole call rather than silently accepting partial results.
async function cmdAudit(rawArgs: string[]): Promise<void> {
  const parsed = parseAuditArgs(rawArgs);
  if (!parsed.slug) {
    console.error(AUDIT_USAGE);
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
    console.error(`error: no such spec: ${slug}`);
    process.exitCode = 1;
    return;
  }
  // Stamped before anything is recorded, so this pass names ids the spec
  // file already carries rather than ids it is about to be given.
  const original = readFileSync(path_, 'utf8');
  const text = stampClauseIds(original);
  const doc = parseSpecDoc(text);
  if (doc.proofClauses.length === 0) {
    console.error(`error: ${slug}'s ## Deliverable has no Proof: clauses to verify`);
    process.exitCode = 1;
    return;
  }
  const duplicates = duplicateClauseIds(doc.proofClauses);
  if (duplicates.length > 0) {
    console.error(`error: ${slug} tags more than one proof clause [c${duplicates[0]}] — a clause id names exactly one clause`);
    process.exitCode = 1;
    return;
  }

  let verdicts: AuditVerdict[];
  if (parsed.proofs.size === 0 && parsed.findings.length === 0) {
    verdicts = await walkClausesInteractively(doc.proofClauses);
  } else {
    const missing = doc.proofClauses.filter((clause) => !parsed.proofs.has(clause.id));
    if (missing.length > 0) {
      console.error(`error: every proof clause needs a verdict before findings are accepted; missing: ${missing.map((clause) => clause.id).join(', ')}`);
      process.exitCode = 1;
      return;
    }
    verdicts = doc.proofClauses.map((clause) => ({
      clause: clause.id,
      status: parsed.proofs.get(clause.id)!,
      evidence: parsed.evidence.get(clause.id) ?? null,
    }));
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
  const base = git.mergeBase(parsed.baseBranch);
  if (base === null) {
    console.error(`error: could not resolve a merge-base between HEAD and ${parsed.baseBranch}`);
    process.exitCode = 1;
    return;
  }
  const head = git.head();
  if (head === null) {
    console.error('error: could not resolve HEAD');
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
  const taken = new Set(tasks.map((task) => task.id));

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
      files: parsed.clauseFiles.get(verdict.clause) ?? [],
      deliverable: clauseText,
      evidence: verdict.evidence,
      source: { spec: slug, pass: passNumber },
      reason: null,
      closed: null,
      closedCommit: null,
      extra: null,
    };
    tasks.push(undelivered);
    taken.add(id);
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
      files: finding.files,
      deliverable: finding.deliverable,
      evidence: finding.evidence,
      source: { spec: slug, pass: passNumber },
      reason: null,
      closed: null,
      closedCommit: null,
      extra: null,
    };
    tasks.push(task);
    taken.add(id);
    findingsCreated++;
  }

  saveStoreAndWarn(tasks, config);
  // An audited deliverable is by definition the reviewed text, so a spec
  // that reaches its first audit pass with no baseline gets one recorded
  // here — this is what removes "remember to run spec freeze first" as a
  // failure mode, without requiring anyone to freeze an unchanged spec.
  const withBaseline = doc.baseline === null ? appendBaseline(text, doc.deliverableSection) : text;
  writeFileSync(path_, appendAuditPass(withBaseline, { pass: passNumber, date: today(), base, head, verdicts }), 'utf8');

  const met = verdicts.filter((verdict) => verdict.status === 'met').length;
  console.log(`recorded pass ${passNumber} for ${slug}: ${met}/${verdicts.length} clauses met`);
  if (doc.baseline === null) console.log(`froze ${slug}'s current ## Deliverable as its opening baseline (pass ${passNumber})`);
  if (text !== original) console.log(`tagged ${slug}'s proof clauses [cN] — the tag is the clause's identity, so keep it when you reword or reorder`);
  if (undeliveredCreated > 0) console.log(`${undeliveredCreated} undelivered task(s) created for unmet clauses`);
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
function cmdHandoff(args: Flags): void {
  const config = resolveConfig(args.flags);
  console.log(`branch: ${config.branch}`);

  const baseBranch = args.flags['base-branch'] ?? 'main';
  const scanCap = args.flags['scan-cap'] !== undefined ? Number(args.flags['scan-cap']) : DEFAULT_HANDOFF_SCAN_CAP;
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

  const tasks = loadStore(config.storePath);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  const spec = activeSpec.spec;
  if (spec === null) {
    console.log(`spec: none — no docs/specs/${config.branch}.md, and no --spec given`);
    return;
  }
  if (activeSpec.note) console.log(activeSpec.note);
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
  for (const clause of doc.proofClauses) console.log(`  ${clause.id}. ${truncateLine(clause.text)}`);
  console.log('');

  const inProgress = tasks.filter((task) => task.spec === spec && task.state === 'in-progress');
  if (inProgress.length > 0) {
    console.log(`${inProgress.length} in-progress task(s):`);
    for (const task of inProgress.slice(0, HANDOFF_QUEUE_CAP)) console.log(`- ${task.id} [${task.severity ?? '?'}] ${task.title}`);
    if (inProgress.length > HANDOFF_QUEUE_CAP) console.log(`… ${inProgress.length - HANDOFF_QUEUE_CAP} more in progress`);
    console.log('');
  }

  const queue = fixNowQueue(tasks, spec);
  console.log(`${queue.length} open fix-now task(s):`);
  const shown = queue.slice(0, HANDOFF_QUEUE_CAP);
  for (const task of shown) {
    console.log(`- ${task.id} [${task.severity ?? '?'}] ${task.title}`);
    if (task.files.length > 0) console.log(`    ${task.files.join('   ')}`);
  }
  // fixNowQueue is already severity-ordered, so truncating here drops the
  // least urgent — the queue can otherwise print 2 lines per member and
  // blow proof clause 6's 40-line cap as the store grows.
  if (queue.length > shown.length) {
    console.log(`… ${queue.length - shown.length} more, see \`tasks list --spec ${spec}\``);
  }
}

// Driven by .claude/hooks/commit-msg, which supplies what only git knows:
// whether MERGE_HEAD/REVERT_HEAD exist, and the staged file list.
function cmdCheckCommitMessage(args: Flags): void {
  const config = resolveConfig(args.flags);
  const msgFile = args.positional[0];
  if (!msgFile) {
    console.error('usage: tasks check-commit-msg <msg-file> [--merge-or-revert] [--files a,b,c]');
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

const USAGE = 'usage: npm run tasks -- <check|add|edit|show|list|search|next|start|stop|done|decline|import|triage|spec|audit|audit-prompt|handoff> ...';

function dispatch(command: string | undefined, args: Flags, rest: string[]): void | Promise<void> {
  switch (command) {
    case undefined:
    case '--help':
    case '-h':
    case 'help':
      console.log(USAGE);
      return;
    case 'check':
      return cmdCheck(args.flags);
    case 'add':
      return cmdAdd(args);
    case 'edit':
      return cmdEdit(args);
    case 'show':
      return cmdShow(args);
    case 'list':
      return cmdList(args);
    case 'search':
      return cmdSearch(args);
    case 'next':
      return cmdNext(args);
    case 'start':
      return cmdStart(args);
    case 'stop':
      return cmdStop(args);
    case 'done':
      return cmdDone(args);
    case 'decline':
      return cmdDecline(args);
    case 'import':
      return cmdImport(args);
    case 'triage':
      return cmdTriage(args);
    case 'spec':
      return cmdSpec(args);
    case 'audit':
      return cmdAudit(rest);
    case 'audit-prompt':
      return cmdAuditPrompt(args);
    case 'handoff':
      return cmdHandoff(args);
    case 'check-commit-msg':
      return cmdCheckCommitMessage(args);
    default:
      console.error(`unknown command: ${command ?? '(none)'}\n${USAGE}`);
      process.exitCode = 1;
  }
}

// A malformed or conflicted docs/tasks.jsonl is reported the same way —
// check's own `path:line` diagnostic, non-zero exit — for every command,
// not only `check`. One boundary here instead of a try/catch in each of
// the other eight store-reading commands, which is where eight of them
// were still missing it.
function reportStoreErrors<T>(work: () => T): T | void {
  try {
    return work();
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

export function run(argv: string[]): void | Promise<void> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  return reportStoreErrors(() => {
    const result = dispatch(command, args, rest);
    if (result instanceof Promise) return result.catch((error) => reportStoreErrors(() => { throw error; }));
    return result;
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.argv.slice(2));
}
