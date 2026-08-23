import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { spokenBy } from '../content/sections/dialogue';
import { createGameState, RuntimeError } from './runtime';
import { choose, menuChoices, openerShown, openersNow, reachedNow, talk } from './dialogue-runtime';

const WORLD = ['# location shore', 'x: 0, y: 0', 'starting', '', '# flag greeted', '# flag asked', '', '# entity miki', 'title: Miki'].join('\n');

const own = ['# dialogue miki', 'owner = miki', '', 'node idle:', '  when: not asked', '  Fine weather for it.'].join('\n');

const given = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: asked', '  Since you ask — there is a thing I need.'].join('\n');

const loaded = (...parts: string[]) => loadInEnglish([WORLD, ...parts].join('\n\n'));

const shown = (registry: ReturnType<typeof loaded>, state = createGameState()) => openersNow(registry, state, 'miki').map((opener) => openerShown(registry, state, opener.node));

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

  it('tells an entity nobody has written a word for apart from one that has nothing to say yet', () => {
    const state = createGameState();
    state.flags['asked'] = true;

    expect(() => talk('miki', loaded(), state)).toThrow(new RuntimeError('no dialogue owned by entity: miki'));
    expect(() => talk('miki', loaded(own), state)).toThrow(new RuntimeError('no node with anything to say in any dialogue owned by entity: miki'));
  });
});

// The whole of the arbitration the engine still does: none. Two modules may both hand this entity something to say and the player is the one who settles which they hear.
describe('every thread an entity holds open is put to the player at once', () => {
  const both = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: not asked', '  Since you are here — there is a thing I need.'].join('\n');

  it('opens the one thread outright, so an entity with a single thing to say costs no click', () => {
    const registry = loaded(own);
    const state = createGameState();

    expect(talk('miki', registry, state)).toBeNull();
    expect(state.log).toEqual(['Fine weather for it.']);
  });

  it('puts up both when two of them hold, whichever module was loaded first', () => {
    for (const registry of [loaded(own, both), loaded(both, own)]) {
      expect(shown(registry)).toEqual(['Fine weather for it.', 'Since you are here — there is a thing I need.']);
    }
  });

  it('says nothing until the player picks, and then says only what they picked', () => {
    const registry = loaded(own, both);
    const state = createGameState();

    const cursor = talk('miki', registry, state)!;
    expect(state.log).toEqual([]);
    expect(menuChoices(cursor, registry, state).map((each) => each.display)).toEqual(['Fine weather for it.', 'Since you are here — there is a thing I need.']);

    expect(choose('1', cursor, registry, state)).toBeNull();
    expect(state.log).toEqual(['Since you are here — there is a thing I need.']);
  });

  it('drops a thread once it is spent, and offers no conversation at all when the last one is', () => {
    const registry = loaded(own, both);
    const state = createGameState();

    const cursor = talk('miki', registry, state)!;
    choose('0', cursor, registry, state);
    expect(shown(registry, state)).toEqual(['Since you are here — there is a thing I need.']);

    talk('miki', registry, state);
    expect(openersNow(registry, state, 'miki')).toEqual([]);
    expect(() => talk('miki', registry, state)).toThrow(RuntimeError);
  });
});

// The list moves with the words in it; what an author writes to pick out of it must not.
describe('picking an entry out of a list', () => {
  const both = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: not asked', '  Since you are here — there is a thing I need.'].join('\n');
  const menu = ['# dialogue miki', 'owner = miki', '', 'node idle:', '  always', '  Fine weather for it.', '  -> Tell me more', '    goto more', '  -> Nothing.', '', 'node more:', '  There is not much more.'].join('\n');

  it('takes a thread by the node it opens, under the name visits counts it by, whole or by any tail of it', () => {
    for (const named of ['an-errand.offer', 'offer']) {
      const state = createGameState();
      const registry = loaded(own, both);
      choose(named, talk('miki', registry, state)!, registry, state);
      expect(Object.keys(state.visits)).toEqual(['an-errand.offer']);
    }
  });

  // A quest names the node it hands over `<quest>.<stage>.<entity>.<n>.said`, and that numeral is why
  // the shape of the string cannot be read back to tell an id from a line somebody says. Every thread
  // the shipped corpus offers is one of these.
  it('takes a thread a quest gave an entity by a tail, though its name carries a numeral', () => {
    const quest = ['# quest an-errand', 'title: An Errand', 'stage asking:', '  log: Asked.', '  miki says:', '    ask: About the thing.', '    There is a thing I need.', '    goto done', '', 'stage done:', '  log: Done.', '  complete'].join('\n');
    const state = createGameState();
    const registry = loaded(own, quest);

    choose('asking.miki.0.said', talk('miki', registry, state)!, registry, state);

    expect(Object.keys(state.visits)).toEqual(['an-errand.asking.miki.0.said']);
  });

  it('takes a line in one node by the words it is written with, and by the place it stands in', () => {
    for (const answer of ['Tell me more', '0']) {
      const state = createGameState();
      const registry = loaded(menu);
      choose(answer, talk('miki', registry, state)!, registry, state);
      expect(state.log).toEqual(['Fine weather for it.', 'There is not much more.']);
    }
  });

  it('names what it does offer when an answer picks out nothing, so an author sees what they could have written', () => {
    const state = createGameState();
    const registry = loaded(menu);
    const cursor = talk('miki', registry, state)!;

    expect(() => choose('more', cursor, registry, state)).toThrow(new RuntimeError('no choice matches "more": this list offers 0 "Tell me more", 1 "Nothing."'));
  });

  it('names a thread by the node and not by the phrase it is picked with, since the phrase is what moves', () => {
    const state = createGameState();
    const registry = loaded(own, both);

    expect(() => choose('Fine weather for it.', talk('miki', registry, state)!, registry, state)).toThrow(
      new RuntimeError('no choice matches "Fine weather for it.": this list offers 0 "Fine weather for it." (miki.idle), 1 "Since you are here — there is a thing I need." (an-errand.offer)'),
    );
  });
});

