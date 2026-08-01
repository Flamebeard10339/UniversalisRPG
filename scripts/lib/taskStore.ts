import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export type Kind = 'task' | 'finding' | 'undelivered';
export type State = 'unreviewed' | 'open' | 'done' | 'declined';
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
  // The proof clause id an undelivered task is bound to, and null for every
  // other kind: the binding is a number the spec file also carries, so
  // rewording the clause cannot break it.
  clause: number | null;
  requires: string[];
  files: string[];
  deliverable: string | null;
  evidence: string | null;
  source: Source | null;
  reason: string | null;
  closed: string | null;
}

export const DEFAULT_STORE_PATH = 'docs/tasks.jsonl';

export function loadStore(path: string = DEFAULT_STORE_PATH): Task[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const task = JSON.parse(line) as Task;
      return { ...task, clause: task.clause ?? null };
    });
}

// One task per line, insertion order preserved and new tasks appended: what
// changes is what moves, so concurrent branches usually merge clean.
export function saveStore(tasks: Task[], path: string = DEFAULT_STORE_PATH): void {
  const body = tasks.map((task) => JSON.stringify(task)).join('\n');
  writeFileSync(path, body.length > 0 ? `${body}\n` : '', 'utf8');
}

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

// Unset ranks last: every queue below sorts high before medium before low
// before null, so this is the one comparator they all share.
const severityRank = (severity: Severity | null): number => (severity === null ? 3 : SEVERITY_RANK[severity]);

export function isBlocked(task: Task, byId: Map<string, Task>): boolean {
  return task.requires.some((id) => byId.get(id)?.state !== 'done');
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
    .filter(({ task }) => (filter.state !== undefined ? task.state === filter.state : task.state === 'unreviewed' || task.state === 'open'))
    .filter(({ task }) => filter.severity === undefined || task.severity === filter.severity)
    .filter(({ task }) => filter.system === undefined || task.system === filter.system)
    .filter(({ task }) => filter.spec === undefined || task.spec === filter.spec)
    .filter(({ task }) => !filter.deferred || (task.state === 'open' && task.spec === null))
    .filter(({ task }) => filter.kind === undefined || task.kind === filter.kind)
    .filter(({ task }) => filter.text === undefined || SEARCHABLE(task).includes(filter.text.toLowerCase()))
    .sort((a, b) => severityRank(a.task.severity) - severityRank(b.task.severity) || a.index - b.index)
    .map(({ task }) => task);
}

export interface CheckIssue {
  level: 'error' | 'warning';
  message: string;
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
    if (task.state !== 'declined' && task.reason) issues.push({ level: 'error', message: `${task.id} has a reason but is not declined` });
    if (task.kind === 'undelivered' && task.state === 'declined') issues.push({ level: 'error', message: `${task.id} is undelivered and cannot be declined` });
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

  for (const cycle of dependencyCycles(tasks, byId)) issues.push({ level: 'error', message: `dependency cycle: ${cycle.join(' -> ')}` });

  return issues;
}

function dependencyCycles(tasks: Task[], byId: Map<string, Task>): string[][] {
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
