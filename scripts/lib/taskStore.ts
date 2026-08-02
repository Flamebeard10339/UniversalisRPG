import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type Kind = 'task' | 'finding' | 'undelivered' | 'question';
export type State = 'unreviewed' | 'open' | 'in-progress' | 'done' | 'declined';
export type Severity = 'high' | 'medium' | 'low';

export interface Source {
  spec: string;
  pass: number;
}

export interface Task {
  id: string;
  title: string;
  kind: Kind;
  state: State;
  severity: Severity | null;
  system: string | null;
  spec: string | null;
  clause: number | null;
  requires: string[];
  files: string[];
  // Forward-looking, unlike `files`, which is evidence about where
  // something was observed. `writes` is the region of the tree this task is
  // expected to touch; `produces` names what nothing owns until it lands.
  // What reads them is planCheck.
  writes: string[];
  produces: string[];
  deliverable: string | null;
  evidence: string | null;
  source: Source | null;
  reason: string | null;
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
const STATES: State[] = ['unreviewed', 'open', 'in-progress', 'done', 'declined'];
const SEVERITIES: Severity[] = ['high', 'medium', 'low'];

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
  title: true,
  kind: true,
  state: true,
  severity: true,
  system: true,
  spec: true,
  clause: true,
  requires: true,
  files: true,
  writes: true,
  produces: true,
  deliverable: true,
  evidence: true,
  source: true,
  reason: true,
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

  return {
    id,
    title: requireString(value, 'title', where),
    kind: kind as Kind,
    state: state as State,
    severity: severity as Severity | null,
    system: nullableString(value, 'system', where),
    spec: nullableString(value, 'spec', where),
    clause,
    requires: stringArray(value, 'requires', where),
    files: stringArray(value, 'files', where),
    writes: optionalStringArray(value, 'writes', where),
    produces: optionalStringArray(value, 'produces', where),
    deliverable: nullableString(value, 'deliverable', where),
    evidence: nullableString(value, 'evidence', where),
    source: nullableSource(value, where),
    reason: nullableString(value, 'reason', where),
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
    title: task.title,
    kind: task.kind,
    state: task.state,
    severity: task.severity,
    system: task.system,
    spec: task.spec,
    clause: task.clause,
    requires: task.requires,
    files: task.files,
    writes: task.writes,
    produces: task.produces,
    deliverable: task.deliverable,
    evidence: task.evidence,
    source: task.source,
    reason: task.reason,
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

// One task per line, insertion order preserved and new tasks appended: what
// changes is what moves, so concurrent branches usually merge clean.
export function saveStore(tasks: Task[], path: string = DEFAULT_STORE_PATH): void {
  const body = tasks.map((task) => renderTask(task)).join('\n');
  writeFileSync(path, body.length > 0 ? `${body}\n` : '', 'utf8');
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

// Unset ranks last: every queue below sorts high before medium before low
// before null, so this is the one comparator they all share.
const severityRank = (severity: Severity | null): number => (severity === null ? 3 : SEVERITY_RANK[severity]);

export type RequirementStatus = 'waiting' | 'done' | 'declined' | 'missing';

export interface RequirementState {
  id: string;
  status: RequirementStatus;
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
// file position, which is creation order for an append-only store.
export function fixNowQueue(tasks: Task[], spec: string | null, filter: QueueFilter = {}): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.state === 'open' && task.spec === spec)
    .filter(({ task }) => !isBlocked(task, byId))
    .filter(({ task }) => filter.system === undefined || task.system === filter.system)
    .filter(({ task }) => filter.severity === undefined || task.severity === filter.severity)
    .sort((a, b) => severityRank(a.task.severity) - severityRank(b.task.severity) || a.index - b.index)
    .map(({ task }) => task);
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

// Severity first, then creation order: the shape `triage` walks the
// unreviewed queue in.
export function unreviewedQueue(tasks: Task[]): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.state === 'unreviewed')
    .sort((a, b) => severityRank(a.task.severity) - severityRank(b.task.severity) || a.index - b.index)
    .map(({ task }) => task);
}

export interface ListFilter {
  state?: State;
  severity?: Severity;
  system?: string;
  spec?: string;
  deferred?: boolean;
  kind?: Kind;
  text?: string;
}

// Topic search until the store has a topic: the words a task already
// carries are the only thing to match on, so "combat" reaches everything
// whose id, title, system or prose mentions it.
const SEARCHABLE = (task: Task): string => [task.id, task.title, task.system, task.deliverable, task.evidence].filter(Boolean).join('\n').toLowerCase();

// The one query with no built-in state filter: with no --state, "not
// closed" (unreviewed + open) is the useful default, since done and
// declined are already resolved. Every filter given is ANDed together.
export function listQueue(tasks: Task[], filter: ListFilter = {}): Task[] {
  return tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => (filter.state !== undefined ? task.state === filter.state : task.state === 'unreviewed' || task.state === 'open' || task.state === 'in-progress'))
    .filter(({ task }) => filter.severity === undefined || task.severity === filter.severity)
    .filter(({ task }) => filter.system === undefined || task.system === filter.system)
    .filter(({ task }) => filter.spec === undefined || task.spec === filter.spec)
    .filter(({ task }) => !filter.deferred || (task.state === 'open' && task.spec === null))
    .filter(({ task }) => filter.kind === undefined || task.kind === filter.kind)
    .filter(({ task }) => filter.text === undefined || SEARCHABLE(task).includes(filter.text.toLowerCase()))
    .sort((a, b) => severityRank(a.task.severity) - severityRank(b.task.severity) || a.index - b.index)
    .map(({ task }) => task);
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
    .map((task, index) => {
      const id = task.id.toLowerCase();
      const idWords = new Set(id.split(/[^a-z0-9]+/));
      const title = task.title.toLowerCase();
      let score = id.includes(normalized) || normalized.includes(id) ? 4 : 0;
      for (const word of words) {
        if (idWords.has(word)) score += 3;
        else if (id.includes(word)) score += 2;
        else if (title.includes(word)) score += 1;
      }
      return { task, index, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
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

export function checkStore(tasks: Task[], systems: string[], specExists: (spec: string) => boolean = (spec) => existsSync(`docs/specs/${spec}.md`)): CheckIssue[] {
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
    if (task.state !== 'done' && task.state !== 'declined' && task.closed) issues.push({ level: 'warning', message: `${task.id} is ${task.state} but still carries a closed date: ${task.closed}` });
    if (task.state !== 'in-progress' && task.claimed) issues.push({ level: 'warning', message: `${task.id} is ${task.state} and still carries a claim by ${task.claimedBy ?? '(unnamed)'} from ${task.claimed}, which reads as a claim that was released` });
    if (task.kind === 'undelivered' && task.clause === null) issues.push({ level: 'error', message: `${task.id} is undelivered but names no proof clause` });
    if (task.kind !== 'undelivered' && task.clause !== null) issues.push({ level: 'error', message: `${task.id} names a proof clause but is not undelivered` });
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
