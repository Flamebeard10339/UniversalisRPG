import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/load';
import { armFightAction, createGameState, initResources, resolve } from './runtime';
import { secondsToMs } from './units';

const ARENA = `
# stat attack
base: 10

# stat defense

# stat accuracy
base: 100000

# stat evasion

# stat attack-rate
base: 60

# stat max-health
base: 100000

# stat regeneration

# resource health
rate: regeneration
max: max-health

# event death
resource: health
trigger: on empty

# faction world

# faction player

# action swing
title: swing
rate: us.attack-rate
accuracy: us.accuracy vs them.evasion
damage: us.attack vs them.defense
depletes: them.health

# entity wasp
title: Wasp
faction: world
stats: max-health 100000, attack 5, accuracy 100000, attack-rate 60
aggressive
uses: swing

# entity hornet
title: Hornet
faction: world
stats: max-health 100000, attack 5, accuracy 100000, attack-rate 60
aggressive
uses: swing

# entity player
faction: player
stats: max-health 100000, attack 10, accuracy 100000, attack-rate 60
uses: swing
`;

const nest = (keyword: string): string => `${ARENA}
# location nest
x: 0, y: 0
starting
${keyword}
entities: wasp, wasp, wasp, hornet, hornet, hornet
`;

function foesEngagedAfter(source: string, seconds: number): number {
  const registry = loadModule(source);
  const state = createGameState('nest');
  initResources(state, registry);
  armFightAction('swing', 'wasp', registry, state);
  resolve(state, registry, secondsToMs(seconds));
  return Object.keys(state.activeAction?.actors ?? {}).length;
}

describe('how many things a room lets fight the player at once', () => {
  it('keeps a room to one attacker where nothing says otherwise, however many stand in it', () => {
    expect(foesEngagedAfter(nest(''), 30)).toBe(1);
  });

  it('lets the room a multicombat that says so put more than one on the player', () => {
    expect(foesEngagedAfter(nest('multicombat'), 30)).toBeGreaterThan(1);
  });

  it('piles on copies of one kind as readily as it mixes kinds, since a room of six rats is the case this is for', () => {
    const swarm = `${ARENA}
# location nest
x: 0, y: 0
starting
multicombat
entities: 6 wasp
`;
    expect(foesEngagedAfter(swarm, 60)).toBeGreaterThan(1);
  });

  it('takes no more of a kind than the room has standing in it', () => {
    const pair = `${ARENA}
# location nest
x: 0, y: 0
starting
multicombat
entities: 2 wasp
`;
    expect(foesEngagedAfter(pair, 120)).toBe(2);
  });
});
