import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../../src/content/load';
import { sessionLocalizer, startSession, view } from '../../src/runtime/session';
import { formatView, printed } from './replLines';
import { fixtureSources } from '../../src/content/worldFixture';

// The parity harness counts the words a surface says, and `choices[].detail` holds the same word
// set as `entities[].title` at a `/look` — so a terminal that stopped naming who offers a choice
// still passes it. This is that hole: a choice that names an owner says the owner on its own line.
describe('a choice line carries what offers it', () => {
  const registry = loadUniverseWithDiagnostics(fixtureSources()).registry;

  it('says the owner beside the choice, for every choice the view gives one', () => {
    const session = startSession(registry);
    const v = view(session);
    const lines = formatView(v, sessionLocalizer(session)).map(printed);

    const owned = v.choices.filter((choice) => choice.detail !== undefined);
    expect(owned.length).toBeGreaterThan(0);
    for (const choice of owned) expect(lines.some((line) => line.includes(String(choice.label)) && line.includes(String(choice.detail)))).toBe(true);
  });
});
