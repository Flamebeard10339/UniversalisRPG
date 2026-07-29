import { describe, expect, it } from 'vitest';
import { loadModule } from './registry';
import { serializeRegistryModule } from './serialize';

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

# flag levered

# item ore
title: Ore

# item ingot
title: Ingot

# item snack
title: Snack
food, +2 vigor, 30s
eat: take: 1 snack, say: You eat it.

# entity npc
title: NPC
stations: forge
stats: vigor 3-4
flags:
  awake
cheer:
  requires: levered
  repeating
  time: 2
  give: 1 ore
  on success:
    say: Hello.
sequence:
  set: levered
  say: Middle.
  unset: levered

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
on empty:
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
{"version":4}

# test smoke
use: entity.npc.cheer
expect: blank
`;

describe('serializeRegistryModule', () => {
  it('prints a canonical module that the loader accepts again', () => {
    const registry = loadModule(FULL_MODULE);
    const printed = serializeRegistryModule(registry, {
      info: { id: 'base', version: [1, 2, 3], pack: 'core' },
      globalVariables: ['travel-seconds-per-unit'],
    });
    const roundTrip = loadModule(printed);

    expect(printed).toContain('# info base');
    expect(printed).toContain('# entity npc');
    expect(printed).toContain('use: entity.base.npc.cheer');
    expect(roundTrip.entities.get('base.npc')?.actions[0].label).toBe('cheer');
    expect(roundTrip.entities.get('base.npc')?.actions[0].onSuccess).toEqual([{ kind: 'say', text: 'Hello.' }]);
    expect(roundTrip.entities.get('base.npc')?.actions[1].results).toEqual([
      { kind: 'set', variable: 'base.levered' },
      { kind: 'say', text: 'Middle.' },
      { kind: 'unset', variable: 'base.levered' },
    ]);
    expect(roundTrip.locations.get('base.grove')?.x).toBe(1);
    expect(roundTrip.dialogues.get('base.npc-chat')?.owner).toBe('base.npc');
    expect(roundTrip.tests.has('base.smoke')).toBe(true);
  });
});
