import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { harvestFiles, parseAuditDoc, systemForDoc } from './lib/auditImport';
import { checkCommitMessage, isExempt } from './lib/commitContract';
import { checkMergeGate } from './lib/mergeGate';
import { appendAuditPass, parseSpecDoc, type AuditVerdict, type Verdict } from './lib/specDoc';
import { loadManifest, systemNames as manifestSystemNames } from './lib/systems';
import {
  checkStore,
  DEFAULT_STORE_PATH,
  fixNowQueue,
  isBlocked,
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
function currentSpec(config: Config): string | null {
  return existsSync(specFile(config, config.branch)) ? config.branch : null;
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

function cmdCheck(flags: Record<string, string>): void {
  const config = resolveConfig(flags);
  const tasks = loadStore(config.storePath);
  const issues = checkStore(tasks, systemNames(config), (spec) => existsSync(specFile(config, spec)));
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

  const mergeIssues = checkMergeGate({
    spec,
    specExists,
    doc,
    deliverableAtMergeBase: deliverableAtMergeBase(config, spec, baseBranch),
    members: tasks.filter((task) => task.spec === spec),
  });
  for (const issue of mergeIssues) console.error(`merge gate: ${issue}`);
  console.log(`merge gate: ${mergeIssues.length} issue(s)`);
  if (mergeIssues.length > 0) process.exitCode = 1;
}

const ADD_USAGE =
  'usage: tasks add "<title>" [--kind task|finding] [--severity high|medium|low] [--system "<name>"] [--spec <slug>] [--files a.ts:12,b.ts] [--requires id1,id2] [--deliverable "..."] [--evidence "..."] [--id <id>]';

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
  const severity = args.flags.severity as Severity | undefined;
  if (severity !== undefined && !['high', 'medium', 'low'].includes(severity)) {
    console.error('error: --severity must be high, medium or low');
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
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
    severity: severity ?? null,
    system: args.flags.system ?? null,
    spec,
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

function cmdNext(args: Flags): void {
  const config = resolveConfig(args.flags);
  const tasks = loadStore(config.storePath);
  const spec = args.flags.spec ?? currentSpec(config);
  // A resolved spec of null means "no active spec", not "match deferred
  // tasks" — those two must not collapse into the same query.
  if (spec === null) {
    console.log('no active spec for this branch, and no --spec given');
    return;
  }
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
    // Rule 7's undelivered members cannot be swept out this way — an unmet
    // deliverable must reach done, never quietly leave the spec.
    for (const straggler of stragglers) {
      if (straggler.kind === 'undelivered') continue;
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

function cmdSpec(args: Flags): void {
  const [sub, ...rest] = args.positional;
  const subArgs: Flags = { positional: rest, flags: args.flags };
  switch (sub) {
    case 'new':
      return cmdSpecNew(subArgs);
    case 'add':
      return cmdSpecAdd(subArgs);
    case 'show':
      return cmdSpecShow(subArgs);
    case 'done':
      return cmdSpecDone(subArgs);
    default:
      console.error(`usage: tasks spec <new|add|show|done> ...`);
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

function printEvidence(evidence: string | null, maxLines = 12): void {
  if (!evidence) return;
  const lines = evidence.split('\n');
  for (const line of lines.slice(0, maxLines)) console.log(`          ${line}`);
  if (lines.length > maxLines) console.log(`          … (${lines.length - maxLines} more line(s), see \`tasks show\`)`);
}

// A human, not the auditor, assigns state — this is the only place that
// happens. promote/defer/decline all persist immediately, not just on quit,
// so a queue this long survives an interrupted session.
async function cmdTriage(args: Flags): Promise<void> {
  const config = resolveConfig(args.flags);
  const spec = args.flags.spec ?? currentSpec(config);
  const tasks = loadStore(config.storePath);
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
  for (let i = 0; i < queue.length; i++) {
    const task = queue[i];
    const severityTag = task.severity ? task.severity[0].toUpperCase() : '?';
    console.log('');
    console.log(`[${i + 1}/${total}]  ${severityTag}  ${task.system ?? '(no system)'}   ${task.title}`);
    if (task.files.length > 0) console.log(`          ${task.files.join('   ')}`);
    console.log('');
    printEvidence(task.evidence);
    console.log('');
    console.log('[1] promote   [2] defer   [3] decline   [s] skip   [q] save and quit');

    const answer = (await ask('> ')).trim().toLowerCase();
    if (answer === 'q') break;
    if (answer === '' || answer === 's') continue;

    if (answer === '1') {
      if (spec === null) {
        console.log('no active spec to promote into — pass --spec, skipping');
        continue;
      }
      // Rule 6: pass 2 and later may defer or decline a finding, never
      // promote — the only rule that terminates the audit-fix loop.
      if (task.source !== null && task.source.pass >= 2) {
        console.log(`pass ${task.source.pass} findings cannot be promoted — defer or decline, skipping`);
        continue;
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
        continue;
      }
      task.state = 'declined';
      task.reason = reason;
      task.closed = today();
    } else {
      console.log('unrecognised input, skipping');
      continue;
    }
    saveStore(tasks, config.storePath);
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
}

interface AuditArgs {
  slug: string | null;
  configFlags: Record<string, string>;
  baseBranch: string;
  proofs: Map<number, Verdict>;
  evidence: Map<number, string>;
  findings: AuditFinding[];
}

const CONFIG_FLAG_NAMES = new Set(['store', 'systems', 'specs-dir', 'branch']);

// Repeated --proof/--evidence/--finding flags need a dedicated scanner: the
// generic parseArgs collapses a repeated flag to its last value, and a
// --finding's --severity/--system/--file belong to whichever --finding
// came most recently, which a flat key-value map cannot express.
function parseAuditArgs(args: string[]): AuditArgs {
  const configFlags: Record<string, string> = {};
  let baseBranch = 'main';
  const proofs = new Map<number, Verdict>();
  const evidence = new Map<number, string>();
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
    } else if (key === 'evidence') {
      const eq = (value ?? '').indexOf('=');
      evidence.set(Number((value ?? '').slice(0, eq)), (value ?? '').slice(eq + 1));
    } else if (key === 'finding') {
      current = { title: value ?? '', severity: null, system: null, files: [] };
      findings.push(current);
    } else if (key === 'severity' && current) {
      current.severity = value as Severity;
    } else if (key === 'system' && current) {
      current.system = value ?? null;
    } else if (key === 'file' && current) {
      current.files.push(value ?? '');
    }
  }
  return { slug, configFlags, baseBranch, proofs, evidence, findings };
}

const AUDIT_USAGE =
  'usage: tasks audit <spec> [--proof N=met|unmet ...] [--evidence N="..." ...] [--finding "..." --severity high|medium|low --system "<name>" [--file path:line ...]]...  (with no --proof flags, walks the clauses interactively)';

async function walkClausesInteractively(clauses: { index: number; text: string }[]): Promise<AuditVerdict[]> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  const ask = async (prompt: string): Promise<string> => {
    process.stdout.write(prompt);
    const next = await lines.next();
    return next.done ? '' : next.value;
  };

  const verdicts: AuditVerdict[] = [];
  for (const clause of clauses) {
    console.log(`\nclause ${clause.index}: ${clause.text}`);
    let status: Verdict | null = null;
    while (status === null) {
      const answer = (await ask('met/unmet? ')).trim().toLowerCase();
      if (answer === 'met' || answer === 'unmet') status = answer;
      else console.log('type "met" or "unmet"');
    }
    let evidenceText: string | null = null;
    if (status === 'unmet') evidenceText = (await ask('evidence: ')).trim() || null;
    verdicts.push({ clause: clause.index, status, evidence: evidenceText });
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
  const text = readFileSync(path_, 'utf8');
  const doc = parseSpecDoc(text);
  if (doc.proofClauses.length === 0) {
    console.error(`error: ${slug}'s ## Deliverable has no Proof: clauses to verify`);
    process.exitCode = 1;
    return;
  }

  let verdicts: AuditVerdict[];
  if (parsed.proofs.size === 0 && parsed.findings.length === 0) {
    verdicts = await walkClausesInteractively(doc.proofClauses);
  } else {
    const missing = doc.proofClauses.filter((clause) => !parsed.proofs.has(clause.index));
    if (missing.length > 0) {
      console.error(`error: every proof clause needs a verdict before findings are accepted; missing: ${missing.map((clause) => clause.index).join(', ')}`);
      process.exitCode = 1;
      return;
    }
    verdicts = doc.proofClauses.map((clause) => ({
      clause: clause.index,
      status: parsed.proofs.get(clause.index)!,
      evidence: parsed.evidence.get(clause.index) ?? null,
    }));
  }

  for (const finding of parsed.findings) {
    if (!finding.severity || !['high', 'medium', 'low'].includes(finding.severity)) {
      console.error(`error: finding "${finding.title}" needs --severity high|medium|low`);
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
    const clauseText = doc.proofClauses.find((clause) => clause.index === verdict.clause)?.text ?? '';
    const undelivered: Task = {
      id,
      title: `Unmet deliverable clause ${verdict.clause}: ${clauseText}`,
      kind: 'undelivered',
      state: 'open',
      severity: 'high',
      system: null,
      spec: slug,
      requires: [],
      files: [],
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
      requires: [],
      files: finding.files,
      deliverable: null,
      evidence: null,
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
  if (undeliveredCreated > 0) console.log(`${undeliveredCreated} undelivered task(s) created for unmet clauses`);
  if (findingsCreated > 0) console.log(`${findingsCreated} finding(s) recorded, unreviewed`);
}

// The first command of a cold session.
function cmdHandoff(args: Flags): void {
  const config = resolveConfig(args.flags);

  let nextLine = '(no commits yet)';
  try {
    const lastMessage = execFileSync('git', ['log', '-1', '--format=%B'], { encoding: 'utf8' });
    const found = lastMessage
      .split('\n')
      .map((line) => line.trim())
      .reverse()
      .find((line) => /^Next:/.test(line));
    nextLine = found ?? '(last commit has no Next: trailer)';
  } catch {
    // no commits yet
  }
  console.log(nextLine);
  console.log('');

  const spec = args.flags.spec ?? currentSpec(config);
  if (spec === null) {
    console.log('no active spec for this branch, and no --spec given');
    return;
  }
  const path_ = specFile(config, spec);
  if (!existsSync(path_)) {
    console.log(`spec file missing: ${path_}`);
    return;
  }
  const doc = parseSpecDoc(readFileSync(path_, 'utf8'));
  console.log(doc.deliverableSection);
  console.log('');

  const tasks = loadStore(config.storePath);
  const queue = fixNowQueue(tasks, spec);
  console.log(`${queue.length} open fix-now task(s):`);
  for (const task of queue) {
    console.log(`- ${task.id} [${task.severity ?? '?'}] ${task.title}`);
    if (task.files.length > 0) console.log(`    ${task.files.join('   ')}`);
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

const USAGE = 'usage: npm run tasks -- <check|add|show|next|done|decline|import|triage|spec|audit|handoff> ...';

export async function run(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const args = parseArgs(rest);
  switch (command) {
    case 'check':
      return cmdCheck(args.flags);
    case 'add':
      return cmdAdd(args);
    case 'show':
      return cmdShow(args);
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
