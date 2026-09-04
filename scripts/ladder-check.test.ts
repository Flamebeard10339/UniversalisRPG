import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import type { Registry } from '../src/content/registry';
import { fixtureSources } from '../src/content/worldFixture';
import type { ModuleSource } from '../src/content/universe';
import { activitiesIn } from './lib/tiers';
import { defaultRungs, delivered, droppedItems, jewelReaches, kitFor, ladderLines, parseLadderArgs, sourcesIn, stockedItems } from './ladder-check';

const LEDGE = `# info ledge
version: 1.0.0
dependencies:
  fixture-town

# stat tinkering
base: 0

# skill tinkering
title: Tinkering
stat: tinkering

# passive nimble
+6 tinkering

# cluster-jewel tinkers-ring
title: Tinker's Ring
shape: ring
open-connections: e
passives: 1 nimble, 2 nimble, 3 nimble, 4 nimble, 5 nimble, 6 nimble

# item coin
title: Coin

# item bench-cap
title: Bench Cap
slot: head
value: 4
+2 tinkering

# item masters-cap
title: Master's Cap
slot: head
value: 40
requires: level.tinkering >= 10
+20 tinkering

# item tinkers-ring-jewel
title: Tinker's Ring Jewel
cluster-jewel: tinkers-ring

# item tinkers-band
title: Tinker's Band
cluster-jewel:
  shape: ring
  open-connections: e
  passives: 1 nimble, 2 nimble

# item work-gloves
title: Work Gloves
slot: gloves
item-level: 6
value: 8

# shop stall
coin: coin
stocks: 3 bench-cap

# droptable spoils
give: 1 masters-cap
give: 1 tinkers-ring-jewel
roll: inner

# droptable inner
give: 1 work-gloves

# entity fixture-town.player
+skills: tinkering
+equipment-slots: head
`;

const world = (extra: readonly ModuleSource[] = []): Registry => {
  const loaded = loadUniverseWithDiagnostics([...fixtureSources(), ...extra]);
  expect(loaded.diagnostics).toEqual([]);
  return loaded.registry;
};

const ledge = (): Registry => world([{ name: 'ledge', text: LEDGE }]);

const STAT = 'ledge.tinkering';

const stall = (registry: Registry) => sourcesIn(registry)[0]!;
const anywhere = (registry: Registry) => sourcesIn(registry)[1]!;
const tinkering = (registry: Registry) => activitiesIn(registry).find((activity) => activity.id === 'ledge')!;

describe('what the report is asked for', () => {
  it('reads its rungs off one flag and falls back to its own sweep', () => {
    expect(parseLadderArgs([]).levels).toEqual(defaultRungs());
    expect(parseLadderArgs(['--levels', '1,4,9']).levels).toEqual([1, 4, 9]);
    expect(parseLadderArgs(['core.digging', 'core.scavenging']).skills).toEqual(['core.digging', 'core.scavenging']);
    expect(parseLadderArgs(['--world', 'somewhere/content']).world).toBe('somewhere/content');
    expect(parseLadderArgs([]).world).toBeUndefined();
    expect(() => parseLadderArgs(['--world'])).toThrow(/--world wants the directory/);
  });

  it('refuses a rung that is not a level, and a flag it does not know, rather than guessing', () => {
    expect(() => parseLadderArgs(['--levels', '1,none'])).toThrow(/whole levels of at least 1/);
    expect(() => parseLadderArgs(['--levels', '0'])).toThrow(/whole levels of at least 1/);
    expect(() => parseLadderArgs(['--levels'])).toThrow(/--levels wants/);
    expect(() => parseLadderArgs(['--rungs', '3'])).toThrow(/unknown flag --rungs/);
    expect(() => parseLadderArgs(['--help'])).toThrow(/Usage: npm run ladder-check/);
  });
});

describe('the subjects the report picks', () => {
  it('are every skill the world declares, and it says which of them have no stat to read a ladder on', () => {
    const registry = world();
    const said = ladderLines(registry, { skills: [], levels: [1] }).lines.join('\n');
    for (const skill of registry.skills.values()) expect(said, skill.id).toContain(skill.id);
    for (const skill of registry.skills.values()) {
      if (skill.stat === undefined) expect(said).toMatch(new RegExp(`${skill.id}[^\\n]*no stat:`));
      else expect(said).toContain(`# ${skill.id} — ${skill.stat}`);
    }
  });

  it('covers a skill declared next month with no edit here, because it never held a list of them', () => {
    const before = ladderLines(world(), { skills: [], levels: [1] }).lines.join('\n');
    const after = ladderLines(ledge(), { skills: [], levels: [1] }).lines.join('\n');
    expect(before).not.toContain('ledge.tinkering');
    expect(after).toContain(`# ledge.tinkering — ${STAT}`);
  });

  it('reads at exactly the rungs it was handed, and narrows to exactly the skills it was named', () => {
    const said = ladderLines(ledge(), { skills: ['ledge.tinkering'], levels: [3, 12] });
    expect(said.lines.filter((line) => line.startsWith('# '))).toHaveLength(1);
    expect(said.lines.filter((line) => line.trimStart().startsWith('level '))).toHaveLength(2);
    expect(said.lines.join('\n')).toContain('level 12 —');
  });

  it('refuses a skill the world does not declare rather than reporting on nothing', () => {
    const said = ladderLines(ledge(), { skills: ['ledge.whittling'], levels: [1] });
    expect(said.ok).toBe(false);
    expect(said.lines.join('\n')).toContain('ledge.whittling');
  });
});

