import { blockCalled, type Parser, type Written } from '../grammar/parser';
import { holeNames } from '../grammar/form';
import { writtenFrom } from '../grammar/codec';
import { NOTE_MARK } from '../grammar/note';
import { namesKind, offeringAt, said, type Offer } from './completion';
import { gathered, shownIn } from './offerGroups';
import { addressedHeading, EVERY_SECTION, sectionFor, sectionKinds } from './sections';
import { LAID_OVER_RULE, WRITTEN_WHOLE_NOTE } from './merge';

const STEP = '  ';

const HOLDS_A_LINE = 'line';
const laidOver = (line: Written | undefined): boolean => line !== undefined && holeNames(line.form).includes(HOLDS_A_LINE);

export const PART = '· ';

const signOf = (lines: readonly Written[]): string => lines.map((line) => `${line.form} names ${namesKind(line) ?? 'nothing'}`).join('|');

const keyOf = (lines: readonly Written[]): string => blockCalled(lines) ?? signOf(lines);

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
  if (found.label === found.kind) return `\`${found.kind}\``;
  return found.kind.startsWith('# ') ? `\`${found.label}\` under \`${found.kind}\`` : `\`${found.label}\``;
};

const holdNow = (already: Already, sign: string, label: string): void => {
  already.seen.set(sign, { label, kind: already.kind });
};

interface Sitting {
  under: string;
  indent: number;
}

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
    const spoken = line === undefined ? undefined : said(line.needs === undefined ? undefined : `only once ${line.needs.map((each) => `${each}:`).join(' or ')} is set`, line.note, namesKind(line));
    return spoken === undefined ? '' : `   — ${spoken}`;
  };
  const listed = (block: readonly Written[], beside: readonly { form: string }[]): boolean => block.every((line) => beside.some((offer) => offer.form.endsWith(`${line.form}, …`)));
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
    if (family.name !== null) out.push(`${pad}${PART}${family.name}${already === undefined ? '' : `, as under ${already}`}`);
    if (already !== undefined) continue;
    if (family.name !== null) holdNow(written, sign, label);
    const over = own.some((line) => laidOver(line));
    const writtenAt = over ? pad + STEP : pad;
    if (over) out.push(`${pad}${addressedHeading()}`);
    for (const group of family.groups) {
      const spoken = (form: string | null): string => (form === null ? '' : saidOf(held.get(form)));
      const apart = new Map<string, string[]>();
      for (const offer of group.offers) {
        const note = spoken(offer.form) || spoken(group.head);
        apart.set(note, [...(apart.get(note) ?? []), shownIn(group, offer)]);
      }
      const like = (shapes: readonly string[]): string => {
        const shown = group.offers.filter((offer) => shapes.includes(shownIn(group, offer))).map((offer) => held.get(offer.form)?.example);
        const example = shown.find((each) => each !== undefined && /[<[]/.test(group.head === null ? shapes[0]! : `${group.head} ${shapes[0]!}`));
        return example === undefined ? '' : `   e.g. ${example}`;
      };
      const inside = [...group.offers.map((offer) => under(held.get(offer.form), writtenAt + STEP)), under(held.get(group.head ?? ''), writtenAt + STEP, group.offers)];
      const points = [...new Set(inside.flatMap((each) => (each.said === undefined ? [] : [each.said])))];
      const shown = [...apart].map(([note, shapes]) => `${writtenAt}${group.head === null ? shapes.join(' | ') : `${group.head} ${shapes.join(' | ')}`.trimEnd()}${like(shapes)}${note}`);
      if (points.length > 0 && shown.length > 0) shown[0] = `${shown[0]}${shown[0]!.includes('   — ') ? '; ' : '   — '}${points.join('; ')}`;
      out.push(...shown, ...inside.flatMap((each) => each.lines));
    }
  }
  return out;
}

export const RULES: readonly string[] = [
  `${PART}a line marked like this names a part of the kind and is not written`,
  `${PART}a keyword whose shape trails off in \`, …\` takes a list, and may instead hold it one value to a line, indented under the bare \`keyword:\``,
  `${PART}\`<int>\` is a whole number and \`<float>\` one that may carry a decimal point; either takes a leading \`-\` for a negative, wherever the line it stands in has a meaning for one`,
  `${PART}an \`e.g.\` shows one line of that shape written out; the ids in it stand for ids and are not ids anything declares`,
  `${PART}an id may be written whole, as \`core.bread\`, or by the name its own module gave it, as \`bread\`, and either way the module that declared it is this one or one listed under this module's \`dependencies:\` — except in a heading, where a short id declares a section of the module being written: writing over a section some other module declared means writing that section's id whole`,
  `${PART}an answer given once is pointed back at rather than written out again: \`as under X\` and \`what X holds\` both say to read it there`,
  `${PART}${LAID_OVER_RULE}`,
  `${PART}in a line the game says to a player, a \`${NOTE_MARK}\` and everything after it is a note the engine drops: write what you can say now, then \`${NOTE_MARK}\` alone to mark it rough, or \`${NOTE_MARK} <what you wanted>\` where the engine cannot do what was asked. \`npm run notes\` lists them`,
];

