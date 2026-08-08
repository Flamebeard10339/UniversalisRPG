import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type Kind = 'task' | 'finding' | 'undelivered' | 'question';
export type State = 'unreviewed' | 'open' | 'in-progress' | 'done' | 'declined';
export type Severity = 'high' | 'medium' | 'low';
export type Grant = 'forecast' | 'commitment';
// `nobody` is a positive claim and not an absence: the knowledge did not
// exist when the work was briefed, which is why it is reportable and why a
// count of defects must not include it.
export type Fault = 'tooling' | 'contract' | 'nobody';
export type Decider = 'worker' | 'planner' | 'author';
// Why a record's `spec` is null, for the one case that is not simply "never
// a member": `deferred` is a scope decision made against a graded clause,
// goal still served; `unmet` is a clause `spec done --defer-open` swept out
// still failing; `retriage` is a manual pull — triage's `defer`, `spec
// remove` — that makes no claim about pass or fail at all.
export type Departure = 'deferred' | 'unmet' | 'retriage';

export interface Source {
  spec: string;
  pass: number;
}

export interface Task {
  id: string;
  // Where this record sat in the file the moment it was written, backfilled
  // once from position because creation order cannot be read back out of
  // anything else — 456 of 590 records predate the event log and only 134
  // carry an `add` event. Null is a record a checkout cut before the
  // backfill still adds after it landed; it sorts as the newest thing in the
  // store, because that is what it is the moment it merges in.
  seq: number | null;
  title: string;
  kind: Kind;
  state: State;
  severity: Severity | null;
  system: string | null;
  spec: string | null;
  // Null while `spec` is non-null. Set together with `spec` by whichever
  // route takes a record out of one — never inferred by a reader from `spec`
  // being null, which is also the state of a record that never joined one.
  departure: Departure | null;
  // The clause this record *is*: an `undelivered` member is a spec's own
  // outstanding promise on one clause, and nothing else carries it.
  clause: number | null;
  // The clauses this record's delivery would settle — a different relation
  // from `clause`, which is why it is a different field. A decomposition
  // session's whole output is this map, and without it "who owes clause 9"
  // is a text search and "which clause has no owner" is unanswerable.
  discharges: number[];
  requires: string[];
  files: string[];
  // Forward-looking, unlike `files`, which is evidence about where
  // something was observed. `writes` is the region of the tree this task is
  // expected to touch; `produces` names what nothing owns until it lands.
  // What reads them is planCheck.
  writes: string[];
  // Which side of the workflow's correction point `writes` is on. A grant
  // declared before anyone read the code is a forecast, and the honest
  // forecast is a directory; a worker that has read the region narrows it and
  // says `commitment`. Null is a record that has not said. planCheck weighs
  // the three differently, which is the whole reason the field exists.
  grant: Grant | null;
  // Which question this record feeds — fix the tooling, or brief the work
  // differently. Null on the kinds that report no cost, and on every record
  // written before the field existed; `nobody` is not that, and the two must
  // not be read as one.
  fault: Fault | null;
  // Who should decide it, for a `question`: the role whose decision would
  // hold. Null on every other kind.
  decider: Decider | null;
  produces: string[];
  deliverable: string | null;
  evidence: string | null;
  source: Source | null;
  reason: string | null;
  // A condition for revisiting a decline, stated once so a queue can hold
  // it rather than a reader having to notice it inside `reason`'s prose.
  // Optional: most declines close the question outright and name no
  // condition under which they would be reopened.
  trigger: string | null;
  closed: string | null;
  closedCommit: string | null;
  claimed: string | null;
  claimedBy: string | null;
  // Fields a store line carried that this version of Task does not know
  // about — kept so an old checkout's `tasks add`/`edit` cannot silently
  // erase a field a concurrent branch is adding, the mirror of the store's
  // own forward-compat problem for `state`. null, never {}, when a line has
  // none.
  extra: Record<string, unknown> | null;
}

export class StoreError extends Error {}

export const DEFAULT_STORE_PATH = 'docs/tasks.jsonl';

export const KINDS: Kind[] = ['task', 'finding', 'undelivered', 'question'];
export const STATES: State[] = ['unreviewed', 'open', 'in-progress', 'done', 'declined'];
export const GRANTS: Grant[] = ['forecast', 'commitment'];
export const FAULTS: Fault[] = ['tooling', 'contract', 'nobody'];
export const DECIDERS: Decider[] = ['worker', 'planner', 'author'];
export const DEPARTURES: Departure[] = ['deferred', 'unmet', 'retriage'];
const SEVERITIES: Severity[] = ['high', 'medium', 'low'];

