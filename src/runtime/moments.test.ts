import { describe, expect, it } from 'vitest';
import { armAction, armFightAction, createGameState, GameState, initResources, resolve } from './runtime';
import { HOOK_LABELS } from '../grammar/hook';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { Registry } from '../content/registry';
import { TRIGGER_NAMES } from '../content/sections/event';
import { secondsToMs } from './units';
import { skillLevel } from './skills';

const TRAIN_XP = 1000;
const TRAIN_SECONDS = 5;

interface Moment {
  by: string;
  content: string;
  playerBlock?: string;
  ratBlock?: string;
  arm?: (state: GameState, registry: Registry) => void;
  seconds: number;
  times: number;
}

const page = (moment: Moment): string =>
  FIXTURE_WORLD +
  `
# stat dr

# stat attack-rate
base: 60

# stat blind
base: 0

# stat uncanny
base: 400

# stat trickle
base: 60

# stat max-fury

# stat max-stamina

# stat leak
base: -60

# resource health
max: max-health

# resource fury
max: max-fury
rate: trickle
start: 0

# resource stamina
max: max-stamina
rate: leak

# faction people

# faction vermin

# action swing
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# action wild-swing
rate: my attack-rate
accuracy: my blind vs their uncanny
damage: my attack vs their dr
depletes: their health

# action skirmish
rate: my attack-rate
damage: my attack vs their dr
depletes: their health
attempts: 2

# action forage
title: forage
continuous
time: 1

# action train
title: train
continuous
time: 1
xp: lore ${TRAIN_XP}

# action gather
title: gather
continuous
time: 1
give: 1 pebble

# action stumble
title: stumble
continuous
time: 1
drain: 2 health

# item pebble
title: pebble

# skill lore

${moment.content}

# entity player
faction: people
stats: max-health 100000, attack 4, attack-rate 60, blind 0, uncanny 400, max-fury 5, max-stamina 10
skills: tally, lore
uses: swing, wild-swing, skirmish, forage, train, gather, stumble
${moment.playerBlock ?? ''}

# entity rat
faction: vermin
stats: max-health 100000, attack 4, attack-rate 60, blind 0, uncanny 400
skills: tally
${moment.ratBlock ?? ''}

# entity mouse
faction: vermin
stats: max-health 8, attack 4, attack-rate 60
skills: tally

# location camp
entities: rat, mouse
`;

const event = (trigger: string, resource?: string, expression = '1'): string => `
# event moment
${resource === undefined ? '' : `resource: ${resource}\n`}trigger: ${trigger}

# skill tally
gain ${expression} experience on moment
`;

const fights = (action: string, target: string, repeating = false): Moment['arm'] => (state, registry) => {
  armFightAction(action, target, registry, state);
  if (repeating) state.activeAction!.repeating = true;
};

const MOMENTS: Record<string, Moment[]> = {
  'on empty': [
    { by: 'a swing that ran a pool out, settled at the instant it did', content: event('on empty', 'health'), arm: fights('swing', 'mouse'), seconds: 4, times: 1 },
    { by: 'its own rate running it down onto the floor', content: event('on empty', 'stamina'), seconds: 15, times: 1 },
  ],
  'on full': [{ by: 'a meter rolling over', content: event('on full', 'fury'), seconds: 15, times: 3 }],
  'damage-dealt': [
    { by: 'a landed swing', content: event('damage-dealt'), arm: fights('swing', 'rat'), seconds: 4, times: 4 },
    { by: 'a landed swing, weighed by the damage it dealt', content: event('damage-dealt', undefined, '4*amount'), arm: fights('swing', 'rat'), seconds: 4, times: 64 },
  ],
  'damage-taken': [
    { by: 'a swing that landed on it', content: event('damage-taken', 'health'), arm: fights('swing', 'rat'), seconds: 4, times: 4 },
    { by: 'a drain: on the same pool, which no swing was behind', content: event('damage-taken', 'health'), arm: (state, registry) => armAction('action', 'stumble', 'stumble', registry, state), seconds: 6, times: 6 },
  ],
  missed: [{ by: 'a swing that did not land', content: event('missed'), arm: fights('wild-swing', 'rat'), seconds: 4, times: 4 }],
  evaded: [{ by: 'a swing that did not land on it', content: event('evaded'), arm: fights('wild-swing', 'rat'), seconds: 4, times: 4 }],
  completed: [{ by: 'a continuous action settling a batch of completions', content: event('completed'), arm: (state, registry) => armAction('action', 'forage', 'forage', registry, state), seconds: 10, times: 10 }],
  unfinished: [{ by: 'a repeating fight running out of attempts', content: event('unfinished'), arm: fights('skirmish', 'rat', true), seconds: 12, times: 6 }],
  'level-up': [
    {
      by: `a skill crossing every threshold under ${TRAIN_SECONDS} payouts of ${TRAIN_XP}`,
      content: event('level-up'),
      arm: (state, registry) => armAction('action', 'train', 'train', registry, state),
      seconds: TRAIN_SECONDS,
      times: skillLevel(TRAIN_SECONDS * TRAIN_XP) - 1,
    },
  ],
  'inventory-changed': [
    {
      by: 'a continuous action putting one pebble in the pack a second',
      content: event('inventory-changed'),
      arm: (state, registry) => armAction('action', 'gather', 'gather', registry, state),
      seconds: 10,
      times: 10,
    },
  ],
  'on hit': [{ by: 'the swinger answering its own landed swing', content: '# skill tally', playerBlock: 'on hit:\n  xp: tally 1', arm: fights('swing', 'rat'), seconds: 4, times: 4 }],
  'when hit': [{ by: 'the struck answering the swing that landed', content: '# skill tally', ratBlock: 'when hit:\n  xp: tally 1', arm: fights('swing', 'rat'), seconds: 4, times: 4 }],
};

function counted(moment: Moment, cuts: number): number {
  const registry = loadInEnglish(page(moment));
  const state = createGameState('camp');
  initResources(state, registry);
  moment.arm?.(state, registry);
  for (let cut = 1; cut <= cuts; cut += 1) resolve(state, registry, secondsToMs((moment.seconds * cut) / cuts));
  return state.xp.tally ?? 0;
}

describe('every moment the language has', () => {
  it('is covered here, because the walk below derives its subjects from the vocabulary', () => {
    expect(Object.keys(MOMENTS).sort()).toEqual([...TRIGGER_NAMES, ...HOOK_LABELS].sort());
  });

  it('wires every entry to the name it is filed under, and makes that moment happen', () => {
    for (const [name, routes] of Object.entries(MOMENTS)) {
      expect(routes.length, name).toBeGreaterThan(0);
      for (const moment of routes) {
        const wiring = (HOOK_LABELS.includes(name) ? [moment.playerBlock, moment.ratBlock] : [moment.content]).filter((part): part is string => part !== undefined);
        const wired = HOOK_LABELS.includes(name) ? `${name}:` : `trigger: ${name}`;
        expect(wiring.join(' '), `${name}: ${moment.by}`).toContain(wired);
        expect(moment.times, `${name}: ${moment.by}`).toBeGreaterThan(0);
      }
    }
  });

  for (const [name, routes] of Object.entries(MOMENTS)) {
    for (const moment of routes) {
      it(`lands ${moment.times} for ${name} by ${moment.by}, however the span is cut`, () => {
        for (const cuts of [1, 2, 3, 5, 10]) expect(counted(moment, cuts), `${cuts} cuts`).toBe(moment.times);
      });
    }
  }
});
