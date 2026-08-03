import { findProducers, type Producer } from './producers';
import { normalizePath as normalize, pathsOverlap } from './systems';
import { isBlocked, waitingOn, type Task } from './taskStore';

// A plan is a set of tasks somebody is about to dispatch concurrently. Every
// finding below is decidable from the records alone — no worker runs, no
// model is consulted, nothing is read from the tree. That is the point: the
// failures this catches are properties of the decomposition, visible before
// the first token is spent on implementing it.

export type PlanLevel = 'defect' | 'note';

export interface PlanFinding {
  level: PlanLevel;
  kind: 'overlapping-writes' | 'unstated-dependency' | 'duplicate-produces' | 'existing-producer' | 'no-write-grant' | 'unreadable-grant' | 'starts-blocked' | 'cohesion';
  message: string;
}

// A grant this check cannot resolve to a region of the tree. `covers`
// understands a literal path, a directory prefix and systems.json's
// root-level `*.ext` form; anything else containing a wildcard is a grant
// whose meaning this module would have to guess at. Guessing is what makes
// a check answer "clean" over a plan it never read.
export function isReadableGrant(path: string): boolean {
  const normalized = normalize(path);
  return !normalized.includes('*') || /^\*\.[a-z0-9]+$/.test(normalized);
}

function overlappingPaths(a: Task, b: Task): string[] {
  const shared = readableWrites(a).filter((left) => readableWrites(b).some((right) => pathsOverlap(left, right)));
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
  // How many of the plan's tasks this check could not read a region for —
  // no grant at all, or a grant it cannot resolve. A check over
  // declarations cannot see past either, and saying so is the difference
  // between "no defects" and "nothing to look at". These are one number
  // because a grant that matches nothing is a grant that is not there, and
  // counting a wildcard as read is what let a plan answer "clean" over
  // tasks nobody had compared.
  ungranted: number;
  tasks: Task[];
}

// Only the entries this module can resolve. Everything downstream compares
// these, so an unreadable entry can never produce a silent non-match.
function readableWrites(task: Task): string[] {
  return task.writes.filter(isReadableGrant);
}

// `known` is every producer that already exists — registered concepts and
// every claim any task ever made. It is built by the caller, which is the one
// party holding both the manifest and the store, and entries belonging to
// plan members are dropped here so a task can never collide with itself.
export function checkPlan(plan: Task[], all: Task[], known: Producer[] = []): PlanReport {
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

  // The same question the check above asks, widened past the dispatch set:
  // two tasks in one plan claiming one interface is the rare case, and
  // claiming something the repository already has is the common one.
  const inPlan = new Set(plan.map((task) => task.id));
  const outside = known.filter((producer) => !(producer.kind === 'task' && inPlan.has(producer.owner)));
  for (const task of plan) {
    for (const name of task.produces) {
      for (const { producer, strength } of findProducers(name, outside)) {
        if (strength === 'word') continue;
        const held = producer.kind === 'concept' ? `${producer.owner} already has it as a registered concept` : `task ${producer.owner} (${producer.state}) already claims it`;
        findings.push({
          level: strength === 'exact' ? 'defect' : 'note',
          kind: 'existing-producer',
          message: `${task.id} claims to produce "${name}", and ${held} as "${producer.name}" — reuse it, or say why a second one is right`,
        });
      }
    }
  }

  for (const task of plan) {
    if (isBlocked(task, byId)) findings.push({ level: 'note', kind: 'starts-blocked', message: `${task.id} starts blocked — it waits on ${waitingOn(task, byId).join(', ')}` });
  }

  for (const task of plan) {
    const unreadable = task.writes.filter((path) => !isReadableGrant(path));
    if (unreadable.length > 0) findings.push({ level: 'note', kind: 'unreadable-grant', message: `${task.id} declares ${unreadable.join(', ')}, which this check cannot resolve to a region — name paths or directories, or it compares nothing` });
  }

  const ungranted = plan.filter((task) => readableWrites(task).length === 0);
  for (const task of ungranted) {
    if (task.writes.length > 0) continue;
    findings.push({ level: 'note', kind: 'no-write-grant', message: `${task.id} declares no writes — nothing here can tell whether it collides with anything` });
  }

  const cohesion = cohesionFinding(plan);
  if (cohesion) findings.push(cohesion);

  return { findings, ungranted: ungranted.length, tasks: plan };
}

// Parallelism pays when the work is genuinely separable, and the cheapest
// evidence that it is not is a single path most of the plan writes to.
// Reported whether or not the overlaps are ordered: a sequence through one
// file is still one change, and adding workers to it buys nothing.
function cohesionFinding(plan: Task[]): PlanFinding | null {
  const granted = plan.filter((task) => readableWrites(task).length > 0);
  if (granted.length < 3) return null;

  const counts = new Map<string, number>();
  for (const task of granted) {
    for (const path of new Set(readableWrites(task).map(normalize))) counts.set(path, (counts.get(path) ?? 0) + 1);
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