// The kinds that report what working the process cost. A `task` is planned
// work and an `undelivered` record is a clause verdict the spec document
// already carries; neither is a report of a cost.
export const REPORTING_KINDS: Kind[] = ['finding', 'question'];

export function reportsCost(kind: Kind): boolean {
  return REPORTING_KINDS.includes(kind);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new StoreError(`${where}: task ${JSON.stringify(record.id ?? '(unknown)')} requires ${key}`);
  return value;
}

function nullableString(record: Record<string, unknown>, key: string, where: string): string | null {
  const value = record[key] ?? null;
  if (value !== null && typeof value !== 'string') throw new StoreError(`${where}: task ${JSON.stringify(record.id ?? '(unknown)')} has non-string ${key}`);
  return value;
}

function stringArray(record: Record<string, unknown>, key: string, where: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new StoreError(`${where}: task ${JSON.stringify(record.id ?? '(unknown)')} requires ${key} as a string array`);
  return value;
}

// A field added after records already existed. Absent means empty, so a
// record written before the field was introduced still parses; present but
// the wrong shape is still malformed, so a typo is not silently an empty
// list. Neither `requires` nor `files` can use this — every record has
// carried both since the store's first line, and defaulting them would turn
// a truncated record into a valid one.
function optionalStringArray(record: Record<string, unknown>, key: string, where: string): string[] {
  if (record[key] === undefined) return [];
  return stringArray(record, key, where);
}

// The numeric twin of optionalStringArray, with the same absent-means-empty
// contract and the same refusal of a present-but-wrong shape.
function optionalNumberArray(record: Record<string, unknown>, key: string, where: string): number[] {
  const value = record[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'number')) throw new StoreError(`${where}: task ${JSON.stringify(record.id ?? '(unknown)')} requires ${key} as a number array`);
  return value as number[];
}

function nullableSource(record: Record<string, unknown>, where: string): Source | null {
  const value = record.source ?? null;
  if (value === null) return null;
  if (!isRecord(value) || typeof value.spec !== 'string' || typeof value.pass !== 'number') throw new StoreError(`${where}: task ${JSON.stringify(record.id ?? '(unknown)')} has malformed source`);
  return { spec: value.spec, pass: value.pass };
}

// The known Task fields a store line may carry, derived once from an
// exhaustively-checked literal (below) so this and renderTask's canonical
// key order can never disagree about what "known" means.
type KnownFields = Omit<Task, 'extra'>;
const KNOWN_KEYS: ReadonlyArray<keyof KnownFields> = Object.keys({
  id: true,
  seq: true,
  title: true,
  kind: true,
  state: true,
  severity: true,
  system: true,
  spec: true,
  departure: true,
  clause: true,
  discharges: true,
  requires: true,
  files: true,
  writes: true,
  grant: true,
  fault: true,
  decider: true,
  produces: true,
  deliverable: true,
  evidence: true,
  source: true,
  reason: true,
  trigger: true,
  closed: true,
  closedCommit: true,
  claimed: true,
  claimedBy: true,
} satisfies Record<keyof KnownFields, true>) as ReadonlyArray<keyof KnownFields>;
const KNOWN_KEY_SET = new Set<string>(KNOWN_KEYS);

function extraFields(record: Record<string, unknown>): Record<string, unknown> | null {
  const unknownKeys = Object.keys(record).filter((key) => !KNOWN_KEY_SET.has(key));
  if (unknownKeys.length === 0) return null;
  const extra: Record<string, unknown> = {};
  for (const key of unknownKeys) extra[key] = record[key];
  return extra;
}

