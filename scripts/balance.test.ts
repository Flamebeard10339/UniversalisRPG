import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/runtime/save';
import { loadModule, loadUniverseWithDiagnostics } from '../src/content/load';
import { DEFAULT_RNG_SEED } from '../src/runtime/rng';
import { secondsToMs } from '../src/runtime/units';
import { balance, balanceLines, clockOn, DEFAULT_SEEDS, DEFAULT_WINDOW_MINUTES, measure, parseBalanceArgs, probeSource, seedsFrom, subjectsFrom, type Measured, type Run, type Subject } from './balance';

// One island with somewhere to stand, somewhere to walk to, a bush that pays for as long as anyone
// picks it, and one wasp, which comes back a minute after it falls. Everything the tool answers is a
// reading of a run through this, so a claim below moves one line and watches the answer change. The
// bramble grows where the wasp is, so an offer nobody gets to take is one a sweep of this island
// finds on its own.
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
respawn after: 60s
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

// Short of the minute the wasp takes to come back, so a run here is the offer and nothing else.
const QUIET_WINDOW = secondsToMs(20);

const SAVE = 'island.on-the-shore';

describe('what the arguments ask for', () => {
  it('takes a save on its own and falls back to its own defaults', () => {
    expect(parseBalanceArgs([SAVE])).toEqual({ save: SAVE, seeds: DEFAULT_SEEDS, window: DEFAULT_WINDOW_MINUTES, all: false });
  });

  it('reads a second loose argument as the text an offer has to hold', () => {
    expect(parseBalanceArgs([SAVE, 'wasp']).holds).toBe('wasp');
  });

  it('takes a place, a seed count and a window off the flags', () => {
    expect(parseBalanceArgs(['s', '--at', 'island.thicket', '--seeds', '2', '--window', '3', '--all'])).toEqual({ save: 's', at: 'island.thicket', seeds: 2, window: 3, all: true });
  });

  it('refuses a run with no save to start from', () => {
    expect(() => parseBalanceArgs([])).toThrow(/name a # save/);
  });

  it('refuses a third loose argument rather than guessing which one was meant', () => {
    expect(() => parseBalanceArgs(['a', 'b', 'c'])).toThrow(/one save and at most one action-spec/);
  });

  it('refuses a count that is not a whole number of at least one', () => {
    expect(() => parseBalanceArgs(['s', '--seeds', '0'])).toThrow(/--seeds wants a whole number/);
    expect(() => parseBalanceArgs(['s', '--window', 'ages'])).toThrow(/--window wants a whole number/);
  });

  it('refuses a flag it does not know instead of reading it as a save', () => {
    expect(() => parseBalanceArgs(['s', '--threat'])).toThrow(/unknown flag --threat/);
  });
});

describe('what a sweep finds to measure', () => {
  it('takes what a player standing there is offered, anywhere the world has a place', () => {
    expect(uses(subjectsFrom(island(), SAVE))).toEqual(['use: entity.island.bush.pick', 'use: entity.island.bramble.pick', 'use: island.strike on island.wasp']);
  });

  it('orders the places by how far the roads put them from where a game begins', () => {
    expect(subjectsFrom(island(), SAVE).map((subject) => [subject.at, subject.depth])).toEqual([
      ['island.shore', 0],
      ['island.thicket', 1],
      ['island.thicket', 1],
    ]);
  });

  it('narrows to the offers whose line holds the text asked for', () => {
    expect(uses(subjectsFrom(island(), SAVE, { holds: 'wasp' }))).toEqual(['use: island.strike on island.wasp']);
  });

  it('narrows to one place when one is named', () => {
    expect(subjectsFrom(island(), SAVE, { at: 'island.thicket' }).map((subject) => subject.at)).toEqual(['island.thicket', 'island.thicket']);
  });

  it('reads the clock off the save every run of a sweep starts from', () => {
    expect(clockOn(island(), SAVE)).toBe(0);
  });
});

describe('the module a sweep writes to run itself', () => {
  const written = probeSource(['island'], subjectsFrom(island(), SAVE), SAVE, QUIET_WINDOW);

  it('marks its own sections DEBUG, so a sweep may stand where no player is meant to', () => {
    expect(written.text).toMatch(/# test stand-0\nDEBUG\n/);
    expect(written.text).toMatch(/# test run-0\nDEBUG\n/);
  });

  it('stands the run up in a section of its own, so the seed can be set after the save is loaded', () => {
    expect(written.text).toContain('load: island.on-the-shore\ngoto: island.shore');
  });

  // What stops the loop is the world's clock reaching the far end of the window, so every offer on
  // the island is asked for the same span of game time and none of them is asked for a count.
  it('runs every offer until the clock reaches the far end of the window', () => {
    expect(written.text).toContain('use: entity.island.bush.pick until time >= 20');
    expect(written.text).not.toMatch(/until \d+ times/);
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
  const swept = (holds?: string, windowMs: number = QUIET_WINDOW): Measured[] => {
    const world = island();
    const subjects = subjectsFrom(world, SAVE, { holds });
    const endMs = clockOn(world, SAVE) + windowMs;
    return measure(beside(probeSource(['island'], subjects, SAVE, endMs).text), subjects, seedsFrom(2), endMs);
  };

  it('reads what an offer paid off the run rather than off the declaration', () => {
    const [picked] = swept('bush');
    expect(picked.runs.every((run) => run.stoppedBy === undefined)).toBe(true);
    expect(picked.runs[0]!.gains.map((gain) => `${gain.kind} ${gain.id}`).sort()).toEqual(['item island.berry', 'xp island.gathering']);
    expect(picked.runs[0]!.gains.every((gain) => gain.amount > 0)).toBe(true);
    expect(picked.runs[0]!.worked).toBeGreaterThan(0);
  });

  it('says a run stopped short in the words the engine stopped it with', () => {
    const [stung] = swept('wasp');
    expect(stung.runs.every((run) => run.stoppedBy !== undefined)).toBe(true);
    expect(balanceLines([stung], { save: 's', seeds: 2, window: 1, all: true }).join('\n')).toMatch(/stopped short in 2\/2 seeds: until time >= /);
  });

  // The wasp is back on its feet a minute after it falls, and a run at it is over in seconds. A
  // fighting tally that grew again can only have grown while the run stood there with nothing left
  // to do, which is the rest of the window being lived through rather than skipped.
  it('spends what is left of the window after the offer has stopped', () => {
    const fought = (found: Measured[]): number => found[0]!.runs[0]!.gains.find((gain) => gain.id === 'island.fighting')!.amount;
    const quiet = swept('wasp');
    const long = swept('wasp', secondsToMs(150));
    expect(long[0]!.runs[0]!.worked).toBe(quiet[0]!.runs[0]!.worked);
    expect(fought(long)).toBeGreaterThan(fought(quiet));
  });

  // Every offer the island has, so an offer added to it answers this without an edit here. What ends
  // a run says nothing about whether it is priced: a run that stopped short was given the same window
  // as one that filled it, and spent all of it either way.
  it('gives a rate to every offer that paid anything, whatever ended the run', () => {
    const found = swept();
    expect(found.some((each) => each.runs.some((run) => run.stoppedBy !== undefined && run.gains.length > 0)), 'nothing on this island stops short holding anything').toBe(true);
    for (const each of found) {
      const paid = each.runs.some((run) => run.gains.length > 0);
      expect(balanceLines([each], { save: 's', seeds: 2, window: 1, all: true }).join('\n').includes('/h'), each.subject.use).toBe(paid);
    }
  });

  it('divides what a run came back holding by the window it was given, not by how long the offer ran', () => {
    const use = 'use: entity.island.bush.pick';
    const rate = (worked: number, window: number): string | undefined => {
      const runs: Run[] = [{ seed: 1, stoppedBy: 'it was finished', cycles: 1, worked, gains: [{ kind: 'item', id: 'island.berry', amount: 6 }] }];
      return balanceLines([{ subject: { at: 'island.shore', depth: 0, use }, runs }], { save: 's', seeds: 1, window, all: true }).find((line) => line.includes('/h'));
    };
    expect(rate(1_000, 60)).toBeDefined();
    expect(rate(1_000, 60)).toBe(rate(3_000_000, 60));
    expect(rate(1_000, 30)).not.toBe(rate(1_000, 60));
  });

  // The bramble grows where the wasp is, so a run at it measures a fight it never asked for. That is
  // worth saying and it is not worth hiding an hour behind: the window is the one the player lived
  // through whoever swung in it.
  it('names a fight something else took and prints what the window paid beside it', () => {
    const [thorned] = swept('bramble');
    const [stung] = swept('wasp');
    expect(thorned.runs.every((run) => run.engagedBy === 'island.wasp')).toBe(true);
    expect(stung.runs.every((run) => run.engagedBy === undefined)).toBe(true);
    const lines = balanceLines([thorned], { save: 's', seeds: 2, window: 1, all: true }).join('\n');
    expect(lines).toContain('island.wasp took a fight inside the window');
    expect(lines).toContain('xp island.fighting');
  });

  it('lists an offer nothing could be measured at even where it came back empty-handed', () => {
    const runs: Run[] = [{ seed: 1, stoppedBy: 'stung', engagedBy: 'island.wasp', cycles: 0, worked: 10, gains: [] }];
    const lines = balanceLines([{ subject: { at: 'island.thicket', depth: 1, use: 'use: entity.island.bramble.pick' }, runs }], { save: 's', seeds: 1, window: 1, all: false }).join('\n');
    expect(lines).toContain('island.wasp took a fight inside the window');
  });

  it('leaves out an offer nothing came of, and lists it when asked to', () => {
    const nothing: Measured[] = [{ subject: { at: 'island.shore', depth: 0, use: 'use: entity.island.bush.examine' }, runs: [{ seed: 1, cycles: 1, worked: 0, gains: [] }] }];
    expect(balanceLines(nothing, { save: 's', seeds: 1, window: 1, all: false }).join('\n')).not.toContain('bush.examine');
    expect(balanceLines(nothing, { save: 's', seeds: 1, window: 1, all: true }).join('\n')).toContain('bush.examine');
  });

  it('heads each place with how far out it is, and says so where no road reaches it', () => {
    const use = 'use: entity.island.crab.pinch';
    const runs: Run[] = [{ seed: 1, cycles: 1, worked: 1000, gains: [{ kind: 'item', id: 'island.berry', amount: 2 }] }];
    const lines = balanceLines([{ subject: { at: 'island.cove', depth: 4, use }, runs }, { subject: { at: 'island.reef', use }, runs }], { save: 's', seeds: 1, window: 1, all: true }).join('\n');
    expect(lines).toContain('island.cove (4 roads out)');
    expect(lines).toContain('island.reef (no road reaches here)');
  });
});

describe('what the tool refuses before it runs anything', () => {
  const source = [{ name: 'island', text: ISLAND }];

  it('names what is defined when the save is not', () => {
    const report = balance(source, { save: 'island.on-the-reef', seeds: 1, window: 1, all: false });
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain(SAVE);
  });

  it('refuses a place the world does not have', () => {
    expect(balance(source, { save: SAVE, at: 'island.reef', seeds: 1, window: 1, all: false }).ok).toBe(false);
  });

  it('says so plainly when the narrowing matched nothing, and does not call that a failure', () => {
    const report = balance(source, { save: SAVE, holds: 'kraken', seeds: 1, window: 1, all: false });
    expect(report.ok).toBe(true);
    expect(report.lines.join('\n')).toContain('nothing is on offer anywhere that matches');
  });
});
