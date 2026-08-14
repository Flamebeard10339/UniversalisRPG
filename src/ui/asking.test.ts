import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import { loadModule } from '../content/registry';
import { SAVE_VERSION } from '../runtime/save';
import { applyDirective, startSession, submitModal, view, type PlaySession, type PlayView } from '../runtime/session';
import { dismissal } from './asking';

// Driven off real published views rather than hand-built ones: what this
// decision is worth is entirely in reading fields the engine actually fills,
// and a fixture typed here could agree with the rule while disagreeing with the
// engine.
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

  // The gesture is the same answer the prompt types, so it takes the screen
  // where answering takes it and never anywhere else: the inventory closes and
  // the plane goes back to the inventory (c11, c19).
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

  // The screen the player is looking at is the top one, so a way out is the top
  // one's and never whatever is covered by it — read in both directions, since a
  // stack whose screens agree cannot tell which one was asked.
  it('belongs to the covering screen and not to the one underneath it', () => {
    const covering = stocked();
    applyDirective(covering, { kind: 'open-modal', modal: 'character-creation' });
    applyDirective(covering, { kind: 'open-modal', modal: 'carried-items' });

    expect(view(covering).modals.map((modal) => modal.name)).toEqual(['character-creation', 'carried-items']);
    expect(dismissal(view(covering).modals)).toEqual({ key: 'item', value: 'close' });

    const covered = onBlade();
    applyDirective(covered, { kind: 'talk', entity: 'sage' });

    expect(view(covered).modals.map((modal) => modal.name)).toEqual(['carried-items', 'dialogue']);
    expect(dismissal(view(covered).modals)).toBeNull();
  });

  // A screen may name a way out that the question in front of the player does
  // not offer, and a click that answered it would be answering a value the
  // engine is not listing.
  it('is nothing where the question being asked does not list it', () => {
    const asked: PlayView['modals'] = [{ name: 'held', leaving: 'close', options: [{ key: 'item', label: asLocalized('Item'), values: [{ value: 'blade', shown: asLocalized('Blade x1') }] }] }];

    expect(dismissal(asked)).toBeNull();
  });
});
