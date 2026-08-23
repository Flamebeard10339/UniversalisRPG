import type { ModalChoice, ModalOption } from './modalOption';
import { type ModalFrame } from './state';
import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { Registry } from '../content/registry';
import { loadUniverse } from '../content/load';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { answerModal, isModalFrame, Modal, MODAL_NAMES, pruneModals, publishModal } from './modals';
import { dialogueFrame, openModal, openModalNamed, topModal } from './modalStack';
import { MODAL_SCREENS } from '../content/sections/modal';
import { shippedSources } from '../content/shipped';
import { SAVE_VERSION } from './save';
import { choose, createGameState, DialogueCursor, GameState, talk } from './runtime';
import { applyResultsNow } from './effects';
import { askedOption } from './command';
import { apply, applyDirective, PlaySession, PlayStatus, startSession, submitModal, view } from './session';

const STACKING_MODULE = `
# race human

# race elf

# race dwarf

# race orc

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
  open modal: name-yourself
  -> Ask about the mirror.
    set: asked
  -> Say nothing.
`;

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

# entity rumour
tell: set: secret

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

const ANSWER_OPENS_MODULE = `
# race human

# race elf

# race dwarf

# race orc

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
    open modal: name-yourself
    goto after

node after:
  -> Nod.
`;

const GATED_MENU_MODULE = `
# location camp
x: 0, y: 0
starting
entities:
  sage
  hermit

# flag secret

# flag told

# entity sage
title: Sage

# entity hermit
title: Hermit

# entity rumour
tell: set: secret

# dialogue sage-talk
owner = sage

node greeting:
  when: not told
  -> Ask about the mirror.
    goto sealed

node sealed:
  -> Say more. (when told)

# dialogue hermit-talk
owner = hermit

node greeting:
  when: not told
  -> Speak. (when not secret)
`;

const THROWING_CHOICE_MODULE = `
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
  -> Ask about the mirror.
    open modal: no-such-screen
  -> Say nothing.
`;

function stackingSession(): PlaySession {
  return startSession(loadInEnglish(STACKING_MODULE));
}

function names(state: GameState): string[] {
  return state.modals.map((frame) => frame.name);
}

function modalNames(status: PlayStatus): string[] {
  return status.modals.map((modal) => modal.name);
}

function talking(registry: Registry): GameState {
  const state = createGameState('camp');
  const cursor = talk('sage', registry, state);
  if (!cursor) throw new Error('the sage has nothing to say');
  openModal(state, dialogueFrame(cursor));
  return state;
}

const answered = (options: readonly ModalOption[] | undefined) => (options ?? []).map((option) => ({ ...option, values: option.values?.map((choice) => choice.value) ?? null }));
const takes = (option: { values?: readonly { value: string }[] | null } | undefined) => option?.values?.map((choice) => choice.value);


describe('the modal stack', () => {
  it('leaves both when one opens over another, and reveals the one beneath when the top is answered', () => {
    const session = stackingSession();

    let v = apply(session, 'talk:sage');
    expect(v.modals.map((modal) => modal.name)).toEqual(['name-yourself', 'dialogue']);

    v = submitModal(session, { choice: '0' });
    expect(v.flags.asked).toBe(true);
    expect(v.modals.map((modal) => modal.name)).toEqual(['name-yourself']);

    v = submitModal(session, { name: 'Rowan' });
    expect(v.modals).toEqual([]);
    expect(v.player).toEqual({ name: 'Rowan', race: '' });
  });

  it('offers only the options still to be answered, and nothing about how to draw them', () => {
    const session = stackingSession();
    const published: Modal = apply(session, 'talk:sage').modals[0];

    expect(Object.keys(published).sort()).toEqual(['leaving', 'name', 'options']);
    for (const option of published.options) expect(Object.keys(option).sort()).toEqual(['key', 'label', 'values']);
  });

  it('publishes a dialogue menu as one option whose values are the choices the state currently allows', () => {
    const session = stackingSession();
    const v = apply(session, 'talk:sage');
    const dialogue = v.modals[1];

    expect(dialogue.name).toBe('dialogue');
    expect(answered(dialogue.options)).toEqual([{ key: 'choice', label: 'Choice', values: ['0', '1'], takesMore: true }]);
  });

  it('withdraws every world choice while a modal is open, and gives them back once it closes', () => {
    const session = stackingSession();

    expect(view(session).choices.map((choice) => choice.id)).toEqual(['talk:sage']);
    const opened = apply(session, 'talk:sage');
    expect(opened.choices).toEqual([]);

    submitModal(session, { choice: '1' });
    const closed = submitModal(session, { name: 'Rowan' });
    expect(closed.choices.map((choice) => choice.id)).toEqual([]);
    expect(closed.modals).toEqual([]);
  });
});