function normalizeTask(value: unknown, where: string): Task {
  if (!isRecord(value)) throw new StoreError(`${where}: task record must be an object`);

  const id = requireString(value, 'id', where);
  const kind = requireString(value, 'kind', where);
  if (!KINDS.includes(kind as Kind)) throw new StoreError(`${where}: task ${JSON.stringify(id)} has invalid kind: ${kind}`);

  const state = requireString(value, 'state', where);
  if (!STATES.includes(state as State)) throw new StoreError(`${where}: task ${JSON.stringify(id)} has invalid state: ${state}`);

  const severity = value.severity ?? null;
  if (severity !== null && (typeof severity !== 'string' || !SEVERITIES.includes(severity as Severity))) throw new StoreError(`${where}: task ${JSON.stringify(id)} has invalid severity: ${String(severity)}`);

  const clause = value.clause ?? null;
  if (clause !== null && typeof clause !== 'number') throw new StoreError(`${where}: task ${JSON.stringify(id)} has non-numeric clause`);

  // Absent the same way `clause` is: a record written before this field
  // existed, or by a branch that still does not know it exists, is not
  // malformed — it is a record with no opinion on its own position.
  const seq = value.seq ?? null;
  if (seq !== null && typeof seq !== 'number') throw new StoreError(`${where}: task ${JSON.stringify(id)} has non-numeric seq`);

  // Absent means the record has not said which side of the correction point
  // its grant is on, which is a third answer and not a default to either.
  const grant = value.grant ?? null;
  if (grant !== null && (typeof grant !== 'string' || !GRANTS.includes(grant as Grant))) throw new StoreError(`${where}: task ${JSON.stringify(id)} has invalid grant: ${String(grant)}`);

  // Absent is a record written before the channel existed, which is not the
  // same answer as `nobody` and is not defaulted to it.
  const fault = value.fault ?? null;
  if (fault !== null && (typeof fault !== 'string' || !FAULTS.includes(fault as Fault))) throw new StoreError(`${where}: task ${JSON.stringify(id)} has invalid fault: ${String(fault)}`);

  const decider = value.decider ?? null;
  if (decider !== null && (typeof decider !== 'string' || !DECIDERS.includes(decider as Decider))) throw new StoreError(`${where}: task ${JSON.stringify(id)} has invalid decider: ${String(decider)}`);

  // Absent is every record written before this field existed, or one that
  // has never left a spec — both read the same as "not recorded", which is
  // what null already means for a field the store learns to carry mid-flight.
  const departure = value.departure ?? null;
  if (departure !== null && (typeof departure !== 'string' || !DEPARTURES.includes(departure as Departure))) throw new StoreError(`${where}: task ${JSON.stringify(id)} has invalid departure: ${String(departure)}`);

  return {
    id,
    seq,
    title: requireString(value, 'title', where),
    kind: kind as Kind,
    state: state as State,
    severity: severity as Severity | null,
    system: nullableString(value, 'system', where),
    spec: nullableString(value, 'spec', where),
    departure: departure as Departure | null,
    clause,
    discharges: optionalNumberArray(value, 'discharges', where),
    requires: stringArray(value, 'requires', where),
    files: stringArray(value, 'files', where),
    writes: optionalStringArray(value, 'writes', where),
    grant: grant as Grant | null,
    fault: fault as Fault | null,
    decider: decider as Decider | null,
    produces: optionalStringArray(value, 'produces', where),
    deliverable: nullableString(value, 'deliverable', where),
    evidence: nullableString(value, 'evidence', where),
    source: nullableSource(value, where),
    reason: nullableString(value, 'reason', where),
    trigger: nullableString(value, 'trigger', where),
    closed: nullableString(value, 'closed', where),
    closedCommit: nullableString(value, 'closedCommit', where),
    claimed: nullableString(value, 'claimed', where),
    claimedBy: nullableString(value, 'claimedBy', where),
    extra: extraFields(value),
  };
}

// The object literal below is typed as an exact mapped type over every
// known Task field, so removing a field from Task without removing it here
// is a missing-property compile error, and forgetting to add a new Task
// field here is the same error the other way — the two ways this function
// could silently drop data are both caught by tsc, not by review.
function renderTask(task: Task): string {
  const known: { [K in keyof KnownFields]: KnownFields[K] } = {
    id: task.id,
    seq: task.seq,
    title: task.title,
    kind: task.kind,
    state: task.state,
    severity: task.severity,
    system: task.system,
    spec: task.spec,
    departure: task.departure,
    clause: task.clause,
    discharges: task.discharges,
    requires: task.requires,
    files: task.files,
    writes: task.writes,
    grant: task.grant,
    fault: task.fault,
    decider: task.decider,
    produces: task.produces,
    deliverable: task.deliverable,
    evidence: task.evidence,
    source: task.source,
    reason: task.reason,
    trigger: task.trigger,
    closed: task.closed,
    closedCommit: task.closedCommit,
    claimed: task.claimed,
    claimedBy: task.claimedBy,
  };
  const merged: Record<string, unknown> = known;
  if (task.extra) {
    for (const key of Object.keys(task.extra).sort()) merged[key] = task.extra[key];
  }
  return JSON.stringify(merged);
}

export interface RecordCore {
  id: string;
  seq: number;
  title: string;
  state: State;
}
type Core = RecordCore;

