import { equippedItemIds, parseTagString } from './equipment';
import type { ParsedItemTag } from './equipment';
import type { EnemyDefinition, ItemDefinition, UniversePlayState } from './types';

export type CombatTagField = 'offensiveTags' | 'defensiveTags';

export const getPlayerCombatTags = (
  state: UniversePlayState,
  items: ItemDefinition[],
  field: CombatTagField,
): ParsedItemTag[] =>
  equippedItemIds(state)
    .map((itemId) => items.find((item) => item.id === itemId))
    .flatMap((item) => parseTagString(item?.[field]));

export const getEnemyCombatTags = (
  enemy: EnemyDefinition | null | undefined,
  field: CombatTagField,
): ParsedItemTag[] => parseTagString(enemy?.[field]);

// Composes an attacker's raw (added, increased) stat totals with tag interactions:
// the attacker's offensive bonus tags (e.g. "+15% undead") apply when the defender
// carries the matching plain tag (e.g. "undead"); the defender's defensive modifier
// tags (e.g. "-10 stab", "+10% crush") apply when the attacker carries the matching
// plain tag (e.g. "stab"). A defensive modifier's sign is inverted onto the attacker:
// a positive modifier is a resistance (reduces the attacker), a negative one is a
// weakness (boosts the attacker) — one formula covers both.
export const applyCombatTags = (
  added: number,
  increased: number,
  attackerOffensiveTags: ParsedItemTag[],
  defenderDefensiveTags: ParsedItemTag[],
): number => {
  const attackerTypeTags = new Set(
    attackerOffensiveTags.filter((tag) => tag.kind === 'tag').map((tag) => tag.tag),
  );
  const defenderTypeTags = new Set(
    defenderDefensiveTags.filter((tag) => tag.kind === 'tag').map((tag) => tag.tag),
  );
  const attackerBonuses = attackerOffensiveTags.filter(
    (tag): tag is Extract<ParsedItemTag, { kind: 'added' | 'increased' }> => tag.kind === 'added' || tag.kind === 'increased',
  );
  const defenderModifiers = defenderDefensiveTags.filter(
    (tag): tag is Extract<ParsedItemTag, { kind: 'added' | 'increased' }> => tag.kind === 'added' || tag.kind === 'increased',
  );

  let totalAdded = added;
  let totalIncreased = increased;
  for (const bonus of attackerBonuses) {
    if (!defenderTypeTags.has(bonus.statId)) continue;
    if (bonus.kind === 'added') totalAdded += bonus.amount;
    else totalIncreased += bonus.amount;
  }

  let percentMultiplier = 1;
  for (const modifier of defenderModifiers) {
    if (!attackerTypeTags.has(modifier.statId)) continue;
    if (modifier.kind === 'added') totalAdded -= modifier.amount;
    else percentMultiplier *= 1 - modifier.amount;
  }

  return Math.max(0, totalAdded) * Math.max(0, 1 + totalIncreased) * Math.max(0, percentMultiplier);
};