describe('opening and answering', () => {
  const registry = loadInEnglish(STACKING_MODULE);

  it('opens the same modal once however many times a batch applies the result', () => {
    const scaled = createGameState();
    applyResultsNow(scaled, registry, [{ kind: 'open-modal', modal: 'name-yourself' }], 4);
    expect(names(scaled)).toEqual(['name-yourself']);

    const repeated = createGameState();
    applyResultsNow(repeated, registry, [{ kind: 'open-modal', modal: 'name-yourself' }, { kind: 'xp', skill: 'lore', amount: { min: 1, max: 4 } }], 4);
    expect(names(repeated)).toEqual(['name-yourself']);
    expect(repeated.xp.lore).toBeGreaterThan(0);

    const wrapped = createGameState();
    applyResultsNow(wrapped, registry, [{ kind: 'chance', numerator: 1, denominator: 1, results: [{ kind: 'open-modal', modal: 'name-yourself' }] }, { kind: 'xp', skill: 'lore', amount: { min: 1, max: 4 } }], 100);
    expect(names(wrapped)).toEqual(['name-yourself']);
  });

  it('refuses a modal nothing defines, and one that carries a payload no result line can spell', () => {
    const state = createGameState();
    expect(() => openModalNamed(state, 'haggling')).toThrow(/unknown modal: haggling/);
    expect(() => openModalNamed(state, 'dialogue')).toThrow(/not opened by name/);
    expect(() => applyResultsNow(state, registry, [{ kind: 'open-modal', modal: 'shop' }])).toThrow(RuntimeError);
    expect(state.modals).toEqual([]);
  });

  it('opens every screen a # modal may name, and nothing a # modal may not', () => {
    for (const screen of MODAL_SCREENS) {
      const state = createGameState();
      openModalNamed(state, screen);
      expect(names(state), screen).toEqual([screen]);
    }
    for (const unopenable of MODAL_NAMES.filter((name) => !(MODAL_SCREENS as readonly string[]).includes(name))) {
      expect(() => openModalNamed(createGameState(), unopenable), unopenable).toThrow(/not opened by name/);
    }
  });

  // `open modal:` raises the id the # modal is declared under, so a modal whose id is not a screen the engine runs loads clean and throws the first time anybody looks at it. The subjects are every # modal the corpus ships.
  it('opens every # modal the shipped corpus declares, by the id it is declared under', () => {
    const shipped = loadUniverse(shippedSources());

    expect(shipped.modals.size).toBeGreaterThan(0);
    for (const id of shipped.modals.keys()) expect(() => openModalNamed(createGameState(), id), id).not.toThrow();
  });

  it('refuses an option it does not have, a value it does not take, and an answer with nothing open', () => {
    const state = createGameState();
    expect(() => answerModal(state, registry, { name: 'Rowan' })).toThrow(/no modal is open/);

    openModalNamed(state, 'name-yourself');
    expect(() => answerModal(state, registry, { title: 'Ser' })).toThrow(/has no option title/);
    expect(topModal(state)?.name).toBe('name-yourself');

    openModalNamed(state, 'choose-race');
    expect(() => answerModal(state, registry, { race: 'Wyvern' })).toThrow(/has no race that takes "Wyvern"/);
    expect(topModal(state)?.name).toBe('choose-race');
  });

  it('lands no part of a form it refuses, so a rejected last field leaves the modal untouched', () => {
    const state = createGameState();
    openModalNamed(state, 'choose-race');

    expect(() => answerModal(state, registry, { race: 'Wyvern', title: 'Ser' })).toThrow(/has no race that takes "Wyvern"/);
    expect(topModal(state)?.answers).toEqual({});
    expect(publishModal(topModal(state)!, state, registry).options.map((option) => option.key)).toEqual(['race']);
  });

  it('puts the frame back when acting on the answer throws, rather than leaving the screen popped and gone', () => {
    const module = loadInEnglish(THROWING_CHOICE_MODULE);
    const state = talking(module);

    expect(() => answerModal(state, module, { choice: '0' })).toThrow(/unknown modal: no-such-screen/);
    expect(names(state)).toEqual(['dialogue']);
    expect(topModal(state)?.answers).toEqual({});
    expect(takes(publishModal(topModal(state)!, state, module).options[0])).toEqual(['0', '1']);
  });

  it('stacks a second dialogue rather than dropping it after its effects have already run', () => {
    const session = startSession(loadInEnglish(TWO_NPC_MODULE));

    apply(session, 'talk:sage');
    applyDirective(session, { kind: 'talk', entity: 'scholar' });
    const both = view(session);
    expect(modalNames(both)).toEqual(['dialogue', 'dialogue']);
    expect(takes(both.modals[1].options[0])).toEqual(['0']);
    expect(both.flags['scholar-seen']).toBe(true);

    const back = submitModal(session, { choice: '0' });
    expect(back.modals.map((modal) => modal.name)).toEqual(['dialogue']);
    expect(takes(back.modals[0].options[0])).toEqual(['0']);
  });

  it('closes a dialogue whose content is gone rather than carrying a cursor into a registry without it', () => {
    const state = talking(loadInEnglish(STACKING_MODULE));
    expect(names(state)).toEqual(['name-yourself', 'dialogue']);

    const dropped = pruneModals(state, loadInEnglish('# location camp\nx: 0, y: 0\nstarting\n\n# race human\n'));
    expect(dropped).toEqual([{ name: 'dialogue', reason: 'dialogue sage-talk is not loaded' }]);
    expect(names(state)).toEqual(['name-yourself']);
  });

  it('closes a frame naming a modal nothing defines, and one whose node no longer offers a menu there', () => {
    const registry = loadInEnglish(STACKING_MODULE);
    const cursor = { ...(talking(registry).modals[1] as { cursor: DialogueCursor }).cursor };

    const withStranger = createGameState();
    (withStranger.modals as ModalFrame[]).push({ name: 'haggling', answers: {} } as unknown as ModalFrame);
    expect(pruneModals(withStranger, registry)).toEqual([{ name: 'haggling', reason: 'it is not a modal this engine knows' }]);
    expect(withStranger.modals).toEqual([]);

    for (const [broken, reason] of [
      [{ ...cursor, node: 'farewell' }, 'dialogue sage-talk has no node farewell'],
      [{ ...cursor, resumeIndex: 1 }, 'dialogue sage-talk node greeting no longer offers a menu there'],
    ] as const) {
      const state = createGameState();
      (state.modals as ModalFrame[]).push({ name: 'dialogue', answers: {}, cursor: broken });
      expect(pruneModals(state, registry)).toEqual([{ name: 'dialogue', reason }]);
      expect(state.modals).toEqual([]);
    }
  });

  it('withholds a choice its when: gate refuses, and refuses to answer with it', () => {
    const session = startSession(loadInEnglish(TWO_NPC_MODULE));

    const gated = apply(session, 'talk:sage');
    expect(takes(gated.modals[0].options[0])).toEqual(['0']);
    expect(() => submitModal(session, { choice: '1' })).toThrow('no choice matches "1": this list offers 0 "Leave the sage."');

    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'rumour', actionId: 'tell' });
    expect(takes(view(session).modals[0].options[0])).toEqual(['0', '1']);
  });

  it('never leaves a menu standing that offers nothing, however it came to offer nothing', () => {
    const registry = loadInEnglish(GATED_MENU_MODULE);

    const talked = startSession(registry);
    applyDirective(talked, { kind: 'use', obj: 'entity', objId: 'rumour', actionId: 'tell' });
    const refused = apply(talked, 'talk:hermit');
    expect(modalNames(refused)).toEqual([]);
    expect(refused.choices.length).toBeGreaterThan(0);

    const emptied = startSession(registry);
    expect(modalNames(apply(emptied, 'talk:hermit'))).toEqual(['dialogue']);
    applyDirective(emptied, { kind: 'use', obj: 'entity', objId: 'rumour', actionId: 'tell' });
    const after = view(emptied);
    expect(modalNames(after)).toEqual([]);
    expect(after.choices.length).toBeGreaterThan(0);

    const answered = startSession(registry);
    expect(modalNames(apply(answered, 'talk:sage'))).toEqual(['dialogue']);
    const sealed = submitModal(answered, { choice: '0' });
    expect(modalNames(sealed)).toEqual([]);
    expect(sealed.choices.length).toBeGreaterThan(0);

    const saved = createGameState('camp');
    (saved.modals as ModalFrame[]).push({ name: 'dialogue', answers: {}, cursor: { dialogue: 'sage-talk', node: 'sealed', resumeIndex: 1, replay: true } });
    expect(pruneModals(saved, registry)).toEqual([{ name: 'dialogue', reason: 'it asks for choice and nothing answers it' }]);
    expect(saved.modals).toEqual([]);
  });

  it('closes a frame a save left unanswerable — every option already answered, or one holding a value it refuses', () => {
    const registry = loadInEnglish(STACKING_MODULE);
    for (const [screen, answers, reason] of [
      ['name-yourself', { name: 'Rowan' }, 'it was saved with every option already answered'],
      ['choose-race', { race: 'Wombat' }, 'it has no race that takes "Wombat"'],
      ['name-yourself', { title: 'Ser' }, 'it has no option title'],
    ] as const) {
      const state = createGameState();
      (state.modals as ModalFrame[]).push({ name: screen, answers });
      expect(pruneModals(state, registry)).toEqual([{ name: screen, reason }]);
      expect(state.modals).toEqual([]);
    }
  });

  it('stacks what an answer opens on what is left, and never on the frame that answer spent', () => {
    const session = startSession(loadInEnglish(ANSWER_OPENS_MODULE));

    expect(modalNames(apply(session, 'talk:sage'))).toEqual(['dialogue']);

    const after = submitModal(session, { choice: '0' });
    expect(after.modals.map((modal) => modal.name)).toEqual(['name-yourself', 'dialogue']);
    expect(takes(after.modals[1].options[0])).toEqual(['0']);
    expect(after.modals.filter((modal) => modal.name === 'dialogue')).toHaveLength(1);
  });

  it('refuses a choice text the menu is not offering when choose is called directly', () => {
    const registry = loadInEnglish(STACKING_MODULE);
    const state = talking(registry);
    const { cursor } = state.modals[1] as { cursor: DialogueCursor };

    expect(() => choose('7', cursor, registry, state)).toThrow(/^no choice matches "7": this list offers 0 /);
    expect(choose('1', cursor, registry, state)).toBeNull();
  });

  it('keeps the dialogue spelling from answering a modal that is not a dialogue', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');
    expect(modalNames(submitModal(session, { choice: '1' }))).toEqual(['name-yourself']);

    expect(() => applyDirective(session, { kind: 'choose', text: '1' })).toThrow(/choose with no active dialogue/);
    expect(view(session).modals[0].options.map((option) => option.key)).toEqual(['name']);
  });
});

