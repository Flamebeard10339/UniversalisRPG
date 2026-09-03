import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/runtime/save';
import { loadModule, loadUniverseWithDiagnostics } from '../src/content/load';
import { DEFAULT_RNG_SEED } from '../src/runtime/rng';
import { secondsToMs } from '../src/runtime/units';
import { simulate, simulationLines, clockOn, DEFAULT_SEEDS, DEFAULT_WINDOW_MINUTES, GOD_WORDS, measure, parseSimulationArgs, probeSource, seedsFrom, subjectsFrom, type Measured, type Run, type Subject } from './simulate-activity';

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

# event fainting
resource: life
trigger: on empty

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
rate: us.swing-rate
damage: us.attack vs them.defence
depletes: them.life
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

# location hollow
x: 2, y: 0
adjacent:
  thicket
entities:
  bush
  adder

# entity player
stats: max-life 100, attack 10, swing-rate 60
faction: islander
uses: strike
on fainting:
  restore: life
  relocate: shore
  stop

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

# entity adder
title: Adder
stats: max-life 900, attack 40, swing-rate 60
faction: world
aggressive
uses: strike

# save on-the-shore
{"version":${String(SAVE_VERSION)},"location":"island.shore"}
`;

const island = (): ReturnType<typeof loadModule> => loadModule(ISLAND);

const beside = (probe: string): ReturnType<typeof loadModule> => {
  const loaded = loadUniverseWithDiagnostics([{ name: 'island', text: ISLAND }, { name: 'simulation-probe', text: probe }]);
  expect(loaded.diagnostics).toEqual([]);
  return loaded.registry;
};

const uses = (found: readonly Subject[]): string[] => found.map((subject) => subject.use);

const QUIET_WINDOW = secondsToMs(20);

const SAVE = 'island.on-the-shore';

describe('what the arguments ask for', () => {
  it('takes a save on its own and falls back to its own defaults', () => {
    expect(parseSimulationArgs([SAVE])).toEqual({ save: SAVE, seeds: DEFAULT_SEEDS, window: DEFAULT_WINDOW_MINUTES, all: false, ideal: false });
  });

  it('reads a second loose argument as the text an offer has to hold', () => {
    expect(parseSimulationArgs([SAVE, 'wasp']).holds).toBe('wasp');
  });

  it('takes a place, a seed count and a window off the flags', () => {
    expect(parseSimulationArgs(['s', '--at', 'island.thicket', '--seeds', '2', '--window', '3', '--all'])).toEqual({ save: 's', at: 'island.thicket', seeds: 2, window: 3, all: true, ideal: false });
  });

  it('refuses a run with no save to start from', () => {
    expect(() => parseSimulationArgs([])).toThrow(/name a # save/);
  });

  it('refuses a third loose argument rather than guessing which one was meant', () => {
    expect(() => parseSimulationArgs(['a', 'b', 'c'])).toThrow(/one save and at most one action-spec/);
  });

  it('refuses a count that is not a whole number of at least one', () => {
    expect(() => parseSimulationArgs(['s', '--seeds', '0'])).toThrow(/--seeds wants a whole number/);
    expect(() => parseSimulationArgs(['s', '--window', 'ages'])).toThrow(/--window wants a whole number/);
  });

  it('refuses a flag it does not know instead of reading it as a save', () => {
    expect(() => parseSimulationArgs(['s', '--threat'])).toThrow(/unknown flag --threat/);
  });
});

describe('the ideal case', () => {
  it('is asked for by one flag and stands every run up under the god words before it steps anywhere', () => {
    expect(parseSimulationArgs(['s', '--ideal']).ideal).toBe(true);
    expect(parseSimulationArgs(['s']).ideal).toBe(false);
    const plain = probeSource(['island'], subjectsFrom(island(), SAVE), SAVE, QUIET_WINDOW).text;
    const ideal = probeSource(['island'], subjectsFrom(island(), SAVE), SAVE, QUIET_WINDOW, true).text;
    for (const word of GOD_WORDS) expect(plain).not.toContain(word);
    expect(ideal).toMatch(new RegExp(`load: ${SAVE}\\n${GOD_WORDS.join('\\n')}\\ngoto: `));
    beside(ideal);
  });
});

describe('what a sweep finds to measure', () => {
  it('takes what a player standing there is offered, anywhere the world has a place', () => {
    expect(uses(subjectsFrom(island(), SAVE))).toEqual([
      'use: entity.island.bush.pick',
      'use: entity.island.bramble.pick',
      'use: island.strike on island.wasp',
      'use: entity.island.bush.pick',
      'use: island.strike on island.adder',
    ]);
  });

  it('orders the places by how far the roads put them from where a game begins', () => {
    expect(subjectsFrom(island(), SAVE).map((subject) => [subject.at, subject.depth])).toEqual([
      ['island.shore', 0],
      ['island.thicket', 1],
      ['island.thicket', 1],
      ['island.hollow', 2],
      ['island.hollow', 2],
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

  it('runs every offer until the clock reaches the far end of the window', () => {
    expect(written.text).toContain('use: entity.island.bush.pick until time >= 20');
    expect(written.text).not.toMatch(/until \d+ times/);
  });

  it('writes a pair per offer and loads beside the world it measures', () => {
    const offers = subjectsFrom(island(), SAVE).length;
    expect(written.text.match(/^# test /gm)).toHaveLength(2 * offers);
    expect(beside(written.text).tests.size).toBe(2 * offers);
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
  const swept = (holds?: string, windowMs: number = QUIET_WINDOW, at?: string): Measured[] => {
    const world = island();
    const subjects = subjectsFrom(world, SAVE, { holds, at });
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

  it('reads what a run spent off the run too: a pool the wasp drained is a cost beside the pay, in the pool\'s own units', () => {
    const [stung] = swept('wasp');
    const spent = stung.runs[0]!.gains.filter((gain) => gain.kind === 'spent');
    expect(spent.map((gain) => gain.id)).toEqual(['island.life']);
    expect(spent[0]!.amount).toBeGreaterThan(0);
    expect(Number.isInteger(spent[0]!.amount * 1000)).toBe(true);
  });

  it('says a run stopped short in the words the engine stopped it with', () => {
    const [stung] = swept('wasp');
    expect(stung.runs.every((run) => run.stoppedBy !== undefined)).toBe(true);
    expect(simulationLines([stung], { save: 's', seeds: 2, window: 1, all: true }).join('\n')).toMatch(/stopped short in 2\/2 seeds: until time >= /);
  });

  it('takes the offer up again once the world puts it back, so a longer window holds more of it', () => {
    const alone = (found: Measured[]): Run => found[0]!.runs[0]!;
    const quiet = alone(swept('wasp'));
    const long = alone(swept('wasp', secondsToMs(200)));
    expect(long.worked).toBeGreaterThan(quiet.worked);
    expect(long.cycles).toBeGreaterThan(quiet.cycles);
  });

  it('ends a run the world will not put back on its feet, and spends the rest of the window anyway', () => {
    const [stung] = swept('wasp');
    expect(stung.runs.every((run) => run.stoppedBy !== undefined)).toBe(true);
    expect(stung.runs.every((run) => run.worked < QUIET_WINDOW)).toBe(true);
  });

  it('ends a run carried out of the place it is measuring, even where the offer stands where it lands', () => {
    const window = secondsToMs(300);
    const [shore] = swept('bush', window, 'island.shore');
    const [hollow] = swept('bush', window, 'island.hollow');
    expect(shore.runs.every((run) => run.stoppedBy === undefined)).toBe(true);
    expect(hollow.runs.every((run) => run.stoppedBy !== undefined)).toBe(true);
    expect(hollow.runs.every((run) => run.worked < shore.runs[0]!.worked)).toBe(true);
  });

  it('gives a rate to every offer that paid anything, whatever ended the run', () => {
    const found = swept();
    expect(found.some((each) => each.runs.some((run) => run.stoppedBy !== undefined && run.gains.length > 0)), 'nothing on this island stops short holding anything').toBe(true);
    for (const each of found) {
      const paid = each.runs.some((run) => run.gains.length > 0);
      expect(simulationLines([each], { save: 's', seeds: 2, window: 1, all: true }).join('\n').includes('/h'), each.subject.use).toBe(paid);
    }
  });

  it('divides what a run came back holding by the window it was given, not by how long the offer ran', () => {
    const use = 'use: entity.island.bush.pick';
    const rate = (worked: number, window: number): string => {
      const runs: Run[] = [{ seed: 1, stoppedBy: 'it was finished', cycles: 1, worked, gains: [{ kind: 'item', id: 'island.berry', amount: 6 }] }];
      const line = simulationLines([{ subject: { at: 'island.shore', depth: 0, use }, runs }], { save: 's', seeds: 1, window, all: true }).find((each) => each.includes('/h'));
      return line!.split(',')[0]!;
    };
    expect(rate(1_000, 60)).toContain('/h');
    expect(rate(1_000, 60)).toBe(rate(3_000_000, 60));
    expect(rate(1_000, 30)).not.toBe(rate(1_000, 60));
  });

  it('prints the pace inside the time the offer ran beside the window rate, and only where they differ', () => {
    const use = 'use: entity.island.bush.pick';
    const printed = (worked: number): string => {
      const runs: Run[] = [{ seed: 1, cycles: 1, worked, gains: [{ kind: 'item', id: 'island.berry', amount: 6 }] }];
      return simulationLines([{ subject: { at: 'island.shore', depth: 0, use }, runs }], { save: 's', seeds: 1, window: 60, all: true }).join('\n');
    };
    expect(printed(secondsToMs(36))).toContain('/h while it ran');
    expect(printed(secondsToMs(3600))).not.toContain('while it ran');
    expect(printed(secondsToMs(3600))).not.toContain('a ceiling');
  });

  it('names a fight something else took and prints what the window paid beside it', () => {
    const [thorned] = swept('bramble');
    const [stung] = swept('wasp');
    expect(thorned.runs.every((run) => run.engagedBy === 'island.wasp')).toBe(true);
    expect(stung.runs.every((run) => run.engagedBy === undefined)).toBe(true);
    const lines = simulationLines([thorned], { save: 's', seeds: 2, window: 1, all: true }).join('\n');
    expect(lines).toContain('island.wasp took a fight inside the window');
    expect(lines).toContain('xp island.fighting');
  });

  it('lists an offer nothing could be measured at even where it came back empty-handed', () => {
    const runs: Run[] = [{ seed: 1, stoppedBy: 'stung', engagedBy: 'island.wasp', cycles: 0, worked: 10, gains: [] }];
    const lines = simulationLines([{ subject: { at: 'island.thicket', depth: 1, use: 'use: entity.island.bramble.pick' }, runs }], { save: 's', seeds: 1, window: 1, all: false }).join('\n');
    expect(lines).toContain('island.wasp took a fight inside the window');
  });

  it('leaves out an offer nothing came of, and lists it when asked to', () => {
    const nothing: Measured[] = [{ subject: { at: 'island.shore', depth: 0, use: 'use: entity.island.bush.examine' }, runs: [{ seed: 1, cycles: 1, worked: 0, gains: [] }] }];
    expect(simulationLines(nothing, { save: 's', seeds: 1, window: 1, all: false }).join('\n')).not.toContain('bush.examine');
    expect(simulationLines(nothing, { save: 's', seeds: 1, window: 1, all: true }).join('\n')).toContain('bush.examine');
  });

  it('heads each place with how far out it is, and says so where no road reaches it', () => {
    const use = 'use: entity.island.crab.pinch';
    const runs: Run[] = [{ seed: 1, cycles: 1, worked: 1000, gains: [{ kind: 'item', id: 'island.berry', amount: 2 }] }];
    const lines = simulationLines([{ subject: { at: 'island.cove', depth: 4, use }, runs }, { subject: { at: 'island.reef', use }, runs }], { save: 's', seeds: 1, window: 1, all: true }).join('\n');
    expect(lines).toContain('island.cove (4 roads out)');
    expect(lines).toContain('island.reef (no road reaches here)');
  });
});

describe('what the tool refuses before it runs anything', () => {
  const source = [{ name: 'island', text: ISLAND }];

  it('names what is defined when the save is not', () => {
    const report = simulate(source, { save: 'island.on-the-reef', seeds: 1, window: 1, all: false });
    expect(report.ok).toBe(false);
    expect(report.lines.join('\n')).toContain(SAVE);
  });

  it('refuses a place the world does not have', () => {
    expect(simulate(source, { save: SAVE, at: 'island.reef', seeds: 1, window: 1, all: false }).ok).toBe(false);
  });

  it('says so plainly when the narrowing matched nothing, and does not call that a failure', () => {
    const report = simulate(source, { save: SAVE, holds: 'kraken', seeds: 1, window: 1, all: false });
    expect(report.ok).toBe(true);
    expect(report.lines.join('\n')).toContain('nothing is on offer anywhere that matches');
  });
});