// A node said once and fallen silent is still a node whose `when:` holds, and offering the conversation anyway is how a player comes to click talk and watch the view redraw with nothing new in it.
describe('a conversation with nothing left to say is not offered', () => {
  const spent = (...lines: string[]) => loaded(['# dialogue miki', 'owner = miki', '', 'node idle:', '  always', ...lines].join('\n'));

  const secondVisit = (registry: ReturnType<typeof loaded>) => {
    const state = createGameState();
    talk('miki', registry, state);
    return reachedNow(registry, state, 'miki');
  };

  it('drops a spent node that neither replays nor writes an again:', () => {
    expect(secondVisit(spent('  Fine weather for it.'))).toBeNull();
  });

  it('keeps one that says something on a later visit', () => {
    expect(secondVisit(spent('  sticky', '  Fine weather for it.'))).toMatchObject({ node: { name: 'idle' } });
    expect(secondVisit(spent('  again: Still fine.', '  Fine weather for it.'))).toMatchObject({ node: { name: 'idle' } });
  });

  it('keeps one that still puts a choice, since a spent node holds back what it says and not what it offers', () => {
    expect(secondVisit(spent('  Fine weather for it.', '  -> Indeed.'))).toMatchObject({ node: { name: 'idle' } });
  });
});

describe('a node reached whenever nothing further along is', () => {
  const boilerplate = ['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  Well met.'].join('\n');

  it('is what an entity says by default, where a node with neither `always` nor `when:` is only ever arrived at', () => {
    const state = createGameState();

    expect(reachedNow(loaded(boilerplate), state, 'miki')?.node.name).toBe('greeting');
    expect(reachedNow(loaded(['# dialogue miki', 'owner = miki', '', 'node greeting:', '  Well met.'].join('\n')), state, 'miki')).toBeNull();
  });

  it('gives way to a thread whose `when:` holds rather than standing beside it, and takes over again when it stops holding', () => {
    const gated = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: asked', '  A thing I need.'].join('\n');
    const registry = loaded(boilerplate, gated);
    const state = createGameState();

    expect(shown(registry, state)).toEqual(['Well met.']);
    state.flags['asked'] = true;
    expect(shown(registry, state)).toEqual(['A thing I need.']);
  });

  it('is narrowed by a `when:` written beside it, rather than overriding it', () => {
    const narrowed = loaded(['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  when: asked', '  Well met.'].join('\n'));

    expect(reachedNow(narrowed, createGameState(), 'miki')).toBeNull();
  });
});

// What lets ordinary standing dialogue stand in the same list as the threads a quest hands out: naming a node is what makes it one of them.
describe('a node the player is given a phrase for', () => {
  const bar = ['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  Well met.', '', 'node the-ale:', '  always', '  ask: What is on tap?', '  Whatever the brewery sends.'].join('\n');

  it('stands beside a thread instead of giving way to it, and is picked by its phrase and not by what it says', () => {
    const gated = ['# dialogue an-errand', 'owner = miki', '', 'node offer:', '  when: asked', '  A thing I need.'].join('\n');
    const state = createGameState();
    state.flags['asked'] = true;

    expect(shown(loaded(bar, gated), state)).toEqual(['A thing I need.', 'What is on tap?']);
  });

  it('is refused where nothing would ever put the phrase to a player', () => {
    expect(() => loaded(['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  goto aside', '', 'node aside:', '  ask: What is on tap?', '  Whatever the brewery sends.'].join('\n'))).toThrow(
      /node aside writes ask: and is only ever arrived at from another node/,
    );
  });
});