// What a route must decide before a record exists. `finding` and `question`
// report a cost, so tsc refuses to assemble either without a fault, and
// refuses a question without the role whose decision would hold — the check
// is on the shape of the call rather than on each route remembering to make
// it, which is why a route added later cannot skip it and compile.
export type NewRecord =
  | (Core & { kind: 'task' | 'undelivered'; fault?: never; decider?: never })
  | (Core & { kind: 'finding'; fault: Fault; decider?: never })
  | (Core & { kind: 'question'; fault: Fault; decider: Decider });

export type Draft = Partial<Omit<Task, keyof Core | 'kind' | 'fault' | 'decider'>>;

// The one assembly point for a new record. Its literal is typed as the whole
// Task, so a field added to Task without a default here is a compile error
// rather than an `undefined` a route happens not to set.
export function createTask(record: NewRecord, draft: Draft = {}): Task {
  return {
    id: record.id,
    seq: record.seq,
    title: record.title,
    kind: record.kind,
    state: record.state,
    severity: null,
    system: null,
    spec: null,
    departure: null,
    clause: null,
    discharges: [],
    requires: [],
    files: [],
    writes: [],
    grant: null,
    fault: record.fault ?? null,
    decider: record.decider ?? null,
    produces: [],
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    trigger: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
    ...draft,
  };
}

// The one route that takes an existing record out of a spec. `spec` and
// `departure` change together because a caller able to set one without the
// other is exactly the confusion this pair of fields exists to rule out.
export function departFromSpec(task: Task, reason: Departure): void {
  task.spec = null;
  task.departure = reason;
}

export type Resolved<T> = { value: T } | { error: string };

// One refusal text for every route that takes a fault from a caller, so the
// routes that can create a record cannot disagree about what one is. A
// reporting kind narrows the result to a `Fault`, which is what lets a caller
// that already knows its kind hand the value straight to `createTask`.
export function resolveFault(kind: 'finding' | 'question', given: string | undefined): Resolved<Fault>;
export function resolveFault(kind: Kind, given: string | undefined): Resolved<Fault | null>;
export function resolveFault(kind: Kind, given: string | undefined): Resolved<Fault | null> {
  if (given === undefined) {
    if (!reportsCost(kind)) return { value: null };
    return { error: `error: a ${kind} record needs --fault ${FAULTS.join('|')} — whether the tooling, the contract that briefed the work, or nobody is at fault` };
  }
  if (!FAULTS.includes(given as Fault)) return { error: `error: --fault must be one of ${FAULTS.join(', ')}` };
  if (!reportsCost(kind)) return { error: `error: a ${kind} record carries no fault — only ${REPORTING_KINDS.join(' and ')} records report what the work cost` };
  return { value: given as Fault };
}

export function resolveDecider(kind: 'question', given: string | undefined): Resolved<Decider>;
export function resolveDecider(kind: Kind, given: string | undefined): Resolved<Decider | null>;
export function resolveDecider(kind: Kind, given: string | undefined): Resolved<Decider | null> {
  if (given === undefined) {
    if (kind !== 'question') return { value: null };
    return { error: `error: a question record needs --decider ${DECIDERS.join('|')} — a question parked with no decider is a stall with extra steps` };
  }
  if (!DECIDERS.includes(given as Decider)) return { error: `error: --decider must be one of ${DECIDERS.join(', ')}` };
  if (kind !== 'question') return { error: `error: a ${kind} record carries no decider — only a question names who should decide it` };
  return { value: given as Decider };
}

// `label` is the `where`-prefix for error messages — a file path for
// `loadStore`, or a `path@revision` tag for text read out of git history by a
// working-tree comparison, which has no path on disk to name.
function storeLines(text: string, label: string): Array<{ line: string; where: string }> {
  return text
    .split('\n')
    .map((line, index) => ({ line: line.trim(), where: `${label}:${index + 1}` }))
    .filter(({ line }) => line.length > 0);
}

function parseLine(line: string, where: string): Task {
  try {
    return normalizeTask(JSON.parse(line) as unknown, where);
  } catch (error) {
    if (error instanceof SyntaxError) throw new StoreError(`${where}: malformed JSONL task record: ${error.message}`);
    throw error;
  }
}

export function parseStore(text: string, label: string): Task[] {
  return storeLines(text, label).map(({ line, where }) => parseLine(line, where));
}

export interface ToleratedStore {
  tasks: Task[];
  skipped: string[];
}

