import type { ContentBundle } from '../../game/types';
import { displayColorKeys } from '../../game/displayProfiles';
import { stateVariableKeys } from '../../game/stateVariables';
import type { StructuredSchema } from './StructuredData';

const string = (suggestions?: string[]): StructuredSchema => ({ kind: 'string', suggestions });
const color: StructuredSchema = { kind: 'color' };
const number = (min?: number): StructuredSchema => ({ kind: 'number', min });
const boolean: StructuredSchema = { kind: 'boolean' };
const comparison: StructuredSchema = { kind: 'enum', options: ['equal', 'greater-than', 'less-than'] };
const stateVariables = (bundle: ContentBundle) => stateVariableKeys(bundle);
const itemTagSuggestions = (bundle: ContentBundle) => Array.from(new Set(bundle.items.flatMap((item) =>
  (item.tags ?? '').split(',').map((tag) => tag.trim().split(/\s|\(/)[0]).filter((tag) => tag && !tag.startsWith('+') && !tag.startsWith('-')),
)));

export const locationSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { schema: string() },
  position: { schema: { kind: 'object', fields: { x: { schema: number() }, y: { schema: number() } } } },
  starting: { schema: boolean, optional: true, defaultValue: false },
  tags: { schema: { kind: 'array', listMode: 'tags', item: string(), createItem: () => '' }, optional: true, defaultValue: [] },
  entities: { schema: { kind: 'array', listMode: 'tags', item: string(), createItem: () => '' }, optional: true, defaultValue: [] },
} });

export const entityDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  actionIds: { label: 'contribution.data.actions', schema: { kind: 'array', listMode: 'tags', item: string(bundle.actions.map((action) => action.id)), createItem: () => bundle.actions[0]?.id ?? '' } },
  collectionLog: { label: 'contribution.data.collectionLog', schema: { kind: 'array', listMode: 'free', item: { kind: 'object', fields: {
    categoryId: { label: 'contribution.collection.category', schema: string(['enemies']) },
    actionId: { label: 'contribution.column.action', schema: string(bundle.actions.map((action) => action.id)) },
    killTargetCount: { label: 'contribution.collection.killTargetCount', schema: number(1), optional: true, defaultValue: 1 },
    dropTableIds: { label: 'contribution.data.dropTables', schema: { kind: 'array', listMode: 'tags', item: string((bundle.dropTables ?? []).map((dropTable) => dropTable.id)), createItem: () => bundle.dropTables?.[0]?.id ?? '' }, optional: true, defaultValue: [] },
    itemIds: { label: 'contribution.data.items', schema: { kind: 'array', listMode: 'tags', item: string(bundle.items.map((item) => item.id)), createItem: () => bundle.items[0]?.id ?? '' }, optional: true, defaultValue: [] },
  } }, createItem: () => ({ categoryId: 'enemies', actionId: bundle.actions[0]?.id ?? '', killTargetCount: 1, dropTableIds: [], itemIds: [] }) }, optional: true, defaultValue: [] },
} });

export const edgeSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { schema: string() }, source: { schema: string(bundle.locations.map((item) => item.id)) }, target: { schema: string(bundle.locations.map((item) => item.id)) },
  travelTimeSeconds: { schema: number(0) },
} });

export const flagDefinitionSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  initialValue: { label: 'contribution.column.initialValue', schema: { kind: 'scalar', types: ['boolean', 'number', 'string'] }, optional: true, defaultValue: false },
} });

export const rewardSchema = (bundle: ContentBundle): StructuredSchema => ({
  kind: 'union', discriminator: 'kind', variants: {
    skillXp: { label: 'contribution.reward.skillXp', createValue: () => ({ kind: 'skillXp', skillId: bundle.skills[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['skillXp'] } }, skillId: { schema: string(bundle.skills.map((item) => item.id)) }, amount: { schema: rewardAmountSchema() } } } },
    item: { label: 'contribution.reward.item', createValue: () => ({ kind: 'item', itemId: bundle.items[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['item'] } }, itemId: { schema: string(bundle.items.map((item) => item.id)) }, amount: { schema: rewardAmountSchema() } } } },
    resource: { label: 'contribution.reward.resource', createValue: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['resource'] } }, resourceId: { schema: string(bundle.resourceDefinitions.map((item) => item.id)) }, amount: { schema: rewardAmountSchema() } } } },
    dropTable: { label: 'contribution.reward.dropTable', createValue: () => ({ kind: 'dropTable', dropTableId: bundle.dropTables?.[0]?.id ?? '' }), schema: () => dropTableRewardSchema(bundle) },
  },
});

