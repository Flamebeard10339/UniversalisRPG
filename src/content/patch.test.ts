import { describe, expect, it } from 'vitest';
import { loadUniverse } from './load';
import { patchedInto, refused } from './patch';
import { sectionFor } from './sections';
import type { AnySchema } from '../grammar/section';

const schemaOf = (kind: string): AnySchema => sectionFor(kind)!.schema!;

const folded = (declared: string, patch: string, kind = 'location'): string => {
  const patched = patchedInto(declared, patch, schemaOf(kind));
  if (refused(patched)) throw new Error(patched.refused);
  return patched.text;
};

const why = (declared: string, patch: string, kind = 'location'): string => {
  const patched = patchedInto(declared, patch, schemaOf(kind));
  if (!refused(patched)) throw new Error(`expected a refusal, got:\n${patched.text}`);
  return patched.refused;
};

const MARKET = ['# location market-square', 'x: 7, y: 0', 'title: Market Square', 'examine: Four roads meet.', 'adjacent:', '  market-row', '  tavern-street'].join('\n');

describe('a patch folded into the section that declared the id', () => {
  it('writes over the fields it names and leaves every other line as it stood', () => {
    expect(folded(MARKET, '# location market-square\nx: 9, y: 2')).toBe(
      ['# location market-square', 'x: 9, y: 2', 'title: Market Square', 'examine: Four roads meet.', 'adjacent:', '  market-row', '  tavern-street'].join('\n'),
    );
  });

  it('rewrites one field of a line two fields share, leaving the other alone', () => {
    expect(folded(MARKET, '# location market-square\ny: 4').split('\n')[1]).toBe('x: 7, y: 4');
  });

  it('writes in a field the declaration does not have, where that kind writes it', () => {
    expect(folded('# location shed\ntitle: A Shed', '# location shed\nx: 2, y: 3').split('\n')).toEqual(['# location shed', 'x: 2, y: 3', 'title: A Shed']);
  });

  it('adds a member to a list without restating the members already there', () => {
    expect(folded(MARKET, '# location market-square\n+adjacent: riverside')).toBe(
      ['# location market-square', 'x: 7, y: 0', 'title: Market Square', 'examine: Four roads meet.', 'adjacent:', '  market-row', '  tavern-street', '  riverside'].join('\n'),
    );
  });

  it('takes a member out of a list and leaves the rest standing', () => {
    expect(folded(MARKET, '# location market-square\n-adjacent: market-row')).toBe(
      ['# location market-square', 'x: 7, y: 0', 'title: Market Square', 'examine: Four roads meet.', 'adjacent:', '  tavern-street'].join('\n'),
    );
  });

  it('adds and removes in one patch, in the order the patch writes them', () => {
    expect(folded(MARKET, '# location market-square\n-adjacent: market-row\n+adjacent: riverside').split('\n').slice(4)).toEqual(['adjacent:', '  tavern-street', '  riverside']);
  });

  it('writes a list in from nothing when the declaration names none', () => {
    expect(folded('# location shed\nx: 2, y: 3\ntitle: A Shed', '# location shed\n+adjacent: market-row').split('\n')).toEqual([
      '# location shed',
      'x: 2, y: 3',
      'title: A Shed',
      'adjacent:',
      '  market-row',
    ]);
  });

  it('is not fooled by a word that only looks like a field inside a value', () => {
    const declared = '# location shed\nx: 1, y: 1\nexamine: The door is adjacent: to nothing at all.';
    expect(folded(declared, '# location shed\nx: 5')).toBe('# location shed\nx: 5, y: 1\nexamine: The door is adjacent: to nothing at all.');
  });

  it('says so rather than writing a block into the middle of a shared line', () => {
    expect(why('# location shed\nx: 1, adjacent: market-row', '# location shed\n+adjacent: riverside')).toMatch(/line of its own/);
  });

  it('refuses a patch the language would refuse, in the language’s own words', () => {
    expect(why(MARKET, '# location market-square\nz: bananas')).toBe('expected a number');
  });
});

// The claim a patch has to answer: staged as a later module and written home into the module that
// declared the id are two roads to one world. Loaded either way, the registry says the same thing.
describe('a patch means the same folded home as it does staged', () => {
  const TOWN = [
    '# info town',
    'version: 1.0.0',
    '',
    '# location market-square',
    'x: 7, y: 0',
    'title: Market Square',
    'starting',
    'adjacent:',
    '  riverside',
    '',
    '# location riverside',
    'x: 8, y: 0',
    'title: Riverside',
    '',
    '# location kiln-lane',
    'x: 9, y: 1',
    'title: Kiln Lane',
  ].join('\n');

  const PATCHES = ['x: 3, y: 4', '+adjacent: kiln-lane', '-adjacent: riverside', 'title: The Market'];

  const sectionIn = (text: string, id: string): string => text.slice(text.indexOf(`# location ${id}`)).split('\n\n')[0]!;

  const staged = (patch: string): string => ['# info local', 'version: 0.0.0', 'dependencies:', '  town', '', '# location town.market-square', patch].join('\n');

  const seen = (registry: ReturnType<typeof loadUniverse>): unknown => {
    const place = registry.locations.get('town.market-square')!;
    return { x: place.x, y: place.y, title: place.title, roads: registry.roads.get('town.market-square')!.map((edge) => edge.target).sort() };
  };

  for (const patch of PATCHES) {
    it(`says the same thing for ${JSON.stringify(patch)}`, () => {
      const asModule = loadUniverse([
        { name: 'town', text: TOWN },
        { name: 'local', text: staged(patch) },
      ]);
      const declared = sectionIn(TOWN, 'market-square');
      const home = patchedInto(declared, `# location market-square\n${patch}`, schemaOf('location'));
      if (refused(home)) throw new Error(home.refused);
      const asHome = loadUniverse([{ name: 'town', text: TOWN.replace(declared, home.text) }]);
      expect(seen(asHome)).toEqual(seen(asModule));
    });
  }
});

describe('a patch written over a patch', () => {
  const STAGED = '# location market-square\nx: 3, y: 4\n+adjacent: kiln-lane';

  it('keeps the fields the second one is silent about', () => {
    expect(folded(STAGED, '# location market-square\ny: 9')).toBe('# location market-square\nx: 3, y: 9\n+adjacent: kiln-lane');
  });

  it('stays a patch: two runs of list edits are said as one, not resolved against a list that is not here', () => {
    expect(folded(STAGED, '# location market-square\n+adjacent: riverside')).toBe('# location market-square\nx: 3, y: 4\n+adjacent: kiln-lane, riverside');
  });

  // Not nothing: adding a road the declaration already holds says nothing, so what an add and its
  // undoing leave behind is the undoing — the one of the two that still means something at home.
  it('lets the later word stand where the two disagree about one member', () => {
    expect(folded(STAGED, '# location market-square\n-adjacent: kiln-lane')).toBe('# location market-square\nx: 3, y: 4\n-adjacent: kiln-lane');
    expect(folded('# location market-square\n-adjacent: kiln-lane', '# location market-square\n+adjacent: kiln-lane')).toBe('# location market-square\n+adjacent: kiln-lane');
  });

  it('takes a whole list written later over every edit that came before it', () => {
    expect(folded('# location market-square\n+adjacent: kiln-lane\n-adjacent: riverside', '# location market-square\nadjacent: forge')).toBe(
      '# location market-square\nadjacent: forge',
    );
  });
});