const CARRIED_MODULE = `
# location camp
x: 0, y: 0
starting

# item rope
title: Rope

# save coiled
{"version":${SAVE_VERSION},"inventory":{"rope":1}}
`;

describe('the carried-items screen, as a frame like any other', () => {
  it('is raised by name, and raising it again raises no second screen', () => {
    const session = startSession(loadInEnglish(CARRIED_MODULE));

    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });

    expect(modalNames(view(session))).toEqual(['carried-items']);
  });

  it('refuses a screen no definition knows, wherever the name came from', () => {
    const session = startSession(loadInEnglish(CARRIED_MODULE));

    expect(() => applyDirective(session, { kind: 'open-modal', modal: 'carried' })).toThrow(/unknown modal: carried/);
    expect(view(session).modals).toEqual([]);
  });

  it('is answerable with nothing to list', () => {
    const session = startSession(loadInEnglish(CARRIED_MODULE));
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });

    expect(answered(view(session).modals[0].options)).toEqual([{ key: 'item', label: 'Item', values: ['close'] }]);
    applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'close' });
    expect(view(session).modals).toEqual([]);
  });

  it('survives a load half-answered, and closes when its answer names what the player has stopped carrying', () => {
    const registry = loadInEnglish(CARRIED_MODULE);
    const half = (): GameState => {
      const state = createGameState('camp');
      (state.modals as ModalFrame[]).push({ name: 'carried-items', answers: { item: 'rope' } });
      return state;
    };

    const carrying = half();
    carrying.inventory.rope = 1;
    expect(pruneModals(carrying, registry)).toEqual([]);
    expect(names(carrying)).toEqual(['carried-items']);

    const empty = half();
    expect(pruneModals(empty, registry)).toEqual([{ name: 'carried-items', reason: 'it has no item that takes "rope"' }]);
    expect(empty.modals).toEqual([]);
  });

  it('leaves no screen with nothing to publish when an answer retracts the question under it', () => {
    const session = startSession(loadInEnglish(GROWING_MODULE));
    applyDirective(session, { kind: 'load', save: 'stocked' });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    submitModal(session, { item: 'blade' });
    submitModal(session, { verb: 'grow' });
    submitModal(session, { plane: 'feed: with whetstone' });
    submitModal(session, { plane: 'back' });

    expect(submitModal(session, { verb: 'destroy' }).modals[0].options.map((option) => option.key)).toEqual(['confirm']);

    const answered = submitModal(session, { item: 'rope' });
    expect(answered.modals).toEqual([]);
    expect(answered.inventory.rope).toBeUndefined();
  });
});

