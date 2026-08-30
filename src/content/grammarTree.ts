import { blockCalled, type Parser, type Written } from '../grammar/parser';
import { writtenFrom } from '../grammar/codec';
import { NOTE_MARK } from '../grammar/note';
import { namesKind, offeringAt, said, type Offer } from './completion';
import { gathered, shownIn } from './offerGroups';
import { EVERY_SECTION, sectionFor, sectionKinds } from './sections';

const STEP = '  ';
// No line of the language begins with this, so what is written out here can be told from what an author writes.
export const PART = '· ';

// A block is known by the lines it holds and what they name, so the one the results grammar repeats down every branch is written out once and pointed at thereafter, while two lists of bare ids that name different kinds stay apart.
const signOf = (lines: readonly Written[]): string => lines.map((line) => `${line.form} names ${namesKind(line) ?? 'nothing'}`).join('|');

// What tells one block from another. A block that carries a name is that name however its site
// parameterised it, which is what makes a node under a quest and a node under a dialogue one grammar;
// anything else is known by the lines it holds and what they name.
const keyOf = (lines: readonly Written[]): string => blockCalled(lines) ?? signOf(lines);

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
  if (found.label === found.kind) return `\`${found.kind}\``;
  // Where to look, but only where that is a heading a reader would have to go and find. What stands above every kind has already been read by anyone reading the page through, and naming it there reads as a second place.
  return found.kind.startsWith('# ') ? `\`${found.label}\` under \`${found.kind}\`` : `\`${found.label}\``;
};

const holdNow = (already: Already, sign: string, label: string): void => {
  already.seen.set(sign, { label, kind: already.kind });
};

// Where a block sits in a draft, which is what the engine needs in order to write out one line of it at the indentation an author writes.
interface Sitting {
  under: string;
  indent: number;
}

// Shapes a site writes out because the engine needs them to tell one of its lines from another, where
// what they are shapes of is a grammar this page has already written out. The page says the name once in
// their place; where it has not written that grammar out, they stand as they are and nothing is lost.
function spelling(lines: readonly Written[], written: Already): readonly Written[] {
  const out: Written[] = [];
  const said = new Set<string>();
  for (const line of lines) {
    if (line.of === undefined || heldBefore(written, line.of) === undefined) out.push(line);
    else if (!said.has(line.of)) {
      said.add(line.of);
      out.push({ ...line, form: `<${line.of}>`, of: undefined });
    }
  }
  return out;
}

function treeLines(written_: readonly Written[], pad: string, sitting: Sitting, written: Already, label: string): string[] {
  const lines = spelling(written_, written);
  const held = new Map(lines.map((line) => [line.form, line]));
  const saidOf = (line: Written | undefined): string => {
    const spoken = line === undefined ? undefined : said(line.needs === undefined ? undefined : `only once ${line.needs}: is set`, line.note, namesKind(line));
    return spoken === undefined ? '' : `   — ${spoken}`;
  };
  // A block whose lines are the values the keyword already takes inline says nothing new: it is the same list, one to a line.
  const listed = (block: readonly Written[], beside: readonly { form: string }[]): boolean => block.every((line) => beside.some((offer) => offer.form.endsWith(`${line.form}, …`)));
  // What is indented under a line. A block written out already is a pointer and no grammar of its own, so
  // it is said on the line it belongs to rather than on a line under it: a line reads once wherever it
  // stands, and the page never says one sentence twice for want of somewhere to put it.
  const under = (line: Written | undefined, deeper: string, beside: readonly { form: string }[] = []): { said?: string; lines: string[] } => {
    const block = line?.block?.();
    if (block === undefined) return { lines: [] };
    if (listed(block, beside)) return { lines: [] };
    const inside: Sitting = { under: [sitting.under, `${' '.repeat(sitting.indent)}${line!.example}`].join('\n'), indent: sitting.indent + 2 };
    const sign = keyOf(block);
    const already = heldBefore(written, sign);
    if (already !== undefined) return { said: `what ${already} holds, indented under it` , lines: [] };
    holdNow(written, sign, line!.form);
    return { lines: treeLines(block, deeper, inside, written, line!.form) };
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
      const inside = [...group.offers.map((offer) => under(held.get(offer.form), pad + STEP)), under(held.get(group.head ?? ''), pad + STEP, group.offers)];
      // A pointer at a block already written out belongs on the line that opens it, and a keyword opening two such blocks points at both.
      const points = [...new Set(inside.flatMap((each) => (each.said === undefined ? [] : [each.said])))];
      const shown = [...apart].map(([note, shapes]) => `${pad}${group.head === null ? shapes.join(' | ') : `${group.head} ${shapes.join(' | ')}`.trimEnd()}${like(shapes)}${note}`);
      if (points.length > 0 && shown.length > 0) shown[0] = `${shown[0]}${shown[0]!.includes('   — ') ? '; ' : '   — '}${points.join('; ')}`;
      out.push(...shown, ...inside.flatMap((each) => each.lines));
    }
  }
  return out;
}

