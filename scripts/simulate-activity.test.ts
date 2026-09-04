import { describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/runtime/save';
import { loadModule, loadUniverseWithDiagnostics } from '../src/content/load';
import { DEBUG_MARK } from '../src/content/sections/define';
import { DEFAULT_RNG_SEED } from '../src/runtime/rng';
import { msToSeconds, secondsToMs } from '../src/runtime/units';
import { abilityAtLevelIn } from '../src/runtime/pace';
import path from 'node:path';
import { FLOORS_DIR } from './floors';
import { floorsBeside, simulate, simulationLines, baseForRung, DEFAULT_SEEDS, DEFAULT_WINDOW_MINUTES, GOD_WORDS, measure, parseSimulationArgs, probeSource, seedsFrom, standClocks, standingAt, stood, subjectsFrom, type Measured, type Run, type Start, type Stood, type Subject } from './simulate-activity';

const GRAPPLE_GATE = 30;

const ISLAND = `# info island
version: 1.0.0

# stat attack
base: 10

# ladder attack
at level one: 0
growth per level: 7
minutes at level one: 5
minutes growth per level: 1.07

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

# action grapple
title: Grapple
hidden if: stat.attack < ${String(GRAPPLE_GATE)}
continuous
rate: 60
damage: us.attack vs them.defence
depletes: them.life
xp: fighting 9

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
uses: strike, grapple
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

const besideWorld = (world: string, probe: string): ReturnType<typeof loadModule> => {
  const loaded = loadUniverseWithDiagnostics([{ name: 'island', text: world }, { name: 'simulation-probe', text: probe }]);
  expect(loaded.diagnostics).toEqual([]);
  return loaded.registry;
};

const beside = (probe: string): ReturnType<typeof loadModule> => besideWorld(ISLAND, probe);

const uses = (found: readonly Subject[]): string[] => found.map((subject) => subject.use);

const QUIET_WINDOW = secondsToMs(20);

const SAVE = 'island.on-the-shore';

interface Windowed {
  registry: ReturnType<typeof loadModule>;
  ends: number[];
}

const windowed = (world: string, subjects: readonly Subject[], windowMs: number, start: Start | string, stoodUp?: Stood): Windowed => {
  const standing = besideWorld(world, probeSource(['island'], subjects, start, [], false, stoodUp).text);
  const ends = standClocks(standing, subjects).map((clock) => clock + windowMs);
  return { registry: besideWorld(world, probeSource(['island'], subjects, start, ends, false, stoodUp).text), ends };
};

const worldOf = (text: string): ReturnType<typeof loadModule> => {
  const loaded = loadUniverseWithDiagnostics([{ name: 'island', text }]);
  expect(loaded.diagnostics).toEqual([]);
  return loaded.registry;
};

const sweep = (world: string, start: Start | string, narrow: { holds?: string; at?: string }, windowMs: number, stoodUp?: Stood): Measured[] => {
  const subjects = subjectsFrom(worldOf(world), start, narrow);
  const { registry, ends } = windowed(world, subjects, windowMs, start, stoodUp);
  return measure(registry, subjects, seedsFrom(2), ends);
};

const swept = (holds?: string, windowMs: number = QUIET_WINDOW, at?: string): Measured[] => sweep(ISLAND, SAVE, { holds, at }, windowMs);

const paidPer = ({ runs }: Measured, of: string, windowMs: number): number =>
  runs.reduce((sum, run) => sum + (run.gains.find((gain) => `${gain.kind} ${gain.id}` === of)?.amount ?? 0), 0) / runs.length / windowMs;

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

  it('sweeps the whole world only when asked to by name, since that is minutes rather than seconds', () => {
    expect(parseSimulationArgs(['s']).everywhere).toBeUndefined();
    expect(parseSimulationArgs(['s', '--everywhere']).everywhere).toBe(true);
  });

  it('takes the world to measure, since a draft an authoring run wrote is not the shipped corpus', () => {
    expect(parseSimulationArgs(['s', '--world', 'somewhere/content']).world).toBe('somewhere/content');
    expect(parseSimulationArgs(['s']).world).toBeUndefined();
    expect(() => parseSimulationArgs(['s', '--world'])).toThrow(/--world wants the directory/);
  });

  it('reads the floors beside the world it was given, and the shipped ones where that world has none', () => {
    expect(floorsBeside(undefined)).toBe(FLOORS_DIR);
    expect(floorsBeside('no-such-place/content')).toBe(FLOORS_DIR);
    const besideTheFloors = 'scripts';
    expect(floorsBeside(besideTheFloors)).toBe(path.join(path.dirname(path.resolve(besideTheFloors)), FLOORS_DIR));
  });
});

describe('the ideal case', () => {
  it('is asked for by one flag and stands every run up under the god words before it steps anywhere', () => {
    expect(parseSimulationArgs(['s', '--ideal']).ideal).toBe(true);
    expect(parseSimulationArgs(['s']).ideal).toBe(false);
    const subjects = subjectsFrom(island(), SAVE);
    const ends = subjects.map(() => QUIET_WINDOW);
    const plain = probeSource(['island'], subjects, SAVE, ends).text;
    const ideal = probeSource(['island'], subjects, SAVE, ends, true).text;
    for (const word of GOD_WORDS) expect(plain).not.toContain(word);
    expect(ideal).toMatch(new RegExp(`load: ${SAVE}\\n${GOD_WORDS.join('\\n')}\\ngoto: `));
    beside(ideal);
  });
});

describe('a sweep at a rung of the stat ladder', () => {
  it('reads <stat>=<number> pairs off one flag, repeatably, and refuses a pair that is not one', () => {
    expect(parseSimulationArgs(['s', '--stats', 'island.attack=40,island.swing-rate=90']).stats).toEqual([
      { id: 'island.attack', value: 40 },
      { id: 'island.swing-rate', value: 90 },
    ]);
    expect(parseSimulationArgs(['s', '--stats', 'a=1', '--stats', 'b=2']).stats).toEqual([{ id: 'a', value: 1 }, { id: 'b', value: 2 }]);
    expect(() => parseSimulationArgs(['s', '--stats', 'island.attack'])).toThrow(/<stat>=<number>/);
    expect(() => parseSimulationArgs(['s', '--stats', 'island.attack=lots'])).toThrow(/<stat>=<number>/);
  });

  it('stands the player at the pair through the world\'s own door, and reads back what they actually stood at', () => {
    const stood = { player: 'island.player', stats: [{ id: 'island.attack', value: 40 }] };
    const subjects = subjectsFrom(island(), SAVE);
    const probe = probeSource(['island'], subjects, SAVE, subjects.map(() => QUIET_WINDOW), false, stood).text;
    expect(probe).toContain('# entity island.player\n+stats: island.attack 40');
    const registry = beside(probe);
    expect(standingAt(registry, SAVE, ['island.attack'])).toEqual([{ id: 'island.attack', value: 40 }]);
    expect(standingAt(island(), SAVE, ['island.attack'])[0]!.value).not.toBe(40);
  });

  it('sweeps what the stood player is offered, so an offer a rung opens is measured at that rung and not below it', () => {
    const sources = [{ name: 'island', text: ISLAND }];
    const asked = { save: SAVE, holds: 'grapple', seeds: 1, window: 1, all: true, everywhere: true };
    const below = simulate(sources, asked);
    expect(below.ok).toBe(true);
    expect(below.lines.join('\n')).toMatch(/nothing is on offer/);

    const atTheRung = simulate(sources, { ...asked, stats: [{ id: 'island.attack', value: GRAPPLE_GATE }] });
    expect(atTheRung.ok).toBe(true);
    expect(atTheRung.lines.join('\n')).toContain('grapple');
  });

  it('refuses a stat the world does not declare rather than standing the player at nothing', () => {
    const { lines, ok } = simulate([{ name: 'island', text: ISLAND }], { save: SAVE, seeds: 1, window: 1, all: false, stats: [{ id: 'island.stealth', value: 5 }] });
    expect(ok).toBe(false);
    expect(lines[0]).toMatch(/--stats names no # stat under: island.stealth/);
  });
});

const LADDERED = `# info rung
version: 1.0.0
dependencies:
  island

# skill prowling
title: Prowling
stat: island.attack

# entity island.player
+skills: prowling
`;

describe('a sweep at a rung of the declared ladder', () => {
  const sources = [{ name: 'island', text: ISLAND }, { name: 'rung', text: LADDERED }];
  const modules = ['island', 'rung'];
  const PLAYER = 'island.player';
  const start = { save: SAVE };

  it('reads <stat>=<level> pairs off one flag, and refuses a rung that is not a level', () => {
    expect(parseSimulationArgs(['s', '--ladder', 'island.attack=12']).rungs).toEqual([{ id: 'island.attack', level: 12 }]);
    expect(parseSimulationArgs(['s', '--ladder', 'a=1', '--ladder', 'b=2']).rungs).toEqual([{ id: 'a', level: 1 }, { id: 'b', level: 2 }]);
    expect(() => parseSimulationArgs(['s', '--ladder', 'island.attack=2.5'])).toThrow(/a whole number of at least 1/);
    expect(() => parseSimulationArgs(['s', '--ladder', 'island.attack=0'])).toThrow(/a whole number of at least 1/);
    expect(() => parseSimulationArgs(['s', '--ladder', 'island.attack'])).toThrow(/<stat>=<number>/);
  });

  it('solves the base that stands the player on the rung rather than writing the rung down as one', () => {
    for (const level of [1, 12, 30]) {
      const asked = abilityAtLevelIn(island(), level, 'island.attack')!;
      const base = baseForRung(sources, modules, PLAYER, start, { id: 'island.attack', level });
      expect(base, 'the rung was written down as a base instead of being solved for').not.toBeCloseTo(asked, 3);
      const loaded = loadUniverseWithDiagnostics([...sources, probeSource(modules, [], start, [], false, { player: PLAYER, stats: [{ id: 'island.attack', value: base }] })]);
      expect(loaded.diagnostics).toEqual([]);
      expect(standingAt(loaded.registry, start, ['island.attack'])[0]!.value).toBeCloseTo(asked, 6);
    }
  });

  it('says where the player actually stood, which is the rung and not the base under it', () => {
    const report = simulate(sources, { save: SAVE, holds: 'pick', seeds: 1, window: 1, all: false, rungs: [{ id: 'island.attack', level: 12 }] });
    expect(report.ok).toBe(true);
    expect(report.lines.find((line) => line.startsWith('standing at'))).toContain(`island.attack ${String(Math.round(abilityAtLevelIn(island(), 12, 'island.attack')! * 10) / 10)}`);
  });

  it('refuses a stat the world does not declare, and one that both flags name', () => {
    const undeclared = simulate(sources, { save: SAVE, seeds: 1, window: 1, all: false, rungs: [{ id: 'island.stealth', level: 4 }] });
    expect(undeclared.ok).toBe(false);
    expect(undeclared.lines[0]).toMatch(/--ladder names no # stat under: island.stealth/);

    const twice = simulate(sources, { save: SAVE, seeds: 1, window: 1, all: false, stats: [{ id: 'island.attack', value: 40 }], rungs: [{ id: 'island.attack', level: 4 }] });
    expect(twice.ok).toBe(false);
    expect(twice.lines[0]).toMatch(/--stats and --ladder both name island.attack/);
  });
});

describe('a sweep that starts where a route ends', () => {
  const ROUTE = `${ISLAND}\n# test to-the-thicket\nload: ${SAVE}\ntravel: thicket\n\n# test the-long-way-round\nload: ${SAVE}\ntravel: thicket\nuse: island.strike on island.wasp until done\ntravel: shore\n`;
  const walked = (): ReturnType<typeof island> => worldOf(ROUTE);
  const LONG_WAY: Start = { after: 'island.the-long-way-round' };
  const BY_THE_SHORE = { holds: 'bush', at: 'island.shore' };
  const HARD_HITTING: Stood = { player: 'island.player', stats: [{ id: 'island.attack', value: 40 }] };

  it('is asked for by --after in place of a save, with the loose word still the offer to hold', () => {
    expect(parseSimulationArgs(['--after', 'island.to-the-thicket', 'wasp'])).toMatchObject({ after: 'island.to-the-thicket', holds: 'wasp', save: '' });
    expect(() => parseSimulationArgs(['--after'])).toThrow(/--after wants/);
    expect(() => parseSimulationArgs(['--after', 'x', 'a', 'b'])).toThrow(/at most one loose argument/);
  });

  it('stands the player where the route left them, on the route\'s own clock, and the probe module runs the route to get there', () => {
    const registry = walked();
    const start = { after: 'island.to-the-thicket' };
    expect(stood(registry, start).state.location).toBe('island.thicket');
    expect(stood(registry, start).state.time).toBeGreaterThan(0);
    const subjects = subjectsFrom(registry, start);
    expect(probeSource(['island'], subjects, start, subjects.map(() => QUIET_WINDOW)).text).toContain('run: island.to-the-thicket\ngoto: ');
  });

  it('refuses a route that does not walk rather than measuring from wherever it stopped', () => {
    const registry = loadUniverseWithDiagnostics([{ name: 'island', text: `${ISLAND}\n# test nowhere\nassert: has berry\n` }]).registry;
    expect(() => stood(registry, { after: 'island.nowhere' })).toThrow(/does not walk/);
  });

  it('opens the window on the clock the run it measures stands on, not on one read off a world nothing runs in', () => {
    const subjects = subjectsFrom(walked(), LONG_WAY, BY_THE_SHORE);
    const clockUnder = (stoodUp?: Stood): number =>
      standClocks(besideWorld(ROUTE, probeSource(['island'], subjects, LONG_WAY, [], false, stoodUp).text), subjects)[0]!;
    expect(clockUnder(HARD_HITTING), 'the route this world walks takes the same time however hard the player hits').toBeLessThan(clockUnder());
  });

  it('pays the same rate whatever window it is measured over, even where the standing moved the clock the route ends on', () => {
    const rate = (windowMs: number): number => paidPer(sweep(ROUTE, LONG_WAY, BY_THE_SHORE, windowMs, HARD_HITTING)[0]!, 'item island.berry', windowMs);
    expect(rate(secondsToMs(200)) / rate(QUIET_WINDOW)).toBeGreaterThan(0.95);
    expect(rate(secondsToMs(200)) / rate(QUIET_WINDOW)).toBeLessThan(1.05);
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

});

describe('the window every run is given', () => {
  const subjects = subjectsFrom(island(), SAVE);
  const clocks = standClocks(beside(probeSource(['island'], subjects, SAVE, []).text), subjects);

  it('closes a window past the clock each run of its own stands up on, so every offer is run over the same game time', () => {
    const ends = clocks.map((clock) => clock + QUIET_WINDOW);
    const written = probeSource(['island'], subjects, SAVE, ends).text;
    for (const [index, subject] of subjects.entries()) {
      expect(written).toContain(`# test run-${String(index)}\n${DEBUG_MARK}\n${subject.use} until time >= ${String(msToSeconds(ends[index]!))}`);
    }
  });

  it('never lets an offer work longer than the window, wherever it stands and however long that window is', () => {
    for (const windowMs of [QUIET_WINDOW, secondsToMs(120)]) {
      for (const { subject, runs } of swept(undefined, windowMs)) {
        for (const run of runs) expect(run.worked, `${subject.use} at ${subject.at}`).toBeLessThanOrEqual(windowMs);
      }
    }
  });

  it('pays an offer that lasts the window out at the same rate whatever window it is measured over', () => {
    const rate = (windowMs: number): number => paidPer(swept('bush', windowMs, 'island.shore')[0]!, 'item island.berry', windowMs);
    expect(rate(secondsToMs(200)) / rate(QUIET_WINDOW)).toBeGreaterThan(0.95);
    expect(rate(secondsToMs(200)) / rate(QUIET_WINDOW)).toBeLessThan(1.05);
  });
});

describe('the module a sweep writes to run itself', () => {
  const offered = subjectsFrom(island(), SAVE);
  const written = probeSource(['island'], offered, SAVE, offered.map(() => QUIET_WINDOW));

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
    expect(simulationLines(island(), [stung], { save: 's', seeds: 2, window: 1, all: true }).join('\n')).toMatch(/stopped short in 2\/2 seeds: until time >= /);
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
      expect(simulationLines(island(), [each], { save: 's', seeds: 2, window: 1, all: true }).join('\n').includes('/h'), each.subject.use).toBe(paid);
    }
  });

  it('divides what a run came back holding by the window it was given, not by how long the offer ran', () => {
    const use = 'use: entity.island.bush.pick';
    const rate = (worked: number, window: number): string => {
      const runs: Run[] = [{ seed: 1, stoppedBy: 'it was finished', cycles: 1, worked, gains: [{ kind: 'item', id: 'island.berry', amount: 6 }] }];
      const line = simulationLines(island(), [{ subject: { at: 'island.shore', depth: 0, use }, runs }], { save: 's', seeds: 1, window, all: true }).find((each) => each.includes('/h'));
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
      return simulationLines(island(), [{ subject: { at: 'island.shore', depth: 0, use }, runs }], { save: 's', seeds: 1, window: 60, all: true }).join('\n');
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
    const lines = simulationLines(island(), [thorned], { save: 's', seeds: 2, window: 1, all: true }).join('\n');
    expect(lines).toContain('island.wasp took a fight inside the window');
    expect(lines).toContain('xp island.fighting');
  });

  it('lists an offer nothing could be measured at even where it came back empty-handed', () => {
    const runs: Run[] = [{ seed: 1, stoppedBy: 'stung', engagedBy: 'island.wasp', cycles: 0, worked: 10, gains: [] }];
    const lines = simulationLines(island(), [{ subject: { at: 'island.thicket', depth: 1, use: 'use: entity.island.bramble.pick' }, runs }], { save: 's', seeds: 1, window: 1, all: false }).join('\n');
    expect(lines).toContain('island.wasp took a fight inside the window');
  });

  it('leaves out an offer nothing came of, and lists it when asked to', () => {
    const nothing: Measured[] = [{ subject: { at: 'island.shore', depth: 0, use: 'use: entity.island.bush.examine' }, runs: [{ seed: 1, cycles: 1, worked: 0, gains: [] }] }];
    expect(simulationLines(island(), nothing, { save: 's', seeds: 1, window: 1, all: false }).join('\n')).not.toContain('bush.examine');
    expect(simulationLines(island(), nothing, { save: 's', seeds: 1, window: 1, all: true }).join('\n')).toContain('bush.examine');
  });

  it('heads each place with how far out it is, and says so where no road reaches it', () => {
    const use = 'use: entity.island.crab.pinch';
    const runs: Run[] = [{ seed: 1, cycles: 1, worked: 1000, gains: [{ kind: 'item', id: 'island.berry', amount: 2 }] }];
    const lines = simulationLines(island(), [{ subject: { at: 'island.cove', depth: 4, use }, runs }, { subject: { at: 'island.reef', use }, runs }], { save: 's', seeds: 1, window: 1, all: true }).join('\n');
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
