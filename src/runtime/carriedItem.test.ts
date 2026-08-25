import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { applyDirective, PlaySession, startSession, view } from './session';
import { SAVE_VERSION } from './save';

const MODULE = `
# location forge
x: 0, y: 0
starting
entities:
  smith

# item blade
slot: mainhand
item-level: 4
examine: A plain steel blade.
polish:
  instant
  say: You work the edge to a shine.

# item hauberk
title: Hauberk
slot: offhand

# item sharp-blade
examine: A blade with a killing edge.

# entity smith
examine: A soot-streaked woman at the anvil.
appraise:
  requires: has blade
  instant
  say: She turns your blade over and grunts.
temper:
  instant
  take: 1 blade
  say: She quenches the blade and hands it back.
grind:
  continuous
  time: 1
  take: 1 blade
  give: 1 sharp-blade
mend:
  instant
  take: 1 hauberk
  say: She hammers the rings back true.

# recipe sharpen
in: 1 blade
out: sharp-blade
say: You grind the blade to a killing edge.

// A base is a copy of its own from the moment it drops, so every fixture below
// spells its blades as instances and none of them is ever in a stack.
# save one-blade
{"version":${SAVE_VERSION},"equipped":{"mainhand":"1"},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"blade","payload":{"roll":0.25,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save carried-blade
{"version":${SAVE_VERSION},"instances":{"next":2,"byId":{"1":{"kind":"item","template":"blade","payload":{"roll":0.25,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

# save two-blades
{"version":${SAVE_VERSION},"equipped":{"mainhand":"1"},"instances":{"next":3,"byId":{"1":{"kind":"item","template":"blade","payload":{"roll":0.25,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}},"2":{"kind":"item","template":"blade","payload":{"roll":0.75,"plane":{"0,0":{"jewel":null,"entry":null,"roll":0.5,"allocatedPositions":[],"allocatedSlots":[],"effects":[]}}}}}}}

// The one thing here that does stack, worn with none left behind it.
# save one-hauberk
{"version":${SAVE_VERSION},"equipped":{"offhand":"hauberk"}}
`;

const registry = loadInEnglish(MODULE);

function choices(session: PlaySession): string[] {
  return view(session).choices.map((choice) => choice.id);
}

function grownFrom(save: string): PlaySession {
  const session = startSession(registry);
  applyDirective(session, { kind: 'load', save });
  return session;
}

describe('a grown copy is still a carried blade', () => {
  it('is worn, out of its stack, and named by its instance id', () => {
    const played = view(grownFrom('one-blade'));
    expect(played.inventory.blade).toBeUndefined();
    expect(played.grown).toEqual({ '1': 'blade' });
    expect(played.equipment).toEqual([{ slot: 'mainhand', title: 'Mainhand', item: '1', name: 'Modified Blade' }]);
  });

  it('still satisfies a requires: has gate', () => {
    expect(choices(grownFrom('one-blade'))).toContain('use:entity.smith.appraise');
  });

  it('still offers the item actions the blade declares', () => {
    expect(choices(grownFrom('one-blade'))).toContain('use:item.blade.polish');
  });

  it('still makes a recipe that names it craftable', () => {
    expect(choices(grownFrom('one-blade'))).toContain('craft:sharpen');
  });

  it('affords a cost that names it, rather than reading as an empty pocket', () => {
    const session = grownFrom('one-blade');
    expect(choices(session)).toContain('use:entity.smith.temper');
    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'smith', actionId: 'temper' });
    expect(view(session).said).not.toContain("You don't have enough Blade.");
  });

  it('does not offer to equip the stack it left', () => {
    expect(choices(grownFrom('one-blade'))).not.toContain('equip:blade');
  });
});

describe('a grown copy is never spent', () => {
  it('refuses a craft that would have to consume it, and leaves the plane standing', () => {
    const session = grownFrom('carried-blade');
    applyDirective(session, { kind: 'craft', recipe: 'sharpen' });

    const played = view(session);
    expect(played.said).toContain('Your Blade has grown a plane of its own, and a grown item is never spent.');
    expect(played.inventory['sharp-blade']).toBeUndefined();
    expect(played.grown).toEqual({ '1': 'blade' });
  });

  it('refuses an action whose cost only the copy in the slot covers, and says why', () => {
    const session = grownFrom('one-blade');
    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'smith', actionId: 'temper' });

    const played = view(session);
    expect(played.said).toContain('Your Blade is the one you are wearing, and what you wear is never spent.');
    expect(played.said).not.toContain('She quenches the blade and hands it back.');
    expect(played.grown).toEqual({ '1': 'blade' });
    expect(played.equipment).toEqual([{ slot: 'mainhand', title: 'Mainhand', item: '1', name: 'Modified Blade' }]);
  });

  it('refuses a cost a worn stack copy alone covers, and leaves it on', () => {
    const session = startSession(registry);
    applyDirective(session, { kind: 'load', save: 'one-hauberk' });
    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'smith', actionId: 'mend' });

    const played = view(session);
    expect(played.said).toContain('Your Hauberk is the one you are wearing, and what you wear is never spent.');
    expect(played.equipment).toEqual([{ slot: 'offhand', title: 'Offhand', item: 'hauberk', name: 'Hauberk' }]);
  });

  it('refuses however many copies are held, because a base never joins the stack a cost is taken from', () => {
    const session = grownFrom('two-blades');
    applyDirective(session, { kind: 'craft', recipe: 'sharpen' });

    const played = view(session);
    expect(played.inventory['sharp-blade']).toBeUndefined();
    expect(played.grown).toEqual({ '1': 'blade', '2': 'blade' });
  });
});
