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
examine: A plain steel blade.
polish:
  instant
  say: You work the edge to a shine.

# item whetstone
item-experience: 1000

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

# recipe sharpen
in: 1 blade
out: sharp-blade
say: You grind the blade to a killing edge.

// The one blade, worn. Re-recorded for c21: written under the invariant it
// replaced, this fixture carried the blade and wore it at once, which now spells
// two blades and is not what any test below is about.
# save one-blade
{"version":${SAVE_VERSION},"inventory":{"whetstone":1},"equipped":{"mainhand":"blade"}}

# save carried-blade
{"version":${SAVE_VERSION},"inventory":{"blade":1,"whetstone":1}}

# save two-blades
{"version":${SAVE_VERSION},"inventory":{"blade":2,"whetstone":1},"equipped":{"mainhand":"blade"}}
`;

const registry = loadInEnglish(MODULE);

function choices(session: PlaySession): string[] {
  return view(session).choices.map((choice) => choice.id);
}

function grownFrom(save: string): PlaySession {
  const session = startSession(registry);
  applyDirective(session, { kind: 'load', save });
  expect(applyDirective(session, { kind: 'feed', target: 'blade', food: 'whetstone' }).failure).toBeUndefined();
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
    applyDirective(session, { kind: 'load', save: 'one-blade' });
    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'smith', actionId: 'temper' });

    const played = view(session);
    expect(played.said).toContain('Your Blade is the one you are wearing, and what you wear is never spent.');
    expect(played.equipment).toEqual([{ slot: 'mainhand', title: 'Mainhand', item: 'blade', name: 'Blade' }]);
  });

  it('stops a repeating action when the stack runs dry, rather than running on nothing', () => {
    const session = grownFrom('two-blades');
    applyDirective(session, { kind: 'begin', inner: { kind: 'use', obj: 'entity', objId: 'smith', actionId: 'grind' } });
    applyDirective(session, { kind: 'wait', seconds: 30 });

    const played = view(session);
    expect(played.inventory['sharp-blade']).toBe(1);
    expect(played.inventory.blade).toBeUndefined();
    expect(played.grown).toEqual({ '1': 'blade' });
  });

  it('spends the stack, and only the stack, when one is still there', () => {
    const session = grownFrom('two-blades');
    applyDirective(session, { kind: 'craft', recipe: 'sharpen' });

    const played = view(session);
    expect(played.inventory['sharp-blade']).toBe(1);
    expect(played.inventory.blade).toBeUndefined();
    expect(played.grown).toEqual({ '1': 'blade' });
  });
});
