import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import { loadModule } from '../content/load';
import { SAVE_VERSION } from '../runtime/save';
import { applyDirective, startSession, submitModal, view, type PlaySession, type PlayView } from '../runtime/session';
import { answering, dismissal } from './asking';
import type { LogEntry } from './transcript';

const MODULE = `
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
  -> Say nothing.

# race human

# race elf

# cluster-jewel core
shape: point
open-connections: e

# item blade
title: Blade
slot: mainhand
max-level: 2
origin-cluster: core

# save stocked
{"version":${SAVE_VERSION},"inventory":{"blade":1}}
`;

function stocked(): PlaySession {
  const session = startSession(loadModule(MODULE));
  applyDirective(session, { kind: 'load', save: 'stocked' });
  return session;
}

function onBlade(): PlaySession {
  const session = stocked();
  applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
  applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'blade' });
  return session;
}

describe('what a click away from a screen answers', () => {
  it('is the value the screen published as the one that leaves it', () => {
    const inventory = view(onBlade());
    expect(dismissal(inventory.modals)).toEqual({ key: 'verb', value: 'close' });

    const session = onBlade();
    submitModal(session, { verb: 'grow' });
    expect(dismissal(view(session).modals)).toEqual({ key: 'plane', value: 'back' });
  });

  it('leaves the screen where answering it leaves it', () => {
    const session = onBlade();
    submitModal(session, { verb: 'grow' });

    const back = dismissal(view(session).modals)!;
    submitModal(session, { [back.key]: back.value });
    expect(view(session).modals.map((modal) => modal.name)).toEqual(['carried-items']);

    const out = dismissal(view(session).modals)!;
    submitModal(session, { [out.key]: out.value });
    expect(view(session).modals).toEqual([]);
  });

  it('is nothing where the screen publishes no way out, and nothing where no screen is up', () => {
    const session = stocked();
    expect(dismissal(view(session).modals)).toBeNull();

    applyDirective(session, { kind: 'talk', entity: 'sage' });
    const talking = view(session);
    expect(talking.modals.map((modal) => modal.name)).toEqual(['dialogue']);
    expect(dismissal(talking.modals)).toBeNull();
  });

  it('belongs to the covering screen and not to the one underneath it', () => {
    const covering = stocked();
    applyDirective(covering, { kind: 'open-modal', modal: 'name-yourself' });
    applyDirective(covering, { kind: 'open-modal', modal: 'carried-items' });

    expect(view(covering).modals.map((modal) => modal.name)).toEqual(['name-yourself', 'carried-items']);
    expect(dismissal(view(covering).modals)).toEqual({ key: 'item', value: 'close' });

    const covered = onBlade();
    applyDirective(covered, { kind: 'talk', entity: 'sage' });

    expect(view(covered).modals.map((modal) => modal.name)).toEqual(['carried-items', 'dialogue']);
    expect(dismissal(view(covered).modals)).toBeNull();
  });

  it('is nothing where the question being asked does not list it', () => {
    const asked: PlayView['modals'] = [{ name: 'held', leaving: 'close', options: [{ key: 'item', label: asLocalized('Item'), values: [{ value: 'blade', shown: asLocalized('Blade x1') }] }] }];

    expect(dismissal(asked)).toBeNull();
  });
});

describe('what a darkened screen is answering', () => {
  const spoke = (id: number, kind: LogEntry['kind'], text: string): LogEntry => ({ id, words: 'player', kind, tone: 'plain', text: asLocalized(text), repeats: 1 });

  it('is every line just spoken, in the order they were said', () => {
    const held = [spoke(1, 'place', 'Camp'), spoke(2, 'said', 'Halt.'), spoke(3, 'said', 'Who goes there?')];

    expect(answering(held).map((line) => String(line.text))).toEqual(['Halt.', 'Who goes there?']);
  });

  it('stops at the first line that is nobody speaking, so it is this beat and not the history', () => {
    const held = [spoke(1, 'said', 'Long ago.'), spoke(2, 'describe', 'A cold room.'), spoke(3, 'said', 'Halt.')];

    expect(answering(held).map((line) => String(line.text))).toEqual(['Halt.']);
  });

  it('is nothing where the last thing that happened was not somebody speaking', () => {
    expect(answering([spoke(1, 'said', 'Halt.'), spoke(2, 'message', 'You cannot go that way.')])).toEqual([]);
    expect(answering([])).toEqual([]);
  });
});
