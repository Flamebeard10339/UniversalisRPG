import { describe, expect, it } from 'vitest';
import { armFightAction, createGameState, GameState, initResources, resolve, useAction } from './runtime';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { compareSave, loadSave, SAVE_VERSION, serializeSave } from './save';
import { secondsToMs } from './units';
import { skillLevel } from './skills';

const SHEET =
  FIXTURE_WORLD +
  `
# stat dr

# stat attack-rate
base: 60

# stat blind
base: 0

# stat uncanny
base: 400

# resource health
max: max-health

# faction people

# faction vermin

# event bit-something
trigger: damage-dealt

# event got-bitten
trigger: damage-taken

# event swung-at-air
trigger: missed

# event slipped-it
trigger: evaded

# skill melee
gain 4*amount experience on bit-something

# skill hide
gain 5 experience on got-bitten

# skill flailing
gain 7 experience on swung-at-air

# skill ducking
gain 3 experience on slipped-it

# skill gnawing
gain 2*amount experience on bit-something

# action swing
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# action wild-swing
rate: my attack-rate
accuracy: my blind vs their uncanny
damage: my attack vs their dr
depletes: their health
`;

const arena = (playerAction: string, ratSkills: string, ratUses: string): string => `${SHEET}
# entity player
faction: people
stats: max-health 100000, attack 4, attack-rate 60, blind 0, uncanny 400
skills: melee, flailing
uses: ${playerAction}

# entity rat
faction: vermin
stats: max-health 100000, attack 4, attack-rate 60, blind 0, uncanny 400
skills: ${ratSkills}
${ratUses}

# location camp
entities: rat
`;

const ONE_SIDED = arena('swing', 'hide, ducking', '');
const MISSING = arena('wild-swing', 'hide, ducking', '');
const BOTH_SIDED = arena('swing', 'hide, ducking, gnawing', 'uses: swing');

function fought(source: string, action: string, seconds: number): GameState {
  const registry = loadInEnglish(source);
  const state = createGameState('camp');
  initResources(state, registry);
  armFightAction(action, 'rat', registry, state);
  resolve(state, registry, secondsToMs(seconds));
  return state;
}

describe('a trigger name says whose view it is', () => {
  it('trains the performer on what it dealt and the struck on what it took', () => {
    const state = fought(ONE_SIDED, 'swing', 4);
    expect(state.xp).toEqual({ melee: 64, hide: 20 });
  });

  it('trains the performer on a miss and the struck on the evasion of it', () => {
    const state = fought(MISSING, 'wild-swing', 4);
    expect(state.xp).toEqual({ flailing: 28, ducking: 12 });
  });

  it('leaves a skill alone where its moment landed on the other side', () => {
    expect(fought(ONE_SIDED, 'swing', 4).xp.gnawing).toBeUndefined();
    expect(fought(MISSING, 'wild-swing', 4).xp.melee).toBeUndefined();
  });
});

describe('the player is not special', () => {
  it('earns an authored enemy experience from its own events, by the same path', () => {
    const state = fought(BOTH_SIDED, 'swing', 4);
    expect(state.xp.gnawing).toBe(32);
    expect(state.xp.melee).toBe(64);
  });

  it('grants nothing for a skill the entity it happened to does not carry', () => {
    const withoutTheSheet = fought(arena('swing', 'ducking', ''), 'swing', 4);
    expect(withoutTheSheet.xp.hide).toBeUndefined();
    expect(withoutTheSheet.xp.melee).toBe(64);
  });
});

describe('one accumulator, and one place that writes it', () => {
  it('lands in the same store the xp: result writes, and says so the same way', () => {
    const registry = loadInEnglish(ONE_SIDED);
    const state = createGameState('camp');
    initResources(state, registry);
    armFightAction('swing', 'rat', registry, state);
    resolve(state, registry, secondsToMs(70));
    expect(state.xp.melee).toBe(16 * 70);
    expect(state.log.filter((line) => line.includes('Melee') && line.includes('level'))).toHaveLength(skillLevel(state.xp.melee) - 1);
  });

  it('keeps the save shape it inherited, so a state that earned a grant reloads clean', () => {
    const registry = loadInEnglish(ONE_SIDED);
    const state = createGameState('camp');
    initResources(state, registry);
    armFightAction('swing', 'rat', registry, state);
    resolve(state, registry, secondsToMs(4));

    expect(SAVE_VERSION).toBe(13);
    const { version, ...diff } = JSON.parse(serializeSave(state, registry));
    expect(Object.keys(diff.xp)).toEqual(['melee', 'hide']);
    expect(compareSave(state, { version, diff }, registry)).toEqual([]);

    const reloaded = createGameState('camp');
    expect(loadSave(reloaded, { version, diff }, registry)).toEqual([]);
    expect(reloaded.xp).toEqual(state.xp);
  });
});

