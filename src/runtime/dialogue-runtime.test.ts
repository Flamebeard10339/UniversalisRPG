import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { offering, spokenBy } from '../content/sections/dialogue';
import { entitiesStood } from '../content/sections/location';
import { ownerIsElsewhere } from './actions';
import type { GameState } from './state';
import { fixtureSources } from '../content/worldFixture';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { initialState } from './save';
import { menuChoices, openersNow, reachedNow, talk } from './dialogue-runtime';

const { registry } = loadUniverseWithDiagnostics(fixtureSources());

const stood = entitiesStood(registry.locations);

const standingBy = (owner: string): GameState => {
  const state = initialState(registry);
  const where = stood.get(owner);
  if (where !== undefined) state.location = where;
  return state;
};

const thereToBeMet = (owner: string): boolean => !ownerIsElsewhere('entity', owner, standingBy(owner), registry);

const owners = [...new Set([...registry.dialogues.values()].map((each) => each.owner).filter((owner): owner is string => owner !== undefined))].filter(thereToBeMet);

describe('an entity whose one word is the whole of talking to it', () => {
  const soleVoice = owners.filter((owner) => spokenBy(registry.dialogues, owner).flatMap((dialogue) => dialogue.nodes.filter(offering)).length === 1);

  it('is most of the fixture world, so the claim below is not vacuous', () => {
    expect(soleVoice.length).toBeGreaterThan(1);
    expect(soleVoice.every((owner) => reachedNow(registry, standingBy(owner), owner) !== null)).toBe(true);
  });

  it('costs no click, because the one thread open is entered outright', () => {
    const clicked = soleVoice.filter((owner) => {
      const state = standingBy(owner);
      const only = openersNow(registry, state, owner)[0]!;
      talk(owner, registry, state);
      return state.visits[`${only.dialogue.id}.${only.node.name}`] !== 1;
    });

    expect(clicked).toEqual([]);
  });
});

describe('everyone the fixture world writes a word for', () => {
  const saysSomethingTwice = (owner: string): boolean => {
    const state = standingBy(owner);
    for (let visit = 0; visit < 2; visit++) {
      const before = state.log.length;
      const cursor = talk(owner, registry, state);
      const spoke = state.log.length > before || (cursor !== null && menuChoices(cursor, registry, state).length > 0);
      if (!spoke) return false;
    }
    return true;
  };

  it('still says something the second time they are spoken to', () => {
    expect(owners.filter((owner) => !saysSomethingTwice(owner))).toEqual([]);
  });

  it('names every thread they hold open in words rather than in an identifier', () => {
    const state = initialState(registry);
    const unnamed = [...registry.dialogues.values()].flatMap((dialogue) =>
      dialogue.nodes.filter(offering).flatMap((node) => (node.ask !== undefined || node.steps.some((step) => step.kind === 'say') ? [] : [`${dialogue.id}.${node.name}`])),
    );

    expect(unnamed).toEqual([]);
    expect(owners.flatMap((owner) => openersNow(registry, state, owner)).length).toBeGreaterThan(1);
  });
});

describe('a line that is nothing but a fragment that does not hold', () => {
  const world = `
# info base
version: 1.0.0
${FIXTURE_WORLD}
# location tent
x: 1, y: 0
entities: oolga

# entity oolga
title: Oolga

# dialogue oolga
owner = oolga

node closing:
  always
  {snubbed: You came back, then.}
  Mind how you go.

# flag snubbed
`;

  it('is not said at all, rather than said blank', () => {
    const { registry } = loadUniverseWithDiagnostics([{ name: 'base', text: world }]);
    const state = initialState(registry);
    state.location = 'base.tent';

    talk('base.oolga', registry, state);

    expect(state.log.filter((said) => said.trim() === '')).toEqual([]);
    expect(state.log).toHaveLength(1);
  });
});
