export interface Heading {
  file: string;
  kind: string;
  id: string;
  title?: string;
}

export interface Change {
  sha: string;
  subject: string;
  removed: readonly Heading[];
  added: readonly Heading[];
}

export interface RenameHistory {
  removalsOf(id: string): readonly Change[];
}

export type Standing =
  | 'the only one of its kind to leave, and the only one to arrive'
  | 'the one that kept its title'
  | 'the one written out of its name'
  | 'the only one to arrive, among several that left'
  | 'more than one could be meant'
  | 'nothing of its kind arrived in its place'
  | 'no commit ever took a heading of this id out';

const SETTLED: readonly Standing[] = [
  'the only one of its kind to leave, and the only one to arrive',
  'the one that kept its title',
  'the one written out of its name',
];

export interface Inference {
  id: string;
  standing: Standing;
  to: string | null;
  candidates: readonly string[];
  evidence: string;
}

export const settled = (found: Inference): boolean => found.to !== null && SETTLED.includes(found.standing);

const ARTICLE = /^(?:a|an|the) /;
const asSignal = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(ARTICLE, '');

const localOf = (id: string): string => id.slice(id.lastIndexOf('.') + 1);

function writtenInto(gone: string, arrived: string): boolean {
  const [from, into] = [localOf(gone), localOf(arrived)];
  if (from === into || into.length <= from.length) return false;
  return into === `${from}` || into.startsWith(`${from}-`) || into.endsWith(`-${from}`) || into.includes(`-${from}-`);
}

const NARROWINGS: readonly { standing: Standing; kept(gone: Heading, arrived: Heading): boolean }[] = [
  { standing: 'the one that kept its title', kept: (gone, arrived) => gone.title !== undefined && arrived.title !== undefined && asSignal(gone.title) === asSignal(arrived.title) },
  { standing: 'the one written out of its name', kept: (gone, arrived) => writtenInto(gone.id, arrived.id) },
];

const named = (change: Change): string => `${change.sha.slice(0, 9)} ${change.subject}`;

const nothing = (id: string, standing: Standing, evidence: string): Inference => ({ id, standing, to: null, candidates: [], evidence });

export function inferRename(id: string, history: RenameHistory, declared: (id: string) => boolean): Inference {
  const lost = history.removalsOf(id).filter((change) => !change.added.some((heading) => heading.id === id));
  const change = lost[0];
  if (change === undefined) return nothing(id, 'no commit ever took a heading of this id out', 'nothing in history took a heading of this id out of a file it stayed out of.');

  const gone = change.removed.find((heading) => heading.id === id)!;
  const sameSort = (heading: Heading): boolean => heading.file === gone.file && heading.kind === gone.kind;
  const arrived = change.added.filter((heading) => sameSort(heading) && heading.id !== id && declared(heading.id));
  const left = change.removed.filter(sameSort);
  const where = `# ${gone.kind} ${id} left ${gone.file} in ${named(change)}`;

  if (arrived.length === 0) return nothing(id, 'nothing of its kind arrived in its place', `${where}, and no # ${gone.kind} the world still declares arrived in that file in that commit. Name the rename yourself.`);

  const candidates = arrived.map((heading) => heading.id);
  const one = (standing: Standing, heading: Heading, why: string): Inference => ({ id, standing, to: heading.id, candidates, evidence: `${where}, and ${why}.` });

  if (arrived.length === 1 && left.length === 1) return one('the only one of its kind to leave, and the only one to arrive', arrived[0]!, `# ${gone.kind} ${arrived[0]!.id} arrived there in the same commit, the only one of either to move`);

  for (const narrowing of NARROWINGS) {
    const kept = arrived.filter((heading) => narrowing.kept(gone, heading));
    if (kept.length === 1) return one(narrowing.standing, kept[0]!, `of the ${arrived.length} that arrived there in the same commit, ${kept[0]!.id} is ${narrowing.standing}`);
  }

  if (arrived.length === 1) return one('the only one to arrive, among several that left', arrived[0]!, `${arrived[0]!.id} is the only # ${gone.kind} that arrived there, but ${left.length} left in that commit, so which of them it stands for is a guess`);

  return { id, standing: 'more than one could be meant', to: null, candidates, evidence: `${where}, alongside ${left.length - 1} other # ${gone.kind}(s), and ${candidates.join(', ')} arrived in their place. Name the rename yourself.` };
}
