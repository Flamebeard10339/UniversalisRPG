import { describe, expect, it } from 'vitest';
import { actionDescriptionKey, actionFailureKey, actionKillKey, actionSuccessKey, actionTitleKey } from './contentIds';

describe('content ids', () => {
  it('preserves dotted action namespaces for entity action localization keys', () => {
    expect(actionTitleKey('entity.goblin.fight')).toBe('action.entity.goblin.fight.title');
    expect(actionDescriptionKey('entity.goblin.fight')).toBe('action.entity.goblin.fight.description');
    expect(actionSuccessKey('entity.goblin.fight')).toBe('action.entity.goblin.fight.success');
    expect(actionFailureKey('entity.goblin.fight')).toBe('action.entity.goblin.fight.failure');
    expect(actionKillKey('entity.goblin.fight')).toBe('action.entity.goblin.fight.kill');
  });

  it('still normalizes each action id segment', () => {
    expect(actionTitleKey('entity.OakTree.ChopFast')).toBe('action.entity.oak-tree.chop-fast.title');
    expect(actionTitleKey('gatherRumors')).toBe('action.gather-rumors.title');
  });
});
