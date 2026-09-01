// What history says about an id, and what may be concluded from it. Nothing here runs git: the
// question is asked through `RenameHistory` and answered by whoever was handed one, so the whole of
// the reasoning below is proved against a history written out by hand and the suite never shells
// out. `gitHistory.ts` is the only implementation that does, and it holds no reasoning at all.

// One `# <kind> <id>` heading a commit took out of, or put into, a file.
export interface Heading {
  file: string;
  kind: string;
  // Written as the world addresses it, so a heading and the id a save body names are one string.
  id: string;
  // The words the section carried at that commit, where the commit shows them. A rename that moved
  // no other line does not show them, and then there are none.
  title?: string;
}

// A commit, as far as a rename is concerned. What it did to anything but section headings is no
// evidence of one, so none of it is carried.
export interface Change {
  sha: string;
  subject: string;
  removed: readonly Heading[];
  added: readonly Heading[];
}

export interface RenameHistory {
  // Every commit that took a heading declaring this id out of a file, newest first.
  removalsOf(id: string): readonly Change[];
}

// How much more than "it happened in the same commit" is standing behind a candidate. Only the first
// three are written without an author saying so: each has a second signal agreeing with the first,
// and the rest are a guess wearing a commit as a hat.
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
  // What to write instead, where one candidate stands alone. Whether it may be written without
  // being asked for is `settled`, not this: a lone candidate is still sometimes a guess.
  to: string | null;
  candidates: readonly string[];
  // One line an author reads before believing any of it.
  evidence: string;
}

// Whether an inference may be acted on without the author naming the rename themselves.
export const settled = (found: Inference): boolean => found.to !== null && SETTLED.includes(found.standing);

// Title as a signal rather than as words: two authors writing the same thing differ over the article
// and the punctuation and nothing else that matters here.
const ARTICLE = /^(?:a|an|the) /;
const asSignal = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(ARTICLE, '');

const localOf = (id: string): string => id.slice(id.lastIndexOf('.') + 1);

// A name written into the one that replaced it: `lockpicks` inside `steel-lockpicks` is the same
// thing said longer. Whole segments only, so a jewel does not match every other jewel through the
// word they all end with.
function writtenInto(gone: string, arrived: string): boolean {
  const [from, into] = [localOf(gone), localOf(arrived)];
  if (from === into || into.length <= from.length) return false;
  return into === `${from}` || into.startsWith(`${from}-`) || into.endsWith(`-${from}`) || into.includes(`-${from}-`);
}

// The narrowings, in the order they are tried, each with the standing it leaves behind. A commit
// that swapped a whole file's worth of sections offers many candidates and one of them is usually
// the same section under another name; these are what says which, and a narrowing that leaves none
// or leaves several is no answer and the next one is asked.
const NARROWINGS: readonly { standing: Standing; kept(gone: Heading, arrived: Heading): boolean }[] = [
  { standing: 'the one that kept its title', kept: (gone, arrived) => gone.title !== undefined && arrived.title !== undefined && asSignal(gone.title) === asSignal(arrived.title) },
  { standing: 'the one written out of its name', kept: (gone, arrived) => writtenInto(gone.id, arrived.id) },
];

const named = (change: Change): string => `${change.sha.slice(0, 9)} ${change.subject}`;

const nothing = (id: string, standing: Standing, evidence: string): Inference => ({ id, standing, to: null, candidates: [], evidence });

// What an id became, so far as history can say. `declared` is the world as it stands now: a heading
// that arrived in the same commit and has since gone again is not what this id is called today, so
// it is no candidate.
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
