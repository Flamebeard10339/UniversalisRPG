import { describe, expect, it } from 'vitest';
import { DslError } from './parser';
import { loadModule } from './registry';

const VALID = `
# stat attack
base: 10

# stat dr

# stat max-health
base: 30

# stat regeneration

# stat attack-rate
base: 25

# resource health
rate: regeneration
max: max-health
on empty: stop

# skill brawling

# item straw
examine: A fistful of straw.

# location den
x: 0, y: 0
starting
entities: training-dummy

# location shed
x: 1, y: 0

# entity training-dummy
stats: max-health 12, dr 2
strike:
  repeating
  time: 60
  speed: attack-rate
  target: health
  ability: attack
  dr: dr
  xp: brawling 2

# dialogue caretaker
owner = training-dummy

node hello:
  when: time >= 0
  Nothing to say.
  give: 1 straw
`;

function loading(replace: string, withText: string): () => void {
  return () => loadModule(VALID.replace(replace, withText));
}

describe('load-time reference resolution', () => {
  it('loads content whose references all resolve', () => {
    expect(() => loadModule(VALID)).not.toThrow();
  });

  it('names the section and the field it failed in', () => {
    expect(loading('speed: attack-rate', 'speed: attack-rat')).toThrow(
      /# entity training-dummy action "strike" speed: names an unknown stat: attack-rat/,
    );
  });

  // Each fell through to a different silent default, so they are pinned
  // individually rather than as one representative case.
  it.each([
    ['speed: attack-rate', 'speed: nope', /unknown stat: nope/],
    ['ability: attack', 'ability: nope', /unknown stat: nope/],
    ['dr: dr', 'dr: nope', /unknown stat: nope/],
    ['target: health', 'target: helth', /unknown resource: helth/],
    ['  time: 60', '  time: 60\n  accuracy: nope', /unknown stat: nope/],
    ['  time: 60', '  time: 60\n  evasion: nope', /unknown stat: nope/],
  ])('rejects %s → %s', (from, to, message) => {
    expect(loading(from, to)).toThrow(message);
  });

  it('rejects a pool whose max: or rate: names no stat', () => {
    expect(loading('max: max-health', 'max: max-helth')).toThrow(/# resource health max: names an unknown stat: max-helth/);
    expect(loading('rate: regeneration', 'rate: regen')).toThrow(/# resource health rate: names an unknown stat: regen/);
  });

  it('rejects a location pointing at an entity or a neighbour that does not exist', () => {
    expect(loading('entities: training-dummy', 'entities: training-dumy')).toThrow(/# location den entities: names an unknown entity: training-dumy/);
    expect(loading('starting', 'starting\nadjacent: beach')).toThrow(/# location den adjacent: names an unknown location: beach/);
  });

  // Never read: the action asks for the correctly-spelled stat, so the override
  // silently does nothing.
  it('rejects an actor sheet assigning a stat nobody declared', () => {
    expect(loading('stats: max-health 12, dr 2', 'stats: max-health 12, drr 2')).toThrow(/# entity training-dummy stats: names an unknown stat: drr/);
  });

  it('checks an item action and a recipe the same way', () => {
    expect(loading('examine: A fistful of straw.', 'examine: A fistful of straw.\neat:\n  time: 1\n  speed: nope\n  take: 1 straw')).toThrow(
      /# item straw action "eat" speed: names an unknown stat: nope/,
    );
    expect(() => loadModule(`${VALID}\n# recipe weave\ntime: 1\nspeed: nope\nout: 1 straw\n`)).toThrow(/# recipe weave speed: names an unknown stat: nope/);
  });

  // An action's RESULTS name ids too, each with its own silent failure mode.
  it.each([
    ['  ability: attack', '  ability: attack\n  drain: 5 bogus', /drain: names an unknown resource: bogus/],
    ['  ability: attack', '  ability: attack\n  restore: 5 bogus', /restore: names an unknown resource: bogus/],
    ['  ability: attack', '  ability: attack\n  give: 1 bogus', /give: names an unknown item: bogus/],
    ['  ability: attack', '  ability: attack\n  take: 1 bogus', /take: names an unknown item: bogus/],
    ['  ability: attack', '  ability: attack\n  relocate: bogus', /relocate: names an unknown location: bogus/],
    ['  ability: attack', '  ability: attack\n  discover: bogus', /discover: names an unknown location: bogus/],
    ['  xp: brawling 2', '  xp: bogus 2', /xp: names an unknown skill: bogus/],
    ['  repeating', '  repeating\n  +100% bogus', /tag names an unknown stat: bogus/],
  ])('rejects a result or tag naming nothing: %s → %s', (from, to, message) => {
    expect(loading(from, to)).toThrow(message);
  });

  it('rejects an unreachable handler: a pool block, a dialogue effect, a choice effect', () => {
    expect(loading('on empty: stop', 'on empty: give: 1 bogus')).toThrow(/# resource health on empty: give: names an unknown item: bogus/);
    expect(loading('  give: 1 straw', '  give: 1 bogus')).toThrow(/# dialogue caretaker node hello give: names an unknown item: bogus/);
    expect(loading('  give: 1 straw', '  -> Take it.\n    give: 1 bogus')).toThrow(/# dialogue caretaker node hello choice give: names an unknown item: bogus/);
    expect(loading('owner = training-dummy', 'owner = training-dumy')).toThrow(/# dialogue caretaker owner names an unknown entity: training-dumy/);
  });

  it('checks a recipe through the action it compiles to', () => {
    expect(() => loadModule(`${VALID}\n# recipe weave\nin: 1 bogus\nout: 1 straw\n`)).toThrow(/# recipe weave take: names an unknown item: bogus/);
    expect(() => loadModule(`${VALID}\n# recipe weave\nout: 1 straw\nskill: bogus 1\n`)).toThrow(/# recipe weave xp: names an unknown skill: bogus/);
    expect(() => loadModule(`${VALID}\n# recipe weave\naccuracy: attack\nout: 1 straw\nburnt: 1 bogus\n`)).toThrow(/# recipe weave give: names an unknown item: bogus/);
  });

  it('checks a food item tag, the other way a stat id reaches statRange', () => {
    expect(loading('examine: A fistful of straw.', 'examine: A fistful of straw.\nfood, +3 bogus, 60s')).toThrow(/# item straw tag names an unknown stat: bogus/);
  });

  it('resolves forward references, since the pass runs once everything has parsed', () => {
    expect(() => loadModule('# entity ogre\nstats: rage 3\nroar:\n  time: 1\n  ability: rage\n\n# stat rage\n')).not.toThrow();
  });

  it('raises a DslError, the same failure kind the rest of load uses', () => {
    expect(loading('target: health', 'target: helth')).toThrow(DslError);
  });
});