// What holds of every kind, so no kind's tree has to repeat it. The tree is written at the indentation an author writes, and everything that is not a line of the language is marked.
export const RULES: readonly string[] = [
  `${PART}a line marked like this names a part of the kind and is not written`,
  `${PART}a keyword whose shape trails off in \`, …\` takes a list, and may instead hold it one value to a line, indented under the bare \`keyword:\``,
  `${PART}an \`e.g.\` shows one line of that shape written out; the ids in it stand for ids and are not ids anything declares`,
  `${PART}an id may be written whole, as \`core.bread\`, or by the name its own module gave it, as \`bread\` — except in a heading, where a short id declares a section of the module being written: writing over a section some other module declared means writing that section's id whole`,
  `${PART}an answer given once is pointed back at rather than written out again: \`as under X\` and \`what X holds\` both say to read it there`,
  `${PART}in a line the game says to a player, a \`${NOTE_MARK}\` and everything after it is a note the engine drops: write what you can say now, then \`${NOTE_MARK}\` alone to mark it rough, or \`${NOTE_MARK} <what you wanted>\` where the engine cannot do what was asked. \`npm run notes\` lists them`,
];

export function treeOf(kind: string, seen: Seen = freshly(), said: ReadonlySet<string> = new Set()): string[] {
  const owner = sectionFor(kind);
  if (owner === undefined) return [`# ${kind} — no such kind`];
  const sitting = { under: `# ${kind} probe`, indent: 0 };
  const already: Already = { kind: `# ${kind}`, seen };
  // A kind that is one named grammar and nothing else says which, rather than writing it out a second
  // time — and asks before claiming that grammar's name for its own heading.
  const held = heldBefore(already, keyOf(owner.grammar));
  if (blockCalled(owner.grammar) !== undefined && held !== undefined) return [`# ${kind} <id>`, `${PART}what ${held} holds, and nothing else`];
  // The section's own lines are a block like any other, so a wrapper that holds them again points back at the heading rather than writing them out twice.
  holdNow(already, keyOf(owner.grammar), `# ${kind}`);
  const own = owner.grammar.filter((line) => !said.has(sameLine(line)));
  // A kind with nothing left to write out still has to say so, or its heading stands over a blank and
  // reads as a page that gave up: a kind whose lines are all said above says which, and one that has no
  // lines at all says that writing the heading is the whole of it.
  if (own.length === 0) {
    const shared = owner.grammar.map((line) => `\`${line.form}\``);
    return [`# ${kind} <id>`, `${PART}${shared.length === 0 ? 'nothing but the heading, which is what declares the name' : `nothing of its own: it takes ${shared.join(', ')}, said above`}`];
  }
  return [`# ${kind} <id>`, ...treeLines(own, '', sitting, already, `# ${kind}`)];
}

// The heading the lines every kind takes stand under, which is not a kind and so is not written as one.
const EVERY_HEAD = 'every section, of whatever kind';

// The name first, because a line elsewhere points back at this by the hole an author types and a reader has to find it by the same word.
export const headingOf = (called: string): string => `<${called}>, wherever a line takes one`;

// Every grammar the page names rather than writing out where it stands, found by walking what the
// kinds' own lines hold. A grammar named next month is written out here for having been named, and
// one nothing points at is never written out at all, so there is no list of them anywhere.
export function namedGrammars(kinds: readonly string[]): { called: string; lines: readonly Written[] }[] {
  const found = new Map<string, readonly Written[]>();
  const walked = new Set<string>();
  const parser = (held: Parser<unknown>): void => {
    if (held.called !== undefined && !found.has(held.called)) found.set(held.called, writtenFrom(held));
    lines(writtenFrom(held));
  };
  const lines = (block: readonly Written[]): void => {
    const called = blockCalled(block);
    if (called !== undefined && !found.has(called)) found.set(called, block);
    const sign = keyOf(block);
    if (walked.has(sign)) return;
    walked.add(sign);
    for (const line of block) {
      for (const held of Object.values(line.holds?.() ?? {})) parser(held);
      const inside = line.block?.();
      if (inside !== undefined) lines(inside);
    }
  };
  lines(EVERY_SECTION);
  for (const kind of kinds) lines(sectionFor(kind)?.grammar ?? []);
  return [...found].map(([called, held]) => ({ called, lines: held }));
}

// The heading the lines more than one kind takes stand under, which is not a kind either.
const SHARED_HEAD = 'taken by the kinds named beside it';

// What tells one written-out line from another: the shape, and everything the page says about it. Two
// kinds declaring the same field off one constant reach here as the same line and are written once.
const sameLine = (line: Written): string => [line.form, line.example, line.family ?? '', line.note ?? '', line.needs ?? '', line.block === undefined ? '' : keyOf(line.block())].join(' ');