const GROWING_MODULE = `
# location camp
x: 0, y: 0
starting

# cluster-jewel core
shape: point
open-connections: e

# item blade
title: Blade
slot: mainhand
max-level: 10
origin-cluster: core

# item rope
title: Rope

# item whetstone
title: Whetstone
item-experience: 1000

# save stocked
{"version":${SAVE_VERSION},"inventory":{"blade":1,"rope":1,"whetstone":1}}
`;

const PLANE_MODULE = `
# location camp
x: 0, y: 0
starting

# cluster-jewel core
shape: point
open-connections: e

# item blade
title: Blade
slot: mainhand
max-level: 1
origin-cluster: core

# item whetstone
title: Whetstone
item-experience: 1000

# save stocked
{"version":${SAVE_VERSION},"inventory":{"blade":1,"whetstone":1}}
`;

function openOnBlade(): PlaySession {
  const session = startSession(loadInEnglish(PLANE_MODULE));
  applyDirective(session, { kind: 'load', save: 'stocked' });
  applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
  applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'blade' });
  return session;
}

describe('the plane screen, as a frame like any other', () => {
  it('replaces the inventory frame, and returns one with that copy still selected', () => {
    const session = openOnBlade();

    expect(modalNames(view(session))).toEqual(['carried-items']);
    submitModal(session, { verb: 'grow' });
    expect(modalNames(view(session))).toEqual(['item-plane']);

    submitModal(session, { plane: 'back' });
    expect(modalNames(view(session))).toEqual(['carried-items']);
    expect(view(session).modals[0].options.map((option) => option.key)).toEqual(['verb']);
  });

  it('states a refused growth on the screen it was refused on, and puts nothing under it', () => {
    const session = openOnBlade();
    submitModal(session, { verb: 'grow' });
    expect(takes(view(session).modals[0].options[0])).toContain('feed: with whetstone');

    const refused = submitModal(session, { plane: 'feed: with whetstone' });
    expect(modalNames(refused)).toEqual(['item-plane']);
    expect(refused.modals[0].options[0].label).toBe('Blade at 0,0 — Blade is already at level 1, which is its maximum');
    expect(refused.said).toEqual([]);
    expect(refused.inventory).toEqual({ blade: 1, whetstone: 1 });
  });

  it('is not a screen a name alone can raise, because a name cannot say which copy', () => {
    const session = startSession(loadInEnglish(PLANE_MODULE));

    expect(() => applyDirective(session, { kind: 'open-modal', modal: 'item-plane' })).toThrow(/not opened by name/);
    expect(view(session).modals).toEqual([]);
  });

  it('tells two plane screens apart by the copy and the hexagon each holds', () => {
    const state = createGameState('camp');

    openModal(state, { name: 'item-plane', answers: {}, target: 'blade', hex: '0,0' });
    openModal(state, { name: 'item-plane', answers: {}, target: 'blade', hex: '0,0' });
    expect(state.modals).toHaveLength(1);

    openModal(state, { name: 'item-plane', answers: {}, target: 'blade', hex: '1,0' });
    openModal(state, { name: 'item-plane', answers: {}, target: 'other', hex: '0,0' });
    expect(state.modals).toHaveLength(3);
  });

  it('closes a saved frame whose copy or hexagon the world no longer has', () => {
    const registry = loadInEnglish(PLANE_MODULE);
    for (const [frame, reason] of [
      [{ name: 'item-plane', answers: {}, target: 'blade', hex: '0,0' }, 'it grows blade, which the player no longer carries'],
      [{ name: 'item-plane', answers: {}, target: 'rope', hex: '0,0' }, 'it grows rope, which the player no longer carries'],
    ] as const) {
      const state = createGameState('camp');
      (state.modals as ModalFrame[]).push(frame);

      expect(pruneModals(state, registry), JSON.stringify(frame)).toEqual([{ name: 'item-plane', reason }]);
      expect(state.modals).toEqual([]);
    }
  });

  it('keeps a saved frame whose copy is still carried', () => {
    const registry = loadInEnglish(PLANE_MODULE);
    const state = createGameState('camp');
    state.inventory.blade = 1;
    (state.modals as ModalFrame[]).push({ name: 'item-plane', answers: {}, target: 'blade', hex: '0,0' });

    expect(pruneModals(state, registry)).toEqual([]);
    expect(names(state)).toEqual(['item-plane']);
  });

  it('publishes which plane is in hand as a focus into the planes the view already publishes', () => {
    const session = openOnBlade();
    submitModal(session, { verb: 'grow' });

    const shown = view(session);
    expect(shown.focus).toEqual({ kind: 'plane', instance: 'blade', hex: '0,0' });
    expect(shown.planes.map((plane) => plane.instance)).toContain('blade');
  });

  it('publishes no focus for a screen that has no plane in hand, nor for none at all', () => {
    const session = openOnBlade();
    expect(view(session).focus).toBeNull();

    submitModal(session, { verb: 'grow' });
    submitModal(session, { plane: 'back' });
    expect(view(session).focus).toBeNull();
  });

  it('publishes no focus while another screen covers the plane', () => {
    const session = openOnBlade();
    submitModal(session, { verb: 'grow' });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });

    expect(modalNames(view(session))).toEqual(['item-plane', 'carried-items']);
    expect(view(session).focus).toBeNull();
  });

  it('refuses a saved body that is not a plane frame', () => {
    expect(isModalFrame({ name: 'item-plane', answers: {}, target: 'blade', hex: '0,0' })).toBe(true);
    expect(isModalFrame({ name: 'item-plane', answers: {}, target: 'blade', hex: '0,0', said: { engine: 'engine.plane.no-points', params: { node: { id: 'position 1 of 0,0' } } } })).toBe(true);
    expect(isModalFrame({ name: 'item-plane', answers: {}, target: 'blade' })).toBe(false);
    expect(isModalFrame({ name: 'item-plane', answers: {}, hex: '0,0' })).toBe(false);
    expect(isModalFrame({ name: 'item-plane', answers: {}, target: 'blade', hex: 7 })).toBe(false);
    expect(isModalFrame({ name: 'item-plane', answers: {}, target: 'blade', hex: '0,0', said: 7 })).toBe(false);
    expect(isModalFrame({ name: 'item-plane', answers: {}, target: 'blade', hex: '0,0', said: { engine: 'no.such.key' } })).toBe(false);
  });
});

