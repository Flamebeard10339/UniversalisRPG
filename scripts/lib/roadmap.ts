import { isBlocked, severityRank, waitingOn, type Task } from './taskStore';

export interface RoadmapCounts {
  total: number;
  unreviewed: number;
  inProgress: number;
  open: number;
  heldBySpec: number;
  deferred: number;
  unblocked: number;
  unblockedTasks: number;
  unblockedFindings: number;
  blocked: number;
}

export interface Waiter {
  id: string;
  alsoWaitsOn: string[];
}

export interface RoadmapTopic {
  task: Task;
  unblocks: Waiter[];
}

export interface RoadmapView {
  counts: RoadmapCounts;
  topics: RoadmapTopic[];
  blockedTopics: Task[];
  findingsBySystem: Array<[system: string, count: number]>;
}

const LIVE_STATES = new Set(['open', 'in-progress']);

// What "unblocks" counts: only records still live can be waiting on
// anything, so a done or declined dependent proves nothing about a topic's
// leverage. This is the whole ordering signal, and it is derived from
// `requires` edges rather than a priority field, so there is nothing to keep
// in sync.
function waiterIndex(tasks: Task[]): Map<string, Task[]> {
  const index = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!LIVE_STATES.has(task.state)) continue;
    for (const id of task.requires) index.set(id, [...(index.get(id) ?? []), task]);
  }
  return index;
}

// The deferred backlog is `open` with no spec: vetted work that no branch has
// claimed. `tasks next` deliberately refuses to read a null spec as this
// query, so it is computed here rather than borrowed from fixNowQueue.
export function roadmapView(tasks: Task[]): RoadmapView {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const order = new Map(tasks.map((task, index) => [task.id, index]));
  const open = tasks.filter((task) => task.state === 'open');
  const deferred = open.filter((task) => task.spec === null);
  const unblocked = deferred.filter((task) => !isBlocked(task, byId));
  const blocked = deferred.filter((task) => isBlocked(task, byId));
  const waiters = waiterIndex(tasks);

  const unblockedTasks = unblocked.filter((task) => task.kind === 'task');
  const unblockedFindings = unblocked.filter((task) => task.kind === 'finding');

  const topics: RoadmapTopic[] = unblockedTasks
    .map((task) => ({
      task,
      unblocks: (waiters.get(task.id) ?? []).map((waiter) => ({
        id: waiter.id,
        alsoWaitsOn: waitingOn(waiter, byId).filter((id) => id !== task.id),
      })),
    }))
    .sort(
      (a, b) =>
        b.unblocks.length - a.unblocks.length ||
        severityRank(a.task.severity) - severityRank(b.task.severity) ||
        (order.get(a.task.id) ?? 0) - (order.get(b.task.id) ?? 0),
    );

  const perSystem = new Map<string, number>();
  for (const finding of unblockedFindings) {
    const system = finding.system ?? '(no system)';
    perSystem.set(system, (perSystem.get(system) ?? 0) + 1);
  }

  return {
    counts: {
      total: tasks.length,
      unreviewed: tasks.filter((task) => task.state === 'unreviewed').length,
      inProgress: tasks.filter((task) => task.state === 'in-progress').length,
      open: open.length,
      heldBySpec: open.length - deferred.length,
      deferred: deferred.length,
      unblocked: unblocked.length,
      unblockedTasks: unblockedTasks.length,
      unblockedFindings: unblockedFindings.length,
      blocked: blocked.length,
    },
    topics,
    blockedTopics: blocked.filter((task) => task.kind === 'task'),
    findingsBySystem: [...perSystem].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
