import { describe, expect, it } from 'vitest';
import { loadModule } from './load';

describe('# race refuses', () => {
  it('a payload it would have to roll, since a race is held and never granted', () => {
    expect(() => loadModule('# stat attack\n\n# race orc\n+1-3 attack')).toThrow(/\+1-3 attack is a range; a race is carried from birth with no moment to roll one/);
  });

  it('a stat nothing declares, wherever the clause names one', () => {
    expect(() => loadModule('# race orc\n+5% brawn')).toThrow(/# race orc tag names an unknown stat: brawn/);
    expect(() => loadModule('# stat attack\n\n# skill melee\n\n# race orc\n+1 attack per level of swimming')).toThrow(/# race orc tag per names an unknown skill: swimming/);
  });
});
