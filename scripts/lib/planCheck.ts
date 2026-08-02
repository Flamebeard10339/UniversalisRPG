import { isBlocked, waitingOn, type Task } from './taskStore';

// A plan is a set of tasks somebody is about to dispatch concurrently. Every
// finding below is decidable from the records alone — no worker runs, no
// model is consulted, nothing is read from the tree. That is the point: the
// failures this catches are properties of the decomposition, visible before
// the first token is spent on implementing it.

export type PlanLevel = 'defect' | 'note';

export interface PlanFinding {
  level: PlanLevel;
  kind: 'overlapping-writes' | 'unstated-dependency' | 'duplicate-produces' | 'no-write-grant' | 'starts-blocked' | 'cohesion';
  message: string;
}

// Write grants name files or directories. A directory grant covers
// everything beneath it, so `src/runtime` and `src/runtime/combat.ts`
// overlap — treating them as distinct strings would let a plan declare
// disjoint grants over the same region and pass.
function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '');
}

export function pathsOverlap(a: string, b: string): boolean {
  const [x, y] = [normalize(a), normalize(b)];
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

function overlappingPaths(a: Task, b: Task): string[] {
  const shared = a.writes.filter((left) => b.writes.some((right) => pathsOverlap(left, right)));
  return [...new Set(shared.map(normalize))].sort();
}

// Reachability over `requires`, not just a direct edge: a -> b -> c orders
// a and c as surely as a direct edge would, and reporting that chain as a
// collision would be a false positive. A report earns its reader by not
// crying wolf. The visited set makes a dependency cycle terminate here
// rather than being this module's problem — `doctor` already reports those.
function dependsOn(from: Task, target: string, byId: Map<string, Task>): boolean {
  const seen = new Set<string>([from.id]);
  const stack = [...from.requires];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const next = byId.get(id);
    if (next) stack.push(...next.requires);
  }
  return false;
}

// An ordering in either direction makes the overlap a sequence rather than
// a collision. The caller asked about a concurrent set, so the ordering is
// what makes writing the same region survivable.
function ordered(a: Task, b: Task, byId: Map<string, Task>): boolean {
  return dependsOn(a, b.id, byId) || dependsOn(b, a.id, byId);
}

function pairs<T>(items: T[]): Array<[T, T]> {
  const out: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) out.push([items[i], items[j]]);
  }
  return out;
}

export interface PlanReport {
  findings: PlanFinding[];
  // How many of the plan's tasks carry no write grant. A check over
  // declarations cannot see past a missing one, and saying so is the
  // difference between "no defects" and "nothing to look at".
  ungranted: number;
  tasks: Task[];
}

export function checkPlan(plan: Task[], all: Task[]): PlanReport {
  const findings: PlanFinding[] = [];
  const byId = new Map(all.map((task) => [task.id, task]));

  for (const [a, b] of pairs(plan)) {
    const shared = overlappingPaths(a, b);
    if (shared.length === 0) continue;
    if (ordered(a, b, byId)) continue;

    // The overlap is worse when one side is inventing something: the other
    // will be writing against an interface that does not exist yet and is
    // still moving. The remedy differs — an ordinary overlap wants the two
    // tasks merged, this one wants the edge that was left out.
    const inventor = a.produces.length > 0 ? a : b.produces.length > 0 ? b : null;
    if (inventor !== null) {
      const other = inventor === a ? b : a;
      findings.push({
        level: 'defect',
        kind: 'unstated-dependency',
        message: `${other.id} writes ${shared.join(', ')}, where ${inventor.id} is producing ${inventor.produces.join(', ')} — and ${other.id} does not require ${inventor.id}`,
      });
      continue;
    }
    findings.push({
      level: 'defect',
      kind: 'overlapping-writes',
      message: `${a.id} and ${b.id} both write ${shared.join(', ')}, and neither requires the other — this is one change, split across two workers`,
    });
  }

  // Two tasks claiming the same interface is duplication stated outright,
  // and it needs no path overlap to be true: the same module can be built
  // twice in two files.
  const claims = new Map<string, string[]>();
  for (const task of plan) {
    for (const name of task.produces) {
      const key = name.trim().toLowerCase();
      claims.set(key, [...(claims.get(key) ?? []), task.id]);
    }
  }
  for (const [name, owners] of claims) {
    if (owners.length > 1) findings.push({ level: 'defect', kind: 'duplicate-produces', message: `${owners.join(' and ')} both claim to produce "${name}" — one of them is the owner and the other is a duplicate` });
  }

  for (const task of plan) {
    if (isBlocked(task, byId)) findings.push({ level: 'note', kind: 'starts-blocked', message: `${task.id} starts blocked — it waits on ${waitingOn(task, byId).join(', ')}` });
  }

  const ungranted = plan.filter((task) => task.writes.length === 0);
  for (const task of ungranted) findings.push({ level: 'note', kind: 'no-write-grant', message: `${task.id} declares no writes — nothing here can tell whether it collides with anything` });

  const cohesion = cohesionFinding(plan);
  if (cohesion) findings.push(cohesion);

  return { findings, ungranted: ungranted.length, tasks: plan };
}

// Parallelism pays when the work is genuinely separable, and the cheapest
// evidence that it is not is a single path most of the plan writes to.
// Reported whether or not the overlaps are ordered: a sequence through one
// file is still one change, and adding workers to it buys nothing.
function cohesionFinding(plan: Task[]): PlanFinding | null {
  const granted = plan.filter((task) => task.writes.length > 0);
  if (granted.length < 3) return null;

  const counts = new Map<string, number>();
  for (const task of granted) {
    for (const path of new Set(task.writes.map(normalize))) counts.set(path, (counts.get(path) ?? 0) + 1);
  }

  let worst: [string, number] | null = null;
  for (const entry of counts) {
    if (worst === null || entry[1] > worst[1]) worst = entry;
  }
  if (worst === null || worst[1] < granted.length - 1 || worst[1] < 3) return null;

  return {
    level: 'defect',
    kind: 'cohesion',
    message: `${worst[1]} of ${granted.length} granted task(s) write ${worst[0]} — a plan concentrated in one place is one task, and more workers on it buy nothing`,
  };
}
