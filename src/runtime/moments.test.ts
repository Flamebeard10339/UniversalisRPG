import { describe, expect, it } from 'vitest';
import { armAction, armFightAction, createGameState, GameState, initResources, resolve } from './runtime';
import { HOOK_LABELS } from '../grammar/hook';
import { loadInEnglish } from '../content/engineLocale';
import { Registry } from '../content/registry';
import { TRIGGER_NAMES } from '../content/event';
import { secondsToMs } from './units';

// Every moment the language has, asked the one question that is the same for
// all of them: it happened some number of times, and that number is a fact
// about what happened rather than about how the caller sliced the clock. A
// moment is wired to `tally` the same way whatever kind it is — a grant for a
// `# event` name, an `xp:` inside the block for a hook — so the answer is one
// number read off the same place, and the shapes are comparable.
interface Moment {
  // How this scenario reaches the moment, where a name has more than one way.
  by: string;
  // The `# skill tally` this moment counts into, and the `# event` it needs.
  content: string;
  playerBlock?: string;
  ratBlock?: string;
  arm?: (state: GameState, registry: Registry) => void;
  seconds: number;
  times: number;
}

// Only the stats an entity's own `stats:` sets exist for it, so the rat carries
// no vigour, fury or stamina and nothing accrues into pools it does not have.
const page = (moment: Moment): string => `
# stat attack
base: 4

# stat dr

# stat attack-rate
base: 60

# stat blind
base: 0

# stat uncanny
base: 400

# stat trickle
base: 60

# stat max-health

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

${moment.content}

# entity player
faction: people
stats: max-health 100000, attack 4, attack-rate 60, blind 0, uncanny 400, max-fury 5, max-stamina 10
skills: tally
uses: swing, wild-swing, skirmish, forage
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
x: 0, y: 0
starting
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

// Every moment the language has, and every route the runtime reaches one by:
// the walk below refuses to run unless the keys are exactly the moments there
// are, so a ninth trigger is covered on the line it is added to the closed set
// rather than on the line somebody remembers a fixture. A name takes a list
// because a name can have more than one producing path, and covering one of
// two is how a broken second path stays quiet.
const MOMENTS: Record<string, Moment[]> = {
  'on empty': [
    { by: 'a swing that ran a pool out, settled at the instant it did', content: event('on empty', 'health'), arm: fights('swing', 'mouse'), seconds: 4, times: 1 },
    { by: 'its own rate running it down onto the floor', content: event('on empty', 'stamina'), seconds: 15, times: 1 },
  ],
  'on full': [{ by: 'a meter rolling over', content: event('on full', 'fury'), seconds: 15, times: 3 }],
  'damage-dealt': [
    { by: 'a landed swing', content: event('damage-dealt'), arm: fights('swing', 'rat'), seconds: 4, times: 4 },
    // The amount-reading half of a grant, asked the same question as the half
    // that ignores it: `4 * amount` over four swings of 4 damage is 64.
    { by: 'a landed swing, weighed by the damage it dealt', content: event('damage-dealt', undefined, '4*amount'), arm: fights('swing', 'rat'), seconds: 4, times: 64 },
  ],
  'damage-taken': [{ by: 'a swing that landed on it', content: event('damage-taken'), arm: fights('swing', 'rat'), seconds: 4, times: 4 }],
  missed: [{ by: 'a swing that did not land', content: event('missed'), arm: fights('wild-swing', 'rat'), seconds: 4, times: 4 }],
  evaded: [{ by: 'a swing that did not land on it', content: event('evaded'), arm: fights('wild-swing', 'rat'), seconds: 4, times: 4 }],
  completed: [{ by: 'a continuous action settling a batch of completions', content: event('completed'), arm: (state, registry) => armAction('action', 'forage', 'forage', registry, state), seconds: 10, times: 10 }],
  unfinished: [{ by: 'a repeating fight running out of attempts', content: event('unfinished'), arm: fights('skirmish', 'rat', true), seconds: 12, times: 6 }],
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

  // A key with an empty page under it would satisfy the check above and prove
  // nothing, so the entry has to be wired to the name it is filed under and
  // has to make the moment happen at least once.
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
