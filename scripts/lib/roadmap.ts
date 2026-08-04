import { isBlocked, listQueue, severityRank, waitingOn, type Task } from './taskStore';

export interface RoadmapCounts {
  total: number;
  unreviewed: number;
  inProgress: number;
  open: number;
  heldBySpec: number;
  deferred: number;
  deferredTasks: number;
  readyTasks: number;
  blockedTasks: number;
  deferredFindings: number;
  deferredOther: number;
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
  findingsBySystem: Array<[system: string, count: number]>;
}

const LIVE_STATES = new Set(['open', 'in-progress']);

function liveWaiterIndex(tasks: Task[]): Map<string, Task[]> {
  const index = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!LIVE_STATES.has(task.state)) continue;
    for (const id of task.requires) index.set(id, [...(index.get(id) ?? []), task]);
  }
  return index;
}

export function roadmapView(tasks: Task[]): RoadmapView {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const order = new Map(tasks.map((task, index) => [task.id, index]));
  const deferred = listQueue(tasks, { deferred: true });
  const waiters = liveWaiterIndex(tasks);

  const deferredTasks = deferred.filter((task) => task.kind === 'task');
  const findings = deferred.filter((task) => task.kind === 'finding');
  const other = deferred.filter((task) => task.kind !== 'task' && task.kind !== 'finding');
  const readyTasks = deferredTasks.filter((task) => !isBlocked(task, byId));
  const blockedTasks = deferredTasks.filter((task) => isBlocked(task, byId));

  const topics: RoadmapTopic[] = readyTasks
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
  for (const finding of findings) {
    const system = finding.system ?? '(no system)';
    perSystem.set(system, (perSystem.get(system) ?? 0) + 1);
  }

  const open = tasks.filter((task) => task.state === 'open');
  return {
    counts: {
      total: tasks.length,
      unreviewed: tasks.filter((task) => task.state === 'unreviewed').length,
      inProgress: tasks.filter((task) => task.state === 'in-progress').length,
      open: open.length,
      heldBySpec: open.length - deferred.length,
      deferred: deferred.length,
      deferredTasks: deferredTasks.length,
      readyTasks: readyTasks.length,
      blockedTasks: blockedTasks.length,
      deferredFindings: findings.length,
      deferredOther: other.length,
    },
    topics,
    findingsBySystem: [...perSystem].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
