import { describe, expect, it } from 'vitest';
import { loadModule } from './load';

const WITH_AN_ACTION = '# action prise\ntitle: Prise\ninstant\n\n';

describe('# guise refuses', () => {
  it('a body that takes nothing away and says nothing, since whatever wore it would be exactly as it was', () => {
    expect(() => loadModule('# guise open')).toThrow(/takes nothing away and says nothing/);
    expect(() => loadModule(`${WITH_AN_ACTION}# guise open\nwithout: prise`)).not.toThrow();
    expect(() => loadModule('# guise open\ntitle: Open')).not.toThrow();
    expect(() => loadModule('# guise open\nexamine: It stands open.')).not.toThrow();
  });

  it('a without: naming an action nothing declares', () => {
    expect(() => loadModule('# guise open\nwithout: prise')).toThrow(/unknown action: prise/);
  });
});
