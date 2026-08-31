import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { offering, spokenBy } from '../content/sections/dialogue';
import { shippedSources } from '../content/shipped';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { initialState } from './save';
import { menuChoices, openersNow, reachedNow, talk } from './dialogue-runtime';

const { registry } = loadUniverseWithDiagnostics(shippedSources());

const owners = [...new Set([...registry.dialogues.values()].map((each) => each.owner).filter((owner): owner is string => owner !== undefined))];

describe('an entity whose one word is the whole of talking to it', () => {
  // Owners for whom exactly one node is ever put forward, so nothing else can take the turn and whatever that node does is the whole of what talking to them ever is.
  const soleVoice = owners.filter((owner) => spokenBy(registry.dialogues, owner).flatMap((dialogue) => dialogue.nodes.filter(offering)).length === 1);

  it('is most of the corpus, so the claim below is not vacuous', () => {
    expect(soleVoice.length).toBeGreaterThan(5);
    expect(soleVoice.every((owner) => reachedNow(registry, initialState(registry), owner) !== null)).toBe(true);
  });

  // Talking to them enters the node itself rather than putting up a list of one to pick out of, which the visit it records is the proof of: a list is answered before anything is entered.
  it('costs no click, because the one thread open is entered outright', () => {
    const clicked = soleVoice.filter((owner) => {
      const state = initialState(registry);
      const only = openersNow(registry, state, owner)[0]!;
      talk(owner, registry, state);
      return state.visits[`${only.dialogue.id}.${only.node.name}`] !== 1;
    });

    expect(clicked).toEqual([]);
  });
});

describe('everyone the corpus writes a word for', () => {
  // Talking twice, through the runtime rather than through a reading of it: what a second visit does is `enterNode`'s to decide, and a test that decided it again would drift the day that one changed. A list of threads is something said as much as a line is, which is why an entity holding several is held to this too.
  const saysSomethingTwice = (owner: string): boolean => {
    const state = initialState(registry);
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

  // The phrase a player picks a thread by falls back to the first line it says, and falls through to the node's own name when it says nothing at all — which is an identifier put in front of a player. Every opener the corpus holds is its own subject here, so a dialogue written next month is covered with no edit.
  it('names every thread they hold open in words rather than in an identifier', () => {
    const state = initialState(registry);
    const unnamed = [...registry.dialogues.values()].flatMap((dialogue) =>
      dialogue.nodes.filter(offering).flatMap((node) => (node.ask !== undefined || node.steps.some((step) => step.kind === 'say') ? [] : [`${dialogue.id}.${node.name}`])),
    );

    expect(unnamed).toEqual([]);
    expect(owners.flatMap((owner) => openersNow(registry, state, owner)).length).toBeGreaterThan(5);
  });
});

// Written out rather than drawn from the corpus, because the corpus holds no such line: the author
// who met this paired their one-sided clauses so that one of each pair always stands, which is the
// technique the fragment's own entry now points at.
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

    talk('base.oolga', registry, state);

    expect(state.log.filter((said) => said.trim() === '')).toEqual([]);
    expect(state.log).toHaveLength(1);
  });
});