// A line more than one kind takes, and the kinds that take it. A line that opens a block is the same
// line only where the block is the same grammar, which is what `keyOf` answers.
function sharedLines(kinds: readonly string[]): Map<string, { line: Written; kinds: string[] }> {
  const held = new Map<string, { line: Written; kinds: string[] }>();
  for (const kind of kinds) {
    const grammar = sectionFor(kind)?.grammar ?? [];
    // A kind whose whole grammar is a grammar with a name of its own has no lines to share: they belong
    // to that name, which the page opens once, and the kind points at it.
    if (blockCalled(grammar) !== undefined) continue;
    for (const line of grammar) {
      const sign = sameLine(line);
      const found = held.get(sign);
      if (found === undefined) held.set(sign, { line, kinds: [kind] });
      else if (!found.kinds.includes(kind)) found.kinds.push(kind);
    }
  }
  return new Map([...held].filter(([, each]) => each.kinds.length > 1));
}

// What holds however the page was narrowed: the lines every kind takes, every line more than one kind
// takes, and every grammar the kinds point at by name. Said once above the kinds rather than once under
// each, which is the same rule `RULES` is said by and the reason a kind's tree can point back at a
// block it has already met.
function preamble(kinds: readonly string[], seen: Seen): string[] {
  const sitting = { under: '# stat probe', indent: 0 };
  const every: Already = { kind: EVERY_HEAD, seen };
  const out = [`${PART}${EVERY_HEAD}`, ...treeLines(EVERY_SECTION, '', sitting, every, EVERY_HEAD), ''];
  for (const { called, lines: block } of namedGrammars(kinds)) {
    // The heading is a sentence and the name is what a line elsewhere writes, so a pointer back at this reads as the hole an author types rather than as the sentence over it.
    const name = `<${called}>`;
    const already: Already = { kind: name, seen };
    // Registered as well as written out, so a keyword whose indented block is this grammar points back here rather than repeating it.
    holdNow(already, keyOf(block), name);
    // Under the bare name as well, which is what a site writing this grammar's shapes out says it is spelling.
    holdNow(already, called, name);
    out.push(`${PART}${headingOf(called)}`, ...treeLines(block, '', sitting, already, name), '');
  }
  const shared = [...sharedLines(kinds).values()];
  if (shared.length > 0) {
    const already: Already = { kind: SHARED_HEAD, seen };
    // Which kinds take it is read off the kinds themselves, so a field a second kind picks up next month says so without an edit here.
    const said = shared.map(({ line, kinds: takers }) => ({ ...line, note: `${line.note === undefined ? '' : `${line.note} — `}taken by ${takers.map((kind) => `# ${kind}`).join(', ')}` }));
    out.push(`${PART}${SHARED_HEAD}`, ...treeLines(said, '', sitting, already, SHARED_HEAD), '');
  }
  return out;
}

// The whole answer to "what may I write", for whoever asks: the terminal's oracle, and the command
// an authoring player types mid-run. The rules hold of every kind, so they are said once above
// whatever was asked for rather than once a kind, and one `seen` across the run means a block met
// under a second kind is pointed back at rather than written out again.
export function grammarLines(kinds: readonly string[] = sectionKinds()): string[] {
  const seen = freshly();
  const said = new Set(sharedLines(kinds).keys());
  return [...RULES, '', ...preamble(kinds, seen), ...kinds.flatMap((kind) => [...treeOf(kind, seen, said), ''])];
}

// What may stand where somebody is standing, gathered under the parts and keywords it belongs to.
// A blank line and a refused one put the same question — an author standing there wants the shapes
// that would have been taken — so the oracle's walk and a refused edit both read it off here. What
// names an id is left out: that is a list of ids and not a shape, and it has its own answer.
export function standingLines(offers: readonly Offer[]): string[] {
  const out: string[] = [];
  for (const family of gathered(offers.filter((offer) => offer.kind === undefined))) {
    out.push(family.name ?? '—');
    for (const group of family.groups) {
      if (group.head !== null) out.push(`  ${group.head}${group.opens === null ? '' : ' — opens a block'}`);
      for (const offer of group.offers) out.push(`  ${group.head === null ? '' : '  '}${shownIn(group, offer)}${offer.note === undefined ? '' : `   — ${offer.note}`}`);
    }
  }
  return out;
}

// The same answer for one line of a draft, asked at the indentation that line is written at rather
// than at its start: a line inside a block is asking what its block takes, and a cursor left in
// column zero would answer for the section instead. Nothing an id-bearing offer needs is read, so
// this answers about a draft the engine has already refused, which is the only time it is asked.
export function standingAt(text: string, line: number): string[] {
  const written = text.split('\n');
  const start = written.slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0);
  const at = written[line - 1];
  if (at === undefined) return [];
  return standingLines(offeringAt(text, start + at.length - at.trimStart().length, []).offers);
}
