import { skillTitleKey, statTitleKey } from './contentIds';
import { skillLevelFromXp } from './skills';
import type { EquipmentSlot, ExperienceCurveDefinition, ItemDefinition, SkillDefinition, StatDefinition, UniversePlayState } from './types';
import type { Translator } from './i18n';

export const equipmentSlots: EquipmentSlot[] = ['head', 'body', 'legs', 'boots', 'gloves', 'ring', 'necklace', 'mainhand', 'offhand'];

export type EquipmentRequirement = {
  skillId: string;
  level: number;
};

export type EquipmentBonus = {
  statId: string;
  amount: number;
  kind: 'added' | 'increased';
};

export type ParsedItemTag =
  | { kind: 'tag'; tag: string }
  | { kind: 'slot'; slot: EquipmentSlot; requirements: EquipmentRequirement[] }
  | { kind: 'duration'; seconds: number }
  | EquipmentBonus;

const slotSet = new Set<string>(equipmentSlots);
const slotTagPattern = /^([a-z][a-z-]*)(?:\s*\((.*)\))?$/;
const bonusPattern = /^([+-]\d+(?:\.\d+)?)(%)?\s+([a-z][a-z-]*)$/;
const requirementPattern = /(\d+)\s+([a-z][a-z-]*)/g;
const durationPattern = /^(\d+)s$/;

export const splitItemTags = (item: ItemDefinition | undefined) =>
  (item?.tags ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);

export const parseItemTag = (tag: string): ParsedItemTag => {
  const duration = tag.match(durationPattern);
  if (duration) {
    return { kind: 'duration', seconds: Number(duration[1]) };
  }

  const bonus = tag.match(bonusPattern);
  if (bonus) {
    return {
      kind: bonus[2] ? 'increased' : 'added',
      amount: Number(bonus[1]) / (bonus[2] ? 100 : 1),
      statId: bonus[3],
    };
  }

  const slot = tag.match(slotTagPattern);
  if (slot && slotSet.has(slot[1])) {
    const requirements: EquipmentRequirement[] = [];
    const requirementText = slot[2] ?? '';
    for (const match of requirementText.matchAll(requirementPattern)) {
      requirements.push({ level: Number(match[1]), skillId: match[2] });
    }
    return { kind: 'slot', slot: slot[1] as EquipmentSlot, requirements };
  }

  return { kind: 'tag', tag };
};

export const getItemTags = (item: ItemDefinition | undefined) => splitItemTags(item).map(parseItemTag);

export const itemHasTag = (item: ItemDefinition | undefined, tag: string) =>
  getItemTags(item).some((parsed) =>
    parsed.kind === 'tag'
      ? parsed.tag === tag
      : parsed.kind === 'slot'
        ? parsed.slot === tag
        : false,
  );

export const itemSlots = (item: ItemDefinition | undefined) =>
  getItemTags(item).filter((tag): tag is Extract<ParsedItemTag, { kind: 'slot' }> => tag.kind === 'slot');

export const itemStatBonuses = (item: ItemDefinition | undefined) =>
  getItemTags(item).filter((tag): tag is EquipmentBonus => tag.kind === 'added' || tag.kind === 'increased');

export const itemBuffDurationSeconds = (item: ItemDefinition | undefined) =>
  getItemTags(item).find((tag): tag is Extract<ParsedItemTag, { kind: 'duration' }> => tag.kind === 'duration')?.seconds;

export const isFoodItem = (item: ItemDefinition | undefined) => itemHasTag(item, 'food');

export const canEatItem = (item: ItemDefinition | undefined) =>
  isFoodItem(item) && itemStatBonuses(item).length > 0 && itemBuffDurationSeconds(item) !== undefined;

export const equippedItemIds = (state: UniversePlayState) =>
  Object.values(state.equipment ?? {}).filter((itemId): itemId is string => Boolean(itemId));

export const hasInventoryItemWithTag = (state: UniversePlayState, items: ItemDefinition[] = [], tag: string) =>
  items.some((item) => (state.inventory[item.id] ?? 0) > 0 && itemHasTag(item, tag));

export const hasEquippedItemWithTag = (state: UniversePlayState, items: ItemDefinition[] = [], tag: string) =>
  equippedItemIds(state).some((itemId) => itemHasTag(items.find((item) => item.id === itemId), tag));

export const meetsEquipmentRequirements = (
  state: UniversePlayState,
  slotTag: Extract<ParsedItemTag, { kind: 'slot' }>,
  skills: SkillDefinition[] = [],
  experienceCurve?: ExperienceCurveDefinition,
) =>
  slotTag.requirements.every((requirement) => {
    const skill = skills.find((candidate) => candidate.id === requirement.skillId);
    const level = Math.min(skill?.maxLevel ?? Number.POSITIVE_INFINITY, skillLevelFromXp(state.skillXp[requirement.skillId] ?? 0, experienceCurve));
    return level >= requirement.level;
  });

export const canEquipItemInSlot = (
  state: UniversePlayState,
  item: ItemDefinition | undefined,
  slot: EquipmentSlot,
  skills: SkillDefinition[] = [],
  experienceCurve?: ExperienceCurveDefinition,
) => {
  if (!item) return false;
  const equippedElsewhere = Object.entries(state.equipment ?? {})
    .filter(([candidateSlot, itemId]) => candidateSlot !== slot && itemId === item.id)
    .length;
  if ((state.inventory[item.id] ?? 0) <= equippedElsewhere) return false;
  const slotTag = itemSlots(item).find((candidate) => candidate.slot === slot);
  return Boolean(slotTag && meetsEquipmentRequirements(state, slotTag, skills, experienceCurve));
};

export const equipItem = (
  state: UniversePlayState,
  item: ItemDefinition,
  slot: EquipmentSlot,
  skills: SkillDefinition[] = [],
  experienceCurve?: ExperienceCurveDefinition,
) =>
  canEquipItemInSlot(state, item, slot, skills, experienceCurve)
    ? { ...state, equipment: { ...(state.equipment ?? {}), [slot]: item.id }, lastTickAt: Date.now() }
    : state;

export const unequipSlot = (state: UniversePlayState, slot: EquipmentSlot) => {
  const equipment = { ...(state.equipment ?? {}) };
  delete equipment[slot];
  return { ...state, equipment, lastTickAt: Date.now() };
};

export const equippedStatBonuses = (
  state: UniversePlayState,
  items: ItemDefinition[] = [],
) =>
  equippedItemIds(state)
    .map((itemId) => items.find((item) => item.id === itemId))
    .flatMap((item) => itemStatBonuses(item));

export const formatItemTag = (
  tag: ParsedItemTag,
  t: Translator,
) => {
  if (tag.kind === 'tag') return tag.tag;
  if (tag.kind === 'slot') {
    if (tag.requirements.length === 0) return t(`equipment.slot.${tag.slot}`);
    const requirements = tag.requirements
      .map((requirement) => `${requirement.level} ${t(skillTitleKey(requirement.skillId), requirement.skillId)}`)
      .join(', ');
    return t('equipment.tag.slotRequirement', { slot: t(`equipment.slot.${tag.slot}`), requirements });
  }
  if (tag.kind === 'duration') return t('equipment.tag.duration', { seconds: tag.seconds });
  const sign = tag.amount >= 0 ? '+' : '';
  const amount = tag.kind === 'increased' ? `${sign}${tag.amount * 100}%` : `${sign}${tag.amount}`;
  return t('equipment.tag.statBonus', { amount, stat: t(statTitleKey(tag.statId), tag.statId) });
};
