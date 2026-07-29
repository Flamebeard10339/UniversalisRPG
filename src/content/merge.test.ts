import { describe, expect, it } from 'vitest';
import { loadUniverse } from './registry';
import { ModuleSource } from './universe';

const module = (id: string, ...lines: string[]): ModuleSource => ({ name: id, text: [`# info ${id}`, ...lines].join('\n') });

// A patch names the path it edits: a bare heading would create inside `patch`.
const patch = (...lines: string[]): ModuleSource => module('patch', 'dependencies: base', ...lines);

const BASE = module(
  'base',
  '# stat attack',
  '# item rope',
  'title: Hemp Rope',
  'examine: Coarse and long.',
  '# location beach',
  'x: 0, y: 0',
  'starting',
  'entities: crab, gull',
  'adjacent: dunes',
  '# location dunes',
  'x: 1, y: 0',
  '# entity crab',
  'title: Sand Crab',
  'examine: It eyes you sideways.',
  'stats: attack 2-4',
  'pinch:',
  '  time: 3',
  '  say: Ouch.',
  'flee:',
  '  say: It scuttles off.',
  '# entity gull',
  'title: Gull',
);

describe('a section applies its fields over what the id already holds', () => {
  it('leaves the fields a patch does not list alone', () => {
    const item = loadUniverse([BASE, patch('# item base.rope', 'examine: Frayed, but it holds.')]).items.get('base.rope')!;
    expect(item.title).toBe('Hemp Rope');
    expect(item.examine).toBe('Frayed, but it holds.');
  });

  it('does not reset unlisted fields to their defaults', () => {
    const entity = loadUniverse([BASE, patch('# entity base.crab', 'examine: Bigger than you remember.')]).entities.get('base.crab')!;
    expect(entity.title).toBe('Sand Crab');
    expect(entity.stats).toEqual({ 'base.attack': { min: 2, max: 4 } });
    expect(entity.actions.map((action) => action.label)).toEqual(['pinch', 'flee']);
  });

  it('creates inside its own module when the heading is bare, whatever a dependency holds', () => {
    const registry = loadUniverse([BASE, patch('# entity limpet', 'title: Limpet', '# item rope', 'title: Nylon Rope')]);
    expect(registry.entities.get('patch.limpet')!.title).toBe('Limpet');
    expect(registry.items.get('patch.rope')!.title).toBe('Nylon Rope');
    expect(registry.items.get('base.rope')!.title).toBe('Hemp Rope');
  });

  it('replaces a list field wholesale, because a bare key replaces', () => {
    const location = loadUniverse([BASE, patch('# location base.beach', 'entities: base.crab')]).locations.get('base.beach')!;
    expect(location.entities).toEqual(['base.crab']);
    expect(location.adjacent.map((edge) => edge.target)).toEqual(['base.dunes']);
    expect(location.starting).toBe(true);
  });
});

describe('actions merge by label', () => {
  it('patches one field of one action and leaves its siblings whole', () => {
    const entity = loadUniverse([BASE, patch('# entity base.crab', 'pinch:', '  time: 9')]).entities.get('base.crab')!;
    const pinch = entity.actions.find((action) => action.label === 'pinch')!;
    expect(pinch.time).toBe(9);
    expect(pinch.results).toEqual([{ kind: 'say', text: 'Ouch.' }]);
    expect(entity.actions.find((action) => action.label === 'flee')!.results).toEqual([{ kind: 'say', text: 'It scuttles off.' }]);
  });

  it('appends an action whose label is new, after the ones already there', () => {
    const entity = loadUniverse([BASE, patch('# entity base.crab', 'wave:', '  say: It waves a claw.')]).entities.get('base.crab')!;
    expect(entity.actions.map((action) => action.label)).toEqual(['pinch', 'flee', 'wave']);
  });
});

describe('dialogue merges one node at a time', () => {
  const withDialogue = module(
    'base',
    '# entity miki',
    'title: Miki the Guide',
    '# dialogue miki-intro',
    'owner = miki',
    'node greet:',
    '  Hello there.',
    'node farewell:',
    '  Goodbye.',
  );
  const dialogueOf = (...lines: string[]) => loadUniverse([withDialogue, patch(...lines)]).dialogues.get('base.miki-intro')!;

  it('replaces the steps of the node it names and leaves the others', () => {
    const dialogue = dialogueOf('# dialogue base.miki-intro', 'node greet:', '  Well met, traveller.');
    expect(dialogue.nodes.map((node) => node.name)).toEqual(['greet', 'farewell']);
    expect(dialogue.nodes[0].steps).toEqual([{ kind: 'say', segments: [{ kind: 'literal', text: 'Well met, traveller.' }] }]);
    expect(dialogue.nodes[1].steps).toEqual([{ kind: 'say', segments: [{ kind: 'literal', text: 'Goodbye.' }] }]);
  });

  it('keeps the steps when a patch only changes a node property', () => {
    const dialogue = dialogueOf('# dialogue base.miki-intro', 'node greet:', '  once');
    expect(dialogue.nodes[0].once).toBe(true);
    expect(dialogue.nodes[0].steps).toEqual([{ kind: 'say', segments: [{ kind: 'literal', text: 'Hello there.' }] }]);
  });

  it('appends a node whose name is new, and keeps the owner', () => {
    const dialogue = dialogueOf('# dialogue base.miki-intro', 'node aside:', '  Psst.');
    expect(dialogue.nodes.map((node) => node.name)).toEqual(['greet', 'farewell', 'aside']);
    expect(dialogue.owner).toBe('base.miki');
  });
});

