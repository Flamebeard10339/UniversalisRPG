import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/runtime/save';
import { loadModule, loadUniverseWithDiagnostics } from '../src/content/load';
import { DEFAULT_RNG_SEED } from '../src/runtime/rng';
import { balance, balanceLines, DEFAULT_CYCLES, DEFAULT_SEEDS, measure, parseBalanceArgs, probeSource, seedsFrom, subjectsFrom, type Measured, type Run, type Subject } from './balance';

// One island with somewhere to stand, somewhere to walk to, a bush that pays for as long as anyone
// picks it, and one wasp, which is fewer wasps than a run asking for three of them needs. Everything
// the tool answers is a reading of a run through this, so a claim below moves one line and watches
// the answer change. The bramble grows where the wasp is, so an offer nobody gets to take is one a
// sweep of this island finds on its own.
const ISLAND = `# info island
version: 1.0.0

# stat attack
base: 10

# stat defence
base: 0

# stat swing-rate
base: 60

# stat max-life

# resource life
max: max-life

# faction world

# faction islander

# skill gathering
title: Gathering

# skill fighting
title: Fighting

# item berry
title: Berry

# action strike
title: Strike
continuous
rate: my swing-rate
damage: my attack vs their defence
depletes: their life
xp: fighting 3

# action pick
title: Pick a berry
continuous
rate: 60
give: berry
xp: gathering 5

# location shore
x: 0, y: 0
starting
adjacent:
  thicket
entities:
  bush

# location thicket
x: 1, y: 0
adjacent:
  shore
entities:
  bramble
  wasp

# entity player
stats: max-life 100, attack 10, swing-rate 60
faction: islander
uses: strike

# entity bush
title: Bush
uses: pick

# entity bramble
title: Bramble
uses: pick

# entity wasp
title: Wasp
stats: max-life 60, attack 1, swing-rate 60
faction: world
aggressive
uses: strike

# save on-the-shore
{"version":${String(SAVE_VERSION)},"location":"island.shore"}
`;

const island = (): ReturnType<typeof loadModule> => loadModule(ISLAND);

// The world with a sweep's own module beside it, which is how the tool loads what it wrote.
const beside = (probe: string): ReturnType<typeof loadModule> => {
  const loaded = loadUniverseWithDiagnostics([{ name: 'island', text: ISLAND }, { name: 'balance-probe', text: probe }]);
  expect(loaded.diagnostics).toEqual([]);
  return loaded.registry;
};

const uses = (found: readonly Subject[]): string[] => found.map((subject) => subject.use);

