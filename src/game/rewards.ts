import type { IdleRewardSummary, Reward } from './types';

const rewardId = (reward: Reward) =>
  reward.kind === 'skillXp'
    ? reward.skillId
    : reward.kind === 'item'
      ? reward.itemId
      : reward.resourceId;

export const aggregateRewards = <T extends Reward>(rewards: T[]): T[] => {
  const groups = new Map<string, T>();

  for (const reward of rewards) {
    const key = `${reward.kind}:${rewardId(reward)}`;
    const existing = groups.get(key);
    groups.set(key, existing ? { ...existing, amount: existing.amount + reward.amount } : reward);
  }

  return Array.from(groups.values());
};

export const aggregateIdleRewards = (rewards: IdleRewardSummary[]): IdleRewardSummary[] => {
  const groups = new Map<string, IdleRewardSummary>();

  for (const reward of rewards) {
    const key = `${reward.kind}:${reward.labelId}`;
    const existing = groups.get(key);
    groups.set(key, existing ? { ...existing, amount: existing.amount + reward.amount } : reward);
  }

  return Array.from(groups.values());
};
