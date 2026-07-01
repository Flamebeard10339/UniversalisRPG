import type { ConcreteReward, IdleRewardSummary, Reward, RewardAmount } from './types';

const rewardId = (reward: ConcreteReward) =>
  reward.kind === 'skillXp'
    ? reward.skillId
    : reward.kind === 'item'
      ? reward.itemId
      : reward.resourceId;

export const aggregateRewards = <T extends ConcreteReward>(rewards: T[]): T[] => {
  const groups = new Map<string, T>();

  for (const reward of rewards) {
    const key = `${reward.kind}:${rewardId(reward)}`;
    const existing = groups.get(key);
    groups.set(key, existing ? { ...existing, amount: existing.amount + reward.amount } : reward);
  }

  return Array.from(groups.values());
};

const amountValue = (amount: RewardAmount, random: () => number) => {
  if (typeof amount === 'number') return amount;
  const min = Math.ceil(Math.min(amount.min, amount.max));
  const max = Math.floor(Math.max(amount.min, amount.max));
  return min + Math.floor(random() * (max - min + 1));
};

const rollReward = (reward: Reward, random: () => number): ConcreteReward[] => {
  if (reward.kind !== 'dropTable') {
    return [{ ...reward, amount: amountValue(reward.amount, random) }] as ConcreteReward[];
  }

  const entries = reward.drops.filter((entry) => entry.weight > 0);
  if (reward.mode === 'independent') {
    return entries.flatMap((entry) =>
      random() < Math.min(1, 1 / entry.weight) ? rollReward(entry.reward, random) : [],
    );
  }

  const totalWeight = entries.reduce((total, entry) => total + entry.weight, 0);
  let roll = random() * totalWeight;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll < 0) return rollReward(entry.reward, random);
  }
  return [];
};

export const rollRewards = (rewards: Reward[], random: () => number = Math.random): ConcreteReward[] =>
  rewards.flatMap((reward) => rollReward(reward, random));

export const aggregateIdleRewards = (rewards: IdleRewardSummary[]): IdleRewardSummary[] => {
  const groups = new Map<string, IdleRewardSummary>();

  for (const reward of rewards) {
    const key = `${reward.kind}:${reward.labelId}`;
    const existing = groups.get(key);
    groups.set(key, existing ? { ...existing, amount: existing.amount + reward.amount } : reward);
  }

  return Array.from(groups.values());
};
