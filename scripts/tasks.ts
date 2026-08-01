import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { harvestFiles, parseAuditDoc, systemForDoc } from './lib/auditImport';
import { checkCommitMessage, extractNextTrailer, isExempt } from './lib/commitContract';
import { checkMergeGate } from './lib/mergeGate';
import { appendAmendment, appendAuditPass, duplicateClauseIds, parseSpecDoc, stampClauseIds, type AuditVerdict, type ProofClause, type Verdict } from './lib/specDoc';
import { loadManifest, systemNames as manifestSystemNames } from './lib/systems';
import {
  checkStore,
  DEFAULT_STORE_PATH,
  type CheckIssue,
  fixNowQueue,
  isBlocked,
  listQueue,
  loadStore,
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

// "the spec whose branch is checked out" — a branch not named after any spec
// file has no active spec, and `--spec` on a read command overrides this.
// Strict on purpose: `check --merge` resolves through this and only this,
// never through resolveActiveSpec below — the gate keying off a mutable
// branch name is a known hole, and inferring through it would make that
// hole easier to trip rather than harder.
function currentSpec(config: Config): string | null {
  return existsSync(specFile(config, config.branch)) ? config.branch : null;
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
    if (task.state !== 'open' || task.spec === null) continue;
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
}

// null means "nothing to compare against" — merge-base lookup failed, or
// the spec file did not exist there (opened on this branch, so nothing has
// drifted).
function deliverableAtMergeBase(config: Config, spec: string, baseBranch: string): string | null {
  try {
    const mergeBase = execFileSync('git', ['merge-base', baseBranch, 'HEAD'], { encoding: 'utf8' }).trim();
    const content = execFileSync('git', ['show', `${mergeBase}:${specFile(config, spec)}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return parseSpecDoc(content).deliverableSection;
  } catch {
    return null;
  }
}

// Here rather than only in the merge gate because this runs on every push,
// while the gate sees one branch's spec on a pull request.
function specIssues(config: Config): CheckIssue[] {
  if (!existsSync(config.specsDir)) return [];
  return readdirSync(config.specsDir)
    .filter((entry) => entry.endsWith('.md'))
    .flatMap((entry) => {
      const spec = entry.replace(/\.md$/, '');
      const doc = parseSpecDoc(readFileSync(`${config.specsDir}/${entry}`, 'utf8'));
      return duplicateClauseIds(doc.proofClauses).map((id) => ({
        level: 'error' as const,
        message: `${spec} tags more than one proof clause [c${id}] — a clause id names exactly one clause`,
      }));
    });
}

function cmdCheck(flags: Record<string, string>): void {
  const config = resolveConfig(flags);
  const tasks = loadStore(config.storePath);
  const issues = [...checkStore(tasks, systemNames(config), (spec) => existsSync(specFile(config, spec))), ...specIssues(config)];
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');
  for (const warning of warnings) console.warn(`warning: ${warning.message}`);
  for (const error of errors) console.error(`error: ${error.message}`);
  console.log(`${tasks.length} task(s), ${errors.length} error(s), ${warnings.length} warning(s)`);
  if (errors.length > 0) process.exitCode = 1;

  if (flags.merge !== 'true') return;

  const spec = flags.spec ?? currentSpec(config);
  const specPath = spec !== null ? specFile(config, spec) : null;
  const specExists = specPath !== null && existsSync(specPath);
  const doc = specExists ? parseSpecDoc(readFileSync(specPath!, 'utf8')) : null;
  const baseBranch = flags['base-branch'] ?? 'main';

  if (spec === null) {
    console.log('merge gate: not applicable — no active spec for this branch, and no --spec given');
    return;
  }

  // An amendment's archived text wins when one exists — it is the freeze's
  // only sanctioned edit path. Merge-base is the fallback for a spec that
  // has never been amended, and is a known no-op for the common case: rule
  // 1 opens one spec per branch on that branch, so it never existed at the
  // merge-base either.
  const latestAmendment = doc ? doc.amendments[doc.amendments.length - 1] : undefined;
  const deliverableBaseline = latestAmendment ? latestAmendment.deliverableText : deliverableAtMergeBase(config, spec, baseBranch);

  const mergeIssues = checkMergeGate({
    spec,
    specExists,
    doc,
    deliverableBaseline,
    members: tasks.filter((task) => task.spec === spec),
  });
  for (const issue of mergeIssues) console.error(`merge gate: ${issue}`);
  console.log(`merge gate: ${mergeIssues.length} issue(s)`);
  if (mergeIssues.length > 0) process.exitCode = 1;
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
  };
  tasks.push(task);
  saveStore(tasks, config.storePath);
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

  saveStore(tasks, config.storePath);
  console.log(`edited ${id}: ${changes.join(', ')}`);
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
}

const LIST_STATES: State[] = ['unreviewed', 'open', 'done', 'declined'];
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
    console.log(`${task.id}  [${tag}]  ${task.system ?? '(no system)'}  ${task.title}`);
  }

  const counts: Record<State, number> = { unreviewed: 0, open: 0, done: 0, declined: 0 };
  for (const task of queue) counts[task.state]++;
  console.log(`${queue.length} task(s) — unreviewed: ${counts.unreviewed}, open: ${counts.open}, done: ${counts.done}, declined: ${counts.declined}`);
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
  printTask(queue[0], tasks);
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
    console.error('usage: tasks done <id>');
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
  task.state = 'done';
  task.closed = today();
  saveStore(tasks, config.storePath);
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
  saveStore(tasks, config.storePath);
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
  saveStore(tasks, config.storePath);
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

  const members = loadStore(config.storePath).filter((task) => task.spec === slug);
  console.log(`${members.length} member(s):`);
  for (const member of members) {
    console.log(`  ${member.id}  [${member.kind}/${member.state}${member.severity ? '/' + member.severity : ''}]  ${member.title}`);
  }
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
    saveStore(tasks, config.storePath);
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
  saveStore(tasks, config.storePath);
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

function cmdSpec(args: Flags): void {
  const [sub, ...rest] = args.positional;
  const subArgs: Flags = { positional: rest, flags: args.flags };
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
    default:
      console.error(`usage: tasks spec <new|add|remove|show|done|amend> ...`);
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
    };
    tasks.push(task);
    taken.add(id);
    imported++;
  }
  saveStore(tasks, config.storePath);

  const skippedNote = skipped > 0 ? ` (${skipped} already present, skipped)` : '';
  const systemNote = system === null && findings.length > 0 ? ' — no system mapping for this doc name, system left null' : '';
  console.log(`imported ${imported} finding(s) from ${docPath}${skippedNote}${systemNote}`);
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
        saveStore(tasks, config.storePath);
        continue;
      } else {
        console.log('unrecognised input, skipping');
        break;
      }
      saveStore(tasks, config.storePath);
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
      current.evidence = value ?? null;
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
  return { slug, configFlags, baseBranch, proofs, evidence, clauseFiles, findings };
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
  const base = execFileSync('git', ['merge-base', parsed.baseBranch, 'HEAD'], { encoding: 'utf8' }).trim();
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

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
    };
    tasks.push(task);
    taken.add(id);
    findingsCreated++;
  }

  saveStore(tasks, config.storePath);
  writeFileSync(path_, appendAuditPass(text, { pass: passNumber, date: today(), base, head, verdicts }), 'utf8');

  const met = verdicts.filter((verdict) => verdict.status === 'met').length;
  console.log(`recorded pass ${passNumber} for ${slug}: ${met}/${verdicts.length} clauses met`);
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

// Only the last commit's Next: is meant to be live, but a mechanical or
// fixup commit can carry none at all — walk back through recent history
// (capped, so a long-dead trailer can't turn this into an unbounded scan)
// to the most recent commit that actually has one.
function findLatestNextTrailer(maxCommits = 20): FoundTrailer | null {
  let log: string;
  try {
    log = execFileSync('git', ['log', `-${maxCommits}`, `--format=%H${FIELD_SEP}%B${COMMIT_SEP}`], { encoding: 'utf8' });
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

  const found = findLatestNextTrailer();
  if (found === null) {
    console.log('(no Next: trailer found in the last 20 commits)');
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
    console.error('every commit needs a body (what was done) and a Next: trailer (what the following session should pick up). --no-verify to bypass.');
    process.exitCode = 1;
  }
}

const USAGE = 'usage: npm run tasks -- <check|add|edit|show|list|search|next|done|decline|import|triage|spec|audit|handoff> ...';

export async function run(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
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
    case 'handoff':
      return cmdHandoff(args);
    case 'check-commit-msg':
      return cmdCheckCommitMessage(args);
    default:
      console.error(`unknown command: ${command ?? '(none)'}\n${USAGE}`);
      process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.argv.slice(2));
}