const rewardAmountSchema = (): StructuredSchema => ({ kind: 'inferred' });

const dropTableRewardSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  kind: { schema: { kind: 'enum', options: ['dropTable'] } },
  dropTableId: { schema: string((bundle.dropTables ?? []).map((dropTable) => dropTable.id)) },
} });

const dropTableEntrySchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  weight: { schema: number(0) },
  reward: { schema: rewardSchema(bundle) },
} });

export const dropTableDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  mode: { schema: { kind: 'enum', options: ['independent', 'dependent'] } },
  drops: { schema: { kind: 'array', listMode: 'free', item: dropTableEntrySchema(bundle), createItem: () => ({ weight: 1, reward: { kind: 'item', itemId: bundle.items[0]?.id ?? '', amount: 1 } }) } },
} });

export const conditionSchema = (bundle: ContentBundle): StructuredSchema => ({
  kind: 'union', discriminator: 'kind', variants: {
    'state-variable': { createValue: () => ({ kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['state-variable'] } }, variable: { schema: string(stateVariables(bundle)) }, comparison: { schema: comparison }, value: { schema: { kind: 'scalar', types: ['boolean', 'number', 'string'] } } } } },
    'item-tag': { label: 'contribution.condition.itemTag', createValue: () => ({ kind: 'item-tag', tag: itemTagSuggestions(bundle)[0] ?? '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['item-tag'] } }, tag: { schema: string(itemTagSuggestions(bundle)) } } } },
    'equipped-item-tag': { label: 'contribution.condition.equippedItemTag', createValue: () => ({ kind: 'equipped-item-tag', tag: itemTagSuggestions(bundle)[0] ?? '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['equipped-item-tag'] } }, tag: { schema: string(itemTagSuggestions(bundle)) } } } },
    all: { createValue: () => ({ kind: 'all', conditions: [] }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['all'] } }, conditions: { schema: { kind: 'array', item: () => conditionSchema(bundle), createItem: () => ({ kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 }) } } } } },
    any: { createValue: () => ({ kind: 'any', conditions: [] }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['any'] } }, conditions: { schema: { kind: 'array', item: () => conditionSchema(bundle), createItem: () => ({ kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 }) } } } } },
    not: { createValue: () => ({ kind: 'not', condition: { kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 } }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['not'] } }, condition: { schema: () => conditionSchema(bundle) } } } },
  },
});

export const resultSchema = (bundle: ContentBundle): StructuredSchema => ({
  kind: 'union', discriminator: 'kind', variants: {
    item: { createValue: () => ({ kind: 'item', itemId: bundle.items[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['item'] } }, itemId: { schema: string(bundle.items.map((item) => item.id)) }, amount: { schema: number() } } } },
    resource: { createValue: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['resource'] } }, resourceId: { schema: string(bundle.resourceDefinitions.map((item) => item.id)) }, amount: { schema: number() } } } },
    'skill-xp': { createValue: () => ({ kind: 'skill-xp', skillId: bundle.skills[0]?.id ?? '', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['skill-xp'] } }, skillId: { schema: string(bundle.skills.map((item) => item.id)) }, amount: { schema: number() } } } },
    'state-variable': { label: 'contribution.result.stateVariable', createValue: () => ({ kind: 'state-variable', variable: stateVariables(bundle)[0] ?? 'location', value: false }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['state-variable'] } }, variable: { schema: string(stateVariables(bundle)) }, value: { schema: { kind: 'scalar', types: ['boolean', 'number', 'string'] } } } } },
    'state-variable-delta': { label: 'contribution.result.stateVariableDelta', createValue: () => ({ kind: 'state-variable-delta', variable: stateVariables(bundle)[0] ?? 'flag:new-flag', amount: 1 }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['state-variable-delta'] } }, variable: { schema: string(stateVariables(bundle)) }, amount: { schema: number() } } } },
    dialogue: { label: 'contribution.result.dialogue', createValue: () => ({ kind: 'dialogue', dialogueId: bundle.dialogues?.[0]?.id ?? '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['dialogue'] } }, dialogueId: { schema: string((bundle.dialogues ?? []).map((item) => item.id)) } } } },
    chat: { createValue: () => ({ kind: 'chat', messageKey: '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['chat'] } }, messageKey: { schema: string() }, delaySeconds: { schema: number(0), optional: true, defaultValue: 0 } } } },
  },
});

export const experienceTriggerSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  event: { label: 'contribution.column.event', schema: { kind: 'enum', options: ['action-complete', 'damage-dealt', 'damage-taken', 'health-regenerated', 'incoming-attack-missed'] } },
  skillId: { label: 'contribution.column.skill', schema: string(bundle.skills.map((item) => item.id)) },
  amount: { label: 'contribution.column.amount', schema: number(0), optional: true },
  amountPerUnit: { label: 'contribution.column.amountPerUnit', schema: number(0), optional: true },
  resourceId: { label: 'contribution.column.resource', schema: string(bundle.resourceDefinitions.map((item) => item.id)), optional: true },
  sourceStat: { label: 'contribution.column.sourceStat', schema: string(bundle.stats.map((item) => item.id)), optional: true },
  effectId: { label: 'contribution.column.effect', schema: string(bundle.effects.map((item) => item.id)), optional: true },
  enemyId: { label: 'contribution.column.enemy', schema: string(bundle.enemies.map((item) => item.id)), optional: true },
  interactionTypeId: { label: 'contribution.column.interaction', schema: string(bundle.interactionTypes.map((item) => item.id)), optional: true },
} });

