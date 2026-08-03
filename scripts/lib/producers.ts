import { allConcepts, type Manifest } from './systems';
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
