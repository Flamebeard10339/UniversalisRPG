import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { SAVE_VERSION } from '../runtime/save';
import { applyDirective, startSession, submitModal, view, type PlaySession, type PlayView } from '../runtime/session';
import { askedOfRow, dismissal } from './asking';

// Driven off real published views rather than hand-built ones: what these two
// decisions are worth is entirely in reading fields the engine actually fills,
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
  applyDirective(session, { kind: 'submit-modal', key: 'item', value: 'Blade x1' });
  return session;
}

describe('what a click away from a screen answers', () => {
  it('is the value the screen published as the one that leaves it', () => {
    const inventory = view(onBlade());
    expect(dismissal(inventory.modals)).toEqual({ key: 'verb', value: 'Close' });

    const session = onBlade();
    submitModal(session, { verb: 'Grow' });
    expect(dismissal(view(session).modals)).toEqual({ key: 'plane', value: 'Back to inventory' });
  });

  // The gesture is the same answer the prompt types, so it takes the screen
  // where answering takes it and never anywhere else: the inventory closes and
  // the plane goes back to the inventory (c11, c19).
  it('leaves the screen where answering it leaves it', () => {
    const session = onBlade();
    submitModal(session, { verb: 'Grow' });

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

  // A screen may name a way out that the question in front of the player does
  // not offer, and a click that answered it would be answering a value the
  // engine is not listing.
  it('is nothing where the question being asked does not list it', () => {
    const asked: PlayView['modals'] = [{ name: 'held', leaving: 'Close', options: [{ key: 'item', label: 'Item', values: ['Blade x1'] }] }];

    expect(dismissal(asked)).toBeNull();
  });
});

describe('which row a question belongs to', () => {
  it('is the row the page opened, while the screen has no subject of its own', () => {
    const opened = view(onBlade());

    expect(askedOfRow(opened, 'blade')).toBe('blade');
    // A row this page is not drawing, and a row nothing was opened on.
    expect(askedOfRow(opened, 'whetstone')).toBeNull();
    expect(askedOfRow(opened, null)).toBeNull();
  });

  // c10's focus is what says a screen holds more than a row can carry, so the
  // plane goes over the page however it was reached — and the name of the screen
  // is still never read.
  it('is nothing for a screen holding a subject beside its options', () => {
    const session = onBlade();
    submitModal(session, { verb: 'Grow' });

    expect(view(session).focus).not.toBeNull();
    expect(askedOfRow(view(session), 'blade')).toBeNull();
  });

  it('is nothing when nothing is being asked', () => {
    const session = stocked();

    expect(askedOfRow(view(session), 'blade')).toBeNull();
    expect(askedOfRow(null, 'blade')).toBeNull();
  });
});