describe('a list key takes + and -', () => {
  const adjacency = (sources: ModuleSource[]): string[] => loadUniverse(sources).locations.get('base.beach')!.adjacent.map((edge) => edge.target);
  const reef = (...lines: string[]) => module('reef', 'dependencies: base', '# location reef', 'x: 0, y: 1', ...lines);

  it('appends and removes independently, leaving the rest of the list alone', () => {
    expect(adjacency([BASE, reef('# location base.beach', '+adjacent: self.reef')])).toEqual(['base.dunes', 'reef.reef']);
    expect(adjacency([BASE, patch('# location base.beach', '-adjacent: dunes')])).toEqual([]);
  });

  it('applies several operators on one key in source order', () => {
    expect(adjacency([BASE, reef('# location base.beach', '+adjacent: self.reef', '-adjacent: dunes')])).toEqual(['reef.reef']);
    expect(adjacency([BASE, reef('# location base.beach', '+adjacent: self.reef', '-adjacent: self.reef')])).toEqual(['base.dunes']);
  });

  it('does not append a member the list already holds, and ignores removing one it does not', () => {
    expect(adjacency([BASE, patch('# location base.beach', '+adjacent: dunes')])).toEqual(['base.dunes']);
    expect(adjacency([BASE, reef('# location base.beach', '-adjacent: self.reef')])).toEqual(['base.dunes']);
  });

  it('removes a member named by only as much of it as identifies it', () => {
    const conditional = module('base', '# flag tide-out', '# location beach', 'x: 0, y: 0', 'adjacent: dunes while tide-out', '# location dunes', 'x: 1, y: 0');
    expect(adjacency([conditional, patch('# location base.beach', '-adjacent: dunes')])).toEqual([]);
  });

  it('rejects replacing and modifying the same key in one section', () => {
    expect(() => adjacency([BASE, patch('# location base.beach', '+adjacent: dunes', 'adjacent: dunes')])).toThrow(/cannot be both replaced and modified/);
    expect(() => adjacency([BASE, patch('# location base.beach', 'adjacent: dunes', '-adjacent: dunes')])).toThrow(/cannot be both replaced and modified/);
  });

  it('rejects an operator on a key that is not a list', () => {
    expect(() => loadUniverse([BASE, patch('# item base.rope', '+title: Rope')])).toThrow(/title is not a list, so it cannot take \+/);
  });

  it('removes one action by label, and refuses a + that would mean nothing', () => {
    const entity = loadUniverse([BASE, patch('# entity base.crab', '-pinch:')]).entities.get('base.crab')!;
    expect(entity.actions.map((action) => action.label)).toEqual(['flee']);
    expect(() => loadUniverse([BASE, patch('# entity base.crab', '+wave:', '  say: Hi.')])).toThrow(/\+ means nothing here/);
  });
});

describe('# remove takes out what omission cannot', () => {
  it('removes a section, and complains when it names nothing', () => {
    const registry = loadUniverse([BASE, patch('# location base.beach', '-adjacent: dunes', '# remove location.dunes')]);
    expect(registry.locations.has('base.dunes')).toBe(false);
    expect(() => loadUniverse([BASE, patch('# remove location.atlantis')])).toThrow(/names an unknown location: atlantis/);
  });

  it('lets a later module name the removed id again and get a fresh one', () => {
    const cut = module('cut', 'dependencies: base', '# remove item.rope');
    const again = module('zzz-again', 'dependencies: cut', '# item rope', 'title: New Rope');
    const registry = loadUniverse([BASE, cut, again]);
    expect(registry.items.has('base.rope')).toBe(false);
    expect(registry.items.get('zzz-again.rope')!.title).toBe('New Rope');
  });
});

describe('merging follows load order, not source order', () => {
  it('lets the module that loads last decide a field both modules write', () => {
    const first = patch('# item base.rope', 'title: Old Rope');
    const second = module('zzz-later', 'dependencies: patch, base', '# item base.rope', 'title: New Rope');
    const item = loadUniverse([second, BASE, first]).items.get('base.rope')!;
    expect(item.title).toBe('New Rope');
    expect(item.examine).toBe('Coarse and long.');
  });
});
