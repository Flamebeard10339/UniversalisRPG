import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../../src/content/load';
import { sessionLocalizer, startSession, view } from '../../src/runtime/session';
import { formatView, printed } from './replLines';
import { fixtureSources } from '../../src/content/worldFixture';

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
