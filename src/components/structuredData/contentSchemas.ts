import type { ContentBundle } from '../../game/types';
import type { StructuredSchema } from './StructuredData';

const string = (suggestions?: string[]): StructuredSchema => ({ kind: 'string', suggestions });
const number = (min?: number): StructuredSchema => ({ kind: 'number', min });
const boolean: StructuredSchema = { kind: 'boolean' };
const comparison: StructuredSchema = { kind: 'enum', options: ['equal', 'at-least', 'at-most', 'greater-than', 'less-than'] };

export const locationSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { schema: string() }, titleKey: { schema: string(), optional: true }, descriptionKey: { schema: string(), optional: true },
  position: { schema: { kind: 'object', fields: { x: { schema: number() }, y: { schema: number() } } } },
  starting: { schema: boolean, optional: true, defaultValue: false },
  tags: { schema: { kind: 'array', item: string(), createItem: () => '' }, optional: true, defaultValue: [] },
} });

export const edgeSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { schema: string() }, source: { schema: string(bundle.locations.map((item) => item.id)) }, target: { schema: string(bundle.locations.map((item) => item.id)) },
  travelTimeSeconds: { schema: number(0) }, requirementIds: { schema: { kind: 'array', item: string(), createItem: () => '' }, optional: true, defaultValue: [] },
} });

export const rewardSchema = (bundle: ContentBundle): StructuredSchema => ({
  kind: 'union', discriminator: 'kind', variants: {
    skillXp: { label: 'contribution.reward.skillXp', createValue: () => ({ kind: 'skillXp', skillId: bundle.skills[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['skillXp'] } }, skillId: { schema: string(bundle.skills.map((item) => item.id)) }, amount: { schema: number(0) } } } },
    item: { label: 'contribution.reward.item', createValue: () => ({ kind: 'item', itemId: bundle.items[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['item'] } }, itemId: { schema: string(bundle.items.map((item) => item.id)) }, amount: { schema: number(0) } } } },
    resource: { label: 'contribution.reward.resource', createValue: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['resource'] } }, resourceId: { schema: string(bundle.resourceDefinitions.map((item) => item.id)) }, amount: { schema: number(0) } } } },
  },
});

export const conditionSchema = (bundle: ContentBundle): StructuredSchema => ({
  kind: 'union', discriminator: 'kind', variants: {
    'death-count': { createValue: () => ({ kind: 'death-count', comparison: 'equal', value: 0 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['death-count'] } }, comparison: { schema: comparison }, value: { schema: number(0) } } } },
    item: { createValue: () => ({ kind: 'item', itemId: bundle.items[0]?.id ?? '', comparison: 'at-least', value: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['item'] } }, itemId: { schema: string(bundle.items.map((item) => item.id)) }, comparison: { schema: comparison }, value: { schema: number() } } } },
    resource: { createValue: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', comparison: 'at-least', value: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['resource'] } }, resourceId: { schema: string(bundle.resourceDefinitions.map((item) => item.id)) }, comparison: { schema: comparison }, value: { schema: number() } } } },
    'skill-level': { createValue: () => ({ kind: 'skill-level', skillId: bundle.skills[0]?.id ?? '', comparison: 'at-least', value: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['skill-level'] } }, skillId: { schema: string(bundle.skills.map((item) => item.id)) }, comparison: { schema: comparison }, value: { schema: number(1) } } } },
    'action-completions': { createValue: () => ({ kind: 'action-completions', actionId: bundle.actions[0]?.id ?? '', comparison: 'at-least', value: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['action-completions'] } }, actionId: { schema: string(bundle.actions.map((item) => item.id)) }, comparison: { schema: comparison }, value: { schema: number(0) } } } },
    flag: { createValue: () => ({ kind: 'flag', flagId: bundle.flags[0]?.id ?? '', value: true }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['flag'] } }, flagId: { schema: string(bundle.flags.map((item) => item.id)) }, value: { schema: boolean } } } },
    all: { createValue: () => ({ kind: 'all', conditions: [] }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['all'] } }, conditions: { schema: { kind: 'array', item: () => conditionSchema(bundle), createItem: () => ({ kind: 'death-count', comparison: 'equal', value: 0 }) } } } } },
    any: { createValue: () => ({ kind: 'any', conditions: [] }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['any'] } }, conditions: { schema: { kind: 'array', item: () => conditionSchema(bundle), createItem: () => ({ kind: 'death-count', comparison: 'equal', value: 0 }) } } } } },
    not: { createValue: () => ({ kind: 'not', condition: { kind: 'death-count', comparison: 'equal', value: 0 } }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['not'] } }, condition: { schema: () => conditionSchema(bundle) } } } },
  },
});