export const actionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  locationId: { label: 'contribution.column.location', schema: string(bundle.locations.map((item) => item.id)) },
  role: { label: 'contribution.column.actionRole', schema: { kind: 'enum', options: ['optional', 'progression', 'utility'] }, optional: true, defaultValue: 'optional' },
  durationSeconds: { label: 'contribution.column.actionDuration', schema: number(0) },
  rewards: { label: 'contribution.column.rewards', schema: { kind: 'array', listMode: 'free', item: rewardSchema(bundle), createItem: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }) } },
  experience: { label: 'contribution.column.experience', schema: { kind: 'array', listMode: 'free', item: experienceTriggerSchema(bundle), createItem: () => ({ event: 'action-complete', skillId: bundle.skills[0]?.id ?? '', amount: 1 }) }, optional: true, defaultValue: [] },
  requirements: { label: 'contribution.column.requirements', schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 } },
  visibleWhen: { label: 'contribution.column.visibleWhen', schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 } },
  results: { label: 'contribution.column.results', schema: { kind: 'array', listMode: 'free', item: resultSchema(bundle), createItem: () => ({ kind: 'state-variable', variable: 'location', value: bundle.locations[0]?.id ?? '' }) }, optional: true, defaultValue: [] },
  maxCompletions: { label: 'contribution.column.maxCompletions', schema: number(1), optional: true, defaultValue: 1 },
  enemyId: { label: 'contribution.column.enemy', schema: string(bundle.enemies.map((item) => item.id)), optional: true },
  interactionTypeId: { label: 'contribution.column.interaction', schema: string(bundle.interactionTypes.map((item) => item.id)), optional: true },
} });

export const dialogueOptionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  labelKey: { label: 'contribution.column.labelKey', schema: string() },
  conditions: { label: 'contribution.column.requirements', schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 } },
  results: { label: 'contribution.column.results', schema: { kind: 'array', listMode: 'free', item: resultSchema(bundle), createItem: () => ({ kind: 'state-variable-delta', variable: stateVariables(bundle)[0] ?? '', amount: 1 }) }, optional: true, defaultValue: [] },
  gotoNodeId: { label: 'contribution.column.gotoNode', schema: string((bundle.dialogues ?? []).flatMap((dialogue) => dialogue.nodes.map((node) => node.id))), optional: true },
} });

export const dialogueBranchSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  conditions: { label: 'contribution.column.requirements', schema: conditionSchema(bundle) },
  gotoNodeId: { label: 'contribution.column.gotoNode', schema: string((bundle.dialogues ?? []).flatMap((dialogue) => dialogue.nodes.map((node) => node.id))) },
} });

