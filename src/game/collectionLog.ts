import type { ConcreteReward, ContentBundle, DropTableDefinition, EntityCollectionLogDefinition, EntityDefinition, GameAction, UniversePlayState } from './types';

export const collectionCategoryTitleKey = (categoryId: string) => `collection.category.${categoryId}.title`;

export const collectionKillKey = (entityId: string) => `entity:${entityId}:kills`;
export const collectionDropKey = (entityId: string, itemId: string) => `entity:${entityId}:drops:${itemId}`;

const collectDropItemIds = (
  dropTableId: string,
  dropTables: Map<string, DropTableDefinition>,
  stack: string[] = [],
): string[] => {
  if (stack.includes(dropTableId)) return [];
  const dropTable = dropTables.get(dropTableId);
  if (!dropTable) return [];
  return dropTable.drops.flatMap((drop) => {
    if (drop.reward?.kind === 'item') return [drop.reward.itemId];
    if (drop.reward?.kind === 'dropTable') return collectRewardDropItemIds(drop.reward, dropTables, [...stack, dropTableId]);
    if (drop.dropTableId) return collectDropItemIds(drop.dropTableId, dropTables, [...stack, dropTableId]);
    if (drop.drops) return collectInlineDropItemIds(drop.drops, dropTables, [...stack, dropTableId]);
    return [];
  });
};

const collectInlineDropItemIds = (
  drops: DropTableDefinition['drops'],
  dropTables: Map<string, DropTableDefinition>,
  stack: string[] = [],
): string[] =>
  drops.flatMap((drop) => {
    if (drop.reward?.kind === 'item') return [drop.reward.itemId];
    if (drop.reward?.kind === 'dropTable') return collectRewardDropItemIds(drop.reward, dropTables, stack);
    if (drop.dropTableId) return collectDropItemIds(drop.dropTableId, dropTables, stack);
    if (drop.drops) return collectInlineDropItemIds(drop.drops, dropTables, stack);
    return [];
  });

const collectRewardDropItemIds = (
  reward: { dropTableId?: string; drops?: DropTableDefinition['drops'] },
  dropTables: Map<string, DropTableDefinition>,
  stack: string[] = [],
) => [
  ...(reward.dropTableId ? collectDropItemIds(reward.dropTableId, dropTables, stack) : []),
  ...(reward.drops ? collectInlineDropItemIds(reward.drops, dropTables, stack) : []),
];

export const collectionTrackedItemIds = (
  definition: EntityCollectionLogDefinition,
  bundle: Pick<ContentBundle, 'dropTables'>,
) => {
  const dropTables = new Map((bundle.dropTables ?? []).map((dropTable) => [dropTable.id, dropTable]));
  return Array.from(new Set([
    ...(definition.itemIds ?? []),
    ...(definition.dropTableIds ?? []).flatMap((dropTableId) => collectDropItemIds(dropTableId, dropTables)),
  ]));
};

export const collectionDefinitionsForAction = (
  action: GameAction,
  entities: EntityDefinition[] = [],
) => entities.flatMap((entity) =>
  (entity.collectionLog ?? [])
    .filter((definition) => definition.actionId === action.id)
    .map((definition) => ({ entity, definition })),
);

export const applyCollectionLogRewards = (
  state: UniversePlayState,
  action: GameAction,
  context: Pick<ContentBundle, 'dropTables'> & { entities?: EntityDefinition[] },
  rewards: ConcreteReward[],
) => {
  const definitions = collectionDefinitionsForAction(action, context.entities);
  if (definitions.length === 0) return state;

  let nextCollectionLog = state.collectionLog ?? {};
  for (const { entity, definition } of definitions) {
    nextCollectionLog = {
      ...nextCollectionLog,
      [collectionKillKey(entity.id)]: (nextCollectionLog[collectionKillKey(entity.id)] ?? 0) + 1,
    };
    const trackedItemIds = new Set(collectionTrackedItemIds(definition, context));
    for (const reward of rewards) {
      if (reward.kind !== 'item' || !trackedItemIds.has(reward.itemId)) continue;
      const key = collectionDropKey(entity.id, reward.itemId);
      nextCollectionLog = {
        ...nextCollectionLog,
        [key]: (nextCollectionLog[key] ?? 0) + reward.amount,
      };
    }
  }

  return { ...state, collectionLog: nextCollectionLog };
};
