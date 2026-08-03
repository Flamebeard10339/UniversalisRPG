import { describe, expect, it } from 'vitest';
import { loadModule, Registry } from './registry';

// One shared shape, three foes that differ only in what they say about it.
const MODULE = [
  '# stat attack',
  'base: 10',
  '',
  '# stat swing-rate',
  'base: 30',
  '',
  '# stat max-health',
  'base: 20',
  '',
  '# skill melee',
  '',
  '# item fang',
  'examine: Yellowed.',
  '',
  '# resource health',
  'max: max-health',
  '',
  '# entitytype melee-foe',
  'fight:',
  '  continuous',
  '  rate: swing-rate',
  '  target: health',
  '  ability: attack',
  'bite:',
  '  retaliates',
  '  rate: swing-rate',
  '  target: health',
  '  ability: attack',
  '',
  '# entity rat',
  'type: melee-foe',
  'stats: attack 4, max-health 8',
  'fight:',
  '  xp: melee 5',
  '',
  '# entity wolf',
  'type: melee-foe',
  'stats: attack 9',
  'howl:',
  '  instant',
  '  say: It howls.',
  '',
  '# entity dummy',
  'type: melee-foe',
  '-bite:',
].join('\n');

const actionsOf = (registry: Registry, entityId: string) => registry.entities.get(entityId)!.actions;
const action = (registry: Registry, entityId: string, label: string) => actionsOf(registry, entityId).find((each) => each.label === label);

describe('an entity inheriting an action template', () => {
  it('takes a template action it says nothing about, whole', () => {
    const registry = loadModule(MODULE);
    expect(action(registry, 'wolf', 'fight')).toMatchObject({ kind: 'continuous', rate: 'swing-rate', target: 'health', ability: 'attack' });
    expect(action(registry, 'wolf', 'bite')!.retaliates).toBe(true);
  });

  // The trap this is built to catch: an untagged block records no kind, so the
  // template's `continuous` survives an override that never mentions it.
  it('overlays a block whose label matches, keeping every field the block did not restate', () => {
    const registry = loadModule(MODULE);
    expect(action(registry, 'rat', 'fight')).toMatchObject({
      kind: 'continuous',
      rate: 'swing-rate',
      target: 'health',
      ability: 'attack',
      results: [{ kind: 'xp', skill: 'melee', amount: 5 }],
    });
  });

  it("keeps a label the template does not have as the entity own", () => {
    const registry = loadModule(MODULE);
    expect(action(registry, 'wolf', 'howl')).toMatchObject({ kind: 'instant' });
    expect(action(registry, 'rat', 'howl')).toBeUndefined();
  });

  it('drops one the entity removes, and only for that entity', () => {
    const registry = loadModule(MODULE);
    expect(action(registry, 'dummy', 'bite')).toBeUndefined();
    expect(action(registry, 'dummy', 'fight')).toBeDefined();
    expect(action(registry, 'rat', 'bite')).toBeDefined();
  });

  it('leaves stats to the entity, since the template sets none', () => {
    const registry = loadModule(MODULE);
    expect(registry.entities.get('rat')!.stats['attack']).toEqual({ min: 4, max: 4 });
    expect(registry.entities.get('wolf')!.stats['attack']).toEqual({ min: 9, max: 9 });
    expect(registry.entities.get('dummy')!.stats).toEqual({});
  });

  // Two entities holding one Action object would be walked once per entity by
  // any pass that rewrites ids in place, and bind to whichever went last.
  it('gives each entity its own copies, sharing no object with the template or each other', () => {
    const registry = loadModule(MODULE);
    const template = registry.entityTypes.get('melee-foe')!.actions.find((each) => each.label === 'bite')!;

    expect(action(registry, 'rat', 'bite')).not.toBe(template);
    expect(action(registry, 'wolf', 'bite')).not.toBe(template);
    expect(action(registry, 'rat', 'bite')).not.toBe(action(registry, 'wolf', 'bite'));
    expect(action(registry, 'rat', 'bite')).toEqual(action(registry, 'wolf', 'bite'));
  });

  // Nothing else in the DSL requires a section to precede the ones naming it,
  // and a template is what an entity is merged onto rather than a lookup it
  // does later, so the templates have to settle before any entity merges.
  it('inherits a template declared after the entity that names it', () => {
    const late = ['# entity crab', 'type: pincher', 'stats: nothing 1', '', '# stat nothing', '', '# entitytype pincher', 'pinch:', '  instant', '  say: Snip.'].join('\n');
    const registry = loadModule(late);
    expect(action(registry, 'crab', 'pinch')).toMatchObject({ kind: 'instant' });
  });

  it('rejects a type: that names no template', () => {
    expect(() => loadModule('# entity ghost\ntype: nowhere\n')).toThrow(/# entity ghost type: names an unknown entitytype: nowhere/);
  });

  it("checks the template own references in its own right", () => {
    expect(() => loadModule(MODULE.replace('  ability: attack\nbite:', '  ability: attaque\nbite:'))).toThrow(/# entitytype melee-foe action "fight" ability: names an unknown stat: attaque/);
  });

  it('removes a template nothing inherits', () => {
    const registry = loadModule(`${MODULE}\n\n# entitytype spare\nwave:\n  say: Hi.\n\n# remove entitytype.spare`);
    expect(registry.entityTypes.has('spare')).toBe(false);
    expect(registry.entityTypes.has('melee-foe')).toBe(true);
  });

  // Templates settle before anything inherits one, so removing a template is
  // removing it outright — an entity still naming it fails rather than quietly
  // keeping the actions it happened to be built from.
  it('fails the entities that still name a removed template', () => {
    expect(() => loadModule(`${MODULE}\n\n# remove entitytype.melee-foe`)).toThrow(/# entity rat type: names an unknown entitytype: melee-foe/);
  });
});