export const dialogueNodeSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  speakerId: { label: 'contribution.column.speaker', schema: string(), optional: true },
  textKey: { label: 'contribution.column.textKey', schema: string(), optional: true },
  narratorKey: { label: 'contribution.column.narratorKey', schema: string(), optional: true },
  results: { label: 'contribution.column.results', schema: { kind: 'array', listMode: 'free', item: resultSchema(bundle), createItem: () => ({ kind: 'state-variable-delta', variable: stateVariables(bundle)[0] ?? '', amount: 1 }) }, optional: true, defaultValue: [] },
  branches: { label: 'contribution.column.branches', schema: { kind: 'array', listMode: 'free', item: dialogueBranchSchema(bundle), createItem: () => ({ conditions: { kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 }, gotoNodeId: '' }) }, optional: true, defaultValue: [] },
  gotoNodeId: { label: 'contribution.column.gotoNode', schema: string((bundle.dialogues ?? []).flatMap((dialogue) => dialogue.nodes.map((node) => node.id))), optional: true },
  options: { label: 'contribution.column.options', schema: { kind: 'array', listMode: 'free', item: dialogueOptionSchema(bundle), createItem: () => ({ id: 'new-option', labelKey: '', gotoNodeId: '' }) }, optional: true, defaultValue: [] },
} });

export const dialogueSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  startNodeId: { label: 'contribution.column.startNode', schema: string((bundle.dialogues ?? []).flatMap((dialogue) => dialogue.nodes.map((node) => node.id))) },
  nodes: { label: 'contribution.column.nodes', schema: { kind: 'array', listMode: 'free', item: dialogueNodeSchema(bundle), createItem: () => ({ id: 'new-node', textKey: '' }) } },
} });

export const boundarySchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'union', discriminator: 'kind', variants: {
  'stop-action': { createValue: () => ({ kind: 'stop-action' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['stop-action'] } } } } },
  'complete-action': { createValue: () => ({ kind: 'complete-action' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['complete-action'] } } } } },
  'enemy-attack': { createValue: () => ({ kind: 'enemy-attack' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['enemy-attack'] } } } } },
  refill: { createValue: () => ({ kind: 'refill', value: 'max' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['refill'] } }, value: { schema: { kind: 'inferred' } } } } },
  relocate: { createValue: () => ({ kind: 'relocate', locationId: bundle.locations[0]?.id ?? '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['relocate'] } }, locationId: { schema: string(bundle.locations.map((item) => item.id)) } } } },
  chat: { createValue: () => ({ kind: 'chat', messageKey: '' }), schema: { kind: 'object', fields: { kind: { schema: { kind: 'enum', options: ['chat'] } }, messageKey: { schema: string() } } } },
  'reset-state': { createValue: () => ({ kind: 'reset-state' }), schema: () => resetStateSchema(bundle) },
} });

export const resetStateSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  kind: { schema: { kind: 'enum', options: ['reset-state'] } },
  locationId: { schema: string(['starting-location', ...bundle.locations.map((item) => item.id)]), optional: true, defaultValue: 'starting-location' },
  incrementVariable: { label: 'contribution.column.incrementVariable', schema: string(stateVariables(bundle)), optional: true },
  preserve: { optional: true, defaultValue: {}, schema: { kind: 'object', fields: {
    inventoryIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.items.map((item) => item.id)), createItem: () => bundle.items[0]?.id ?? '' } },
    resourceIds: { optional: true, defaultValue: [], schema: { kind: 'array', item: string(bundle.resourceDefinitions.map((item) => item.id)), createItem: () => bundle.resourceDefinitions[0]?.id ?? '' } },
    variableIds: { label: 'contribution.column.variables', optional: true, defaultValue: [], schema: { kind: 'array', listMode: 'tags', item: string(stateVariables(bundle)), createItem: () => stateVariables(bundle)[0] ?? '' } },
    skillXp: { optional: true, defaultValue: true, schema: boolean }, discoveredLocations: { optional: true, defaultValue: true, schema: boolean },
    actionCompletionIds: { optional: true, defaultValue: [], schema: { kind: 'array', listMode: 'tags', item: string(bundle.actions.map((item) => item.id)), createItem: () => bundle.actions[0]?.id ?? '' } },
  } } },
} });

