import { clauseStandings, outstandingSummary, parseSpecDoc } from './specDoc';
import { isBlocked, listQueue, requirementStates, severityRank, waitingOn, type Task } from './taskStore';

// One vocabulary for the whole view, because each name asks for a different
// person: `ready` wants an implementer, `unspecced` wants a planning session,
// `blocked` wants whatever it names, `in-progress` wants nobody.
export type LiveState = 'in-progress' | 'blocked' | 'ready' | 'unspecced';

const STATE_ORDER: LiveState[] = ['ready', 'in-progress', 'blocked', 'unspecced'];

// The spec file's text, or null when the slug reads back nothing. The read
// is the caller's effect so this module stays a pure function of the store
// plus whatever the specs say.
export type ReadSpec = (slug: string) => string | null;

// Both directions of a dependency edge carry the spec at the other end: that
// is what turns a list of ids into a chain, and what separates "waiting on
// another decided branch" from "waiting on something nobody has decided".
export interface Blocker {
  id: string;
  spec: string | null;
  status: 'waiting' | 'missing';
}

export interface Waiter {
  id: string;
  spec: string | null;
  alsoWaitsOn: string[];
}

export interface RoadmapEntry {
  task: Task;
  state: LiveState;
  waitsOn: Blocker[];
  unblocks: Waiter[];
}

export interface SpecStanding {
  clauses: number;
  latestPass: number | null;
  outstanding: string;
}

export interface DecidedSpec {
  spec: string;
  // The longest chain of decided specs that must land before this one can —
  // what an ordered rendering indents by, so a chain looks like a chain.
  depth: number;
  state: LiveState;
  members: Task[];
  // Null when the slug reads back nothing: a decided branch whose promise is
  // missing is a fact the roadmap states rather than a row it drops.
  standing: SpecStanding | null;
  waitsOn: Blocker[];
  unblocks: Waiter[];
}

export interface RoadmapCounts {
  total: number;
  ready: number;
  inProgress: number;
  blocked: number;
  unspecced: number;
  findings: number;
  highFindings: number;
  otherKinds: number;
  unreviewed: number;
  archived: number;
}

export interface RoadmapView {
  counts: RoadmapCounts;
  decided: DecidedSpec[];
  topics: RoadmapEntry[];
  blocked: RoadmapEntry[];
  namedFindings: RoadmapEntry[];
  findingsBySystem: Array<[system: string, count: number]>;
}

const LIVE_STATES = new Set(['open', 'in-progress']);

export function liveStateOf(task: Task, byId: Map<string, Task>): LiveState {
  if (task.state === 'in-progress') return 'in-progress';
  if (isBlocked(task, byId)) return 'blocked';
  return task.spec === null ? 'unspecced' : 'ready';
}

function liveWaiterIndex(tasks: Task[]): Map<string, Task[]> {
  const index = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!LIVE_STATES.has(task.state)) continue;
    for (const id of task.requires) index.set(id, [...(index.get(id) ?? []), task]);
  }
  return index;
}

function blockersOf(members: Task[], byId: Map<string, Task>): Blocker[] {
  const seen = new Set<string>();
  const blockers: Blocker[] = [];
  for (const member of members) {
    for (const requirement of requirementStates(member, byId)) {
      if (requirement.status !== 'waiting' && requirement.status !== 'missing') continue;
      if (seen.has(requirement.id)) continue;
      seen.add(requirement.id);
      blockers.push({ id: requirement.id, spec: byId.get(requirement.id)?.spec ?? null, status: requirement.status });
    }
  }
  return blockers;
}

function waitersOf(members: Task[], index: Map<string, Task[]>, byId: Map<string, Task>, own: (task: Task) => boolean): Waiter[] {
  const memberIds = new Set(members.map((member) => member.id));
  const seen = new Set<string>();
  const waiters: Waiter[] = [];
  for (const member of members) {
    for (const waiter of index.get(member.id) ?? []) {
      if (own(waiter) || seen.has(waiter.id)) continue;
      seen.add(waiter.id);
      waiters.push({ id: waiter.id, spec: waiter.spec, alsoWaitsOn: waitingOn(waiter, byId).filter((id) => !memberIds.has(id)) });
    }
  }
  return waiters;
}

function specStanding(slug: string, readSpec: ReadSpec): SpecStanding | null {
  const text = readSpec(slug);
  if (text === null) return null;
  const doc = parseSpecDoc(text);
  const latest = doc.auditPasses[doc.auditPasses.length - 1];
  return {
    clauses: doc.proofClauses.length,
    latestPass: latest?.pass ?? null,
    outstanding: outstandingSummary(clauseStandings(doc.proofClauses, latest?.verdicts)),
  };
}

function specState(members: Task[], byId: Map<string, Task>): LiveState {
  if (members.some((member) => member.state === 'in-progress')) return 'in-progress';
  return members.some((member) => !isBlocked(member, byId)) ? 'ready' : 'blocked';
}

// Longest path over the decided specs only. A slug met twice on one walk is a
// cycle `doctor` already reports as an error; contributing 0 rather than
// recursing keeps a read that cannot fail from hanging on one.
function specDepths(predecessors: Map<string, string[]>): Map<string, number> {
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (slug: string): number => {
    const cached = depths.get(slug);
    if (cached !== undefined) return cached;
    if (visiting.has(slug)) return 0;
    visiting.add(slug);
    const depth = Math.max(0, ...(predecessors.get(slug) ?? []).map((predecessor) => depthOf(predecessor) + 1));
    visiting.delete(slug);
    depths.set(slug, depth);
    return depth;
  };
  for (const slug of predecessors.keys()) depthOf(slug);
  return depths;
}

