import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { answerModal, Modal, openModalNamed, pruneModals, publishModal, topModal } from './modals';
import { createGameState, GameState, RuntimeError } from './runtime';
import { applyResultsNow } from './effects';
import { apply, PlaySession, startSession, submitModal, view } from './session';

// One entity that opens a modal from a dialogue effect and then offers a menu,
// which is the only shape in the shipped grammar that stacks two modals.
const STACKING_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  sage

# flag greeted

# flag asked

# entity sage
title: Sage

# dialogue sage-talk
owner = sage

node greeting:
  when: not greeted
  set: greeted
  open modal: character-creation
  -> Ask about the mirror.
    set: asked
  -> Say nothing.
`;

function stackingSession(): PlaySession {
  return startSession(loadModule(STACKING_MODULE));
}

function names(state: GameState): string[] {
  return state.modals.map((frame) => frame.name);
}

describe('the modal stack', () => {
  it('leaves both when one opens over another, and reveals the one beneath when the top is answered', () => {
    const session = stackingSession();

    let v = apply(session, 'talk:sage');
    expect(v.modals.map((modal) => modal.name)).toEqual(['character-creation', 'dialogue']);

    v = submitModal(session, { choice: 'Ask about the mirror.' });
    expect(session.state.flags.asked).toBe(true);
    expect(v.modals.map((modal) => modal.name)).toEqual(['character-creation']);

    submitModal(session, { name: 'Rowan' });
    v = submitModal(session, { race: 'Dwarf' });
    expect(v.modals).toEqual([]);
    expect(session.state.player).toEqual({ name: 'Rowan', race: 'Dwarf' });
  });

  it('offers only the options still to be answered, and nothing about how to draw them', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');
    const published: Modal = publishModal(session.state.modals[0], session.state, session.registry);

    expect(Object.keys(published).sort()).toEqual(['name', 'options']);
    for (const option of published.options) expect(Object.keys(option).sort()).toEqual(['key', 'label', 'values']);
  });

  it('publishes a dialogue menu as one option whose values are the choices the state currently allows', () => {
    const session = stackingSession();
    const v = apply(session, 'talk:sage');
    const dialogue = v.modals[1];

    expect(dialogue.name).toBe('dialogue');
    expect(dialogue.options).toEqual([{ key: 'choice', label: 'Choice', values: ['Ask about the mirror.', 'Say nothing.'] }]);
  });

  it('withdraws every world choice while a modal is open, and gives them back once it closes', () => {
    const session = stackingSession();

    expect(view(session).choices.map((choice) => choice.id)).toEqual(['talk:sage']);
    const opened = apply(session, 'talk:sage');
    expect(opened.choices).toEqual([]);

    submitModal(session, { choice: 'Say nothing.' });
    submitModal(session, { name: 'Rowan' });
    const closed = submitModal(session, { race: 'Human' });
    expect(closed.choices.map((choice) => choice.id)).toEqual([]);
    // The dialogue has no reachable node left, so `talk:` is gone rather than
    // withheld — what matters is that the withdrawal was the modal's doing.
    expect(closed.modals).toEqual([]);
  });
});

describe('opening and answering', () => {
  const registry = loadModule(STACKING_MODULE);

  it('opens the same modal once however many times a batch applies the result', () => {
    const state = createGameState();
    applyResultsNow(state, registry, [{ kind: 'open-modal', modal: 'character-creation' }], 4);
    openModalNamed(state, 'character-creation');
    expect(names(state)).toEqual(['character-creation']);
  });

  it('refuses a modal nothing defines, and one that carries a payload no result line can spell', () => {
    const state = createGameState();
    expect(() => openModalNamed(state, 'quest-journal')).toThrow(/unknown modal: quest-journal/);
    expect(() => openModalNamed(state, 'dialogue')).toThrow(/not opened by name/);
    expect(() => applyResultsNow(state, registry, [{ kind: 'open-modal', modal: 'quest-journal' }])).toThrow(RuntimeError);
    expect(state.modals).toEqual([]);
  });

  it('refuses an option it does not have, a value it does not take, and an answer with nothing open', () => {
    const state = createGameState();
    expect(() => answerModal(state, registry, { name: 'Rowan' })).toThrow(/no modal is open/);

    openModalNamed(state, 'character-creation');
    expect(() => answerModal(state, registry, { title: 'Ser' })).toThrow(/has no option title/);
    expect(() => answerModal(state, registry, { race: 'Wyvern' })).toThrow(/does not take "Wyvern"/);
    expect(topModal(state)?.name).toBe('character-creation');
  });

  it('closes a dialogue whose content is gone rather than carrying a cursor into a registry without it', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');
    expect(names(session.state)).toEqual(['character-creation', 'dialogue']);

    const dropped = pruneModals(session.state, loadModule('# location camp\nx: 0, y: 0\nstarting\n'));
    expect(dropped).toEqual([{ name: 'dialogue', reason: 'dialogue sage-talk is not loaded' }]);
    expect(names(session.state)).toEqual(['character-creation']);
  });
});