export const resourceDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  owner: { schema: { kind: 'enum', options: ['player', 'enemy'] }, optional: true, defaultValue: 'player' },
  sourceStat: { label: 'contribution.column.sourceStat', schema: string(bundle.stats.map((item) => item.id)) },
  sourceEnemyStat: { schema: { kind: 'enum', options: ['attack', 'defense', 'health', 'rate', 'regeneration', 'armorPenetration', 'torpidity', 'critChance', 'critMultiplier'] }, optional: true },
  max: { schema: number(0), optional: true, defaultValue: 0 },
  display: { label: 'contribution.column.display', schema: { kind: 'enum', options: ['full', 'minimal', 'hidden'] }, optional: true, defaultValue: 'full' },
  hidden: { schema: boolean, optional: true, defaultValue: false },
  initialValue: { label: 'contribution.column.initialValue', schema: { kind: 'enum', options: ['full', 'empty'] }, optional: true, defaultValue: 'full' },
  onEmpty: { label: 'contribution.column.onEmpty', schema: { kind: 'array', listMode: 'free', item: boundarySchema(bundle), createItem: () => ({ kind: 'stop-action' }) }, optional: true, defaultValue: [] },
  onFull: { label: 'contribution.column.onFull', schema: { kind: 'array', listMode: 'free', item: boundarySchema(bundle), createItem: () => ({ kind: 'stop-action' }) }, optional: true, defaultValue: [] },
} });

export const effectDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  resourceId: { label: 'contribution.column.resource', schema: string(bundle.resourceDefinitions.map((item) => item.id)) },
  sourceStat: { label: 'contribution.column.sourceStat', schema: string(bundle.stats.map((item) => item.id)) },
  sourceEnemyStat: { schema: { kind: 'enum', options: ['attack', 'defense', 'health', 'rate', 'regeneration', 'armorPenetration', 'torpidity', 'critChance', 'critMultiplier'] }, optional: true },
  rateUnit: { schema: { kind: 'enum', options: ['per-minute', 'per-second'] }, optional: true, defaultValue: 'per-minute' },
  activeWhen: { schema: conditionSchema(bundle), optional: true, defaultValue: { kind: 'state-variable', variable: stateVariables(bundle)[0] ?? '', comparison: 'equal', value: 0 } },
  resetResourceWhenInactive: { schema: boolean, optional: true, defaultValue: false },
  locationId: { label: 'contribution.column.location', schema: string(bundle.locations.map((item) => item.id)), optional: true },
} });

export const statDefinitionSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  base: { label: 'contribution.column.base', schema: number(), optional: true, defaultValue: 0 },
} });

export const skillDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  maxLevel: { label: 'contribution.column.maxLevel', schema: number(1) },
  statId: { label: 'contribution.column.stat', schema: string(bundle.stats.map((item) => item.id)), optional: true },
  addedPerLevel: { label: 'contribution.column.addedPerLevel', schema: number(), optional: true },
  increasedPerLevel: { label: 'contribution.column.increasedPerLevel', schema: number(), optional: true },
} });

export const itemDefinitionSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  maxQuantity: { label: 'contribution.column.maxQuantity', schema: number(1), optional: true },
  tags: { label: 'contribution.column.tags', schema: string(), optional: true },
} });

export const interactionTypeDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  sourceStatId: { label: 'contribution.column.sourceStat', schema: string(bundle.stats.map((item) => item.id)) },
  targetStatId: { label: 'contribution.column.targetStat', schema: string(bundle.stats.map((item) => item.id)) },
  targetPlayerHealth: { label: 'contribution.column.targetPlayerHealth', schema: boolean },
} });

export const enemyStatsSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  attack: { label: 'contribution.enemyStats.attack', schema: number(), optional: true },
  defense: { label: 'contribution.enemyStats.defense', schema: number(), optional: true },
  health: { label: 'contribution.enemyStats.health', schema: number(), optional: true },
  rate: { label: 'contribution.enemyStats.rate', schema: number(), optional: true },
  regeneration: { label: 'contribution.enemyStats.regeneration', schema: number(), optional: true },
  armorPenetration: { label: 'contribution.enemyStats.armorPenetration', schema: number(), optional: true },
  torpidity: { label: 'contribution.enemyStats.torpidity', schema: number(), optional: true },
  critChance: { label: 'contribution.enemyStats.critChance', schema: number(), optional: true },
  critMultiplier: { label: 'contribution.enemyStats.critMultiplier', schema: number(), optional: true },
} });

