import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { spokenBy } from '../content/sections/dialogue';
import { createGameState, GameState, RuntimeError } from './runtime';
import { receiveItem } from './itemInstance';
import { choose, menuChoices, openerShown, openersNow, reachedNow, standsAtWords, talk } from './dialogue-runtime';

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

  it('opens the one thread outright, so an entity with a single thing to say costs no click to reach', () => {
    const registry = loaded(own);
    const state = createGameState();

    expect(standsAtWords(talk('miki', registry, state)!)).toBe(true);
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

    expect(standsAtWords(choose('1', cursor, registry, state)!)).toBe(true);
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

  // Two quests speaking through one entity name their threads apart only by the quest, so every tail
  // short enough to leave the quest out fits both. Taking the first would take whichever the list drew
  // first, and the list is drawn in the order of the words a player reads — so the same recording would
  // take the other thread in another language and still pass.
  it('refuses a name that fits two threads rather than taking whichever the language put first', () => {
    const asking = (id: string, said: string) => [`# quest ${id}`, `title: ${id}`, '', 'stage opening:', `  log: ${id}.`, '  miki says:', `    ${said}`, '    goto done', '', 'stage done:', '  log: Done.', '  complete'].join('\n');
    const registry = loaded(asking('an-errand', 'There is a thing I need.'), asking('a-favour', 'And a favour, while you are here.'));
    const state = createGameState();

    expect(() => choose('opening.miki.0.said', talk('miki', registry, state)!, registry, state)).toThrow(
      new RuntimeError(
        '"opening.miki.0.said" names more than one of this list: 0 "And a favour, while you are here." (a-favour.opening.miki.0.said), 1 "There is a thing I need." (an-errand.opening.miki.0.said). Write more of the one you mean',
      ),
    );

    choose('an-errand.opening.miki.0.said', talk('miki', registry, state)!, registry, state);
    expect(Object.keys(state.visits)).toEqual(['an-errand.opening.miki.0.said']);
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

// A quest is the thing the player is in the middle of, so its line is never the fallback and stands
// ahead of whatever else the entity holds open. The rest of the list is ordered by the words a player
// reads, so the two phrases below run the other way round under that ordering on its own.
describe('a line a quest gives an entity', () => {
  const errand = ['# quest an-errand', 'title: An Errand', '', 'stage asking:', '  log: Asked.', '  miki says:', '    ask: What was that errand?', '    There is a thing I need.', '    goto done', '', 'stage done:', '  log: Done.', '  complete'].join('\n');
  const bar = ['# dialogue miki', 'owner = miki', '', 'node the-ale:', '  always', '  ask: About the ale.', '  Whatever the brewery sends.'].join('\n');

  it('stands first, ahead of a thread the entity holds of its own whose phrase reads earlier', () => {
    expect(shown(loaded(bar, errand))).toEqual(['What was that errand?', 'About the ale.']);
  });
});

// The equivalent of an action's `hidden if:`, written once in the `take:` itself rather than a
// second time as a condition an author has to keep in step with it.
describe('a node that would take what the player has not got', () => {
  const trade = ['# item blade', 'title: blade', 'value: 5', '', '# item coin', 'title: coin', '', '# dialogue swap', 'owner = miki', '', 'node deal:', '  always', '  ask: swap my blade', '  Done.', '  take: 1 blade', '  give: 3 coin'].join('\n');

  const carrying = (registry: ReturnType<typeof loaded>, blades: number): GameState => {
    const state = createGameState();
    if (blades > 0) receiveItem(state, registry, 'blade', blades);
    return state;
  };

  it('is not offered at all, and takes the whole conversation with it when it is the only thing they hold open', () => {
    const registry = loaded(trade);

    expect(openersNow(registry, carrying(registry, 0), 'miki')).toEqual([]);
    expect(reachedNow(registry, carrying(registry, 0), 'miki')).toBeNull();
    expect(shown(registry, carrying(registry, 1))).toEqual(['swap my blade']);
  });

  it('leaves the other threads this entity holds standing, so only the one line goes quiet', () => {
    const registry = loaded(own, trade);

    expect(shown(registry, carrying(registry, 0))).toEqual(['Fine weather for it.']);
    expect(shown(registry, carrying(registry, 1))).toEqual(['Fine weather for it.', 'swap my blade']);
  });

  it('pays out nothing on the 1 blade it never got, which is what being unoffered is protecting', () => {
    const registry = loaded(trade);
    const state = carrying(registry, 1);

    talk('miki', registry, state);

    expect(state.inventory).toEqual({ blade: 0, coin: 3 });
  });

  it('is still offered once it is spent, because a spent node holds its take back and costs nothing', () => {
    const registry = loaded(['# item blade', 'title: blade', '', '# dialogue swap', 'owner = miki', '', 'node deal:', '  always', '  ask: swap my blade', '  again: Nothing more to swap.', '  Done.', '  take: 1 blade'].join('\n'));
    const state = carrying(registry, 1);

    talk('miki', registry, state);
    expect(state.inventory.blade).toBe(0);
    expect(shown(registry, state)).toEqual(['swap my blade']);
  });

  it('drops the one line in a menu it cannot pay for and leaves the rest of the list standing', () => {
    const registry = loaded(['# item blade', 'title: blade', '', '# dialogue miki', 'owner = miki', '', 'node idle:', '  always', '  Fine weather for it.', '  -> Here, take my blade', '    take: 1 blade', '  -> Nothing.'].join('\n'));

    const asks = (blades: number): string[] => {
      const state = carrying(registry, blades);
      return menuChoices(talk('miki', registry, state)!, registry, state).map((each) => String(each.display));
    };

    expect(asks(0)).toEqual(['Nothing.']);
    expect(asks(1)).toEqual(['Here, take my blade', 'Nothing.']);
  });
});

// The other half of the same question, answered the other way on purpose. What the player has not
// got is a durable fact they can act on and a line about it reads as a quest they have not started;
// a full pack is a passing one, and an entity who goes silent over it tells them nothing they can
// do something about.
describe('a node that hands something over to a pack with no room for it', () => {
  const oneSlot = ['# variable inventory-slots', 'value: 1', '', '# item coin', 'title: coin', '', '# item pebble', 'title: pebble', '', '# dialogue gift', 'owner = miki', '', 'node here:', '  always', '  ask: anything for me?', '  Here, take this.', '  give: 1 coin'].join('\n');

  it('is offered all the same, and says its one line and then that the pack is full', () => {
    const registry = loaded(oneSlot);
    const state = createGameState();
    receiveItem(state, registry, 'pebble', 1);

    expect(shown(registry, state)).toEqual(['anything for me?']);
    talk('miki', registry, state);

    expect(state.log.map(String)).toEqual(['Here, take this.', 'Your pack is full, so the coin stays where it is.']);
    expect(state.inventory).toEqual({ pebble: 1 });
  });
});

// The line the owner met as "the second dialogue with miki doesn't pop up a modal (because there
// is no choice)": words that arrive with nothing to answer land in the log behind whatever the
// player is looking at, and a click that visibly does nothing is what they read instead.
describe('a node that says its piece and puts up no list', () => {
  const spoken = ['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  sticky', '  Fine weather for it.'].join('\n');
  const silent = ['# dialogue miki', 'owner = miki', '', 'node greeting:', '  always', '  Fine weather for it.', '  goto quietly', '', 'node quietly:', '  set: greeted'].join('\n');

  it('stands at what it said, with the one thing left to answer being that it has been read', () => {
    const registry = loaded(spoken);
    const state = createGameState();

    const cursor = talk('miki', registry, state)!;
    expect(menuChoices(cursor, registry, state).map((each) => String(each.display))).toEqual(['Continue']);
    expect(choose('continue', cursor, registry, state)).toBeNull();
  });

  it('is answerable by where it stands as well as by the word, the way every other list is', () => {
    const registry = loaded(spoken);
    const state = createGameState();

    expect(choose('0', talk('miki', registry, state)!, registry, state)).toBeNull();
  });

  // A spent node holds back everything it says and still follows its goto, so a second visit can be
  // offered and put nothing in front of anybody — and a screen carrying no words and asking no
  // question is a click to dismiss over nothing.
  it('leaves nothing standing where the visit said nothing at all', () => {
    const registry = loaded(silent);
    const state = createGameState();

    expect(standsAtWords(talk('miki', registry, state)!)).toBe(true);
    state.log.length = 0;

    expect(talk('miki', registry, state)).toBeNull();
    expect(state.log).toEqual([]);
  });
});
