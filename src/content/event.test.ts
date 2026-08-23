import { describe, expect, it } from 'vitest';
import { EVENT_TRIGGERS, EventTrigger, TRIGGER_NAMES, watchesAPool } from './sections/event';
import { loadModule } from './load';

const PRELUDE = `
# stat max-health
base: 10

# resource health
max: max-health

# skill melee
`;

const withEvent = (body: string): string => `${PRELUDE}\n# event moment\n${body}\n`;

const wellFormed = (trigger: EventTrigger): string => withEvent(`trigger: ${trigger}${watchesAPool(trigger) ? '\nresource: health' : ''}`);

describe('the closed set lives in trigger:', () => {
  it('accepts every name the table declares and nothing else', () => {
    for (const trigger of TRIGGER_NAMES) expect(() => loadModule(wellFormed(trigger)), trigger).not.toThrow();
    for (const absent of ['succeeded', 'failed', 'escaped', 'restored', 'drained', 'on hit', 'damage', 'on damage-dealt', 'sneezed']) {
      expect(() => loadModule(withEvent(`trigger: ${absent}\nresource: health`)), absent).toThrow('event trigger must be one of');
    }
  });

  it('names the triggers that do exist when it refuses one, so the list is readable off the error', () => {
    try {
      loadModule(withEvent('trigger: sneezed'));
      expect.unreachable('an unrecognised trigger must not load');
    } catch (raw) {
      const message = (raw as Error).message;
      for (const trigger of TRIGGER_NAMES) expect(message, trigger).toContain(trigger);
    }
  });

  it('is the whole vocabulary: ten names, each declaring one arity', () => {
    expect(TRIGGER_NAMES).toEqual(['on empty', 'on full', 'damage-dealt', 'damage-taken', 'missed', 'evaded', 'completed', 'unfinished', 'level-up', 'inventory-changed']);
    expect(Object.values(EVENT_TRIGGERS).every((arity) => arity === 'pool' || arity === 'none')).toBe(true);
  });
});

describe("a trigger's arity is resource:, in either direction", () => {
  it('refuses a declaration that disagrees with what its trigger takes', () => {
    for (const trigger of TRIGGER_NAMES) {
      const bare = withEvent(`trigger: ${trigger}`);
      const watching = withEvent(`trigger: ${trigger}\nresource: health`);
      const [loads, refused] = watchesAPool(trigger) ? [watching, bare] : [bare, watching];
      expect(() => loadModule(loads), `${trigger} well-formed`).not.toThrow();
      expect(() => loadModule(refused), `${trigger} ill-formed`).toThrow(/watches a pool, so it needs a resource:|watches no pool, so it takes no resource:/);
    }
  });

  it('names the arity it violated rather than only the field', () => {
    expect(() => loadModule(withEvent('trigger: on empty'))).toThrow('trigger: on empty watches a pool, so it needs a resource: naming which one');
    expect(() => loadModule(withEvent('trigger: damage-taken\nresource: health'))).toThrow('trigger: damage-taken watches no pool, so it takes no resource:');
  });
});

describe('a grant names a declared event and never an engine moment', () => {
  it('refuses every trigger name written where an event name belongs', () => {
    for (const trigger of TRIGGER_NAMES) {
      const source = `${PRELUDE}gain 4 experience on ${trigger.replace(' ', '-')}\n\n# event moment\ntrigger: damage-dealt\n`;
      expect(() => loadModule(source), trigger).toThrow('names an unknown event');
    }
  });

  it('resolves a declared event exactly as a handler label does', () => {
    const registry = loadModule(`${PRELUDE}gain 4 experience on moment\n\n# event moment\ntrigger: damage-dealt\n\n# entity rat\non moment:\n  say: bitten\n`);
    expect(registry.skills.get('melee')!.grants).toEqual([{ coefficient: 4, amount: false, event: 'moment' }]);
    expect(registry.entities.get('rat')!.handlers[0].event).toBe('moment');
  });
});

const OPTIONAL = `
# info m
version: 1.0.0
dependencies: ?absent

# stat attack
base: 4

# event moment
trigger: damage-dealt

# skill melee
tags: +1 attack per level of melee
gain 4 experience on absent.gone
gain 2 experience on moment

# skill lost-cause
tags: +1 absent.brawn per level of lost-cause

# entity player
skills: melee, lost-cause
`;

describe('a grant into a module that is absent prunes like every other reference', () => {
  it('drops the grant and keeps the skill, so the module still loads', () => {
    const registry = loadModule(OPTIONAL);
    expect(registry.skills.get('m.melee')!.grants).toEqual([{ coefficient: 2, amount: false, event: 'm.moment' }]);
  });

  it('drops the tag whose stat went with the absent module and keeps the skill anyone levelled', () => {
    const registry = loadModule(OPTIONAL);
    expect(registry.skills.get('m.lost-cause')!.tags).toEqual([]);
    expect(registry.entities.get('m.player')!.skills).toEqual(['m.melee', 'm.lost-cause']);
  });

  it('still refuses a name that no absent module could have supplied', () => {
    expect(() => loadModule(OPTIONAL.replace('gain 4 experience on absent.gone', 'gain 4 experience on typo'))).toThrow('names an unknown event');
  });
});