describe('the value a screen leaves by', () => {
  const leaves = (status: PlayStatus): { leaving: string | null; listed: boolean } => {
    const modal = status.modals[status.modals.length - 1];
    return { leaving: modal.leaving, listed: modal.options.every((option) => option.values?.some((choice) => choice.value === (modal.leaving ?? '')) ?? false) };
  };

  it('is listed on every question the inventory asks, and takes it down from any of them', () => {
    const session = startSession(loadInEnglish(CARRIED_MODULE));
    applyDirective(session, { kind: 'load', save: 'coiled' });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });

    expect(view(session).modals[0].options.map((option) => option.key)).toEqual(['item']);
    expect(leaves(view(session))).toEqual({ leaving: 'close', listed: true });

    applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'rope' });
    expect(view(session).modals[0].options.map((option) => option.key)).toEqual(['verb']);
    expect(leaves(view(session))).toEqual({ leaving: 'close', listed: true });

    applyDirective(session, { kind: 'submit-modal', key: 'verb', value: 'close' });
    expect(view(session).modals).toEqual([]);
  });

  it('is the word the plane screen leaves by, and goes back rather than closing the world', () => {
    const session = openOnBlade();
    submitModal(session, { verb: 'grow' });

    expect(leaves(view(session))).toEqual({ leaving: 'back', listed: true });

    submitModal(session, { plane: view(session).modals[0].leaving! });
    expect(modalNames(view(session))).toEqual(['carried-items']);
  });

  it('is nothing for a screen answering cannot leave', () => {
    const session = stackingSession();
    const opened = apply(session, 'talk:sage');

    expect(opened.modals.map((modal) => [modal.name, modal.leaving])).toEqual([
      ['name-yourself', null],
      ['dialogue', null],
    ]);
  });
});

