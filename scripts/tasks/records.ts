import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as git from '../lib/git';
import { parseSpecDoc } from '../lib/specDoc';
import { findProducers, producerIndex } from '../lib/producers';
import { loadManifest } from '../lib/systems';
import { filterEvents, loadEvents } from '../lib/eventLog';
import {
  claimSummary,
  coldClaims,
  dependencyCycles,
  fixNowQueue,
  GRANTS,
  isBlocked,
  KINDS,
  listQueue,
  loadStore,
  matchesSearchTerm,
  nextSeq,
  parseStore,
  requirementStates,
  SEARCH_FIELDS,
  STATES,
  unreviewedFiledBy,
  waitingOn,
  type Grant,
  type Kind,
  type Severity,
  type State,
  type Task,
} from '../lib/taskStore';
import type { Flags } from './cli';
import {
  CLOSING_STATES,
  readStore,
  recordEvents,
  refuseUnknownSpec,
  reportStoreScope,
  resolveActiveSpec,
  resolveCommit,
  resolveConfig,
  saveStoreAndWarn,
  specFile,
  splitList,
  subjectOf,
  today,
  uniqueId,
  slugify,
  validateContentFields,
  type Config,
} from './context';
import { reportPriorArtOnWrites } from './architectureCmds';
import { printRow, printTask, truncateLine, wrapUnder } from './render';
import { resolveTaskIds } from './resolveIds';

export function reportUnresolvedRequires(task: Task, tasks: Task[]): void {
  const known = new Set(tasks.map((candidate) => candidate.id));
  const unresolved = task.requires.filter((id) => !known.has(id));
  if (unresolved.length === 0) return;
  console.log(`recorded ${unresolved.length} requirement(s) no record answers to: ${unresolved.join(', ')} — they hold the task until the record exists, and \`tasks doctor\` reports them until it does`);
}

// A grant nobody has read the code for is a forecast, so that is what a
// grant declared here is unless its author says otherwise: `add` and a
// planner's `edit` both run before the region has been read, and the
// workflow's correction point is a worker narrowing its own grant at
// dispatch. Returning the previous kind for an edit that touches nothing
// else keeps a worker's commitment from being demoted by a later title fix.
function resolveGrant(flags: Record<string, string>, current: Grant | null): { grant: Grant | null } | { error: string } {
  const given = flags.grant;
  if (given !== undefined) return GRANTS.includes(given as Grant) ? { grant: given as Grant } : { error: `error: --grant must be one of ${GRANTS.join(', ')}` };
  if (flags.writes === undefined) return { grant: current };
  return { grant: current ?? 'forecast' };
}

// `c3` and `3` both name clause 3, because a spec writes `[c3]` and a
// planner types what the spec writes.
function parseDischarges(given: string | undefined, current: number[]): { numbers: number[] } | { error: string } {
  if (given === undefined) return { numbers: current };
  const numbers: number[] = [];
  for (const entry of splitList(given)) {
    const parsed = Number(/^c?(\d+)$/.exec(entry)?.[1]);
    if (Number.isNaN(parsed)) return { error: `error: --discharges takes clause numbers, as 3 or c3: ${entry}` };
    numbers.push(parsed);
  }
  return { numbers: [...new Set(numbers)].sort((a, b) => a - b) };
}

function reportGrant(task: Task): void {
  if (task.grant !== 'forecast') return;
  console.log(`its write grant is recorded as a forecast — \`tasks edit ${task.id} --writes <paths> --grant commitment\` is what a worker that has read the region says, and \`tasks plan\` grades an overlap between commitments as a defect and one resting on a forecast as a note`);
}

