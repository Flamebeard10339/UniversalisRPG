import { describe, expect, it } from 'vitest';
import { rollRewards } from './rewards';
import type { DropTableDefinition, Reward } from './types';

const randomSequence = (values: number[]) => {
  let index = 0;
  return () => values[index++] ?? 0;
};

const goblinReward: Reward = {
  kind: 'dropTable',
  dropTableId: 'goblin-drop-table',
};

const dropTables: DropTableDefinition[] = [{
  id: 'goblin-drop-table',
  mode: 'independent',
  drops: [
    { weight: 1, reward: { kind: 'item', itemId: 'bones', amount: 1 } },
    {
      weight: 3,
      reward: {
        kind: 'dropTable',
        dropTableId: 'goblin-equipment-table',
      },
    },
  ],
}, {
  id: 'goblin-equipment-table',
        mode: 'dependent',
        drops: [
          {
            weight: 3,
            reward: {
              kind: 'dropTable',
              dropTableId: 'goblin-bronze-table',
            },
          },
          { weight: 5, reward: { kind: 'item', itemId: 'iron-ore', amount: { min: 1, max: 2 } } },
        ],
}, {
  id: 'goblin-bronze-table',
              mode: 'dependent',
              drops: [
                {
                  weight: 2,
                  reward: {
                    kind: 'dropTable',
                    dropTableId: 'goblin-bronze-weapon-table',
                  },
                },
                {
                  weight: 1,
                  reward: {
                    kind: 'dropTable',
                    dropTableId: 'goblin-bronze-ammo-table',
                  },
                },
              ],
}, {
  id: 'goblin-bronze-weapon-table',
                    mode: 'dependent',
                    drops: [
                      { weight: 5, reward: { kind: 'item', itemId: 'bronze-spear', amount: 1 } },
                      { weight: 10, reward: { kind: 'item', itemId: 'bronze-dagger', amount: 1 } },
                    ],
}, {
  id: 'goblin-bronze-ammo-table',
                    mode: 'dependent',
                    drops: [
                      { weight: 3, reward: { kind: 'item', itemId: 'bronze-arrow', amount: { min: 5, max: 8 } } },
                      { weight: 6, reward: { kind: 'item', itemId: 'bronze-throwing-knife', amount: { min: 3, max: 5 } } },
                    ],
}];

describe('rollRewards', () => {
  it('rolls independent and nested dependent drop tables', () => {
    const rewards = rollRewards([goblinReward], randomSequence([0.99, 0.1, 0.1, 0.1, 0.9]), dropTables);

    expect(rewards).toEqual([
      { kind: 'item', itemId: 'bones', amount: 1 },
      { kind: 'item', itemId: 'bronze-dagger', amount: 1 },
    ]);
  });

  it('supports dependent table range amounts', () => {
    const rewards = rollRewards([goblinReward], randomSequence([0.99, 0.1, 0.9, 0.5]), dropTables);

    expect(rewards).toEqual([
      { kind: 'item', itemId: 'bones', amount: 1 },
      { kind: 'item', itemId: 'iron-ore', amount: 2 },
    ]);
  });

  it('can independently skip optional tables', () => {
    const rewards = rollRewards([goblinReward], randomSequence([0.99, 0.9]), dropTables);

    expect(rewards).toEqual([
      { kind: 'item', itemId: 'bones', amount: 1 },
    ]);
  });
});
