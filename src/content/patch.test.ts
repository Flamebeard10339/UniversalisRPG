import { describe, expect, it } from 'vitest';
import { loadUniverse } from './load';
import { patchedInto, refused, travelsWhole } from './patch';
import { sectionFor } from './sections';
import type { AnySchema } from '../grammar/section';

const schemaOf = (kind: string): AnySchema => sectionFor(kind)!.schema!;

const folded = (declared: string, patch: string, kind = 'location'): string => {
  const patched = patchedInto(declared, patch, schemaOf(kind));
  if (refused(patched)) throw new Error(patched.refused);
  if (travelsWhole(patched)) throw new Error(`expected a fold, got the patch whole:\n${patched.text}`);
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

  it('takes a block in whole, down under a line that opens a block of its own', () => {
    const struck = ['# entity oolga', 'when hit:', '  if not oolga-struck:', '    set: oolga-struck', '    say: Snap.'];
    const declared = ['# entity oolga', 'title: Grandma Oolga', 'stats: attack 1, defense 1, max-health 10'];

    const text = folded(declared.join('\n'), struck.join('\n'), 'entity');

    expect(text.split('\n').sort()).toEqual([...declared, ...struck.slice(1)].sort());
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

describe('an entry folded home by the label it carries', () => {
  const GATE = ['# location gate', 'x: 1, y: 2', 'title: The Gate', 'push it open:', '  time: 4', '  say: It gives.'];
  const KNOCK = ['knock twice:', '  time: 2', '  say: Nobody answers.'];

  it('writes in an entry nothing at home holds, under every line that does', () => {
    expect(folded(GATE.join('\n'), ['# location gate', ...KNOCK].join('\n')).split('\n')).toEqual([...GATE, ...KNOCK]);
  });

  it('takes an entry away by striking the one at home, block and all', () => {
    expect(folded(GATE.join('\n'), '# location gate\n-push it open:').split('\n')).toEqual(['# location gate', 'x: 1, y: 2', 'title: The Gate']);
  });

  it('unwrites nothing where it takes away a label nothing at home holds', () => {
    expect(folded(GATE.join('\n'), '# location gate\n-knock twice:')).toBe(GATE.join('\n'));
  });

  it('hands the patch back whole where an entry is laid over one already standing', () => {
    const patched = patchedInto(GATE.join('\n'), '# location gate\npush it open:\n  say: It sticks.', schemaOf('location'));

    expect(refused(patched)).toBe(false);
    expect(travelsWhole(patched)).toBe(true);
    expect((patched as { text: string }).text).toBe('# location gate\npush it open:\n  say: It sticks.');
  });

  const ANGLER = ['# entity angler', 'title: Angler', 'stats: attack 1, defense 1, max-health 10', 'on fishing.line-parted:', '  say: The line goes slack.'];

  it('matches a dotted label to its home the way an undotted one matches', () => {
    const same = patchedInto(ANGLER.join('\n'), '# entity angler\non fishing.line-parted:\n  say: Again.', schemaOf('entity'));

    expect(travelsWhole(same)).toBe(true);
    expect(folded(ANGLER.join('\n'), '# entity angler\non fishing.rod-snapped:\n  say: Snap.', 'entity').split('\n')).toEqual([...ANGLER, 'on fishing.rod-snapped:', '  say: Snap.']);
    expect(folded(ANGLER.join('\n'), '# entity angler\n-on fishing.line-parted:', 'entity').split('\n')).toEqual(ANGLER.slice(0, 3));
  });
});

describe('a patch written over a patch', () => {
  const STAGED = '# location market-square\nx: 3, y: 4\n+adjacent: kiln-lane';

  it('keeps the fields the second one is silent about', () => {
    expect(folded(STAGED, '# location market-square\ny: 9')).toBe('# location market-square\nx: 3, y: 9\n+adjacent: kiln-lane');
  });

  it('stays a patch: two runs of list edits are said as one, not resolved against a list that is not here', () => {
    expect(folded(STAGED, '# location market-square\n+adjacent: riverside')).toBe('# location market-square\nx: 3, y: 4\n+adjacent: kiln-lane, riverside');
  });

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
