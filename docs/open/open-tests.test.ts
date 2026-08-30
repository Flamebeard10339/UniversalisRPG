// Red on purpose. Each describe below is named for an open line in this folder and
// pins the behaviour that line asks for, so it goes green the day the line closes
// and migrates into the suite by being moved. `npm run handoff` reads it.
import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../../src/content/load';
import { FIXTURE_WORLD } from '../../src/content/worldFixture';
import { talk } from '../../src/runtime/dialogue-runtime';
import { initialState } from '../../src/runtime/save';

describe('a-line-of-only-a-false-fragment-is-dropped', () => {
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

  it('says the line that stands and nothing where the false one was', () => {
    const { registry } = loadUniverseWithDiagnostics([{ name: 'base', text: world }]);
    const state = initialState(registry);

    talk('base.oolga', registry, state);

    expect(state.log.filter((said) => said.trim() === '')).toEqual([]);
    expect(state.log).toHaveLength(1);
  });
});