// The tolerant twin of parseStore, for readers only. A writer must keep
// using parseStore: saveStore rewrites the whole file from the tasks it was
// given, so saving a store parsed this way would delete the very lines this
// skipped.
export function parseStoreTolerantly(text: string, label: string): ToleratedStore {
  const tasks: Task[] = [];
  const skipped: string[] = [];
  for (const { line, where } of storeLines(text, label)) {
    try {
      tasks.push(parseLine(line, where));
    } catch (error) {
      if (!(error instanceof StoreError)) throw error;
      skipped.push(error.message);
    }
  }
  return { tasks, skipped };
}

export function loadStore(path: string = DEFAULT_STORE_PATH): Task[] {
  if (!existsSync(path)) return [];
  return parseStore(readFileSync(path, 'utf8'), path);
}

export function loadStoreTolerantly(path: string = DEFAULT_STORE_PATH): ToleratedStore {
  if (!existsSync(path)) return { tasks: [], skipped: [] };
  return parseStoreTolerantly(readFileSync(path, 'utf8'), path);
}

// One task per line, in id order — the file on disk is a function of the
// record set alone, never of what order the caller happened to build it in.
// A line only ever moves when the id set itself changes, so two branches
// editing different records touch different lines and git's ordinary
// three-way merge resolves them per record; the residual is two branches
// each inserting a new, id-adjacent line, which lands at the same position
// on both sides and conflicts once, in the shape a human resolves by keeping
// both.
export function saveStore(tasks: Task[], path: string = DEFAULT_STORE_PATH): void {
  const sorted = [...tasks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const body = sorted.map((task) => renderTask(task)).join('\n');
  writeFileSync(path, body.length > 0 ? `${body}\n` : '', 'utf8');
}

// The next position a newly created record takes. Both sides of a parallel
// add compute this from what they can each see and neither sees the other,
// so two branches can produce the same number — harmless, because `seq`
// orders a queue and does not identify a record.
export function nextSeq(tasks: Task[]): number {
  return tasks.reduce((max, task) => (task.seq !== null && task.seq > max ? task.seq : max), 0) + 1;
}

// The one-time move from position to data, for a store where creation order
// still lives only in where a line sits: a record with no `seq` takes one
// from its position in the array given, in order, continuing after whatever
// `seq` the store's other records already carry. A record that already has
// one is left untouched, so this is idempotent — running it again once
// every record carries `seq` changes nothing. Run once, by hand, over
// `docs/tasks.jsonl` through `npm run inspect`; nothing in the ordinary
// command surface calls it.
export function backfillSeq(tasks: Task[]): Task[] {
  let next = nextSeq(tasks);
  return tasks.map((task) => (task.seq !== null ? task : { ...task, seq: next++ }));
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

// Unset ranks last: every queue below sorts high before medium before low
// before null, so this is the one comparator they all share.
export const severityRank = (severity: Severity | null): number => (severity === null ? 3 : SEVERITY_RANK[severity]);

// The tie-break every queue below shares once severity (or score) is equal:
// oldest first. A null `seq` ranks after every number, because it can only
// belong to a record a branch cut before the backfill added after — the
// newest thing in the store the moment it merges in, whatever position it
// happened to land at in its own branch's file.
export const seqRank = (seq: number | null): number => (seq === null ? Number.POSITIVE_INFINITY : seq);

export type RequirementStatus = 'waiting' | 'done' | 'declined' | 'missing';

export interface RequirementState {
  id: string;
  status: RequirementStatus;
}

// Every proof clause a record answers for, from both fields that can carry
// one: `discharges` is what a slice promises to settle, and an `undelivered`
// record's `clause` is the promise it *is*. Two relations, one question —
// and asking it in two places is what let `work-prompt` read only the field
// that `doctor` guarantees is null for an ordinary task.
export function clausesOf(task: Task): number[] {
  return [...new Set([...task.discharges, ...(task.clause === null ? [] : [task.clause])])].sort((a, b) => a - b);
}

export function requirementStates(task: Task, byId: Map<string, Task>): RequirementState[] {
  return task.requires.map((id) => {
    const dep = byId.get(id);
    if (dep === undefined) return { id, status: 'missing' };
    if (dep.state === 'done') return { id, status: 'done' };
    if (dep.state === 'declined') return { id, status: 'declined' };
    return { id, status: 'waiting' };
  });
}

// A requirement holds the task up until some record says it does not.
// `done` releases it and `declined` releases it — both are records that
// answered. `missing` is not an answer: nothing in the store can say the
// prerequisite happened, so presenting the task as ready asserts something
// no record supports. The two blocking statuses stay distinct in
// requirementStates because "not yet" and "nobody can say" are different
// answers to print, and only the second is also a doctor error.
export function waitingOn(task: Task, byId: Map<string, Task>): string[] {
  return requirementStates(task, byId)
    .filter((requirement) => requirement.status === 'waiting' || requirement.status === 'missing')
    .map((requirement) => requirement.id);
}

export function isBlocked(task: Task, byId: Map<string, Task>): boolean {
  return waitingOn(task, byId).length > 0;
}

export interface QueueFilter {
  system?: string;
  severity?: Severity;
}

// Fix-now: open, a member of the given spec, and unblocked. Ties break by
// `seq`, oldest first.
export function fixNowQueue(tasks: Task[], spec: string | null, filter: QueueFilter = {}): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks
    .filter((task) => task.state === 'open' && task.spec === spec)
    .filter((task) => !isBlocked(task, byId))
    .filter((task) => filter.system === undefined || task.system === filter.system)
    .filter((task) => filter.severity === undefined || task.severity === filter.severity)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || seqRank(a.seq) - seqRank(b.seq));
}