export const enemyDefinitionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  interactionTypeId: { label: 'contribution.column.interaction', schema: string(bundle.interactionTypes.map((item) => item.id)) },
  stats: { label: 'contribution.enemyStats.title', schema: enemyStatsSchema(), optional: true, defaultValue: {} },
  showHealthBar: { label: 'contribution.column.showHealth', schema: boolean, optional: true, defaultValue: false },
  rewards: { label: 'contribution.column.rewards', schema: { kind: 'array', listMode: 'free', item: rewardSchema(bundle), createItem: () => ({ kind: 'resource', resourceId: bundle.resourceDefinitions[0]?.id ?? '', amount: 1 }) } },
} });

export const basePlayerSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  inventory: { label: 'contribution.universe.baseInventory', defaultValue: {}, schema: { kind: 'object', fields: Object.fromEntries(bundle.items.map((item) => [item.id, { label: item.id, schema: number(0), optional: true }])) } },
} });

export const combatBalanceSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  expectedHitsToKill: { label: 'contribution.universe.expectedHitsToKill', schema: number(0.000001) },
  combatSpread: { label: 'contribution.universe.combatSpread', schema: number(0) },
} });

const displayPaletteSchema = (): StructuredSchema => ({ kind: 'object', fields: Object.fromEntries(
  displayColorKeys.map((key) => [key, { label: `settings.color.${key}`, schema: color, optional: true }]),
) });

export const displayProfileSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  titleKey: { label: 'contribution.column.titleKey', schema: string(), optional: true },
  colors: { label: 'contribution.data.displayProfileColors', schema: displayPaletteSchema(), optional: true, defaultValue: {} },
} });

export const moduleDataSectionSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  locations: { label: 'contribution.data.locations', schema: { kind: 'array', listMode: 'free', item: locationSchema(), createItem: () => ({ id: 'new-location', position: { x: 0, y: 0 } }) }, optional: true, defaultValue: [] },
  edges: { label: 'contribution.data.edges', schema: { kind: 'array', listMode: 'table', columns: ['id', 'source', 'target', 'travelTimeSeconds'], item: edgeSchema(bundle), createItem: () => ({ id: 'new-edge', source: bundle.locations[0]?.id ?? '', target: bundle.locations[1]?.id ?? '', travelTimeSeconds: 1 }) }, optional: true, defaultValue: [] },
  entities: { label: 'contribution.data.entities', schema: { kind: 'array', listMode: 'free', item: entityDefinitionSchema(bundle), createItem: () => ({ id: 'new-entity', actionIds: [] }) }, optional: true, defaultValue: [] },
  actions: { label: 'contribution.data.actions', schema: { kind: 'array', listMode: 'free', item: actionSchema(bundle), createItem: () => ({ id: 'new-action', locationId: bundle.locations[0]?.id ?? '', durationSeconds: 1, rewards: [] }) }, optional: true, defaultValue: [] },
  skills: { label: 'contribution.data.skills', schema: { kind: 'array', listMode: 'table', columns: ['id', 'maxLevel', 'statId'], item: skillDefinitionSchema(bundle), createItem: () => ({ id: 'new-skill', maxLevel: 100 }) }, optional: true, defaultValue: [] },
  stats: { label: 'contribution.data.stats', schema: { kind: 'array', listMode: 'table', columns: ['id', 'base'], item: statDefinitionSchema(), createItem: () => ({ id: 'new-stat', base: 0 }) }, optional: true, defaultValue: [] },
  items: { label: 'contribution.data.items', schema: { kind: 'array', listMode: 'table', columns: ['id', 'maxQuantity', 'tags'], item: itemDefinitionSchema(), createItem: () => ({ id: 'new-item' }) }, optional: true, defaultValue: [] },
  flags: { label: 'contribution.data.flags', schema: { kind: 'array', listMode: 'table', columns: ['id', 'initialValue'], item: flagDefinitionSchema(), createItem: () => ({ id: 'new-flag', initialValue: false }) }, optional: true, defaultValue: [] },
  resources: { label: 'contribution.data.resources', schema: { kind: 'array', listMode: 'free', item: resourceDefinitionSchema(bundle), createItem: () => ({ id: 'new-resource', sourceStat: bundle.stats[0]?.id ?? '' }) }, optional: true, defaultValue: [] },
  resourceDefinitions: { label: 'contribution.data.resources', schema: { kind: 'array', listMode: 'free', item: resourceDefinitionSchema(bundle), createItem: () => ({ id: 'new-resource', sourceStat: bundle.stats[0]?.id ?? '' }) }, optional: true, defaultValue: [] },
  effects: { label: 'contribution.data.effects', schema: { kind: 'array', listMode: 'free', item: effectDefinitionSchema(bundle), createItem: () => ({ id: 'new-effect', resourceId: bundle.resourceDefinitions[0]?.id ?? '', sourceStat: bundle.stats[0]?.id ?? '' }) }, optional: true, defaultValue: [] },
  interactionTypes: { label: 'contribution.data.interactions', schema: { kind: 'array', listMode: 'table', columns: ['id', 'sourceStatId', 'targetStatId', 'targetPlayerHealth'], item: interactionTypeDefinitionSchema(bundle), createItem: () => ({ id: 'new-interaction', sourceStatId: bundle.stats[0]?.id ?? '', targetStatId: bundle.stats[0]?.id ?? '', targetPlayerHealth: false }) }, optional: true, defaultValue: [] },
  enemies: { label: 'contribution.data.enemies', schema: { kind: 'array', listMode: 'free', item: enemyDefinitionSchema(bundle), createItem: () => ({ id: 'new-enemy', interactionTypeId: bundle.interactionTypes[0]?.id ?? '', rewards: [] }) }, optional: true, defaultValue: [] },
  dropTables: { label: 'contribution.data.dropTables', schema: { kind: 'array', listMode: 'free', item: dropTableDefinitionSchema(bundle), createItem: () => ({ id: 'new-drop-table', mode: 'dependent', drops: [] }) }, optional: true, defaultValue: [] },
  dialogues: { label: 'contribution.data.dialogues', schema: { kind: 'array', listMode: 'free', item: dialogueSchema(bundle), createItem: () => ({ id: 'new-dialogue', startNodeId: 'start', nodes: [{ id: 'start', textKey: 'dialogue.new-dialogue.start' }] }) }, optional: true, defaultValue: [] },
  displayProfiles: { label: 'contribution.data.displayProfiles', schema: { kind: 'array', listMode: 'free', item: displayProfileSchema(), createItem: () => ({ id: 'new-profile', colors: {} }) }, optional: true, defaultValue: [] },
} });

