import { describe, expect, it } from 'vitest';
import { applyJsonPatch, diffJsonPatch } from './jsonPatch';

describe('applyJsonPatch', () => {
  it('applies a nested add to an existing object', () => {
    const result = applyJsonPatch({ actions: ['a'] }, [{ op: 'add', path: '/actions/-', value: 'b' }]);
    expect(result).toEqual({ actions: ['a', 'b'] });
  });

  it('leaves the value unchanged when the patch targets a nested path on an undefined object', () => {
    const result = applyJsonPatch(undefined, [{ op: 'add', path: '/actions/-', value: 'b' }]);
    expect(result).toBeUndefined();
  });

  it('still supports replacing the whole value at the root path', () => {
    const result = applyJsonPatch(undefined, [{ op: 'add', path: '', value: { id: 'new' } }]);
    expect(result).toEqual({ id: 'new' });
  });
});

describe('diffJsonPatch', () => {
  it('produces no ops for identical values', () => {
    expect(diffJsonPatch({ a: 1 }, { a: 1 })).toEqual([]);
  });
});