// The queue fixNowQueue cannot answer for: an in-progress record is held,
// not open, so without this a dead worker's claim removes the work from
// every queue and nothing ever says so. Coldest first — the claim most
// likely abandoned is the one a caller should be offered first. Reported
// only; nothing here writes.
export function coldClaims(tasks: Task[], spec: string | null, today: string, filter: QueueFilter = {}): Task[] {
  return tasks
    .filter((task) => task.state === 'in-progress' && task.spec === spec)
    .filter((task) => filter.system === undefined || task.system === filter.system)
    .filter((task) => filter.severity === undefined || task.severity === filter.severity)
    .filter((task) => isColdClaim(task, today))
    .sort((a, b) => (claimOf(b, today)?.days ?? 0) - (claimOf(a, today)?.days ?? 0));
}

// The findings a spec's own audit passes filed that triage has not admitted
// yet. `spec` on the record stays null until a human moves it — this reads
// the provenance the record already carries, so spec-scoped views can show
// what the spec's audits raised without pretending triage happened.
export function unreviewedFiledBy(tasks: Task[], spec: string): Task[] {
  return unreviewedQueue(tasks).filter((task) => task.source?.spec === spec);
}

// Severity first, then `seq`: the shape `triage` walks the unreviewed queue
// in.
export function unreviewedQueue(tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.state === 'unreviewed')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || seqRank(a.seq) - seqRank(b.seq));
}

export interface ListFilter {
  state?: State;
  severity?: Severity;
  system?: string;
  spec?: string;
  deferred?: boolean;
  // Every open task naming no spec, whatever the reason — the roadmap's own
  // backlog question, and a different one from `deferred`'s scope-decision
  // reading: a record `--defer-open` swept out unmet is unspecced too.
  unspecced?: boolean;
  kind?: Kind;
  text?: string;
  // A declined record carrying a trigger: the store's shape for "revisit
  // this if a condition holds", filed as a decline rather than left as prose
  // only `tasks log` or a lucky search would ever surface.
  triggered?: boolean;
}

// Topic search until the store has a topic: the words a task already
// carries are the only thing to match on, so "combat" reaches everything
// whose id, title, system or prose mentions it. The labelled list is the
// one definition of "searchable" — `search` reports which field matched
// from the same list this filters by, so the two cannot disagree. `reason`
// is where a decline's whole argument lives — a ruling with no `writes` or
// `files` to be found by, the way `audit-loop-costs-less-clause-5` is found
// by nothing else in this list.
export const SEARCH_FIELDS: Array<[label: string, read: (task: Task) => string | null]> = [
  ['id', (task) => task.id],
  ['title', (task) => task.title],
  ['system', (task) => task.system],
  ['deliverable', (task) => task.deliverable],
  ['evidence', (task) => task.evidence],
  ['reason', (task) => task.reason],
  ['trigger', (task) => task.trigger],
];

const SEARCHABLE = (task: Task): string =>
  SEARCH_FIELDS.map(([, read]) => read(task))
    .filter(Boolean)
    .join('\n')
    .toLowerCase();

// A query is every word it contains, each required somewhere in the
// haystack — not the query as one contiguous phrase. "user interface" still
// finds a system field that spells it exactly, since a phrase's own words are
// each present; "faking git" finds a reason that reads "faking the git
// subprocesses" without the two words touching, which a plain
// `.includes(term)` never would. A search term is typed by a human choosing
// their own words, not a name two authors have to agree on, so there is no
// stopword list here the way `producers.ts` keeps one for capability names.
export function matchesSearchTerm(haystack: string, term: string): boolean {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  const text = haystack.toLowerCase();
  return words.length > 0 && words.every((word) => text.includes(word));
}