const idListSchema = (ids: string[] = []): StructuredSchema => ({
  kind: 'array',
  listMode: 'tags',
  item: string(ids),
  createItem: () => ids[0] ?? '',
});

const dialogueOptionRemovalSchema = (bundle: ContentBundle): StructuredSchema => {
  const fields = Object.fromEntries((bundle.dialogues ?? []).flatMap((dialogue) =>
    dialogue.nodes.map((node) => {
      const optionIds = (node.options ?? []).map((option) => option.id);
      return [`${dialogue.id}.${node.id}`, {
        label: `${dialogue.id}.${node.id}`,
        optional: true,
        defaultValue: [],
        schema: idListSchema(optionIds),
      }];
    }),
  ));
  return {
    kind: 'object',
    allowAdditional: true,
    additionalField: { schema: idListSchema(), optional: true, defaultValue: [] },
    fields,
  };
};

export const moduleRemoveSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  locations: { label: 'contribution.data.locations', schema: idListSchema(bundle.locations.map((item) => item.id)), optional: true, defaultValue: [] },
  edges: { label: 'contribution.data.edges', schema: idListSchema(bundle.edges.map((item) => item.id)), optional: true, defaultValue: [] },
  entities: { label: 'contribution.data.entities', schema: idListSchema((bundle.entities ?? []).map((item) => item.id)), optional: true, defaultValue: [] },
  actions: { label: 'contribution.data.actions', schema: idListSchema(bundle.actions.map((item) => item.id)), optional: true, defaultValue: [] },
  skills: { label: 'contribution.data.skills', schema: idListSchema(bundle.skills.map((item) => item.id)), optional: true, defaultValue: [] },
  stats: { label: 'contribution.data.stats', schema: idListSchema(bundle.stats.map((item) => item.id)), optional: true, defaultValue: [] },
  items: { label: 'contribution.data.items', schema: idListSchema(bundle.items.map((item) => item.id)), optional: true, defaultValue: [] },
  flags: { label: 'contribution.data.flags', schema: idListSchema(bundle.flags.map((item) => item.id)), optional: true, defaultValue: [] },
  resources: { label: 'contribution.data.resources', schema: idListSchema(bundle.resourceDefinitions.map((item) => item.id)), optional: true, defaultValue: [] },
  effects: { label: 'contribution.data.effects', schema: idListSchema(bundle.effects.map((item) => item.id)), optional: true, defaultValue: [] },
  interactionTypes: { label: 'contribution.data.interactions', schema: idListSchema(bundle.interactionTypes.map((item) => item.id)), optional: true, defaultValue: [] },
  enemies: { label: 'contribution.data.enemies', schema: idListSchema(bundle.enemies.map((item) => item.id)), optional: true, defaultValue: [] },
  dropTables: { label: 'contribution.data.dropTables', schema: idListSchema((bundle.dropTables ?? []).map((item) => item.id)), optional: true, defaultValue: [] },
  dialogues: { label: 'contribution.data.dialogues', schema: idListSchema((bundle.dialogues ?? []).map((item) => item.id)), optional: true, defaultValue: [] },
  dialogueOptions: { label: 'contribution.module.removeDialogueOptions', schema: dialogueOptionRemovalSchema(bundle), optional: true, defaultValue: {} },
  displayProfiles: { label: 'contribution.data.displayProfiles', schema: idListSchema((bundle.manifest.displayProfiles ?? []).map((item) => item.id)), optional: true, defaultValue: [] },
  locales: { label: 'contribution.module.locale', schema: idListSchema(Object.keys(bundle.locales).flatMap((locale) => Object.keys(bundle.locales[locale] ?? {}))), optional: true, defaultValue: [] },
} });

