import { describe, expect, it } from 'vitest';
import { loadUniverse } from './registry';
import { ModuleSource } from './universe';

const module = (id: string, ...lines: string[]): ModuleSource => ({ name: id, text: [`# info ${id}`, ...lines].join('\n') });

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
    const item = loadUniverse([BASE, patch('# item rope', 'examine: Frayed, but it holds.')]).items.get('rope')!;
    expect(item.title).toBe('Hemp Rope');
    expect(item.examine).toBe('Frayed, but it holds.');
  });

  it('does not reset unlisted fields to their defaults', () => {
    const entity = loadUniverse([BASE, patch('# entity crab', 'examine: Bigger than you remember.')]).entities.get('crab')!;
    expect(entity.title).toBe('Sand Crab');
    expect(entity.stats).toEqual({ attack: { min: 2, max: 4 } });
    expect(entity.actions.map((action) => action.label)).toEqual(['pinch', 'flee']);
  });

  it('creates the id when nothing holds it yet, with the same syntax', () => {
    const registry = loadUniverse([BASE, patch('# entity limpet', 'title: Limpet')]);
    expect(registry.entities.get('limpet')!.title).toBe('Limpet');
  });

  it('replaces a list field wholesale, because a bare key replaces', () => {
    const location = loadUniverse([BASE, patch('# location beach', 'entities: crab')]).locations.get('beach')!;
    expect(location.entities).toEqual(['crab']);
    expect(location.adjacent.map((edge) => edge.target)).toEqual(['dunes']);
    expect(location.starting).toBe(true);
  });
});

describe('actions merge by label', () => {
  it('patches one field of one action and leaves its siblings whole', () => {
    const entity = loadUniverse([BASE, patch('# entity crab', 'pinch:', '  time: 9')]).entities.get('crab')!;
    const pinch = entity.actions.find((action) => action.label === 'pinch')!;
    expect(pinch.time).toBe(9);
    expect(pinch.results).toEqual([{ kind: 'say', text: 'Ouch.' }]);
    expect(entity.actions.find((action) => action.label === 'flee')!.results).toEqual([{ kind: 'say', text: 'It scuttles off.' }]);
  });

  it('appends an action whose label is new, after the ones already there', () => {
    const entity = loadUniverse([BASE, patch('# entity crab', 'wave:', '  say: It waves a claw.')]).entities.get('crab')!;
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

  it('replaces the steps of the node it names and leaves the others', () => {
    const dialogue = loadUniverse([withDialogue, patch('# dialogue miki-intro', 'node greet:', '  Well met, traveller.')]).dialogues.get('miki-intro')!;
    expect(dialogue.nodes.map((node) => node.name)).toEqual(['greet', 'farewell']);
    expect(dialogue.nodes[0].steps).toEqual([{ kind: 'say', segments: [{ kind: 'literal', text: 'Well met, traveller.' }] }]);
    expect(dialogue.nodes[1].steps).toEqual([{ kind: 'say', segments: [{ kind: 'literal', text: 'Goodbye.' }] }]);
  });

  it('keeps the steps when a patch only changes a node property', () => {
    const dialogue = loadUniverse([withDialogue, patch('# dialogue miki-intro', 'node greet:', '  once')]).dialogues.get('miki-intro')!;
    expect(dialogue.nodes[0].once).toBe(true);
    expect(dialogue.nodes[0].steps).toEqual([{ kind: 'say', segments: [{ kind: 'literal', text: 'Hello there.' }] }]);
  });

  it('appends a node whose name is new, and keeps the owner', () => {
    const dialogue = loadUniverse([withDialogue, patch('# dialogue miki-intro', 'node aside:', '  Psst.')]).dialogues.get('miki-intro')!;
    expect(dialogue.nodes.map((node) => node.name)).toEqual(['greet', 'farewell', 'aside']);
    expect(dialogue.owner).toBe('miki');
  });
});

describe('merging follows load order, not source order', () => {
  it('lets the module that loads last decide a field both modules write', () => {
    const first = patch('# item rope', 'title: Old Rope');
    const second = module('zzz-later', 'dependencies: patch', '# item rope', 'title: New Rope');
    expect(loadUniverse([second, BASE, first]).items.get('rope')!.title).toBe('New Rope');
    expect(loadUniverse([second, BASE, first]).items.get('rope')!.examine).toBe('Coarse and long.');
  });
});
