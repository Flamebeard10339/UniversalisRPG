import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/load';
import { parseDirectiveLine } from '../content/sections/test';
import { serializeSession, startSession, view, walkTest } from './session';

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

# action faint
title: You come round
time: 5
say: The ground is cold, and then it is not the same ground.
on success:
  relocate: starting-location

# entity player
faction: player
stats: max-health 10, attack 1, accuracy 100000, attack-rate 60
uses: swing
on death:
  restore: health
  perform: faint

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

describe('a performed action cannot be called off', () => {
  it('refuses cancel while the performed action runs, and the action goes on', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2', 'cancel', 'refused')).failure).toBeNull();
    expect(view(session).action, 'the faint went on running past the refused cancel').not.toBeNull();
    expect(view(session).action?.forced).toBe(true);
  });

  it('refuses taking anything else up while it runs', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2')).failure).toBeNull();
    expect(walkTest(session, steps('travel: shore')).failure).not.toBeNull();
    expect(view(session).action?.label).toBe('You come round');
  });
});

describe('a performed action runs its success when its time is up', () => {
  it('holds the player where they fell for its time, then runs its success', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2')).failure).toBeNull();
    expect(view(session).location.id).toBe('tidepool');
    expect(view(session).action?.label).toBe('You come round');
    expect(walkTest(session, steps('wait: 5')).failure).toBeNull();
    expect(view(session).location.id).toBe('shore');
    expect(view(session).action).toBeNull();
  });

  it('is saved as forced, so a game put down mid-faint picks it up held', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2')).failure).toBeNull();
    const saved = JSON.parse(serializeSession(session)) as { activeAction?: { forced?: boolean } };
    expect(saved.activeAction?.forced).toBe(true);
  });
});

describe('nothing engages a player while a performed action runs', () => {
  it('keeps the aggressive room off the player until the performed action has run out', () => {
    const session = startSession(loadModule(TIDEPOOL));
    expect(walkTest(session, steps('goto: tidepool', 'wait: 2', 'wait: 3')).failure).toBeNull();
    expect(view(session).encounter).toBeNull();
    expect(view(session).action?.label).toBe('You come round');
    expect(view(session).location.id).toBe('tidepool');
  });
});

describe('a performed action has to end on its own', () => {
  it('refuses a continuous action at load, naming it and who performs it', () => {
    expect(() => loadModule(TIDEPOOL.replace('time: 5\n', 'continuous\ntime: 5\n'))).toThrow(/# action faint[\s\S]*continuous/);
  });

  it('refuses a two-sided action at load', () => {
    expect(() => loadModule(TIDEPOOL.replace('  perform: faint', '  perform: swing'))).toThrow(/# action swing[\s\S]*two sides/);
  });

  it('refuses an action nothing declares', () => {
    expect(() => loadModule(TIDEPOOL.replace('  perform: faint', '  perform: swoon'))).toThrow(/swoon/);
  });
});

const GULL_ON_THE_SHORE = TIDEPOOL.replace('# entity limpet', '# entity gull\nfaction: world\nstats: max-health 1\non death:\n  perform: faint\n\n# entity limpet').replace('title: Shore\n', 'title: Shore\nentities: gull\n');

describe('only the player can be made to do something', () => {
  it('refuses a perform: that runs for a foe, naming the foe and the action', () => {
    const session = startSession(loadModule(GULL_ON_THE_SHORE));
    const { failure } = walkTest(session, steps('use: swing on gull', 'wait: 2'));
    expect(failure).toMatch(/only the player/);
    expect(failure).toMatch(/gull/);
    expect(failure).toMatch(/faint/);
  });
});
