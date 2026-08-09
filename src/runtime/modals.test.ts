import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { answerModal, Modal, ModalFrame, openModalNamed, pruneModals, publishModal, topModal } from './modals';
import { choose, createGameState, DialogueCursor, GameState, RuntimeError } from './runtime';
import { applyResultsNow } from './effects';
import { apply, applyDirective, PlaySession, startSession, submitModal, view } from './session';

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

// Two menus of the same name, which is the case a dedupe on the frame's name
// rather than on the batch that opened it silently swallows.
const TWO_NPC_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  sage
  scholar

# flag sage-seen

# flag scholar-seen

# flag secret

# skill lore

# entity sage
title: Sage

# entity scholar
title: Scholar

# dialogue sage-talk
owner = sage

node greeting:
  when: not sage-seen
  set: sage-seen
  -> Leave the sage.
  -> Ask about the secret. (when secret)

# dialogue scholar-talk
owner = scholar

node greeting:
  when: not scholar-seen
  set: scholar-seen
  -> Leave the scholar.
`;

// A choice that both raises a modal and walks the dialogue on to a second menu,
// so answering one modal opens two — the spec's open question, made executable.
const ANSWER_OPENS_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  sage

# flag greeted

# entity sage
title: Sage

# dialogue sage-talk
owner = sage

node greeting:
  when: not greeted
  set: greeted
  -> Look at the mirror.
    open modal: character-creation
    goto after

node after:
  -> Nod.
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
    const scaled = createGameState();
    applyResultsNow(scaled, registry, [{ kind: 'open-modal', modal: 'character-creation' }], 4);
    expect(names(scaled)).toEqual(['character-creation']);

    // The other batch shape: a group that draws is applied once per repetition
    // rather than once and scaled, and the screen still goes up once.
    const repeated = createGameState();
    applyResultsNow(repeated, registry, [{ kind: 'open-modal', modal: 'character-creation' }, { kind: 'xp', skill: 'lore', amount: { min: 1, max: 4 } }], 4);
    expect(names(repeated)).toEqual(['character-creation']);
    expect(repeated.xp.lore).toBeGreaterThan(0);

    // And from inside a wrapper, which re-enters applyResults as its own group
    // and so leads every repetition — a `say:` speaks each time, deliberately,
    // and a screen still goes up once.
    const wrapped = createGameState();
    applyResultsNow(wrapped, registry, [{ kind: 'chance', numerator: 1, denominator: 1, results: [{ kind: 'open-modal', modal: 'character-creation' }] }, { kind: 'xp', skill: 'lore', amount: { min: 1, max: 4 } }], 100);
    expect(names(wrapped)).toEqual(['character-creation']);
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
    expect(() => answerModal(state, registry, { race: 'Wyvern' })).toThrow(/has no race that takes "Wyvern"/);
    expect(topModal(state)?.name).toBe('character-creation');
  });

  it('lands no part of a form it refuses, so a rejected last field leaves the modal untouched', () => {
    const state = createGameState();
    openModalNamed(state, 'character-creation');

    expect(() => answerModal(state, registry, { name: 'Rowan', race: 'Wyvern' })).toThrow(/has no race that takes "Wyvern"/);
    expect(topModal(state)?.answers).toEqual({});
    expect(publishModal(topModal(state)!, state, registry).options.map((option) => option.key)).toEqual(['name', 'race']);
  });

  it('stacks a second dialogue rather than dropping it after its effects have already run', () => {
    const session = startSession(loadModule(TWO_NPC_MODULE));

    apply(session, 'talk:sage');
    // Through the directive, since the world's choices are withdrawn under an
    // open modal — which is exactly how a `# test` reaches the second NPC.
    applyDirective(session, { kind: 'talk', entity: 'scholar' });
    const both = view(session);
    expect(names(session.state)).toEqual(['dialogue', 'dialogue']);
    expect(both.modals[1].options[0].values).toEqual(['Leave the scholar.']);
    expect(session.state.flags['scholar-seen']).toBe(true);

    // Answering the scholar hands the sage's own menu back, cursor intact.
    const back = submitModal(session, { choice: 'Leave the scholar.' });
    expect(back.modals.map((modal) => modal.name)).toEqual(['dialogue']);
    expect(back.modals[0].options[0].values).toEqual(['Leave the sage.']);
  });

  it('closes a dialogue whose content is gone rather than carrying a cursor into a registry without it', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');
    expect(names(session.state)).toEqual(['character-creation', 'dialogue']);

    const dropped = pruneModals(session.state, loadModule('# location camp\nx: 0, y: 0\nstarting\n'));
    expect(dropped).toEqual([{ name: 'dialogue', reason: 'dialogue sage-talk is not loaded' }]);
    expect(names(session.state)).toEqual(['character-creation']);
  });

  it('closes a frame naming a modal nothing defines, and one whose node no longer offers a menu there', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');
    const cursor = { ...(session.state.modals[1] as { cursor: DialogueCursor }).cursor };

    const withStranger = createGameState();
    (withStranger.modals as ModalFrame[]).push({ name: 'quest-journal', answers: {} } as unknown as ModalFrame);
    expect(pruneModals(withStranger, session.registry)).toEqual([{ name: 'quest-journal', reason: 'it is not a modal this engine knows' }]);
    expect(withStranger.modals).toEqual([]);

    for (const [broken, reason] of [
      [{ ...cursor, node: 'farewell' }, 'dialogue sage-talk has no node farewell'],
      [{ ...cursor, resumeIndex: 1 }, 'dialogue sage-talk node greeting no longer offers a menu there'],
    ] as const) {
      const state = createGameState();
      (state.modals as ModalFrame[]).push({ name: 'dialogue', answers: {}, cursor: broken });
      expect(pruneModals(state, session.registry)).toEqual([{ name: 'dialogue', reason }]);
      expect(state.modals).toEqual([]);
    }
  });

  it('withholds a choice its when: gate refuses, and refuses to answer with it', () => {
    const session = startSession(loadModule(TWO_NPC_MODULE));

    const gated = apply(session, 'talk:sage');
    expect(gated.modals[0].options[0].values).toEqual(['Leave the sage.']);
    expect(() => submitModal(session, { choice: 'Ask about the secret.' })).toThrow(/has no choice that takes "Ask about the secret."/);

    session.state.flags.secret = true;
    expect(view(session).modals[0].options[0].values).toEqual(['Leave the sage.', 'Ask about the secret.']);
  });

  it('closes a frame a save left unanswerable — every option already answered, or one holding a value it refuses', () => {
    const registry = loadModule(STACKING_MODULE);
    for (const [answers, reason] of [
      [{ name: 'Rowan', race: 'Elf' }, 'it was saved with every option already answered'],
      [{ name: 'Rowan', race: 'Wombat' }, 'it has no race that takes "Wombat"'],
      [{ title: 'Ser' }, 'it has no option title'],
    ] as const) {
      const state = createGameState();
      (state.modals as ModalFrame[]).push({ name: 'character-creation', answers });
      expect(pruneModals(state, registry)).toEqual([{ name: 'character-creation', reason }]);
      expect(state.modals).toEqual([]);
    }
  });

  it('stacks what an answer opens on what is left, and never on the frame that answer spent', () => {
    const session = startSession(loadModule(ANSWER_OPENS_MODULE));

    apply(session, 'talk:sage');
    expect(names(session.state)).toEqual(['dialogue']);

    // The choice's own effects raise a modal and its goto opens a second menu:
    // both must land above the spent frame, not under it or in place of it.
    const after = submitModal(session, { choice: 'Look at the mirror.' });
    expect(after.modals.map((modal) => modal.name)).toEqual(['character-creation', 'dialogue']);
    expect(after.modals[1].options[0].values).toEqual(['Nod.']);
    expect(session.state.modals.filter((frame) => frame.name === 'dialogue')).toHaveLength(1);
  });

  // answerModal weighs the text against the same menu before it ever gets here,
  // so this guard is only reachable by a caller of its own — which the runtime
  // barrel exports, and which is the reason it is not deleted as unreachable.
  it('refuses a choice text the menu is not offering when choose is called directly', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');
    const { cursor } = session.state.modals[1] as { cursor: DialogueCursor };

    expect(() => choose('Ask about the weather.', cursor, session.registry, session.state)).toThrow(/no choice matches: "Ask about the weather."/);
    expect(choose('Say nothing.', cursor, session.registry, session.state)).toBeNull();
  });

  it('keeps the dialogue spelling from answering a modal that is not a dialogue', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');
    submitModal(session, { choice: 'Say nothing.' });
    expect(names(session.state)).toEqual(['character-creation']);

    expect(() => applyDirective(session, { kind: 'choose', text: 'Say nothing.' })).toThrow(/choose with no active dialogue/);
    expect(topModal(session.state)?.answers).toEqual({});
  });
});