describe('where the gear a rung can reach is read from', () => {
  it('takes what can be bought off the shops\' own stocks: lines', () => {
    const registry = ledge();
    const stocked = stockedItems(registry);
    for (const shop of registry.shops.values()) for (const entry of shop.stocks) expect(stocked).toContain(entry.item);
    expect(stocked).toContain('ledge.bench-cap');
    expect(stocked).not.toContain('ledge.masters-cap');
  });

  it('takes what drops off the droptables, following a roll into the table it names', () => {
    const dropped = droppedItems(ledge());
    expect(dropped).toContain('ledge.masters-cap');
    expect(dropped).toContain('ledge.work-gloves');
    expect(dropped).not.toContain('ledge.bench-cap');
  });

  it('leaves a piece out of a rung the engine would not let it be worn at, and takes it once the level has', () => {
    const registry = ledge();
    const activity = tinkering(registry);
    const wornAt = (level: number): string[] => kitFor(registry, activity, level, STAT, anywhere(registry).holds).worn.map((item) => item.id);
    expect(wornAt(1)).not.toContain('ledge.masters-cap');
    expect(wornAt(12)).toContain('ledge.masters-cap');
  });

  it('reaches further where a piece exists only as a drop than where a shop has to stock it', () => {
    const registry = ledge();
    const activity = tinkering(registry);
    const reach = (source: { holds: (id: string) => boolean }): number => delivered(registry, activity, 12, STAT, source.holds).stood;
    expect(reach(anywhere(registry))).toBeGreaterThan(reach(stall(registry)));
  });
});

describe('the stat a jewel on a piece of gear reaches', () => {
  const grants = (registry: Registry, jewelId: string): string[] => {
    const jewel = registry.clusterJewels.get(jewelId);
    expect(jewel, jewelId).toBeDefined();
    return [
      ...new Set(
        Object.values(jewel!.positions).flatMap((passiveId) =>
          (registry.passives.get(passiveId)?.tags ?? []).flatMap((tag) => (tag.kind === 'stat-bonus' ? [tag.statId] : [])),
        ),
      ),
    ];
  };

  it('is read through the item, so a jewel an item names counts for as much as one written out under it', () => {
    const registry = ledge();
    const carrying = [...registry.items.values()].filter((item) => item.clusterJewel !== undefined);
    expect(carrying.filter((item) => item.clusterJewel === item.id).length, 'a jewel written out under the item carrying it').toBeGreaterThan(0);
    expect(carrying.filter((item) => item.clusterJewel !== item.id).length, 'a jewel declared on its own and named by an item').toBeGreaterThan(0);

    for (const item of carrying) {
      const reaches = grants(registry, item.clusterJewel!);
      expect(reaches.length, `${item.id} carries a jewel granting a stat`).toBeGreaterThan(0);
      for (const statId of reaches) expect(jewelReaches(registry, item.id, statId), `${item.id} reaches ${statId}`).toBe(true);
    }
  });

  it('is nothing at all where the item carries no jewel, whatever else stands under its own id', () => {
    const registry = ledge();
    for (const item of registry.items.values()) {
      if (item.clusterJewel !== undefined) continue;
      expect(jewelReaches(registry, item.id, STAT), item.id).toBe(false);
    }
  });

  it('puts every reaching jewel a source holds among the extras that rung is handed', () => {
    const registry = ledge();
    const source = anywhere(registry);
    const reaching = [...registry.items.values()].filter((item) => source.holds(item.id) && jewelReaches(registry, item.id, STAT)).map((item) => item.id);
    expect(reaching.length, 'the fixture drops a jewel that reaches tinkering').toBeGreaterThan(0);
    const extras = kitFor(registry, tinkering(registry), 12, STAT, source.holds).extras;
    for (const id of reaching) expect(extras, id).toContain(id);
  });
});

describe('a report and never a gate', () => {
  it('stands a whole world up without asserting anything about it, even where nothing reaches a stat', () => {
    const said = ladderLines(world(), { skills: [], levels: defaultRungs() });
    expect(said.ok).toBe(true);
  });

  it('carries what a level itself grants inside every figure, so a rung never reads below the one under it', () => {
    const registry = ledge();
    const activity = tinkering(registry);
    const source = anywhere(registry);
    const rungs = [1, 5, 12, 20].map((level) => delivered(registry, activity, level, STAT, source.holds).stood);
    for (let at = 1; at < rungs.length; at += 1) expect(rungs[at]!).toBeGreaterThan(rungs[at - 1]!);
  });
});
