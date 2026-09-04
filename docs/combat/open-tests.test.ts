import { describe, expect, it } from 'vitest';
import { loadModule } from '../../src/content/load';
import { startSession, view, walkTest } from '../../src/runtime/session';
import { parseDirectiveLine } from '../../src/content/sections/test';

const TIDEPOOL = `
# stat attack
base: 1

# stat defense

# stat accuracy
base: 100000

# stat evasion

# stat attack-rate
base: 60

# stat max-health
base: 10

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

# entity player
faction: player
stats: max-health 10, attack 1, accuracy 100000, attack-rate 60
uses: swing
on death:
  restore: health
  perform: faint
faint:
  title: You come round
  time: 5
  say: The ground is cold, and then it is not the same ground.
  on success:
    relocate: starting-location

# entity limpet
faction: world
stats: max-health 1000, attack 1000, accuracy 100000, attack-rate 60
uses: swing
aggressive
respawn after: 2s

# location shore
x: 0, y: 0
starting
title: Shore

# location tidepool
x: 1, y: 0
title: Tidepool
entities: 3 limpet
`;

const steps = (...lines: string[]) => lines.map((line) => parseDirectiveLine(line)!);

describe('a-performed-action-cannot-be-called-off', () => {
  it('refuses cancel while the performed action runs, and takes it again once the action is over', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2', 'cancel', 'refused')).failure).toBeNull();
    expect(view(session).action, 'the faint went on running past the refused cancel').not.toBeNull();
  });
});

describe('a-performed-action-runs-its-success-when-its-time-is-up', () => {
  it('holds the player where they fell for its time, then runs its success', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2')).failure).toBeNull();
    expect(view(session).location.id).toBe('tidepool');
    expect(view(session).action?.label).toBe('You come round');
    expect(walkTest(session, steps('wait: 5')).failure).toBeNull();
    expect(view(session).location.id).toBe('shore');
    expect(view(session).action).toBeNull();
  });
});

describe('nothing-engages-a-player-while-a-performed-action-runs', () => {
  it('keeps the aggressive room off the player until the performed action has run out', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2', 'wait: 3')).failure).toBeNull();
    expect(view(session).encounter).toBeNull();
    expect(view(session).action?.label).toBe('You come round');
    expect(view(session).location.id).toBe('tidepool');
  });
});
