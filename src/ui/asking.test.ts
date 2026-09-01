import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import { loadModule } from '../content/load';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { SAVE_VERSION } from '../runtime/save';
import { applyDirective, startSession, submitModal, view, type PlaySession, type PlayView } from '../runtime/session';
import { dismissal } from './asking';

const MODULE =
  FIXTURE_WORLD +
  `
# location camp
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
item-level: 2
origin-cluster: core

# save stocked
{"version":${SAVE_VERSION},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"blade","payload":{"roll":0.5,"plane":{"0,0":{"jewel":"core","entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}
`;

function stocked(): PlaySession {
  const session = startSession(loadModule(MODULE));
  applyDirective(session, { kind: 'load', save: 'stocked' });
  return session;
}

function onBlade(): PlaySession {
  const session = stocked();
  applyDirective(session, { kind: 'open-modal', modal: 'carried-items' });
  applyDirective(session, { kind: 'submit-modal', key: 'item', value: '1' });
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
    applyDirective(covering, { kind: 'open-modal', modal: 'choose-name' });
    applyDirective(covering, { kind: 'open-modal', modal: 'carried-items' });

    expect(view(covering).modals.map((modal) => modal.name)).toEqual(['choose-name', 'carried-items']);
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

  it('is the way out of a question that takes free text, which lists nothing to find it among', () => {
    const typed: PlayView['modals'] = [{ name: 'held', leaving: 'back', options: [{ key: 'count', label: asLocalized('How many?'), values: null }] }];

    expect(dismissal(typed)).toEqual({ key: 'count', value: 'back' });
    expect(dismissal([{ ...typed[0], leaving: null }])).toBeNull();
  });
});