// The one query with no built-in state filter: with no --state, "not
// closed" (unreviewed + open) is the useful default for a queue view, since
// done and declined are already resolved and are not what `list` is for.
// `search` and `--triggered` share this filter and are a different
// question — closed work is where the prior art that bites lives, the same
// fact the 2026-08-04 prior-art ruling already settled for `tasks where`, and
// a trigger's whole point is a declined record — so either reaches every
// state rather than inheriting the queue's default; `--state` still narrows
// any of them the same way. Every filter given is ANDed together.
export function listQueue(tasks: Task[], filter: ListFilter = {}): Task[] {
  return tasks
    .filter((task) => {
      if (filter.state !== undefined) return task.state === filter.state;
      if (filter.text !== undefined || filter.triggered) return true;
      return task.state === 'unreviewed' || task.state === 'open' || task.state === 'in-progress';
    })
    .filter((task) => filter.severity === undefined || task.severity === filter.severity)
    .filter((task) => filter.system === undefined || task.system === filter.system)
    .filter((task) => filter.spec === undefined || task.spec === filter.spec)
    // `deferred` here means the scope decision, read from `departure` rather
    // than inferred from `spec` being null — a record `--defer-open` swept
    // out still failing carries `departure: 'unmet'` and is reachable by a
    // plain `tasks list`, but is not what this flag answers.
    .filter((task) => !filter.deferred || (task.state === 'open' && task.departure === 'deferred'))
    .filter((task) => !filter.unspecced || (task.state === 'open' && task.spec === null))
    .filter((task) => filter.kind === undefined || task.kind === filter.kind)
    .filter((task) => filter.text === undefined || matchesSearchTerm(SEARCHABLE(task), filter.text))
    .filter((task) => !filter.triggered || (task.state === 'declined' && task.trigger !== null))
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || seqRank(a.seq) - seqRank(b.seq));
}

// An id that resolves to nothing is a guess that missed, and the guess is
// usually close: ids are hyphenated words, so a shared word is the signal.
// Whole-id containment outranks it, because `pass1-check` against
// `pass1-check-merge-shell` is a prefix a caller truncated, not a coincidence.
export function nearMatches(query: string, tasks: Task[], limit = 5): Task[] {
  const normalized = query.toLowerCase();
  const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];
  return tasks
    .map((task) => {
      const id = task.id.toLowerCase();
      const idWords = new Set(id.split(/[^a-z0-9]+/));
      const title = task.title.toLowerCase();
      let score = id.includes(normalized) || normalized.includes(id) ? 4 : 0;
      for (const word of words) {
        if (idWords.has(word)) score += 3;
        else if (id.includes(word)) score += 2;
        else if (title.includes(word)) score += 1;
      }
      return { task, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || seqRank(a.task.seq) - seqRank(b.task.seq))
    .slice(0, limit)
    .map((entry) => entry.task);
}

export interface CheckIssue {
  level: 'error' | 'warning';
  message: string;
}

// One number, in one place, until someone needs to tune it. Past this many
// days with no activity a claim is *reported* cold and never released:
// releasing it would put two agents on one task, while telling the next
// agent who holds it and for how long lets that agent decide in one read.
export const COLD_CLAIM_DAYS = 3;

export interface Claim {
  by: string | null;
  since: string;
  // Null when `since` is not a date this can read. An unreadable claim is
  // reported with its age unknown — never assumed fresh, never assumed cold.
  days: number | null;
  cold: boolean;
}

export function claimOf(task: Task, today: string): Claim | null {
  if (task.claimed === null) return null;
  const by = task.claimedBy;
  const since = Date.parse(`${task.claimed}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(since) || Number.isNaN(now)) return { by, since: task.claimed, days: null, cold: false };
  const days = Math.floor((now - since) / 86_400_000);
  return { by, since: task.claimed, days, cold: days >= COLD_CLAIM_DAYS };
}

// The one rendering of a claim, shared by every command that mentions one.
export function claimSummary(task: Task, today: string): string | null {
  const claim = claimOf(task, today);
  if (claim === null) return null;
  const holder = `claimed by ${claim.by ?? '(unnamed)'} since ${claim.since}`;
  if (claim.days === null) return `${holder} (unreadable date, so its age is unknown)`;
  const age = `${claim.days} day${claim.days === 1 ? '' : 's'}`;
  return `${holder} (${age}${claim.cold ? `, COLD — past the ${COLD_CLAIM_DAYS}-day threshold, never auto-released` : ''})`;
}

// `in-progress` is the only state that means someone is holding the record,
// so a claim left on any other state is history, not a live hold.
export function isColdClaim(task: Task, today: string): boolean {
  return task.state === 'in-progress' && (claimOf(task, today)?.cold ?? false);
}

// Separate from checkStore because coldness is the one thing here that
// depends on a clock, and a clock is an effect the caller passes in.
export function coldClaimIssues(tasks: Task[], today: string): CheckIssue[] {
  return tasks
    .filter((task) => isColdClaim(task, today))
    .map((task) => ({
      level: 'warning' as const,
      message: `${task.id} ${claimSummary(task, today)}; \`tasks start ${task.id} --actor <you>\` takes it over and \`tasks stop ${task.id}\` returns it to the queue`,
    }));
}

