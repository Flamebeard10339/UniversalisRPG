import { normalizeEnemyDefinition } from './enemies';
import { normalizeGameAction } from './actions';
import type {
  CollectionLogDefinition,
  ContentBundle,
  EffectDefinition,
  EnemyDefinition,
  EntityActionDefinition,
  EntityDefinition,
  GameAction,
  ItemActionDefinition,
  ItemDefinition,
  LocationNode,
  ResourceDefinition,
} from './types';

const entityActionRuntimeId = (entityId: string, actionId: string) =>
  actionId.includes('.') ? actionId : `entity.${entityId}.${actionId}`;

const itemActionRuntimeId = (itemId: string, actionId: string) =>
  actionId.includes('.') ? actionId : `item.${itemId}.${actionId}`;

const normalizeItemAction = (
  item: ItemDefinition,
  action: ItemActionDefinition,
): GameAction => normalizeGameAction({
  ...action,
  id: itemActionRuntimeId(item.id, action.id),
  itemId: item.id,
  rewards: action.rewards ?? [],
});

const actionIdsForEntity = (entity: EntityDefinition) => [
  ...new Set([
    ...(entity.actionIds ?? []),
    ...(entity.actions ?? []).map((action) => entityActionRuntimeId(entity.id, action.id)),
  ]),
];

const locationActionIds = (locations: LocationNode[]) =>
  new Set(locations.flatMap((location) => location.actions ?? []));

const normalizeEntityAction = (
  entity: EntityDefinition,
  action: EntityActionDefinition,
): GameAction => {
  const { enemy: _enemy, ...actionFields } = action;
  return normalizeGameAction({
    ...actionFields,
    id: entityActionRuntimeId(entity.id, action.id),
    entityId: entity.id,
    enemyId: action.enemy ? entity.id : actionFields.enemyId,
    rewards: actionFields.rewards ?? [],
  });
};

const normalizeTopLevelAction = (
  action: GameAction,
  locations: LocationNode[],
): GameAction => {
  if (action.locationId || !locationActionIds(locations).has(action.id)) {
    return normalizeGameAction(action);
  }

  const location = locations.find((candidate) => (candidate.actions ?? []).includes(action.id));
  return normalizeGameAction({
    ...action,
    locationId: location?.id,
  });
};

const enemiesFromEntities = (entities: EntityDefinition[] = []): EnemyDefinition[] =>
  entities.flatMap((entity) =>
    (entity.actions ?? []).flatMap((action) =>
      action.enemy
        ? [{
            ...action.enemy,
            id: entity.id,
            rewards: action.enemy.rewards ?? [],
          }]
        : [],
    ),
  );

const effectsFromResources = (resources: ResourceDefinition[] = []): EffectDefinition[] =>
  resources.flatMap((resource) =>
    (resource.effects ?? []).map((effect) => ({
      ...effect,
      resourceId: resource.id,
    })),
  );

const collectionLogsFromTopLevel = (
  collectionLogs: CollectionLogDefinition[] = [],
): EntityDefinition[] => {
  const byEntity = new Map<string, CollectionLogDefinition[]>();
  for (const definition of collectionLogs) {
    byEntity.set(definition.entityId, [...(byEntity.get(definition.entityId) ?? []), definition]);
  }
  return [...byEntity.entries()].map(([entityId, definitions]) => ({
    id: entityId,
    collectionLog: definitions.map(({ id: _id, entityId: _entityId, ...definition }) => definition),
  }));
};

const mergeEntityDerivedData = (
  entities: EntityDefinition[] = [],
  collectionLogs: CollectionLogDefinition[] = [],
): EntityDefinition[] => {
  const merged = new Map(entities.map((entity) => [entity.id, { ...entity }]));
  for (const topLevel of collectionLogsFromTopLevel(collectionLogs)) {
    const existing = merged.get(topLevel.id);
    merged.set(topLevel.id, {
      ...(existing ?? topLevel),
      actionIds: existing ? actionIdsForEntity(existing) : topLevel.actionIds,
      collectionLog: [
        ...(existing?.collectionLog ?? []),
        ...(topLevel.collectionLog ?? []),
      ],
    });
  }
  return [...merged.values()].map((entity) => ({
    ...entity,
    actionIds: actionIdsForEntity(entity),
  }));
};

export const normalizeContentBundleStructure = (bundle: ContentBundle): ContentBundle => {
  const entities = mergeEntityDerivedData(bundle.entities ?? [], bundle.collectionLogs ?? []);
  const existingActionIds = new Set(bundle.actions.map((action) => action.id));
  const existingEffectIds = new Set((bundle.effects ?? []).map((effect) => effect.id));
  const existingEnemyIds = new Set((bundle.enemies ?? []).map((enemy) => enemy.id));
  const entityActions = (bundle.entities ?? []).flatMap((entity) =>
    (entity.actions ?? [])
      .map((action) => normalizeEntityAction(entity, action))
      .filter((action) => !existingActionIds.has(action.id)),
  );
  const itemActions = (bundle.items ?? []).flatMap((item) =>
    (item.actions ?? [])
      .map((action) => normalizeItemAction(item, action))
      .filter((action) => !existingActionIds.has(action.id)),
  );

  return {
    ...bundle,
    entities,
    actions: [
      ...bundle.actions.map((action) => normalizeTopLevelAction(action, bundle.locations)),
      ...entityActions,
      ...itemActions,
    ],
    effects: [
      ...(bundle.effects ?? []),
      ...effectsFromResources(bundle.resourceDefinitions ?? []).filter((effect) => !existingEffectIds.has(effect.id)),
    ],
    enemies: [
      ...(bundle.enemies ?? []),
      ...enemiesFromEntities(bundle.entities ?? []).filter((enemy) => !existingEnemyIds.has(enemy.id)),
    ].map((enemy) => normalizeEnemyDefinition(enemy)),
  };
};
