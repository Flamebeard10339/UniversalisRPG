import { describe, expect, it } from 'vitest';
import { loadModule } from '../content/registry';
import { applyDirective, PlaySession, startSession, view } from './session';
import { SAVE_VERSION } from './save';

// A blade with a slot: has a plane, so feeding it takes it out of its stack.
// Everything else here names the blade from a different reader: an entity
// action's `requires: has`, a recipe's inputs, an item action, and a cost.
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

# save one-blade
{"version":${SAVE_VERSION},"inventory":{"blade":1,"whetstone":1},"equipped":{"mainhand":"blade"}}

# save two-blades
{"version":${SAVE_VERSION},"inventory":{"blade":2,"whetstone":1},"equipped":{"mainhand":"blade"}}
`;

const registry = loadModule(MODULE);

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
    expect(played.equipment.mainhand).toBe('1');
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
    const session = grownFrom('one-blade');
    applyDirective(session, { kind: 'craft', recipe: 'sharpen' });

    const played = view(session);
    expect(played.said).toContain('Your Blade has grown a plane of its own, and a grown item is never spent.');
    expect(played.inventory['sharp-blade']).toBeUndefined();
    expect(played.grown).toEqual({ '1': 'blade' });
  });

  it('refuses an action whose cost it alone covers, and says why', () => {
    const session = grownFrom('one-blade');
    applyDirective(session, { kind: 'use', obj: 'entity', objId: 'smith', actionId: 'temper' });

    const played = view(session);
    expect(played.said).toContain('Your Blade has grown a plane of its own, and a grown item is never spent.');
    expect(played.said).not.toContain('She quenches the blade and hands it back.');
    expect(played.grown).toEqual({ '1': 'blade' });
    expect(played.equipment.mainhand).toBe('1');
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
