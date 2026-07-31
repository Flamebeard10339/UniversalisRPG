import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { harvestFiles, parseAuditDoc, systemForDoc } from './lib/auditImport';
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

const USAGE = 'usage: npm run tasks -- <check|add|show|next|done|decline|import|triage> ...';

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
    default:
      console.error(`unknown command: ${command ?? '(none)'}\n${USAGE}`);
      process.exitCode = 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run(process.argv.slice(2));
}
