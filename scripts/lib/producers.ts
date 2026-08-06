import type { TaskEvent } from './eventLog';
import { allConcepts, canonicalPath, pathsOverlap, type Concept, type Manifest } from './systems';
import type { State, Task } from './taskStore';

// "Does anything already do this?" — the question a worker is supposed to ask
// before building, and the one the store could not answer. `produces` has
// been on the record since the plan-check landed, but only `checkPlan`
// consulted it and only within a single dispatch set, so a claim went inert
// the moment its task closed. This module is the reader that spans both
// halves: the concepts a system has registered, and every claim any task ever
// made, open or closed.

export type ProducerKind = 'concept' | 'task';

export interface Producer {
  name: string;
  kind: ProducerKind;
  // The system that registered the concept, or the id of the task that
  // claimed it.
  owner: string;
  // Where the claim is written down, for a reader who wants to go and look.
  where: string;
  // A task's standing at the time it claimed. A closed task's claim is
  // something that shipped; an open one's is a claim in flight, and the two
  // call for different responses.
  state: State | null;
}

export function producerIndex(manifest: Manifest, tasks: Task[]): Producer[] {
  const concepts: Producer[] = allConcepts(manifest).map(({ system, concept }) => ({
    name: concept.name,
    kind: 'concept',
    owner: system.name,
    where: `${system.name} in docs/audits/systems.json`,
    state: null,
  }));
  const claims: Producer[] = tasks.flatMap((task) => task.produces.map((name) => ({ name, kind: 'task' as const, owner: task.id, where: `task ${task.id}`, state: task.state })));
  return [...concepts, ...claims];
}

// Words this short carry no topic, and matching on them makes every query
// hit everything. Kept tiny on purpose: a stopword list that grows is a
// relevance heuristic pretending to be a rule.
const NOISE = new Set(['the', 'and', 'for', 'its', 'a', 'an', 'of', 'to']);

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function words(name: string): string[] {
  return normalizeName(name)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !NOISE.has(word));
}

// `exact` is the same capability under the same name. `contains` is one name
// inside the other — "buff engine" against "buff". `word` is a shared topic
// word and nothing more, which is a lead rather than a finding.
export type MatchStrength = 'exact' | 'contains' | 'word';

export interface ProducerMatch {
  producer: Producer;
  strength: MatchStrength;
  // The word that matched, when that is all there was. Without it a `word`
  // hit gives a reader no way to judge it.
  on: string | null;
}

const RANK: Record<MatchStrength, number> = { exact: 0, contains: 1, word: 2 };

export function matchStrength(query: string, name: string): { strength: MatchStrength; on: string | null } | null {
  const [q, n] = [normalizeName(query), normalizeName(name)];
  if (q === '' || n === '') return null;
  if (q === n) return { strength: 'exact', on: null };
  if (q.includes(n) || n.includes(q)) return { strength: 'contains', on: null };
  const shared = words(q).find((word) => words(n).includes(word));
  return shared === undefined ? null : { strength: 'word', on: shared };
}

// A registered concept outranks a task claim at equal strength: the concept
// is the durable answer and the task is the evidence it was earned.
export function findProducers(query: string, index: Producer[]): ProducerMatch[] {
  return index
    .flatMap((producer) => {
      const match = matchStrength(query, producer.name);
      return match === null ? [] : [{ producer, strength: match.strength, on: match.on }];
    })
    .sort((a, b) => RANK[a.strength] - RANK[b.strength] || (a.producer.kind === b.producer.kind ? 0 : a.producer.kind === 'concept' ? -1 : 1) || a.producer.name.localeCompare(b.producer.name));
}

// The same question keyed by path rather than by name. Everything above
// depends on two people independently choosing the same words for one
// capability, which is how `+N <stat> per <counter>` was built twice under
// two names; a path is the same string for everyone who touches it. So this
// is the primary index and the name match is the secondary signal.

// Which field carried the claim. A `writes` grant is a forecast about a
// region and a `files` entry is evidence about where something was observed
// — different claims about the same path, so they are reported apart rather
// than flattened into "mentioned".
export type ClaimField = 'writes' | 'files';

export interface PathMatch {
  field: ClaimField;
  // The entry as the record spells it, so a directory grant is visible as
  // one rather than as the file it happened to reach.
  declared: string;
  // Which of the queried paths it reached, for a query that asked about
  // several.
  query: string;
}

export interface PathClaim {
  task: Task;
  on: PathMatch[];
}

export interface ConceptClaim {
  system: string;
  concept: Concept;
  on: string[];
}

export interface PriorArt {
  paths: string[];
  concepts: ConceptClaim[];
  claims: PathClaim[];
}