describe('nothing a player answers with carries words', () => {
  const WORDED = [
    '# info forge',
    'version: 1.0.0',
    '',
    '# location camp',
    'x: 0, y: 0',
    'starting',
    'entities:',
    '  sage',
    '  pedlar',
    '',
    '# cluster-jewel core',
    'shape: point',
    'open-connections: e',
    '',
    '# cluster-jewel bough',
    'shape: point',
    'open-connections: e',
    '',
    '# item bough-jewel',
    'title: Bough',
    'cluster-jewel: bough',
    '',
    '# item blade',
    'title: Blade',
    'slot: mainhand',
    'max-level: 4',
    'origin-cluster: core',
    '',
    '# item whetstone',
    'title: Whetstone',
    'item-experience: 1000',
    '',
    '# item coin',
    'title: Coin',
    '',
    '# item nail',
    'title: Nail',
    'value: 3',
    '',
    '# shop stall',
    'coin: coin',
    'stocks:',
    '  4 nail',
    '',
    '# entity sage',
    'title: Sage',
    '',
    '# race elf',
    'title: Elf',
    '',
    '# entity pedlar',
    'title: Pedlar',
    'keeps shop: stall',
    '',
    '# flag greeted',
    '',
    '# dialogue sage-talk',
    'owner = sage',
    'node greeting:',
    '  when: not greeted',
    '  -> Ask about the mirror.',
    '  -> Say nothing.',
    '',
    '# quest an-errand',
    'title: An Errand',
    'log: Someone at the forge wants something fetched.',
    '',
    'stage asking:',
    '  log: The sage asked for a whetstone.',
    '  complete',
    '',
    '# save stocked',
    `{"version":${SAVE_VERSION},"inventory":{"forge.blade":2,"forge.whetstone":2,"forge.bough-jewel":1,"forge.coin":50,"forge.nail":1}}`,
  ].join('\n');

  const SPANISH = [
    '# info forge-es',
    'version: 1.0.0',
    'dependencies:',
    '  forge',
    '',
    '# locale es',
    'forge.item.blade.title: Espada',
    'forge.item.whetstone.title: Piedra',
    'forge.item.bough-jewel.title: Rama',
    'forge.entity.sage.title: Sabio',
    'engine.carried.verb.grow: Cultiva',
    'engine.carried.close: Cierra',
    'forge.race.elf.title: Elfo',
    'engine.plane.back: Vuelve',
  ].join('\n');

  const registry = loadUniverse([engineLocale(), { name: 'forge', text: WORDED }, { name: 'forge-es', text: SPANISH }]);

  const everyWord = (): Set<string> => {
    const words = new Set<string>();
    for (const table of registry.locales.declared.values()) for (const value of table.values()) words.add(value);
    for (const entry of registry.locales.base.values()) words.add(entry.text);
    words.add('Ask about the mirror.');
    words.add('Say nothing.');
    return words;
  };

  const walked = new Set<string>();
  const leavable: { name: string; offers: boolean }[] = [];

  const rows = (session: PlaySession): string[] => {
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    const open = view(session).modals;
    const listed = (open[open.length - 1].options[0].values ?? []).map((choice: ModalChoice) => choice.value);
    applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'close' });
    return listed.filter((value: string) => value !== 'close');
  };

  const everyValue = (language: string): string[] => {
    const session = startSession(registry, language);
    applyDirective(session, { kind: 'load', save: 'forge.stocked' });
    applyDirective(session, { kind: 'equip', item: 'forge.blade' });
    const values: string[] = [];
    const published = (): void => {
      for (const modal of view(session).modals) {
        walked.add(modal.name);
        for (const option of modal.options) for (const choice of option.values ?? []) values.push(choice.value);
      }
      const open = view(session).modals;
      const top = open[open.length - 1];
      const asking = askedOption(open);
      // A screen that names no way out is one there is no leaving early — character creation is answered, a dialogue menu is chosen — and says so by publishing none.
      if (top?.leaving && asking) leavable.push({ name: top.name, offers: (asking.values ?? []).some((choice) => choice.value === top.leaving) });
    };

    applyDirective(session, { kind: 'open-modal', modal: 'name-yourself' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'name', value: 'Rowan' });
    applyDirective(session, { kind: 'open-modal', modal: 'choose-race' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'race', value: 'forge.elf' });

    applyDirective(session, { kind: 'feed', target: 'forge.blade', food: 'forge.whetstone' });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'item', value: '1' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'verb', value: 'grow' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'plane', value: 'allocate: slot e' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'plane', value: 'back' });
    applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'close' });

    for (const row of rows(session)) {
      applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
      applyDirective(session, { kind: 'submit-modal', key: 'item', value: row });
      published();
      applyDirective(session, { kind: 'submit-modal', key: 'verb', value: 'close' });
    }

    applyDirective(session, { kind: 'shop', shop: 'forge.stall' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'buy:forge.nail' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'count', value: '2' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'close' });

    applyDirective(session, { kind: 'talk', entity: 'forge.sage' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'choice', value: '1' });

    applyDirective(session, { kind: 'open-modal', modal: 'quest-journal' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'quest', value: 'forge.an-errand' });
    published();
    applyDirective(session, { kind: 'submit-modal', key: 'close', value: 'close' });
    return values;
  };

  const wordsInside = (value: string, words: Iterable<string>): string[] => [...words].filter((word) => value.includes(word));

  it('publishes no value that is a title, an authored line or a locale entry', () => {
    const words = everyWord();
    for (const language of ['en', 'es']) {
      const values = everyValue(language);
      expect(values.length, language).toBeGreaterThan(10);
      for (const verb of ['slot: ', 'feed: ']) expect(values.filter((value) => value.startsWith(verb)), `${language} published no ${verb.trim()} value`).not.toEqual([]);
      for (const verb of ['equip', 'unequip', 'destroy']) expect(values, language).toContain(verb);
      expect(values.flatMap((value) => wordsInside(value, words).map((word) => `${value} holds ${word}`)), language).toEqual([]);
    }
  });

  it('publishes the same values in every language, so a recording replays in each', () => {
    expect(everyValue('es')).toEqual(everyValue('en'));
  });

  // Clicking away from a screen answers it with the value it says it leaves by, so a screen that does not offer that value among the ones it is asking for cannot be left that way. The subjects are every screen the walk above opens, in every state it opens them in.
  it('offers the value it says it leaves by, in every state every screen is asked in', () => {
    everyValue('en');

    expect(leavable.length).toBeGreaterThan(5);
    expect(leavable.filter((each) => !each.offers).map((each) => each.name)).toEqual([]);
  });

  it('walks every modal the engine declares, so the enumeration is of all of them', () => {
    everyValue('en');

    expect([...walked].sort()).toEqual([...MODAL_NAMES].sort());
  });
});

