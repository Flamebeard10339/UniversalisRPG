import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { LOCAL_CHANGES_MODULE_ID } from './localChanges';
import { formatModuleDiagnostic } from './registry';
import { loadModule, loadUniverse, loadUniverseWithDiagnostics } from './load';
import { canSerialize, declaredGlobalIds, roundTripModule, roundTripUniverse } from './serialize';
import { ModuleSource, parseModuleSource, parseUniverse } from './universe';

const FULL_MODULE = `
# info base
version: 1.2.3
pack: core

# variable travel-seconds-per-unit
value: 5

# stat vigor
base: 10

# skill focus
stat-id: vigor

# skill grit
stat-id: vigor
per-level: +2%

# skill haggling
stat-id: vigor
per-level: +2-5

# skill grudge
stat-id: vigor
per-level: -3%

# flag levered

# item ore
title: Ore

# item ingot
title: Ingot

# item snack
title: Snack
food, +2 vigor, 30s
eat: take: 1 snack, say: You eat it.

# item bramble-mail
title: Bramble Mail
+4-7 vigor, +2 vigor per stamina
on hit: 1 in 4: drain: 3 stamina from them
when hit: drain: 2 stamina from them
polish: say: You buff it.

# action haul
title: haul
continuous
rate: 12
give: 1 ore

# entity npc
uses: haul
title: NPC
stations: forge
stats: vigor 3-4
flags:
  awake
cheer:
  requires: levered
  continuous
  time: 2
  give: 1 ore
  on success:
    say: Hello.
sequence:
  set: levered
  say: Middle.
  unset: levered
glance:
  instant
  say: A quick look.
swing:
  continuous
  rate: vigor
  give: 1 ore
on hit:
  restore: 1 stamina to me
  1 in 20:
    drain: 4 stamina from them
when hit: restore: 1 stamina

# location camp
x: 0, y: 0
starting
entities:
  npc
adjacent:
  grove while levered

# location grove
east of camp

# resource stamina
rate: vigor
max: vigor
display: minimal

# event tiring
resource: stamina
trigger: on empty

# entity player
on tiring:
  say: Tired.
  set: levered

# recipe smelt
station: forge
in:
  ore
out:
  ingot
skill: focus 2
say: The ore softens.

# dialogue npc-chat
owner = npc
node greet:
  when: levered
  Hello {player.name}.
  -> Bye

# save blank
{"version":6}

# test smoke
use: entity.npc.cheer
feed: bramble-mail with snack
slot: 1 at 0,0 e with ore
allocate: 1 at 1,-1 position 4
allocate: 1 at -2,3 slot ne
apply: 1 at 0,1 with ingot
refuse: feed 1 with snack
open-modal: character-creation
submit-modal: race=Elf
expect: blank
`;

describe('what the serializer prints, reached through the round trip that is its only door', () => {
  function expectSemanticRoundTrip(source: ModuleSource): void {
    const parsed = parseModuleSource(source);
    const trip = roundTripModule(loadUniverse([source]), { info: parsed.info, globals: declaredGlobalIds(parsed) }, (printed) =>
      loadUniverseWithDiagnostics([{ ...source, text: printed }]),
    );

    expect(trip.diagnostics.map(formatModuleDiagnostic)).toEqual([]);
    expect(trip.differences).toEqual([]);
  }

  it('preserves the loaded semantics of a broad fixture', () => {
    expectSemanticRoundTrip({ name: 'base', text: FULL_MODULE });
  });

  // The directory is the manifest, the way the browser's glob and the shipped
  // replay both read it: a module added to content/ is round-tripped on the
  // commit that authors it. Reloaded as one universe rather than one at a time,
  // because a module naming another's ids does not load alone.
  it('preserves the loaded semantics of every shipped module, as one universe', () => {
    const dir = path.join(import.meta.dirname, '../../content');
    const sources = readdirSync(dir)
      .filter((name) => name.endsWith('.dsl'))
      .map((name) => ({ name: name.replace(/\.dsl$/, ''), text: readFileSync(path.join(dir, name), 'utf8') }))
      .filter((source) => source.name !== LOCAL_CHANGES_MODULE_ID);
    expect(sources.length).toBeGreaterThan(1);

    const modules = parseUniverse(sources);
    const trip = roundTripUniverse(loadUniverse(sources), modules.filter(canSerialize), (printed) => loadUniverseWithDiagnostics(printed));

    expect(trip.diagnostics.map(formatModuleDiagnostic)).toEqual([]);
    expect(trip.differences).toEqual([]);
  });

  it('prints readable canonical sections for the broad fixture', () => {
    const registry = loadModule(FULL_MODULE);
    const printed = roundTripModule(registry, { info: { id: 'base', version: [1, 2, 3], pack: 'core' }, globals: ['travel-seconds-per-unit'] }, (text) =>
      loadUniverseWithDiagnostics([{ name: 'base', text }]),
    ).printed;
    const roundTrip = loadModule(printed);

    expect(printed).toContain('# info base');
    expect(printed).toContain('# entity npc');
    expect(printed).toContain('# action haul');
    expect(printed).toContain('per-level: +2%');
    expect(printed).toContain('per-level: +2-5');
    expect(printed).toContain('per-level: -3%');
    expect(printed).toContain('use: entity.base.npc.cheer');
    expect(printed).toContain('+2 base.vigor per base.stamina');
    expect(printed).toContain('drain: 4 base.stamina from them');
    // The one carrier whose labelled blocks were all actions until now, so its
    // hook and its action have to come back as two different things.
    const mail = roundTrip.items.get('base.bramble-mail');
    expect(mail?.onHit).toEqual([{ kind: 'chance', numerator: 1, denominator: 4, results: [{ kind: 'pool', resource: 'base.stamina', delta: { min: -3, max: -3 }, party: 'them' }] }]);
    expect(mail?.whenHit).toEqual([{ kind: 'pool', resource: 'base.stamina', delta: { min: -2, max: -2 }, party: 'them' }]);
    expect(mail?.actions.map((each) => each.label)).toEqual(['polish']);
    expect(roundTrip.entities.get('base.npc')?.whenHit).toEqual([{ kind: 'pool', resource: 'base.stamina', delta: { min: 1, max: 1 } }]);
    const npcAction = (label: string) => roundTrip.entities.get('base.npc')?.actions.find((each) => each.label === label);
    expect(npcAction('haul')).toMatchObject({ kind: 'continuous', rate: 12 });
    expect(npcAction('cheer')?.onSuccess).toEqual([{ kind: 'say', text: 'Hello.', key: 'base.entity.npc.say.0' }]);
    expect(npcAction('sequence')?.results).toEqual([
      { kind: 'set', variable: 'base.levered' },
      { kind: 'say', text: 'Middle.', key: 'base.entity.npc.say.1' },
      { kind: 'unset', variable: 'base.levered' },
    ]);
    expect(roundTrip.locations.get('base.grove')?.x).toBe(1);
    expect(roundTrip.dialogues.get('base.npc-chat')?.owner).toBe('base.npc');
    expect(roundTrip.tests.has('base.smoke')).toBe(true);
  });
});