describe('a grant costs nothing when nobody wrote one', () => {
  it('walks the declared skills at most once however many moments fire', () => {
    const registry = loadInEnglish(BOTH_SIDED);
    const values = registry.skills.values.bind(registry.skills);
    let walks = 0;
    registry.skills.values = () => {
      walks += 1;
      return values();
    };
    const state = createGameState('camp');
    initResources(state, registry);
    armFightAction('swing', 'rat', registry, state);
    resolve(state, registry, secondsToMs(120));

    expect(state.xp.melee).toBeGreaterThan(0);
    expect(walks).toBeLessThanOrEqual(1);
  });

  it('resolves the same segments, log and clock whether or not a grant was authored', () => {
    const ungranted = SHEET.replace(/^gain .*$/gm, '');
    const withGrants = fought(BOTH_SIDED, 'swing', 30);
    const without = fought(`${ungranted}${BOTH_SIDED.slice(SHEET.length)}`, 'swing', 30);

    expect(Object.keys(without.xp)).toEqual([]);
    expect(Object.keys(withGrants.xp).length).toBeGreaterThan(0);
    expect({ ...without, xp: undefined, log: undefined }).toEqual({ ...withGrants, xp: undefined, log: undefined });
    expect(without.log).toEqual(withGrants.log.filter((line) => !line.includes('level')));
  });
});

describe('the resolve loop does not grow with the skills declared', () => {
  it('runs a fight to the same state with three hundred idle skills on the page', () => {
    const padding = Array.from({ length: 300 }, (_, i) => `# skill filler-${i}`).join('\n\n');
    const padded = loadInEnglish(`${ONE_SIDED}\n${padding}\n`);
    expect(padded.skills.size).toBeGreaterThan(300);

    const state = createGameState('camp');
    initResources(state, padded);
    armFightAction('swing', 'rat', padded, state);
    resolve(state, padded, secondsToMs(20));

    expect(state).toEqual(fought(ONE_SIDED, 'swing', 20));
  });
});

describe('an entity with no sheet at all', () => {
  it('earns nothing rather than throwing when a moment reaches it', () => {
    const state = fought(arena('swing', '', ''), 'swing', 4);
    expect(state.xp).toEqual({ melee: 64 });
    expect(state.activeAction).not.toBeNull();
  });
});

const OUTCOMES =
  FIXTURE_WORLD +
  `
# stat dr

# stat attack-rate
base: 60

# resource health
max: max-health

# faction people

# faction vermin

# event job-done
trigger: completed

# event gave-up
trigger: unfinished

# skill finishing
gain 10 experience on job-done

# skill quitting
gain 6 experience on gave-up

# action duel
rate: my attack-rate
damage: my attack vs their dr
depletes: their health

# action forage
title: forage
continuous
time: 1

# action skirmish
rate: my attack-rate
damage: my attack vs their dr
depletes: their health
attempts: 2

# entity player
faction: people
stats: max-health 1000, attack 4, attack-rate 60
skills: finishing, quitting
uses: duel, skirmish, forage

# entity rat
faction: vermin
stats: max-health 8, attack 4, attack-rate 60

# entity tortoise
faction: vermin
stats: max-health 10000, attack 4, attack-rate 60

# location camp
entities: rat, tortoise
`;

describe('an action that reached its end, and one that did not', () => {
  it('trains the performer on the completion it reached', () => {
    const registry = loadInEnglish(OUTCOMES);
    const state = createGameState('camp');
    initResources(state, registry);
    armFightAction('duel', 'rat', registry, state);
    resolve(state, registry, secondsToMs(4));

    expect(state.activeAction).toBeNull();
    expect(state.xp).toEqual({ finishing: 10 });
  });

  it('trains the performer on the attempts: bound it ran out of instead', () => {
    const registry = loadInEnglish(OUTCOMES);
    const state = createGameState('camp');
    initResources(state, registry);
    armFightAction('skirmish', 'tortoise', registry, state);
    resolve(state, registry, secondsToMs(4));

    expect(state.activeAction).toBeNull();
    expect(state.xp).toEqual({ quitting: 6 });
  });

  it('grants once per completion a batched span produced', () => {
    const registry = loadInEnglish(OUTCOMES);
    const state = createGameState('camp');
    initResources(state, registry);
    useAction('action', 'forage', 'forage', registry, state);
    resolve(state, registry, secondsToMs(10));

    expect(state.activeAction).not.toBeNull();
    expect(state.xp).toEqual({ finishing: 100 });
  });

  it('grants once per completion a repeated span produced, and no more', () => {
    const registry = loadInEnglish(OUTCOMES);
    const state = createGameState('camp');
    initResources(state, registry);
    armFightAction('skirmish', 'tortoise', registry, state);
    state.activeAction!.repeating = true;
    resolve(state, registry, secondsToMs(12));

    expect(state.xp.quitting).toBe(6 * 6);
  });
});