// `specExists` has no default on purpose: the spec directory is the
// caller's configuration, and a default here would hard-code a path that
// `specFile` owns.
export function checkStore(tasks: Task[], systems: string[], specExists: (spec: string) => boolean): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.id)) issues.push({ level: 'error', message: `duplicate id: ${task.id}` });
    seen.add(task.id);
  }

  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    for (const dep of task.requires) {
      if (!byId.has(dep)) issues.push({ level: 'error', message: `${task.id} requires unresolved id: ${dep}` });
    }
    if (task.state === 'declined' && !task.reason) issues.push({ level: 'error', message: `${task.id} is declined but has no reason` });
    if (task.state !== 'declined' && task.reason) issues.push({ level: 'warning', message: `${task.id} is ${task.state} and carries a decline reason, which reads as a decline that was reopened: ${task.reason}` });
    if (task.state !== 'declined' && task.trigger) issues.push({ level: 'warning', message: `${task.id} is ${task.state} and carries a decline trigger, which reads as a decline that was reopened: ${task.trigger}` });
    if (task.state !== 'done' && task.state !== 'declined' && task.closed) issues.push({ level: 'warning', message: `${task.id} is ${task.state} but still carries a closed date: ${task.closed}` });
    if (task.state !== 'in-progress' && task.claimed) issues.push({ level: 'warning', message: `${task.id} is ${task.state} and still carries a claim by ${task.claimedBy ?? '(unnamed)'} from ${task.claimed}, which reads as a claim that was released` });
    if (task.grant !== null && task.writes.length === 0) issues.push({ level: 'warning', message: `${task.id} calls its write grant a ${task.grant} and grants nothing — the kind describes \`writes\`, which is empty` });
    if (task.kind === 'undelivered' && task.clause === null) issues.push({ level: 'error', message: `${task.id} is undelivered but names no proof clause` });
    if (task.kind !== 'undelivered' && task.clause !== null) issues.push({ level: 'error', message: `${task.id} names a proof clause but is not undelivered` });
    if (task.discharges.length > 0 && task.spec === null) issues.push({ level: 'error', message: `${task.id} claims to discharge clause(s) ${task.discharges.join(', ')} and names no spec, so there is no document those numbers refer to` });
    if (task.system !== null && !systems.includes(task.system)) issues.push({ level: 'error', message: `${task.id} has a system not in systems.json: ${task.system}` });
    if (task.spec !== null && !specExists(task.spec)) issues.push({ level: 'error', message: `${task.id} references a spec with no file: ${task.spec}` });
    for (const file of task.files) {
      // A doc backlink is `path#H1`, a code reference is `path:88` — strip
      // whichever suffix is present before checking the path itself exists.
      const path = file.split(/[:#]/)[0];
      if (!existsSync(path)) issues.push({ level: 'warning', message: `${task.id} lists a file that no longer exists: ${file}` });
    }
  }

  for (const cycle of dependencyCycles(tasks)) issues.push({ level: 'error', message: `dependency cycle: ${cycle.join(' -> ')}` });

  return issues;
}

export function dependencyCycles(tasks: Task[]): string[][] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];
  const reported = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): void {
    color.set(id, GRAY);
    stack.push(id);
    for (const dep of byId.get(id)?.requires ?? []) {
      if (!byId.has(dep)) continue;
      const depColor = color.get(dep) ?? WHITE;
      if (depColor === WHITE) visit(dep);
      else if (depColor === GRAY) {
        const start = stack.indexOf(dep);
        const cycle = [...stack.slice(start), dep];
        const key = [...cycle].sort().join(',');
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push(cycle);
        }
      }
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const task of tasks) {
    if ((color.get(task.id) ?? WHITE) === WHITE) visit(task.id);
  }
  return cycles;
}
