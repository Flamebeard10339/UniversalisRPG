import { describe, expect, it } from 'vitest';
import { parseSection } from './section';
import { entitySchema, Entity } from './entity';
import { hydrateSection } from './section';
import { scopeEntity } from './scope';
import { splitSections } from './structure';

function entity(source: string): Entity {
  return scopeEntity(hydrateSection(parseSection(splitSections(source)[0], entitySchema), entitySchema));
}

describe('entity reference scoping', () => {
  it('qualifies a bare reference and a bare set/unset to the entity, leaving qualified refs, has, and items alone', () => {
    const door = entity(
      ['# entity front-door', 'pick lock:', '  requires: has lockpick', '  hidden if: unlocked', '  on success:', '    set: unlocked', '    set: tutorial.quest-given', '    give: coins'].join('\n'),
    );
    const [action] = door.actions;
    expect(action.requires).toEqual({ kind: 'has', item: 'lockpick', count: 1 });
    expect(action.hiddenIf).toEqual({ kind: 'reference', reference: { path: ['front-door', 'unlocked'] } });
    expect(action.onSuccess).toEqual([
      { kind: 'set', variable: 'front-door.unlocked' },
      { kind: 'set', variable: 'tutorial.quest-given' },
      { kind: 'give', item: 'coins' },
    ]);
  });
});