describe('what the arguments ask for', () => {
  it('takes a save on its own and falls back to its own defaults', () => {
    expect(parseBalanceArgs(['island.on-the-shore'])).toEqual({ save: 'island.on-the-shore', seeds: DEFAULT_SEEDS, cycles: DEFAULT_CYCLES, all: false });
  });

  it('reads a second loose argument as the text an offer has to hold', () => {
    expect(parseBalanceArgs(['island.on-the-shore', 'wasp']).holds).toBe('wasp');
  });

  it('takes a place, a seed count and a cycle count off the flags', () => {
    expect(parseBalanceArgs(['s', '--at', 'island.thicket', '--seeds', '2', '--cycles', '3', '--all'])).toEqual({ save: 's', at: 'island.thicket', seeds: 2, cycles: 3, all: true });
  });

  it('refuses a run with no save to start from', () => {
    expect(() => parseBalanceArgs([])).toThrow(/name a # save/);
  });

  it('refuses a third loose argument rather than guessing which one was meant', () => {
    expect(() => parseBalanceArgs(['a', 'b', 'c'])).toThrow(/one save and at most one action-spec/);
  });

  it('refuses a count that is not a whole number of at least one', () => {
    expect(() => parseBalanceArgs(['s', '--seeds', '0'])).toThrow(/--seeds wants a whole number/);
    expect(() => parseBalanceArgs(['s', '--cycles', 'lots'])).toThrow(/--cycles wants a whole number/);
  });

  it('refuses a flag it does not know instead of reading it as a save', () => {
    expect(() => parseBalanceArgs(['s', '--threat'])).toThrow(/unknown flag --threat/);
  });
});

describe('what a sweep finds to measure', () => {
  it('takes what a player standing there is offered, anywhere the world has a place', () => {
    expect(uses(subjectsFrom(island(), 'island.on-the-shore'))).toEqual(['use: entity.island.bush.pick', 'use: entity.island.bramble.pick', 'use: island.strike on island.wasp']);
  });

  it('orders the places by how far the roads put them from where a game begins', () => {
    expect(subjectsFrom(island(), 'island.on-the-shore').map((subject) => [subject.at, subject.depth])).toEqual([
      ['island.shore', 0],
      ['island.thicket', 1],
      ['island.thicket', 1],
    ]);
  });

  it('narrows to the offers whose line holds the text asked for', () => {
    expect(uses(subjectsFrom(island(), 'island.on-the-shore', { holds: 'wasp' }))).toEqual(['use: island.strike on island.wasp']);
  });

  it('narrows to one place when one is named', () => {
    expect(subjectsFrom(island(), 'island.on-the-shore', { at: 'island.thicket' }).map((subject) => subject.at)).toEqual(['island.thicket', 'island.thicket']);
  });
});

describe('the module a sweep writes to run itself', () => {
  const written = probeSource(['island'], subjectsFrom(island(), 'island.on-the-shore'), 'island.on-the-shore', 7);

  it('marks its own sections DEBUG, so a sweep may stand where no player is meant to', () => {
    expect(written.text).toMatch(/# test stand-0\nDEBUG\n/);
    expect(written.text).toMatch(/# test run-0\nDEBUG\n/);
  });

  it('stands the run up in a section of its own, so the seed can be set after the save is loaded', () => {
    expect(written.text).toContain('load: island.on-the-shore\ngoto: island.shore');
    expect(written.text).toContain('use: entity.island.bush.pick until 7 times');
  });

  it('writes a pair per offer and loads beside the world it measures', () => {
    expect(written.text.match(/^# test /gm)).toHaveLength(6);
    expect(beside(written.text).tests.size).toBe(6);
  });
});

describe('the seeds a sweep samples', () => {
  it('starts at the world\'s own, so one seed is what a # test would have run', () => {
    expect(seedsFrom(1)).toEqual([DEFAULT_RNG_SEED]);
  });

  it('takes the rest as far apart as the world\'s own rolls are', () => {
    expect(new Set(seedsFrom(5)).size).toBe(5);
  });
});

describe('what a run reports', () => {
  const swept = (holds?: string): Measured[] => {
    const subjects = subjectsFrom(island(), 'island.on-the-shore', { holds });
    const registry = beside(probeSource(['island'], subjects, 'island.on-the-shore', 3).text);
    return measure(registry, subjects, seedsFrom(2));
  };

  it('reads what an offer paid off the run rather than off the declaration', () => {
    const [picked] = swept('bush');
    expect(picked.runs.every((run) => run.finished)).toBe(true);
    expect(picked.runs[0]!.gains.map((gain) => `${gain.kind} ${gain.id}`).sort()).toEqual(['item island.berry', 'xp island.gathering']);
    expect(picked.runs[0]!.gains.every((gain) => gain.amount > 0)).toBe(true);
    expect(picked.runs[0]!.milliseconds).toBeGreaterThan(0);
  });

  it('says a run stopped short in the words the engine stopped it with', () => {
    const [stung] = swept('wasp');
    expect(stung.runs.every((run) => run.finished)).toBe(false);
    expect(balanceLines([stung], { save: 's', seeds: 2, cycles: 3, all: true }).join('\n')).toContain('stopped short: until 3 times —');
  });

  // Every offer the island has, so an offer added to it answers this without an edit here. A run that
  // stopped short was divided by an interruption rather than by a duration, and one nothing let start
  // was not this offer's run at all — neither is an hour of anything.
  it('gives an hourly rate to no offer that did not come round, whatever it came back holding', () => {
    const found = swept();
    expect(found.some((each) => each.runs.some((run) => !run.finished && run.gains.length > 0)), 'nothing on this island stops short holding anything').toBe(true);
    for (const each of found) {
      const earned = each.runs.some((run) => run.finished) && each.runs.every((run) => run.engagedBy === undefined);
      expect(balanceLines([each], { save: 's', seeds: 2, cycles: 3, all: true }).join('\n').includes('/h'), each.subject.use).toBe(earned);
    }
  });

  it('says which seeds a rate came from wherever they are not all of them', () => {
    const use = 'use: entity.island.bush.pick';
    const seeded = (seed: number, finished: boolean): Run => ({ seed, finished, cycles: 1, milliseconds: 1000, gains: [{ kind: 'item', id: 'island.berry', amount: 2 }] });
    const printed = (...runs: Run[]): string => balanceLines([{ subject: { at: 'island.shore', depth: 0, use }, runs }], { save: 's', seeds: runs.length, cycles: 3, all: true }).join('\n');
    expect(printed(seeded(1, true), seeded(2, true))).not.toContain('seeds that finished');
    expect(printed(seeded(1, true), seeded(2, false))).toContain('/h (from the 1/2 seeds that finished)');
    expect(printed(seeded(1, false), seeded(2, false))).toContain('no rate: no seed finished');
  });

  // The bramble grows where the wasp is, so a run at it measures the wasp; the wasp's own offer is
  // that fight and measures itself. One aggressor, two offers, and the tool has to tell them apart.
  it('reports an offer something took the fight from as unmeasurable, named by what took it', () => {
    const [thorned] = swept('bramble');
    const [stung] = swept('wasp');
    expect(thorned.runs.every((run) => run.engagedBy === 'island.wasp')).toBe(true);
    expect(stung.runs.every((run) => run.engagedBy === undefined)).toBe(true);
    const lines = balanceLines([thorned], { save: 's', seeds: 2, cycles: 3, all: true }).join('\n');
    expect(lines).toContain('unmeasurable here: island.wasp');
    expect(lines).not.toContain('xp island.');
    expect(lines).not.toContain('item island.');
  });

  it('lists an offer nothing could be measured at even where it came back empty-handed', () => {
    const runs = [{ seed: 1, finished: false, engagedBy: 'island.wasp', cycles: 0, milliseconds: 10, gains: [] }];
    const lines = balanceLines([{ subject: { at: 'island.thicket', depth: 1, use: 'use: entity.island.bramble.pick' }, runs }], { save: 's', seeds: 1, cycles: 3, all: false }).join('\n');
    expect(lines).toContain('unmeasurable here: island.wasp');
  });

  it('leaves out an offer nothing came of, and lists it when asked to', () => {
    const nothing: Measured[] = [{ subject: { at: 'island.shore', depth: 0, use: 'use: entity.island.bush.examine' }, runs: [{ seed: 1, finished: true, cycles: 1, milliseconds: 0, gains: [] }] }];
    expect(balanceLines(nothing, { save: 's', seeds: 1, cycles: 3, all: false }).join('\n')).not.toContain('bush.examine');
    expect(balanceLines(nothing, { save: 's', seeds: 1, cycles: 3, all: true }).join('\n')).toContain('bush.examine');
  });

  it('heads each place with how far out it is, and says so where no road reaches it', () => {
    const use = 'use: entity.island.crab.pinch';
    const runs = [{ seed: 1, finished: true, cycles: 1, milliseconds: 1000, gains: [{ kind: 'item', id: 'island.berry', amount: 2 }] }];
    const lines = balanceLines([{ subject: { at: 'island.cove', depth: 4, use }, runs }, { subject: { at: 'island.reef', use }, runs }], { save: 's', seeds: 1, cycles: 3, all: true }).join('\n');
    expect(lines).toContain('island.cove (4 roads out)');
    expect(lines).toContain('island.reef (no road reaches here)');
  });
});

describe('what the tool refuses before it runs anything', () => {
  const source = [{ name: 'island', text: ISLAND }];

  it('names what is defined when the save is not', () => {
    const report = balance(source, { save: 'island.on-the-reef', seeds: 1, cycles: 1, all: false });
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain('island.on-the-shore');
  });

  it('refuses a place the world does not have', () => {
    expect(balance(source, { save: 'island.on-the-shore', at: 'island.reef', seeds: 1, cycles: 1, all: false }).ok).toBe(false);
  });

  it('says so plainly when the narrowing matched nothing, and does not call that a failure', () => {
    const report = balance(source, { save: 'island.on-the-shore', holds: 'kraken', seeds: 1, cycles: 1, all: false });
    expect(report.ok).toBe(true);
    expect(report.lines.join('\n')).toContain('nothing is on offer anywhere that matches');
  });
});
