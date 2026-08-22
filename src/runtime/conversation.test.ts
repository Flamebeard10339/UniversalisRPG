import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { spokenBy } from '../content/sections/dialogue';
import { createGameState, RuntimeError } from './runtime';
import { reachedNow, talk } from './dialogue-runtime';

const WORLD = ['# location shore', 'x: 0, y: 0', 'starting', '', '# flag greeted', '# flag asked', '', '# entity miki', 'title: Miki'].join('\n');

const own = ['# dialogue miki', 'owner = miki', '', 'node idle:', '  when: not asked', '  Fine weather for it.'].join('\n');

const given = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: asked', '  Since you ask — there is a thing I need.'].join('\n');

const loaded = (...parts: string[]) => loadInEnglish([WORLD, ...parts].join('\n\n'));

describe('what an entity has to say', () => {
  it('is every dialogue that names it, not the one dialogue that happens to be its own', () => {
    const registry = loaded(own, given);

    expect(spokenBy(registry.dialogues, 'miki').map((each) => each.id)).toEqual(['miki', 'an-errand']);
  });

  it('reaches a node given to it by another section when its own has nothing to say', () => {
    const registry = loaded(own, given);
    const state = createGameState();
    state.flags['asked'] = true;

    expect(reachedNow(registry, state, 'miki')).toMatchObject({ dialogue: { id: 'an-errand' }, node: { name: 'offer' } });
  });

  // Two nodes may both claim the moment; the loading order settles it, which is how an expansion speaks over what it expands.
  it('gives the last word to whichever dialogue was loaded last', () => {
    const both = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: not asked', '  Since you are here — there is a thing I need.'].join('\n');

    expect(reachedNow(loaded(own, both), createGameState(), 'miki')?.dialogue.id).toBe('an-errand');
    expect(reachedNow(loaded(both, own), createGameState(), 'miki')?.dialogue.id).toBe('miki');
  });

  it('tells an entity nobody has written a word for apart from one that has nothing to say yet', () => {
    const state = createGameState();
    state.flags['asked'] = true;

    expect(() => talk('miki', loaded(), state)).toThrow(new RuntimeError('no dialogue owned by entity: miki'));
    expect(() => talk('miki', loaded(own), state)).toThrow(new RuntimeError('no reachable node in any dialogue owned by entity: miki'));
  });
});

describe('a node reached whenever nothing further along is', () => {
  const boilerplate = ['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  Well met.'].join('\n');

  it('is what an entity says by default, where a node with neither `always` nor `when:` is only ever arrived at', () => {
    const state = createGameState();

    expect(reachedNow(loaded(boilerplate), state, 'miki')?.node.name).toBe('greeting');
    expect(reachedNow(loaded(['# dialogue miki', 'owner = miki', '', 'node greeting:', '  Well met.'].join('\n')), state, 'miki')).toBeNull();
  });

  it('gives way to a node whose `when:` holds, and takes over again when it stops holding', () => {
    const gated = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: asked', '  A thing I need.'].join('\n');
    const registry = loaded(boilerplate, gated);
    const state = createGameState();

    expect(reachedNow(registry, state, 'miki')?.node.name).toBe('greeting');
    state.flags['asked'] = true;
    expect(reachedNow(registry, state, 'miki')?.node.name).toBe('offer');
  });

  it('is narrowed by a `when:` written beside it, rather than overriding it', () => {
    const narrowed = loaded(['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  when: asked', '  Well met.'].join('\n'));

    expect(reachedNow(narrowed, createGameState(), 'miki')).toBeNull();
  });
});
