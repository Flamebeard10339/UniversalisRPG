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

# resource health
max: max-health

# resource fury
max: max-fury
rate: trickle
start: 0

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
stats: max-health 100000, attack 4, attack-rate 60, blind 0, uncanny 400, max-fury 5
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

const event = (trigger: string, resource?: string): string => `
# event moment
${resource === undefined ? '' : `resource: ${resource}\n`}trigger: ${trigger}

# skill tally
gain 1 experience on moment
`;

const fights = (action: string, target: string, repeating = false): Moment['arm'] => (state, registry) => {
  armFightAction(action, target, registry, state);
  if (repeating) state.activeAction!.repeating = true;
};

// One entry per moment the language has, and the walk below refuses to run
// unless the entries are exactly the moments there are — so an eleventh
// trigger is covered on the line it is added to the closed set, rather than on
// the line somebody remembers to write a fixture.
const MOMENTS: Record<string, Moment> = {
  'on empty': { content: event('on empty', 'health'), arm: fights('swing', 'mouse'), seconds: 4, times: 1 },
  'on full': { content: event('on full', 'fury'), seconds: 15, times: 3 },
  'damage-dealt': { content: event('damage-dealt'), arm: fights('swing', 'rat'), seconds: 4, times: 4 },
  'damage-taken': { content: event('damage-taken'), arm: fights('swing', 'rat'), seconds: 4, times: 4 },
  missed: { content: event('missed'), arm: fights('wild-swing', 'rat'), seconds: 4, times: 4 },
  evaded: { content: event('evaded'), arm: fights('wild-swing', 'rat'), seconds: 4, times: 4 },
  completed: { content: event('completed'), arm: (state, registry) => armAction('action', 'forage', 'forage', registry, state), seconds: 10, times: 10 },
  unfinished: { content: event('unfinished'), arm: fights('skirmish', 'rat', true), seconds: 12, times: 6 },
  'on hit': { content: '# skill tally', playerBlock: 'on hit:\n  xp: tally 1', arm: fights('swing', 'rat'), seconds: 4, times: 4 },
  'when hit': { content: '# skill tally', ratBlock: 'when hit:\n  xp: tally 1', arm: fights('swing', 'rat'), seconds: 4, times: 4 },
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
    for (const [name, moment] of Object.entries(MOMENTS)) {
      const wiring = (HOOK_LABELS.includes(name) ? [moment.playerBlock, moment.ratBlock] : [moment.content]).filter((part): part is string => part !== undefined);
      const wired = HOOK_LABELS.includes(name) ? `${name}:` : `trigger: ${name}`;
      expect(wiring.join(' '), name).toContain(wired);
      expect(moment.times, name).toBeGreaterThan(0);
    }
  });

  for (const [name, moment] of Object.entries(MOMENTS)) {
    it(`fires ${moment.times} time(s) for ${name}, however the span is cut`, () => {
      for (const cuts of [1, 2, 3, 5, 10]) expect(counted(moment, cuts), `${cuts} cuts`).toBe(moment.times);
    });
  }
});