export function treeOf(kind: string, seen: Seen = freshly(), said: ReadonlySet<string> = new Set()): string[] {
  const owner = sectionFor(kind);
  if (owner === undefined) return [`# ${kind} — no such kind`];
  const heading = `# ${kind} <id>${owner.bodyOver === 'whole' ? `   — ${WRITTEN_WHOLE_NOTE}` : ''}`;
  const sitting = { under: `# ${kind} probe`, indent: 0 };
  const already: Already = { kind: `# ${kind}`, seen };
  const own = owner.grammar.filter((line) => !said.has(sameLine(line)));
  const held = heldBefore(already, keyOf(owner.grammar)) ?? (own.length > 0 ? heldBefore(already, keyOf(own)) : undefined);
  if (held !== undefined) return [heading, `${PART}what ${held} holds, and nothing else`];
  holdNow(already, keyOf(owner.grammar), `# ${kind}`);
  if (own.length > 0 && keyOf(own) !== keyOf(owner.grammar)) holdNow(already, keyOf(own), `# ${kind}`);
  if (own.length === 0) {
    const shared = owner.grammar.map((line) => `\`${line.form}\``);
    return [heading, `${PART}${shared.length === 0 ? 'nothing but the heading, which is what declares the name' : `nothing of its own: it takes ${shared.join(', ')}, said above`}`];
  }
  return [heading, ...treeLines(own, '', sitting, already, `# ${kind}`)];
}

const EVERY_HEAD = 'every section, of whatever kind';

export const headingOf = (called: string): string => `<${called}>, wherever a line takes one`;

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

const SHARED_HEAD = 'taken by the kinds named beside it';

const sameLine = (line: Written): string => [line.form, line.example, line.family ?? '', line.note ?? '', (line.needs ?? []).join(','), line.block === undefined ? '' : keyOf(line.block())].join(' ');

function sharedLines(kinds: readonly string[]): Map<string, { line: Written; kinds: string[] }> {
  const held = new Map<string, { line: Written; kinds: string[] }>();
  for (const kind of kinds) {
    const grammar = sectionFor(kind)?.grammar ?? [];
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

function preamble(kinds: readonly string[], seen: Seen): string[] {
  const sitting = { under: '# stat probe', indent: 0 };
  const every: Already = { kind: EVERY_HEAD, seen };
  const out = [`${PART}${EVERY_HEAD}`, ...treeLines(EVERY_SECTION, '', sitting, every, EVERY_HEAD), ''];
  for (const { called, lines: block } of namedGrammars(kinds)) {
    const name = `<${called}>`;
    const already: Already = { kind: name, seen };
    holdNow(already, keyOf(block), name);
    holdNow(already, called, name);
    out.push(`${PART}${headingOf(called)}`, ...treeLines(block, '', sitting, already, name), '');
  }
  const shared = [...sharedLines(kinds).values()];
  if (shared.length > 0) {
    const already: Already = { kind: SHARED_HEAD, seen };
    const said = shared.map(({ line, kinds: takers }) => ({ ...line, note: `${line.note === undefined ? '' : `${line.note} — `}taken by ${takers.map((kind) => `# ${kind}`).join(', ')}` }));
    out.push(`${PART}${SHARED_HEAD}`, ...treeLines(said, '', sitting, already, SHARED_HEAD), '');
  }
  return out;
}

export function grammarLines(kinds: readonly string[] = sectionKinds()): string[] {
  const seen = freshly();
  const said = new Set(sharedLines(kinds).keys());
  return [...RULES, '', ...preamble(kinds, seen), ...kinds.flatMap((kind) => [...treeOf(kind, seen, said), ''])];
}

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

export function standingAt(text: string, line: number): string[] {
  const written = text.split('\n');
  const start = written.slice(0, line - 1).reduce((sum, each) => sum + each.length + 1, 0);
  const at = written[line - 1];
  if (at === undefined) return [];
  return standingLines(offeringAt(text, start + at.length - at.trimStart().length, []).offers);
}
