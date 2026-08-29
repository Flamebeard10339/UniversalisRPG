import type { Written } from '../grammar/parser';
import { NOTE_MARK } from '../grammar/note';
import { namesKind, said } from './completion';
import { gathered, shownIn } from './offerGroups';
import { EVERY_SECTION, sectionFor, sectionKinds } from './sections';

const STEP = '  ';
// No line of the language begins with this, so what is written out here can be told from what an author writes.
const PART = '· ';

// A block is known by the lines it holds and what they name, so the one the results grammar repeats down every branch is written out once and pointed at thereafter, while two lists of bare ids that name different kinds stay apart.
const signOf = (lines: readonly Written[]): string => lines.map((line) => `${line.form} names ${namesKind(line) ?? 'nothing'}`).join('|');

// What has already been written out, and under which kind. A run printing every kind writes the results grammar once rather than once a kind, so a block met again is pointed back at across a heading as readily as under one.
interface Already {
  kind: string;
  seen: Seen;
}

export type Seen = Map<string, { label: string; kind: string }>;

export const freshly = (): Seen => new Map();

const heldBefore = (already: Already, sign: string): string | undefined => {
  const found = already.seen.get(sign);
  if (found === undefined) return undefined;
  if (found.kind === already.kind) return `\`${found.label}\``;
  // A block held at the top of its own kind is pointed at by that heading and nothing else; saying the heading twice reads as two places.
  return found.label === found.kind ? `\`${found.kind}\`` : `\`${found.label}\` under \`${found.kind}\``;
};

const holdNow = (already: Already, sign: string, label: string): void => {
  already.seen.set(sign, { label, kind: already.kind });
};

// Where a block sits in a draft, which is what the engine needs in order to write out one line of it at the indentation an author writes.
interface Sitting {
  under: string;
  indent: number;
}

function treeLines(lines: readonly Written[], pad: string, sitting: Sitting, written: Already, label: string): string[] {
  const held = new Map(lines.map((line) => [line.form, line]));
  const saidOf = (line: Written | undefined): string => {
    const spoken = line === undefined ? undefined : said(line.needs === undefined ? undefined : `only once ${line.needs}: is set`, line.note, namesKind(line));
    return spoken === undefined ? '' : `   — ${spoken}`;
  };
  // A block whose lines are the values the keyword already takes inline says nothing new: it is the same list, one to a line.
  const listed = (block: readonly Written[], beside: readonly { form: string }[]): boolean => block.every((line) => beside.some((offer) => offer.form.endsWith(`${line.form}, …`)));
  const under = (line: Written | undefined, deeper: string, beside: readonly { form: string }[] = []): string[] => {
    const block = line?.block?.();
    if (block === undefined) return [];
    if (listed(block, beside)) return [];
    const inside: Sitting = { under: [sitting.under, `${' '.repeat(sitting.indent)}${line!.example}`].join('\n'), indent: sitting.indent + 2 };
    const sign = signOf(block);
    const already = heldBefore(written, sign);
    if (already !== undefined) return [`${deeper}…indented under it, what ${already} holds`];
    holdNow(written, sign, line!.form);
    return treeLines(block, deeper, inside, written, line!.form);
  };
  const out: string[] = [];
  for (const family of gathered(lines.map((line) => ({ ...line, insert: line.form })))) {
    const own = family.groups.flatMap((group) => [...(group.opens === null ? [] : [group.opens]), ...group.offers]).flatMap((offer) => held.get(offer.form) ?? []);
    const sign = `${family.name} of ${signOf(own)}`;
    const already = family.name === null ? undefined : heldBefore(written, sign);
    // A part is named beside the lines that belong to it rather than above and outside them, so what is indented here is what an author indents.
    if (family.name !== null) out.push(`${pad}${PART}${family.name}${already === undefined ? '' : `, as under ${already}`}`);
    if (already !== undefined) continue;
    if (family.name !== null) holdNow(written, sign, label);
    // The shapes a keyword takes stand on its own line, one or another of them; only a block it opens is indented, because only a block is indented in a file.
    for (const group of family.groups) {
      const spoken = (form: string | null): string => (form === null ? '' : saidOf(held.get(form)));
      const apart = new Map<string, string[]>();
      for (const offer of group.offers) {
        const note = spoken(offer.form) || spoken(group.head);
        apart.set(note, [...(apart.get(note) ?? []), shownIn(group, offer)]);
      }
      // A shape says what may be written and a line says what it looks like written; neither on its own tells an author where the spaces go.
      const like = (shapes: readonly string[]): string => {
        const shown = group.offers.filter((offer) => shapes.includes(shownIn(group, offer))).map((offer) => held.get(offer.form)?.example);
        const example = shown.find((each) => each !== undefined && /[<[]/.test(group.head === null ? shapes[0]! : `${group.head} ${shapes[0]!}`));
        return example === undefined ? '' : `   e.g. ${example}`;
      };
      for (const [note, shapes] of apart) out.push(`${pad}${group.head === null ? shapes.join(' | ') : `${group.head} ${shapes.join(' | ')}`.trimEnd()}${like(shapes)}${note}`);
      for (const offer of group.offers) out.push(...under(held.get(offer.form), pad + STEP));
      out.push(...under(held.get(group.head ?? ''), pad + STEP, group.offers));
    }
  }
  return out;
}

// What holds of every kind, so no kind's tree has to repeat it. The tree is written at the indentation an author writes, and everything that is not a line of the language is marked.
export const RULES: readonly string[] = [
  `${PART}a line marked like this names a part of the kind and is not written`,
  `${PART}a keyword whose shape trails off in \`, …\` takes a list, and may instead hold it one value to a line, indented under the bare \`keyword:\``,
  `${PART}an \`e.g.\` shows one line of that shape written out; the ids in it stand for ids and are not ids anything declares`,
  `${PART}an id may be written whole, as \`core.bread\`, or by the name its own module gave it, as \`bread\``,
  `${PART}an answer given once is pointed back at rather than written out again: \`as under X\` and \`what X holds\` both say to read it there`,
  `${PART}in a line the game says to a player, a \`${NOTE_MARK}\` and everything after it is a note the engine drops: write what you can say now, then \`${NOTE_MARK}\` alone to mark it rough, or \`${NOTE_MARK} <what you wanted>\` where the engine cannot do what was asked. \`npm run notes\` lists them`,
];

export function treeOf(kind: string, seen: Seen = freshly()): string[] {
  const owner = sectionFor(kind);
  if (owner === undefined) return [`# ${kind} — no such kind`];
  const sitting = { under: `# ${kind} probe`, indent: 0 };
  const already: Already = { kind: `# ${kind}`, seen };
  // The section's own lines are a block like any other, so a wrapper that holds them again points back at the heading rather than writing them out twice.
  holdNow(already, signOf(owner.grammar), `# ${kind}`);
  // The lines any section takes stand under the heading they are written under, before the kind's own: a page that offers a line and does not show it has told an author to guess.
  return [`# ${kind} <id>`, ...treeLines(EVERY_SECTION, '', sitting, already, `# ${kind}`), ...treeLines(owner.grammar, '', sitting, already, `# ${kind}`)];
}

// The whole answer to "what may I write", for whoever asks: the terminal's oracle, and the command
// an authoring player types mid-run. The rules hold of every kind, so they are said once above
// whatever was asked for rather than once a kind, and one `seen` across the run means a block met
// under a second kind is pointed back at rather than written out again.
export function grammarLines(kinds: readonly string[] = sectionKinds()): string[] {
  const seen = freshly();
  return [...RULES, '', ...kinds.flatMap((kind) => [...treeOf(kind, seen), ''])];
}
