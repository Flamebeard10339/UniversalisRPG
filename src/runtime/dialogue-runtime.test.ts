import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { spokenBy } from '../content/sections/dialogue';
import type { DialogueNode } from '../content/sections/dialogue';
import { initialState } from './save';
import { menuChoices, reachedNow, talk } from './dialogue-runtime';

const CORPUS = readdirSync('content')
  .filter((name) => name.endsWith('.dsl'))
  .map((name) => ({ name, text: readFileSync(path.join('content', name), 'utf8') }));

describe('an entity whose one word is the whole of talking to it', () => {
  const { registry } = loadUniverseWithDiagnostics(CORPUS);

  // A node a conversation may open on: `always`, or a `when:` narrowing which moment is its turn. One only ever arrived at by a goto is neither, and this is the same question `reachedNow` asks.
  const offering = (node: DialogueNode): boolean => node.always === true || node.when !== undefined;

  const owners = [...new Set([...registry.dialogues.values()].map((each) => each.owner).filter((owner): owner is string => owner !== undefined))];

  // Owners for whom exactly one node is ever put forward, so nothing else can take the turn and whatever that node does is the whole of what talking to them ever is.
  const soleVoice = owners.filter((owner) => spokenBy(registry.dialogues, owner).flatMap((dialogue) => dialogue.nodes.filter(offering)).length === 1);

  // Talking twice, through the runtime rather than through a reading of it: what a second visit does is `enterNode`'s to decide, and a test that decided it again would drift the day that one changed.
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

  it('is most of the corpus, so the claim below is not vacuous', () => {
    expect(soleVoice.length).toBeGreaterThan(5);
    expect(soleVoice.every((owner) => reachedNow(registry, initialState(registry), owner) !== null)).toBe(true);
  });

  it('still says something the second time it is spoken to', () => {
    expect(soleVoice.filter((owner) => !saysSomethingTwice(owner))).toEqual([]);
  });
});
