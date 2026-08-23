import { describe, expect, it } from 'vitest';
import { moveSections, parseHeading, rewritingOf, type MoveReport } from './move-sections';
import type { TextFile } from './rename-module';

const ISLAND = `# info probe-island
version: 1.0.0

# stat attack
base: 10

// --- locations ---

# location start
title: Start
starting

// The far end of the only road, and it is the one that moves.
# location shore
title: Shore
adjacent: start

# item coin
title: Coin

# item shore-stone
title: Shore Stone

# flag lit

# entity lamp
title: Lamp
light:
  instant
  hidden if: lit
  set: lit
  say: The wick takes.

# save arrived
{"version":11,"inventory":{"probe-island.coin":2},"flags":{"probe-island.shore.discovered":true},"location":"probe-island.start"}
`;

const TOWN = `# info probe-town
version: 1.0.0
dependencies:
  probe-island

# location square
title: Square
adjacent: probe-island.shore

# item bread
title: Bread
`;

const FIXTURE = `const where = 'probe-island.shore';
const stone = 'probe-island.shore-stone';
const home = 'probe-island.start';
`;

const world = (): TextFile[] => [
  { path: 'content/probe-island.dsl', text: ISLAND },
  { path: 'content/probe-town.dsl', text: TOWN },
  { path: 'src/content/probe.test.ts', text: FIXTURE },
];

const at = (report: MoveReport, file: string): string => report.files.find((each) => each.path === file)?.text ?? '';

const shore = (): ReturnType<typeof parseHeading>[] => [parseHeading('location:shore')];

describe('naming a section', () => {
  it('reads a kind and an id off one word', () => {
    expect(parseHeading('location:shore')).toEqual({ kind: 'location', id: 'shore' });
  });

  it('refuses a word that is not a kind and an id', () => {
    expect(() => parseHeading('shore')).toThrow();
  });
});

describe('moving a section between modules', () => {
  it('takes the section out of the module it left', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', shore());
    expect(report.ok, report.lines.join('\n')).toBe(true);
    expect(at(report, 'content/probe-island.dsl')).not.toContain('# location shore');
  });

  it('lands it among the sections already of its kind, with the comment written above it', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', shore());
    const town = at(report, 'content/probe-town.dsl');
    expect(town).toContain('// The far end of the only road, and it is the one that moves.\n# location shore');
    expect(town.indexOf('# location shore')).toBeGreaterThan(town.indexOf('# location square'));
    expect(town.indexOf('# location shore')).toBeLessThan(town.indexOf('# item bread'));
  });

  it('writes the qualified reference in the module it landed in as its own', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', shore());
    expect(at(report, 'content/probe-town.dsl')).toContain('adjacent: probe-town.shore');
  });

  it('rewrites the keys and the values inside a save body, and the string literals under src', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', shore());
    expect(at(report, 'content/probe-island.dsl')).toContain('"probe-town.shore.discovered":true');
    expect(at(report, 'src/content/probe.test.ts')).toContain("const where = 'probe-town.shore';");
  });

  it('leaves an id that merely shares a prefix with a moved one alone', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', shore());
    expect(at(report, 'content/probe-island.dsl')).toContain('# item shore-stone');
    expect(at(report, 'src/content/probe.test.ts')).toContain("const stone = 'probe-island.shore-stone';");
    expect(at(report, 'src/content/probe.test.ts')).toContain("const home = 'probe-island.start';");
  });

  it('moves several sections of several kinds at once', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', [parseHeading('location:shore'), parseHeading('item:coin')]);
    expect(report.ok, report.lines.join('\n')).toBe(true);
    const town = at(report, 'content/probe-town.dsl');
    expect(town).toContain('# item coin');
    expect(town).toContain('# location shore');
    expect(at(report, 'content/probe-island.dsl')).toContain('"probe-town.coin":2');
  });

  it('refuses a section the module does not hold', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', [parseHeading('location:lagoon')]);
    expect(report.ok).toBe(false);
    expect(report.files).toEqual([]);
    expect(report.lines.join('\n')).toContain('# location lagoon: no such section');
  });

  it('refuses when a section that stays behind shares the id of one that moves', () => {
    const files = world().map((file) => (file.path === 'content/probe-island.dsl' ? { ...file, text: `${file.text}\n# item shore\ntitle: A Shore Trinket\n` } : file));
    const report = moveSections(files, 'probe-island', 'probe-town', shore());
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('# item shore stays behind');
  });

  it('refuses a module that does not exist, and names the ones that do', () => {
    const report = moveSections(world(), 'probe-island', 'probe-city', shore());
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('No module declares the id probe-city.');
    expect(report.lines.join('\n')).toContain('Declared: probe-island, probe-town');
  });

  it('refuses a move the module left behind cannot see, since a dependency runs one way', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', [parseHeading('location:start')]);
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('does not load');
  });

  it('refuses a corpus that does not load', () => {
    const broken = world().map((file) => (file.path === 'content/probe-town.dsl' ? { ...file, text: file.text.replace('probe-island.shore', 'probe-island.nowhere') } : file));
    const report = moveSections(broken, 'probe-island', 'probe-town', shore());
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('The corpus does not load');
  });

  it('refuses a module moved onto itself', () => {
    expect(moveSections(world(), 'probe-island', 'probe-island', shore()).lines.join('\n')).toContain('the same id');
  });
});

// Two forms an id takes only once the loader has folded it into a value: a condition
// holds its reference split into segments, and a line the game says is keyed under the
// module that declared the thing saying it. Neither is written that way in any file, so
// the move below can only come out clean if the proof knows about both.
describe('an id inside a value', () => {
  it('is written under the new module where a condition holds it split into segments', () => {
    const rewrite = rewritingOf('probe-island', 'probe-town', [parseHeading('flag:lit')]);

    expect(rewrite('{"path":["probe-island","lit"]}')).toBe('{"path":["probe-town","lit"]}');
    expect(rewrite('{"path":["probe-island","unlit"]}')).toBe('{"path":["probe-island","unlit"]}');
  });

  it('is written under the new module where a spoken line is keyed by its owner', () => {
    const rewrite = rewritingOf('probe-island', 'probe-town', [parseHeading('entity:lamp')]);

    expect(rewrite('probe-island.entity.lamp.say.0')).toBe('probe-town.entity.lamp.say.0');
    expect(rewrite('probe-island.entity.lamplighter.say.0')).toBe('probe-island.entity.lamplighter.say.0');
  });

  it('carries a flag its own entity reads, and the line that entity says, across in one move', () => {
    const report = moveSections(world(), 'probe-island', 'probe-town', [parseHeading('flag:lit'), parseHeading('entity:lamp')]);

    expect(report.ok, report.lines.join('\n')).toBe(true);
    expect(at(report, 'content/probe-town.dsl')).toContain('# entity lamp');
    expect(at(report, 'content/probe-town.dsl')).toContain('# flag lit');
  });
});