// Depth-first from the specs nothing decided blocks, so a spec is printed
// directly under the last one it was waiting for and a chain reads down the
// page. Anything a cycle leaves unreachable is appended rather than dropped.
function orderSpecs(specs: DecidedSpec[], predecessors: Map<string, string[]>): DecidedSpec[] {
  const rank = new Map(specs.map((spec, index) => [spec.spec, index]));
  const bySlug = new Map(specs.map((spec) => [spec.spec, spec]));
  const successors = new Map<string, string[]>();
  for (const [slug, list] of predecessors) {
    for (const predecessor of list) successors.set(predecessor, [...(successors.get(predecessor) ?? []), slug]);
  }

  const emitted = new Set<string>();
  const order: DecidedSpec[] = [];
  const emit = (slug: string): void => {
    emitted.add(slug);
    order.push(bySlug.get(slug)!);
    const next = [...(successors.get(slug) ?? [])].sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
    for (const successor of next) {
      if (emitted.has(successor)) continue;
      if ((predecessors.get(successor) ?? []).every((predecessor) => emitted.has(predecessor))) emit(successor);
    }
  };

  for (const spec of specs) {
    if (!emitted.has(spec.spec) && (predecessors.get(spec.spec) ?? []).length === 0) emit(spec.spec);
  }
  for (const spec of specs) if (!emitted.has(spec.spec)) order.push(spec);
  return order;
}

function decidedSpecs(tasks: Task[], byId: Map<string, Task>, index: Map<string, Task[]>, readSpec: ReadSpec): DecidedSpec[] {
  const bySpec = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!LIVE_STATES.has(task.state) || task.spec === null) continue;
    bySpec.set(task.spec, [...(bySpec.get(task.spec) ?? []), task]);
  }

  const specs = [...bySpec]
    .map(([spec, members]) => ({
      spec,
      depth: 0,
      state: specState(members, byId),
      members,
      standing: specStanding(spec, readSpec),
      waitsOn: blockersOf(members, byId),
      unblocks: waitersOf(members, index, byId, (waiter) => waiter.spec === spec),
    }))
    .sort((a, b) => STATE_ORDER.indexOf(a.state) - STATE_ORDER.indexOf(b.state));

  const predecessors = new Map(specs.map((spec) => [spec.spec, [...new Set(spec.waitsOn.map((blocker) => blocker.spec).filter((slug): slug is string => slug !== null && slug !== spec.spec && bySpec.has(slug)))]]));
  const depths = specDepths(predecessors);
  for (const spec of specs) spec.depth = depths.get(spec.spec) ?? 0;
  return orderSpecs(specs, predecessors);
}

function countRecords(tasks: Task[], byId: Map<string, Task>): RoadmapCounts {
  const counts: RoadmapCounts = { total: tasks.length, ready: 0, inProgress: 0, blocked: 0, unspecced: 0, findings: 0, highFindings: 0, otherKinds: 0, unreviewed: 0, archived: 0 };
  for (const task of tasks) {
    if (task.state === 'done' || task.state === 'declined') counts.archived++;
    else if (task.state === 'unreviewed') counts.unreviewed++;
    else if (task.kind === 'finding') {
      counts.findings++;
      if (task.severity === 'high') counts.highFindings++;
    } else if (task.kind !== 'task') counts.otherKinds++;
    else if (liveStateOf(task, byId) === 'in-progress') counts.inProgress++;
    else if (liveStateOf(task, byId) === 'blocked') counts.blocked++;
    else if (liveStateOf(task, byId) === 'ready') counts.ready++;
    else counts.unspecced++;
  }
  return counts;
}

function entryOf(task: Task, byId: Map<string, Task>, index: Map<string, Task[]>): RoadmapEntry {
  return {
    task,
    state: liveStateOf(task, byId),
    waitsOn: blockersOf([task], byId),
    unblocks: waitersOf([task], index, byId, (waiter) => waiter.id === task.id),
  };
}

export function roadmapView(tasks: Task[], readSpec: ReadSpec): RoadmapView {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const index = liveWaiterIndex(tasks);

  // `backlog` is already severity-then-seq ordered — listQueue's own sort —
  // so ties here only ever need breaking on `unblocks.length` and severity;
  // a third seqRank term would be inert, since a stable sort keeps whatever
  // relative order backlog already carries whenever both compare equal.
  const backlog = listQueue(tasks, { deferred: true, kind: 'task' }).map((task) => entryOf(task, byId, index));
  const topics = backlog.filter((entry) => entry.state === 'unspecced').sort((a, b) => b.unblocks.length - a.unblocks.length || severityRank(a.task.severity) - severityRank(b.task.severity));

  const findings = listQueue(tasks, { state: 'open', kind: 'finding' });
  const perSystem = new Map<string, number>();
  for (const finding of findings.filter((finding) => finding.severity !== 'high')) {
    const system = finding.system ?? '(no system)';
    perSystem.set(system, (perSystem.get(system) ?? 0) + 1);
  }

  return {
    counts: countRecords(tasks, byId),
    decided: decidedSpecs(tasks, byId, index, readSpec),
    topics,
    blocked: backlog.filter((entry) => entry.state === 'blocked'),
    namedFindings: findings.filter((finding) => finding.severity === 'high').map((finding) => entryOf(finding, byId, index)),
    findingsBySystem: [...perSystem].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  };
}