const GATHERED_MODULE = `
# location camp
x: 0, y: 0
starting

# item rope
title: Rope

# item flask
title: Flask

# save rope-first
{"version":${SAVE_VERSION},"inventory":{"rope":1,"flask":1}}

# save flask-first
{"version":${SAVE_VERSION},"inventory":{"flask":1,"rope":1}}
`;

describe('a recorded answer is the value and never where it sat (c2)', () => {
  const gathered = (save: string): PlaySession => {
    const session = startSession(loadInEnglish(GATHERED_MODULE));
    applyDirective(session, { kind: 'load', save });
    applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
    return session;
  };

  it('lists what is carried in the order it was gathered, so no position names one thing', () => {
    expect(takes(view(gathered('rope-first')).modals[0].options[0])).toEqual(['rope', 'flask', 'close']);
    expect(takes(view(gathered('flask-first')).modals[0].options[0])).toEqual(['flask', 'rope', 'close']);
  });

  it('reaches the same object from either order, because the value is what was recorded', () => {
    for (const save of ['rope-first', 'flask-first']) {
      const session = gathered(save);

      applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'rope' });

      expect(view(session).modals[0].options[0].label).toBe('Rope');
    }
  });

  it('refuses an answer that names a position rather than the value standing at it', () => {
    const session = gathered('rope-first');

    expect(() => applyDirective(session, { kind: 'submit-modal', key: 'item', value: '0' })).toThrow(/takes "0"/);
    expect(takes(view(session).modals[0].options[0])).toEqual(['rope', 'flask', 'close']);
  });

  it('publishes no list to index where the answer is typed', () => {
    const session = stackingSession();
    apply(session, 'talk:sage');

    const creation = view(session).modals[0];
    expect(creation.name).toBe('name-yourself');
    expect(creation.options.map((option) => [option.key, option.values === null])).toEqual([['name', true]]);
    expect(submitModal(session, { choice: '1' }).modals[0].options[0].values).toBeNull();
    expect(submitModal(session, { name: 'Rowan' }).player.name).toBe('Rowan');

    applyDirective(session, { kind: 'open-modal', modal: 'choose-race' });
    expect(view(session).modals[0].options.map((option) => [option.key, option.values === null])).toEqual([['race', false]]);
    expect(submitModal(session, { race: 'orc' }).player).toEqual({ name: 'Rowan', race: 'orc' });
  });
});
