import type { ContentBundle } from '../../game/types';
import { stateVariableKeys } from '../../game/stateVariables';
import type { StructuredSchema } from './StructuredData';

const string = (suggestions?: string[]): StructuredSchema => ({ kind: 'string', suggestions });
const number = (min?: number): StructuredSchema => ({ kind: 'number', min });
const boolean: StructuredSchema = { kind: 'boolean' };
const comparison: StructuredSchema = { kind: 'enum', options: ['equal', 'greater-than', 'less-than'] };

export const locationSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { schema: string() },
  position: { schema: { kind: 'object', fields: { x: { schema: number() }, y: { schema: number() } } } },
  starting: { schema: boolean, optional: true, defaultValue: false },
  tags: { schema: { kind: 'array', item: string(), createItem: () => '' }, optional: true, defaultValue: [] },
} });

export const edgeSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { schema: string() }, source: { schema: string(bundle.locations.map((item) => item.id)) }, target: { schema: string(bundle.locations.map((item) => item.id)) },
  travelTimeSeconds: { schema: number(0) },
} });

export const flagDefinitionSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  initialValue: { label: 'contribution.column.initialValue', schema: { kind: 'scalar', types: ['boolean', 'number'] }, optional: true, defaultValue: false },
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
    'state-variable': { createValue: () => ({ kind: 'state-variable', variable: stateVariableKeys(bundle)[0] ?? '', comparison: 'equal', value: 0 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['state-variable'] } }, variable: { schema: string(stateVariableKeys(bundle)) }, comparison: { schema: comparison }, value: { schema: { kind: 'scalar', types: ['boolean', 'number'] } } } } },
    all: { createValue: () => ({ kind: 'all', conditions: [] }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['all'] } }, conditions: { schema: { kind: 'array', item: () => conditionSchema(bundle), createItem: () => ({ kind: 'state-variable', variable: stateVariableKeys(bundle)[0] ?? '', comparison: 'equal', value: 0 }) } } } } },
    any: { createValue: () => ({ kind: 'any', conditions: [] }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['any'] } }, conditions: { schema: { kind: 'array', item: () => conditionSchema(bundle), createItem: () => ({ kind: 'state-variable', variable: stateVariableKeys(bundle)[0] ?? '', comparison: 'equal', value: 0 }) } } } } },
    not: { createValue: () => ({ kind: 'not', condition: { kind: 'state-variable', variable: stateVariableKeys(bundle)[0] ?? '', comparison: 'equal', value: 0 } }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['not'] } }, condition: { schema: () => conditionSchema(bundle) } } } },
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
  id: { label: 'contribution.column.id', schema: string() },
  locationId: { label: 'contribution.column.location', schema: string(bundle.locations.map((item) => item.id)) },
  role: { label: 'contribution.column.actionRole', schema: { kind: 'enum', options: ['optional', 'progression', 'utility'] }, optional: true, defaultValue: 'optional' },
  durationSeconds: { label: 'contribution.column.actionDuration', schema: number(0) },
  rewards: { label: 'contribution.column.rewards', schema: { kind: 'array', item: rewardSchema(bundle), createItem: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }) } },
  requirements: { label: 'contribution.column.requirements', schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'state-variable', variable: stateVariableKeys(bundle)[0] ?? '', comparison: 'equal', value: 0 } },
  visibleWhen: { label: 'contribution.column.visibleWhen', schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'state-variable', variable: stateVariableKeys(bundle)[0] ?? '', comparison: 'equal', value: 0 } },
  results: { label: 'contribution.column.results', schema: { kind: 'array', item: resultSchema(bundle), createItem: () => ({ kind: 'chat', messageKey: '' }) }, optional: true, defaultValue: [] },
  maxCompletions: { label: 'contribution.column.maxCompletions', schema: number(1), optional: true, defaultValue: 1 },
  enemyId: { label: 'contribution.column.enemy', schema: string(bundle.enemies.map((item) => item.id)), optional: true },
  interactionTypeId: { label: 'contribution.column.interaction', schema: string(bundle.interactionTypes.map((item) => item.id)), optional: true },
} });

export const boundarySchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'union', discriminator: 'kind', variants: {
  'stop-action': { createValue: () => ({ kind: 'stop-action' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['stop-action'] } } } } },
  refill: { createValue: () => ({ kind: 'refill', value: 'max' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['refill'] } }, value: { schema: { kind: 'inferred' } } } } },
  relocate: { createValue: () => ({ kind: 'relocate', locationId: bundle.locations[0]?.id ?? '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['relocate'] } }, locationId: { schema: string(bundle.locations.map((item) => item.id)) } } } },
  chat: { createValue: () => ({ kind: 'chat', messageKey: '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['chat'] } }, messageKey: { schema: string() } } } },
  'reset-state': { createValue: () => ({ kind: 'reset-state' }), schema: () => resetStateSchema(bundle) },
} });

export const resetStateSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  kind: { schema: { kind: 'enum', options: ['reset-state'] } },
  locationId: { schema: string(['starting-location', ...bundle.locations.map((item) => item.id)]), optional: true, defaultValue: 'starting-location' },
  incrementFlagId: { schema: string(bundle.flags.map((item) => item.id)), optional: true },
  preserve: { optional: true, defaultValue: {}, schema: { kind: 'object', fields: {
    inventoryIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.items.map((item) => item.id)), createItem: () => bundle.items[0]?.id ?? '' } },
    resourceIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.resourceDefinitions.map((item) => item.id)), createItem: () => bundle.resourceDefinitions[0]?.id ?? '' } },
    flagIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.flags.map((item) => item.id)), createItem: () => bundle.flags[0]?.id ?? '' } },
    skillXp: { optional: true, defaultValue: true, schema: boolean }, discoveredLocations: { optional: true, defaultValue: true, schema: boolean },
    actionCompletionIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.actions.map((item) => item.id)), createItem: () => bundle.actions[0]?.id ?? '' } },
  } } },
} });

export const resourceDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  sourceStat: { label: 'contribution.column.sourceStat', schema: string(bundle.skills.map((item) => item.id)) },
  initialValue: { label: 'contribution.column.initialValue', schema: { kind: 'enum', options: ['full', 'empty'] }, optional: true, defaultValue: 'full' },
  onEmpty: { label: 'contribution.column.onEmpty', schema: { kind: 'array', item: boundarySchema(bundle), createItem: () => ({ kind: 'stop-action' }) }, optional: true, defaultValue: [] },
  onFull: { label: 'contribution.column.onFull', schema: { kind: 'array', item: boundarySchema(bundle), createItem: () => ({ kind: 'stop-action' }) }, optional: true, defaultValue: [] },
} });

export const effectDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  resourceId: { label: 'contribution.column.resource', schema: string(bundle.resourceDefinitions.map((item) => item.id)) },
  ratePerMinute: { label: 'contribution.column.ratePerMinute', schema: number() },
  useStat: { label: 'contribution.column.useStat', schema: string(bundle.skills.map((item) => item.id)), optional: true },
  locationId: { label: 'contribution.column.location', schema: string(bundle.locations.map((item) => item.id)), optional: true },
} });