// `src/runtime/save.ts:88` and `docs/workflow.md#H1` are a path with a
// location on the end: the suffix says where inside the file something was
// seen, and is not part of what was claimed.
const declaredPath = (entry: string): string => canonicalPath(entry.split(/[:#]/)[0]);

// Live work first, because an open claim on a path is a collision and a
// closed one is a precedent to read. Within a group, store order — id order,
// since saveStore canonicalizes on it.
const STATE_RANK: Record<State, number> = { 'in-progress': 0, open: 1, unreviewed: 2, done: 3, declined: 4 };

function pathMatches(task: Task, queries: string[]): PathMatch[] {
  const declared: Array<[ClaimField, string]> = [...task.writes.map((entry): [ClaimField, string] => ['writes', entry]), ...task.files.map((entry): [ClaimField, string] => ['files', entry])];
  return declared.flatMap(([field, entry]) => queries.filter((query) => pathsOverlap(declaredPath(entry), query)).map((query) => ({ field, declared: entry, query })));
}

// Everything that has ever claimed these paths: every task's `writes` and
// `files` in every state, `done` and `declined` included — the half a
// dispatch-set check cannot see, and the half the duplications were in —
// beside the concepts registered over them. Containment runs both ways
// through `pathsOverlap`, so a directory grant answers for a file beneath
// it and a directory query answers for the files under it.
export function priorArt(manifest: Manifest, tasks: Task[], paths: string[]): PriorArt {
  const queries = paths.map(canonicalPath).filter((path) => path !== '');

  const claims = tasks
    .map((task, index) => ({ task, index, on: pathMatches(task, queries) }))
    .filter((entry) => entry.on.length > 0)
    .sort((a, b) => STATE_RANK[a.task.state] - STATE_RANK[b.task.state] || a.index - b.index)
    .map(({ task, on }) => ({ task, on }));

  const concepts = allConcepts(manifest)
    .map(({ system, concept }) => ({ system: system.name, concept, on: queries.filter((query) => concept.paths.some((path) => pathsOverlap(path, query))) }))
    .filter((entry) => entry.on.length > 0);

  return { paths: queries, concepts, claims };
}

// A claim is "someone has written here"; a ruling is "someone has decided
// something about this", and the two live in different fields. `priorArt`
// above answers the first from `writes`/`files`, which is silent on a record
// like `audit-loop-costs-less-clause-5`: empty `writes`, empty `files`, and
// the whole argument sitting in `reason` and in a `decision` event that names
// no path at all. So a ruling is found by reading text, not by matching a
// grant — the only index that reaches it.

// The last path segment, so a query for the file matches prose that names it
// without the directories in front — "handoff.test.ts is 16.2s of a 25.2s
// wall" names the file the query asked about even though it never writes out
// `scripts/tasks/`.
function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

// Which of the queried paths a piece of text names, by the full path or by
// its basename. Substring, case-insensitive: this reads prose a human wrote
// for a human, not a declared grant, so there is no containment relation to
// lean on the way `pathsOverlap` has for `writes`/`files`.
function namesAny(text: string, queries: string[]): string[] {
  const lower = text.toLowerCase();
  return queries.filter((query) => lower.includes(query.toLowerCase()) || lower.includes(basename(query).toLowerCase()));
}

export interface ReasonRuling {
  task: Task;
  on: string[];
}

export interface DecisionRuling {
  event: TaskEvent;
  on: string[];
}

export interface Rulings {
  paths: string[];
  // A closed record's own account of itself. Not filtered to `declined`:
  // `reason` is a field any record may carry, and reading the field is
  // cheaper than trusting a state to predict it.
  reasons: ReasonRuling[];
  // `decision`-op events only. `note`/`add`/`decline` events carry text too,
  // but a decision is the event log's own label for "this was ruled on" —
  // reading every op would report an addition or a note as a ruling, which
  // is the distinction this function exists to keep.
  decisions: DecisionRuling[];
}

// A closed record's `reason` is a ruling on every path its own `files` and
// `writes` already name, not only on the ones its prose happens to spell
// out — `pathMatches` is the same containment `priorArt` runs, reused so a
// directory grant reaches a path beneath it here exactly as it does there.
// Folded into the text match's result rather than reported beside it, so a
// record that qualifies both ways still holds one entry in `reasons`.
function structuralOn(task: Task, queries: string[]): string[] {
  return [...new Set(pathMatches(task, queries).map((match) => match.query))];
}

export function rulingsOn(tasks: Task[], events: TaskEvent[], paths: string[]): Rulings {
  const queries = paths.map(canonicalPath).filter((path) => path !== '');

  const reasons = tasks
    .filter((task) => task.reason !== null)
    .map((task) => ({ task, on: [...new Set([...namesAny(task.reason as string, queries), ...structuralOn(task, queries)])] }))
    .filter((entry) => entry.on.length > 0);

  const decisions = events
    .filter((event) => event.op === 'decision')
    .map((event) => ({ event, on: namesAny(event.note, queries) }))
    .filter((entry) => entry.on.length > 0);

  return { paths: queries, reasons, decisions };
}