export const moduleDataUpdatesSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  ...((moduleDataSectionSchema(bundle) as Extract<StructuredSchema, { kind: 'object' }>).fields),
  remove: { label: 'contribution.module.remove', schema: moduleRemoveSchema(bundle), optional: true, defaultValue: {} },
  locale: { label: 'contribution.module.locale', schema: { kind: 'inferred' }, optional: true, defaultValue: {} },
} });

export const contentModuleSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  version: { label: 'contribution.module.version', schema: string() },
  universe: { label: 'contribution.module.universe', schema: string([bundle.manifest.id]) },
  author: { label: 'contribution.module.author', schema: string() },
  game_version: { label: 'contribution.module.gameVersion', schema: string() },
  dependencies: { label: 'contribution.module.dependencies', schema: { kind: 'array', listMode: 'tags', item: string((bundle.modules ?? []).map((module) => module.id)), createItem: () => '' }, optional: true, defaultValue: [] },
  data: { label: 'contribution.module.data', schema: moduleDataSectionSchema(bundle), optional: true, defaultValue: {} },
  'data-updates': { label: 'contribution.module.dataUpdates', schema: moduleDataUpdatesSchema(bundle), optional: true, defaultValue: {} },
  locale: { label: 'contribution.module.locale', schema: { kind: 'inferred' }, optional: true, defaultValue: {} },
} });

export const modulePackSchema = (bundle: ContentBundle): StructuredSchema => ({ kind: 'object', fields: {
  id: { label: 'contribution.column.id', schema: string() },
  titleKey: { label: 'contribution.column.titleKey', schema: string(), optional: true },
  modules: {
    label: 'contribution.modules.title',
    schema: { kind: 'array', listMode: 'tags', item: string((bundle.modules ?? []).map((module) => module.id)), createItem: () => bundle.modules?.[0]?.id ?? '' },
    optional: true,
    defaultValue: [],
  },
  packs: {
    label: 'contribution.modules.packs',
    schema: { kind: 'array', listMode: 'free', item: () => modulePackSchema(bundle), createItem: () => ({ id: 'new-pack', modules: [] }) },
    optional: true,
    defaultValue: [],
  },
} });

export const universeUiSchema = (): StructuredSchema => ({ kind: 'object', fields: {
  floatingTextDurationSeconds: { label: 'contribution.universe.floatingTextDuration', schema: number(0.001), optional: true },
  loopActionsByDefault: { label: 'contribution.universe.loopActionsByDefault', schema: boolean, optional: true },
} });