export const resultSchema = (bundle: ContentBundle): StructuredSchema => ({
  kind: 'union', discriminator: 'kind', variants: {
    item: { createValue: () => ({ kind: 'item', itemId: bundle.items[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['item'] } }, itemId: { schema: string(bundle.items.map((item) => item.id)) }, amount: { schema: number() } } } },
    resource: { createValue: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['resource'] } }, resourceId: { schema: string(bundle.resourceDefinitions.map((item) => item.id)) }, amount: { schema: number() } } } },
    'skill-xp': { createValue: () => ({ kind: 'skill-xp', skillId: bundle.skills[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['skill-xp'] } }, skillId: { schema: string(bundle.skills.map((item) => item.id)) }, amount: { schema: number() } } } },
    flag: { createValue: () => ({ kind: 'flag', flagId: bundle.flags[0]?.id ?? '', value: true }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['flag'] } }, flagId: { schema: string(bundle.flags.map((item) => item.id)) }, value: { schema: boolean } } } },
    relocate: { createValue: () => ({ kind: 'relocate', locationId: bundle.locations[0]?.id ?? '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['relocate'] } }, locationId: { label: 'contribution.column.location', schema: string(bundle.locations.map((item) => item.id)) } } } },
    chat: { createValue: () => ({ kind: 'chat', messageKey: '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['chat'] } }, messageKey: { schema: string() }, delaySeconds: { schema: number(0), optional: true, defaultValue: 0 } } } },
  },
});

export const actionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() }, locationId: { label: 'contribution.column.location', schema: string(bundle.locations.map((item) => item.id)) }, inventoryItemId: { label: 'contribution.column.inventoryItem', schema: string(bundle.items.map((item) => item.id)), optional: true }, role: { label: 'contribution.column.actionRole', schema: { kind: 'enum', options: ['optional', 'progression', 'utility'] }, optional: true, defaultValue: 'optional' }, titleKey: { schema: string(), optional: true }, descriptionKey: { schema: string(), optional: true }, durationSeconds: { label: 'contribution.column.actionDuration', schema: number(0) }, rewards: { label: 'contribution.column.rewards', schema: { kind: 'array', item: rewardSchema(bundle), createItem: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }) } }, requirements: { label: 'contribution.column.requirements', schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'death-count', comparison: 'equal', value: 0 } }, visibleWhen: { label: 'contribution.column.visibleWhen', schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'death-count', comparison: 'equal', value: 0 } }, results: { label: 'contribution.column.results', schema: { kind: 'array', item: resultSchema(bundle), createItem: () => ({ kind: 'chat', messageKey: '' }) }, optional: true, defaultValue: [] }, maxCompletions: { label: 'contribution.column.maxCompletions', schema: number(1), optional: true, defaultValue: 1 }, enemyId: { label: 'contribution.column.enemy', schema: string(bundle.enemies.map((item) => item.id)), optional: true }, interactionTypeId: { label: 'contribution.column.interaction', schema: string(bundle.interactionTypes.map((item) => item.id)), optional: true }, sourceSkillId: { label: 'contribution.column.sourceSkill', schema: string(bundle.skills.map((item) => item.id)), optional: true }, targetSkillId: { label: 'contribution.column.targetSkill', schema: string(bundle.skills.map((item) => item.id)), optional: true }, health: { label: 'contribution.column.health', schema: number(0), optional: true }, rate: { label: 'contribution.column.rate', schema: number(0), optional: true },
} });

export const boundarySchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'union', discriminator: 'kind', variants: {
  'stop-action': { createValue: () => ({ kind: 'stop-action' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['stop-action'] } } } } },
  refill: { createValue: () => ({ kind: 'refill', value: 'max' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['refill'] } }, value: { schema: { kind: 'inferred' } } } } },
  relocate: { createValue: () => ({ kind: 'relocate', locationId: bundle.locations[0]?.id ?? '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['relocate'] } }, locationId: { schema: string(bundle.locations.map((item) => item.id)) } } } },
  chat: { createValue: () => ({ kind: 'chat', messageKey: '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['chat'] } }, messageKey: { schema: string() } } } },
  'death-reset': { createValue: () => ({ kind: 'death-reset' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['death-reset'] } } } } },
} });

export const deathResetSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  locationId: { schema: string(['starting-location', ...bundle.locations.map((item) => item.id)]), optional: true, defaultValue: 'starting-location' },
  preserve: { optional: true, defaultValue: {}, schema: { kind: 'object', fields: {
    inventoryIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.items.map((item) => item.id)), createItem: () => bundle.items[0]?.id ?? '' } },
    resourceIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.resourceDefinitions.map((item) => item.id)), createItem: () => bundle.resourceDefinitions[0]?.id ?? '' } },
    flagIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.flags.map((item) => item.id)), createItem: () => bundle.flags[0]?.id ?? '' } },
    skillXp: { optional: true, defaultValue: true, schema: boolean }, discoveredLocations: { optional: true, defaultValue: true, schema: boolean },
    actionCompletionIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.actions.map((item) => item.id)), createItem: () => bundle.actions[0]?.id ?? '' } },
  } } },
} });