export function cmdAdd(args: Flags, usage: string): void {
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

  const grant = resolveGrant(args.flags, null);
  if ('error' in grant) {
    console.error(grant.error);
    process.exitCode = 1;
    return;
  }

  const clauses = parseDischarges(args.flags.discharges, []);
  if ('error' in clauses) {
    console.error(clauses.error);
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
    seq: nextSeq(tasks),
    title,
    kind,
    state,
    severity: (args.flags.severity as Severity | undefined) ?? null,
    system: args.flags.system ?? null,
    spec,
    clause: null,
    discharges: clauses.numbers,
    requires: splitList(args.flags.requires),
    writes: splitList(args.flags.writes),
    grant: grant.grant,
    produces: splitList(args.flags.produces),
    files: splitList(args.flags.files),
    deliverable: args.flags.deliverable ?? null,
    evidence: args.flags.evidence ?? null,
    source: null,
    reason: null,
    trigger: null,
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
  if (kind === 'finding' && args.flags.spec !== undefined) console.log(`--spec is not recorded on a finding — it starts unreviewed outside every spec, and triage or \`tasks promote\` moves it in`);
  reportUnresolvedRequires(task, tasks);
  reportGrant(task);
  if (args.flags.writes !== undefined) reportPriorArtOnWrites(config, tasks, task);
}

export function cmdEdit(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const given = args.positional[0];
  if (!given) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const tasks = loadStore(config.storePath);
  const resolved = resolveTaskIds([given], tasks);
  if (resolved === null) return;
  const task = resolved[0];

  const validationError = validateContentFields(config, args.flags);
  if (validationError) {
    console.error(validationError);
    process.exitCode = 1;
    return;
  }

  const grant = resolveGrant(args.flags, task.grant);
  if ('error' in grant) {
    console.error(grant.error);
    process.exitCode = 1;
    return;
  }

  const clauses = parseDischarges(args.flags.discharges, task.discharges);
  if ('error' in clauses) {
    console.error(clauses.error);
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
  if (args.flags.discharges !== undefined) {
    task.discharges = clauses.numbers;
    changes.push('discharges');
  }
  if (grant.grant !== task.grant) {
    task.grant = grant.grant;
    changes.push('grant');
  }
  if (args.flags.produces !== undefined) {
    task.produces = splitList(args.flags.produces);
    changes.push('produces');
  }

  if (changes.length === 0) {
    console.log(`${task.id}: nothing to change`);
    return;
  }

  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'edit', [subjectOf(task, `edited ${changes.join(', ')}`)]);
  console.log(`edited ${task.id}: ${changes.join(', ')}`);
  reportUnresolvedRequires(task, tasks);
  if (changes.includes('grant')) reportGrant(task);
  if (args.flags.writes !== undefined) reportPriorArtOnWrites(config, tasks, task);
}

function storeStateAt(config: Config, commit: string, id: string): State | null {
  const text = git.fileAt(commit, config.storePath);
  if (text === null) return null;
  try {
    return parseStore(text, `${config.storePath}@${commit}`).find((task) => task.id === id)?.state ?? null;
  } catch {
    return null;
  }
}

// "What implemented this" for a task whose `closedCommit` is null (`done`
// cannot record it, since it does not exist yet) — a best-effort answer read
// off history rather than a fact written at close-time, so `show` labels it
// "derived" and callers must not treat it as `closedCommit`. Walks commits
// touching the store newest-first and returns the most recent one where this
// id's state is `done` and its predecessor's is not — i.e. the commit that
// flipped the record. One git log plus a parse per commit, so it is called
// for a single task on demand and never for a whole queue.
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

// A close carries why it closed, and where a closer puts that is `tasks
// note` — which lands in the event log, reachable only by someone who
// already knows it is there. `show` is where a reader arrives, so the
// judgements come with the record. `note` and `decision` and nothing else:
// the state verbs already wrote what they did into the fields above.
function printJudgements(config: Config, task: Task): void {
  const judgements = filterEvents(loadEvents(config.eventsPath).events, { id: task.id }).filter((event) => event.op === 'note' || event.op === 'decision');
  if (judgements.length === 0) return;
  console.log(`\n${judgements.length} judgement(s) recorded against this record:`);
  for (const event of judgements) {
    for (const line of wrapUnder(event.note, `  [${event.op}] ${event.t.slice(0, 10)} ${event.by ?? '(unnamed)'} — `, '    ')) console.log(line);
  }
}

export function cmdShow(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = readStore(config);
  const task = resolveTaskIds([id], tasks, { report: (line) => console.log(line) })?.[0];
  if (task === undefined) return;
  printTask(task, new Map(tasks.map((candidate) => [candidate.id, candidate])), 'full');
  if (task.state === 'done' && task.closedCommit === null) {
    const derived = deriveClosingCommit(config, task.id);
    console.log(derived ? `closedCommit (derived): ${derived}` : 'closedCommit: (none recorded, and none could be derived from git history)');
  }
  printJudgements(config, task);
}

// The only verb that reads the whole store rather than one spec's fix-now
// queue, which is how a `spec: null` finding is reachable at all.
export function cmdSearch(args: Flags, usage: string): void {
  const term = args.positional[0];
  if (!term) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  runList(args, term);
}

export function cmdList(args: Flags): void {
  runList(args, undefined);
}

// The same rule `listQueue` filters by, applied per field rather than to the
// whole record, so the two cannot report a match by one rule and a reason by
// another. A query whose words spread across two fields (one in `title`, one
// in `reason`) matches the record but no single field, which is the honest
// answer to "which field" when the true answer is "more than one, together".
function matchingFields(task: Task, text: string): string[] {
  return SEARCH_FIELDS.filter(([, read]) => matchesSearchTerm(read(task) ?? '', text)).map(([label]) => label);
}

function runList(args: Flags, text: string | undefined): void {
  const config = resolveConfig(args.flags);
  const flags = args.flags;

  const state = flags.state as State | undefined;
  if (state !== undefined && !STATES.includes(state)) {
    console.error(`error: --state must be one of ${STATES.join(', ')}`);
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

  const triggered = flags.triggered === 'true';
  const queue = listQueue(tasks, {
    state,
    severity,
    system: flags.system,
    spec: flags.spec,
    deferred: flags.deferred === 'true',
    kind,
    text,
    triggered,
  });

  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of queue) {
    const note = text !== undefined ? `(matches: ${matchingFields(task, text).join(', ')})` : triggered && task.trigger ? `(trigger: ${task.trigger})` : undefined;
    printRow(task, byId, { note });
  }

  // A finding filed by this spec's audits is part of the spec's picture even
  // though triage has not admitted it yet — listed, marked, never counted as
  // members are.
  if (flags.spec !== undefined && state === undefined) {
    const filed = unreviewedFiledBy(tasks, flags.spec);
    for (const task of filed) printRow(task, byId, { note: '(filed by this spec\'s audit — awaiting triage)' });
    if (filed.length > 0) console.log(`${filed.length} unreviewed finding(s) above were filed by ${flags.spec}'s audits and await triage`);
  }

  const counts: Record<State, number> = { unreviewed: 0, open: 0, 'in-progress': 0, done: 0, declined: 0 };
  for (const task of queue) counts[task.state]++;
  console.log(`${queue.length} task(s) — unreviewed: ${counts.unreviewed}, open: ${counts.open}, in-progress: ${counts['in-progress']}, done: ${counts.done}, declined: ${counts.declined}`);
  if (queue.length === 0) {
    reportStoreScope(config, tasks.length);
    // A search answers from the store's own fields and nothing else. "No
    // record names this" is not "nothing is known": a decline's trigger, a
    // decision with no task behind it, and every other write live in the
    // event log, which this never opens.
    if (text !== undefined) console.log(`This searches ${SEARCH_FIELDS.map(([label]) => label).join(', ')} — not the event log, where a ruling can live with no task record behind it at all: \`tasks log ${JSON.stringify(text)}\` reads decisions, declines and every other write, in order.`);
  }
}

// An empty queue has causes that look identical from outside — no members,
// every member closed, every member held by a live requirement, a
// requirement naming no record, or a ring of members holding each other —
// and the caller's next move differs for each.
export function explainEmptyQueue(tasks: Task[], spec: string, filter: { system?: string; severity?: string }): void {
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

export function cmdNext(args: Flags): void {
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

  const filed = unreviewedFiledBy(tasks, spec);
  if (filed.length > 0) console.log(`${filed.length} unreviewed finding(s) filed by ${spec}'s audits await triage — \`tasks triage\` or \`tasks promote\`; they are never offered as work here`);

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
export function transition(task: Task, to: State): string[] {
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

export function cmdStart(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const resolved = resolveTaskIds([id], tasks);
  if (resolved === null) return;
  const task = resolved[0];
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
  console.log(`started ${task.id}`);
  if (displaced !== null) console.log(`took over a claim: ${displaced} — the previous claim is replaced, not merged`);
  for (const note of notes) console.log(note);
  console.log(claimSummary(task, today()));
  if (actor === null) console.log(`no --actor given: the claim is recorded with no holder named — pass --actor <name> so a cold claim says who to ask`);
  if (waiting.length > 0) console.log(`started while still waiting on ${waiting.join(', ')} — the requirement stands, the claim is recorded anyway`);
}

export function cmdStop(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const id = args.positional[0];
  if (!id) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const resolved = resolveTaskIds([id], tasks);
  if (resolved === null) return;
  const task = resolved[0];
  const notes = transition(task, 'open');
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'stop', [subjectOf(task, ['stopped', ...notes].join('; '))]);
  console.log(`stopped ${task.id}`);
  for (const note of notes) console.log(note);
}

// The five determinations `done` used to refuse an undelivered task on,
// reported beside the close instead of preventing it, so a clause closed
// against an unmet verdict leaves a record of what its spec's latest pass
// actually said at the moment it closed.
export interface SpecSource {
  path: string;
  // Null when nothing is there to read, which the caller reports as a
  // missing spec file rather than as an ungraded clause.
  text: string | null;
}

// The spec document as a value, so the determination below is decided from
// what it says and not from what is on disk when it runs.
function specSource(config: Config, spec: string): SpecSource {
  const path = specFile(config, spec);
  return { path, text: existsSync(path) ? readFileSync(path, 'utf8') : null };
}

export function clauseStanding(task: Task, load: (spec: string) => SpecSource): string {
  if (!task.spec) return 'it names no spec, so no audit pass can speak to it';
  if (task.clause === null) return 'it names no proof clause';
  const { path: path_, text } = load(task.spec);
  if (text === null) return `its spec file is missing: ${path_}`;
  const doc = parseSpecDoc(text);
  if (!doc.proofClauses.some((candidate) => candidate.id === task.clause)) return `proof clause ${task.clause} is no longer in ${path_}`;
  const latest = doc.auditPasses[doc.auditPasses.length - 1];
  if (!latest) return `${task.spec} has no recorded audit pass`;
  const status = latest.verdicts.find((candidate) => candidate.clause === task.clause)?.status ?? 'unknown';
  const nobodyLooked = status === 'unknown' ? ' — nobody graded it, which is not the same as unmet' : '';
  return `proof clause ${task.clause} is ${status} in the latest audit pass (pass ${latest.pass})${nobodyLooked}`;
}

// A claim that closes without being registered is a capability the next
// worker's `tasks produces` will not find. Printed, never written: half the
// claims in this store name a branch's output — "playtest findings",
// "balance numbers" — and auto-graduating those would fill the architecture
// map with things that are not capabilities at all.
function reportUnregisteredProduces(config: Config, task: Task): void {
  if (task.produces.length === 0) return;
  const index = producerIndex(loadManifest(config.systemsPath), []);
  const unregistered = task.produces.filter((name) => !findProducers(name, index).some((match) => match.strength === 'exact'));
  if (unregistered.length === 0) return;
  console.log(`\n${unregistered.length} of this task's produces claim(s) are not registered concepts, so \`tasks produces\` will only find them as a closed task's claim:`);
  for (const name of unregistered) console.log(`  tasks concept ${JSON.stringify(task.system ?? '<system>')} ${JSON.stringify(name)} --paths <paths> --note "produced by ${task.id}"`);
  console.log('Register the ones that are durable capabilities. A branch\'s output is not one.');
}

// The store is only the path of least resistance for a judgement if it asks
// for one. `tasks decision` went unrun across a whole branch while twelve
// commit bodies carried the reasoning, because the commit had a writing
// prompt attached and the store did not. Printed, never written, exactly as
// the `tasks concept` nudge above is — and it names `show` because that is
// where the next reader will now find the answer.
export function printDecisionPrompt(task: Task): void {
  console.log(`if this rested on a judgement worth reading later, \`tasks decision "<one line>" --id ${task.id}\` records it where \`tasks show ${task.id}\` surfaces it`);
}

// The line clause 16 pins. A pass-2 finding was not part of what the spec
// promised, so promoting it widens the promise, and both the batch form and
// the interactive walk say so from here.
export function pass2Promotion(task: Task, spec: string): string | null {
  const pass = task.source?.pass ?? 0;
  return pass >= 2 ? `promoting a pass ${pass} finding, which extends what ${spec} owes` : null;
}

export function cmdDone(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  if (args.positional.length === 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const resolved = resolveTaskIds(args.positional, tasks);
  if (resolved === null) return;
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
  const closes: Array<{ task: Task; note: string }> = [];
  for (const task of resolved) {
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
    closes.push({ task, note: ['done', ...notes, ...(task.closedCommit ? [`closing commit ${task.closedCommit}`] : []), ...(waiting.length > 0 ? [`${waiting.length} requirement(s) still open: ${waiting.join(', ')}`] : [])].join('; ') });
    console.log(`done ${task.id}`);
    for (const note of notes) console.log(note);
    if (task.kind === 'undelivered') console.log(`clause standing at close: ${clauseStanding(task, (spec) => specSource(config, spec))}`);
    if (alreadyDone) console.log(`the recorded close date stands: ${task.closed ?? 'undated'}`);
    if (waiting.length > 0) console.log(`closed with ${waiting.length} requirement(s) still open: ${waiting.join(', ')}`);
    printDecisionPrompt(task);
  }
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'done', closes.map((close) => subjectOf(close.task, close.note)));
  for (const close of closes) reportUnregisteredProduces(config, close.task);
}

export function cmdDecline(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  const reason = args.flags.reason;
  const trigger = args.flags.trigger ?? null;
  if (args.positional.length === 0 || !reason) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const resolved = resolveTaskIds(args.positional, tasks);
  if (resolved === null) return;
  const declines: Array<{ task: Task; note: string }> = [];
  for (const task of resolved) {
    const notes = transition(task, 'declined');
    task.reason = reason;
    task.trigger = trigger;
    task.closed = today();
    task.closedCommit = null;
    declines.push({ task, note: [`declined: ${truncateLine(reason, 120)}`, ...(trigger ? [`trigger: ${truncateLine(trigger, 120)}`] : []), ...notes].join('; ') });
    console.log(`declined ${task.id}`);
    for (const note of notes) console.log(note);
    if (task.kind === 'undelivered') console.log(`this was ${task.spec ?? 'a spec'}'s outstanding promise on clause ${task.clause ?? '(none named)'} — declining it abandons the clause, it does not discharge it`);
    // Prose in `reason` alone is write-only — it appears in no queue until
    // something reads it back out. `--trigger` is the store's field for a
    // condition worth revisiting, and `--triggered` is the queue that reads
    // it: naming both here is what keeps the second one from being advice
    // nobody follows the way the step-2 survey command list was.
    if (trigger) console.log(`trigger recorded — \`tasks list --triggered\` surfaces it until this branch's work resolves it`);
    printDecisionPrompt(task);
  }
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'decline', declines.map((decline) => subjectOf(decline.task, decline.note)));
}

// The non-interactive form of triage's promote, for the case the walk is
// wrong for: a batch of findings whose disposition is already decided —
// this repo's policy says a branch's own first-pass HIGHs are always
// promoted, so a walk that asks about each one is ceremony.
export function cmdPromote(args: Flags, usage: string): void {
  const config = resolveConfig(args.flags);
  if (args.positional.length === 0) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }
  const tasks = loadStore(config.storePath);
  const activeSpec = resolveActiveSpec(config, tasks, args.flags.spec);
  if (activeSpec.note) console.log(activeSpec.note);
  if (activeSpec.spec === null) {
    console.error('error: no active spec to promote into — pass --spec');
    process.exitCode = 1;
    return;
  }
  const spec = activeSpec.spec;
  if (!existsSync(specFile(config, spec))) {
    refuseUnknownSpec(config, spec);
    return;
  }
  const resolved = resolveTaskIds(args.positional, tasks);
  if (resolved === null) return;
  // All-or-nothing, validated before anything is printed or moved: a batch
  // that announced promotions and then refused on a later id had asserted
  // writes that never happened — resolveTaskIds's own contract, applied to
  // the state check it cannot make.
  for (const task of resolved) {
    if (task.state !== 'unreviewed' && task.state !== 'open') {
      console.error(`error: ${task.id} is ${task.state} — promote moves unreviewed or deferred records into a spec, it does not reopen closed ones. Nothing was promoted`);
      process.exitCode = 1;
      return;
    }
  }
  const promotions: Array<{ task: Task; note: string }> = [];
  for (const task of resolved) {
    const from = task.state;
    const widening = pass2Promotion(task, spec);
    if (widening) console.log(`${widening}: ${task.id}`);
    task.state = 'open';
    task.spec = spec;
    promotions.push({ task, note: `promoted into spec ${spec} (was ${from})` });
    console.log(`promoted ${task.id} into ${spec}`);
  }
  saveStoreAndWarn(tasks, config);
  recordEvents(config, 'triage', promotions.map((promotion) => subjectOf(promotion.task, promotion.note)));
}
