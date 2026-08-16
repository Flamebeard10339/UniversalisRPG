import { readFileSync, readdirSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import { SECTION_KINDS, parseModule, parserFor, schemaFor } from './module';
import { parseSaveSection } from './saveSection';
import { parseAnySection } from '../grammar/section';
import { answersForItsBlocks, splitSections } from '../grammar/structure';

// A line nobody wrote, indented under one somebody did. Whatever the parser
// above it reads, it cannot read this and call it what the author meant.
const INTRUDER = 'zzz nonsense here';

const indentOf = (line: string): number => line.length - line.trimStart().length;

interface SectionSource {
  kind: string;
  lines: string[];
}

// One section rendered back from its own lines, so a probe reparses a section
// rather than a whole file.
function sectionSources(text: string): SectionSource[] {
  const render = (lines: readonly { text: string; children: readonly unknown[] }[], depth: number): string[] =>
    lines.flatMap((line) => ['  '.repeat(depth) + line.text, ...render(line.children as { text: string; children: readonly unknown[] }[], depth + 1)]);
  return splitSections(text).map((section) => ({
    kind: section.kind,
    lines: [`# ${section.kind}${section.id === undefined ? '' : ` ${section.id}`}`, ...render(section.body, 0)],
  }));
}

const shippedSections = (): SectionSource[] =>
  readdirSync('content')
    .filter((name) => name.endsWith('.dsl') && name.replace(/\.dsl$/, '') !== LOCAL_CHANGES_MODULE_ID)
    .flatMap((name) => sectionSources(readFileSync(`content/${name}`, 'utf8')));

// The kinds the corpus leaves unprobed, each with the reason written as source
// rather than as a name. `lines` is a body no shipped section happens to write;
// `refusesABody` is a kind that has no probeable line because it takes no body
// at all. Both halves are checked below, so an entry that goes stale fails
// instead of quietly excusing its kind.
const UNPROBED_BY_CONTENT: readonly { kind: string; lines?: string[]; refusesABody?: string[] }[] = [
  { kind: 'faction', lines: ['# faction wardens', 'title: The Wardens'] },
  { kind: 'flag', refusesABody: ['# flag alarm', 'raised'] },
  { kind: 'remove', refusesABody: ['# remove entity.mirror', 'reason: retired'] },
];

const parsed = (lines: readonly string[]) => JSON.stringify(parseModule(lines.join('\n')));

interface Probe {
  kind: string;
  line: string;
  dropped: boolean;
  // Why a section could not be read standalone, when it could not be. A
  // section skipped here is a subject the walk lost.
  unreadable?: string;
}

// Every body line that has no block of its own, given one. A parse that then
// reads the same thing it read without the intruder has discarded it without
// saying so, which is the outcome this spec exists to remove.
function probeSection({ kind, lines }: SectionSource): Probe[] {
  let before: string;
  try {
    before = parsed(lines);
  } catch (error) {
    // Reported, never swallowed: a walk that proves nothing is dropped in
    // silence must not lose its own subjects in silence.
    return [{ kind, line: lines[0], dropped: false, unreadable: error instanceof Error ? error.message : String(error) }];
  }
  const probes: Probe[] = [];
  for (let at = 1; at < lines.length; at++) {
    const indent = indentOf(lines[at]);
    if (at + 1 < lines.length && indentOf(lines[at + 1]) > indent) continue;
    const intruded = [...lines.slice(0, at + 1), ' '.repeat(indent + 2) + INTRUDER, ...lines.slice(at + 1)];
    let dropped: boolean;
    try {
      dropped = parsed(intruded) === before;
    } catch {
      dropped = false;
    }
    probes.push({ kind, line: lines[at].trim(), dropped });
  }
  return probes;
}

describe('an indented block under a line whose reader never asked for one', () => {
  const written = UNPROBED_BY_CONTENT.filter((entry) => entry.lines !== undefined).map((entry) => ({ kind: entry.kind, lines: entry.lines! }));
  const probes = [...shippedSections(), ...written].flatMap(probeSection);

  it('is refused, never discarded, on every line the corpus writes', () => {
    const discarded = [...new Set(probes.filter((probe) => probe.dropped).map((probe) => `${probe.kind}: ${probe.line}`))];
    expect(discarded).toEqual([]);
  });

  // The walk's subjects come from the corpus, so a corpus that shrank — or a
  // reader that stopped being reached — would shrink the walk in silence. Held
  // against a set derived somewhere else: every kind the loader can parse is
  // either probed here or has answered for itself below.
  it('probes every kind the loader can parse', () => {
    const probed = new Set(probes.map((probe) => probe.kind));
    const excused = new Set(UNPROBED_BY_CONTENT.filter((entry) => entry.refusesABody !== undefined).map((entry) => entry.kind));
    expect([...SECTION_KINDS].sort().filter((kind) => !probed.has(kind) && !excused.has(kind))).toEqual([]);
  });

  it('has a body refused outright by each kind it excuses for having no probeable line', () => {
    for (const entry of UNPROBED_BY_CONTENT.filter((each) => each.refusesABody !== undefined)) {
      expect(() => parsed(entry.refusesABody!), `# ${entry.kind} was excused as taking no body`).toThrow();
    }
  });

  // A line the section engine already inspected the block of, to decide whether
  // a field claimed it, and then read past: `faction:` takes the id and the
  // keyword after it is read by the keyword branch, which consumes no block.
  // Asking whether a block is there must not be the same act as taking it.
  it('is refused on a line whose block one reader looked at and no reader took', () => {
    expect(() => parsed(['# faction birds', '# entity gull', 'faction: birds aggressive', '  ' + INTRUDER])).toThrow(/"faction: birds aggressive" takes no indented block/);
    expect(() => parsed(['# faction birds', '# entity gull', 'faction: birds aggressive'])).not.toThrow();
  });

  // A section parser carries the demand wherever it is reached from, because it
  // is wrapped where it is defined rather than where the kinds are tabulated.
  // `scripts/migrate-saves.ts` reads `# save` fixtures through this import and
  // was measured dropping a block that `parseModule` refuses.
  it('is refused by a section parser called directly, not only through the module table', () => {
    const saveSection = (...lines: string[]) => splitSections(lines.join('\n'))[0];
    expect(() => parseSaveSection(saveSection('# save start', '{"version":11}', '  ' + INTRUDER))).toThrow(/takes no indented block/);
    expect(() => parseSaveSection(saveSection('# save start', '{"version":11}'))).not.toThrow();
    // The schema engine carries its own wrap, and the parser table wraps it a
    // second time for the per-kind check above. Only a direct call tells the
    // two apart, so only a direct call holds the inner one.
    const location = schemaFor('location')!;
    expect(() => parseAnySection(saveSection('# location bay', 'starting', '  ' + INTRUDER), location)).toThrow(/takes no indented block/);
    expect(() => parseAnySection(saveSection('# location bay', 'starting'), location)).not.toThrow();
  });

  // The one check that does not depend on finding a droppable line: every kind
  // the loader can parse is answered for by a parser that makes the demand.
  // Pass 3 moved that demand off the parser table and onto eight hand-written
  // wraps, and pass 4 measured four of them removable with the whole suite
  // still green — a kind whose parser forgets to wrap has no probe that can
  // reach it, because the probe needs a body the parser accepts and a new kind
  // can be excused for having none.
  it('is demanded by every kind the loader can parse, whoever wrote its parser', () => {
    const checked = [...SECTION_KINDS];
    // Held against the corpus route rather than against itself: every kind the
    // walk above reached, or excused, has to be one of the subjects here.
    const reached = new Set([...probes.map((probe) => probe.kind), ...UNPROBED_BY_CONTENT.map((entry) => entry.kind)]);
    expect([...reached].filter((kind) => !checked.includes(kind))).toEqual([]);
    expect(checked.filter((kind) => !answersForItsBlocks(parserFor(kind)!))).toEqual([]);
  });

  // The reporting path above, exercised: today no shipped section fails to
  // read standalone, so the assertion guarding it would otherwise never run
  // and could not fail.
  it('reports a section it cannot read standalone rather than skipping it', () => {
    const [only] = probeSection({ kind: 'location', lines: ['# location bay', '!!!'] });
    expect(only.unreadable).toMatch(/expected a direction/);
    expect(only.dropped).toBe(false);
  });

  // Refusing everything satisfies the first test, and so does a corpus that
  // went missing. This is what says the walk had subjects worth grading; the
  // floor is far below what content holds and only ever catches an empty sweep.
  it('found lines to probe, in every kind that ships one', () => {
    expect(probes.filter((probe) => probe.unreadable !== undefined).map((probe) => `${probe.line} — ${probe.unreadable}`)).toEqual([]);
    expect(probes.length).toBeGreaterThan(100);
    for (const entry of written) expect(probes.filter((probe) => probe.kind === entry.kind).length, `# ${entry.kind} was written here to be probed`).toBeGreaterThan(0);
  });
});
