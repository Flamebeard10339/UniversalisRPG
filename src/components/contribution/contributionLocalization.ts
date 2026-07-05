import {
  actionDescriptionKey,
  actionFailureKey,
  actionSuccessKey,
  actionTitleKey,
  effectTitleKey,
  itemDescriptionKey,
  itemTitleKey,
  interactionEntityHitKey,
  interactionEntityKillKey,
  interactionEntityMissKey,
  interactionPlayerHitKey,
  interactionPlayerKillKey,
  interactionPlayerMissKey,
  interactionTitleKey,
  locationDescriptionKey,
  locationTitleKey,
  resourceTitleKey,
  skillDescriptionKey,
  skillTitleKey,
  statDescriptionKey,
  statTitleKey,
  toKebabInput,
} from '../../game/contentIds';
import type { ContentBundle, LocaleDictionary } from '../../game/types';
import type { Translator } from '../../game/i18n';

export const mergeLocalePatch = (
  locales: Record<string, LocaleDictionary>,
  locale: string,
  patch: Record<string, string>,
) => ({
  ...locales,
  [locale]: {
    ...(locales[locale] ?? {}),
    ...patch,
  },
});

export const workingLocale = (bundle: ContentBundle, preferredLocale?: string) => (
  preferredLocale && preferredLocale !== 'system' && bundle.manifest.locales.includes(preferredLocale)
    ? preferredLocale
    : bundle.manifest.locales[0] ?? 'en'
);

export const dialogueTextKey = (dialogueId: string, nodeId: string) => `dialogue.${toKebabInput(dialogueId)}.${toKebabInput(nodeId)}.text`;
export const dialogueNarratorKey = (dialogueId: string, nodeId: string) => `dialogue.${toKebabInput(dialogueId)}.${toKebabInput(nodeId)}.narrator`;
export const dialogueOptionLabelKey = (dialogueId: string, nodeId: string, optionId: string) => `dialogue.${toKebabInput(dialogueId)}.${toKebabInput(nodeId)}.${toKebabInput(optionId)}.label`;

export const defaultModuleLocalePatch = (key: string, id: string) => {
  if (key === 'locations') {
    return {
      [locationTitleKey(id)]: 'New location',
      [locationDescriptionKey(id)]: 'Describe this location.',
    };
  }
  if (key === 'actions') {
    return {
      [actionTitleKey(id)]: 'New action',
      [actionDescriptionKey(id)]: 'Describe this action.',
      [actionSuccessKey(id)]: 'Action succeeded.',
      [actionFailureKey(id)]: 'Action failed.',
    };
  }
  if (key === 'skills') {
    return {
      [skillTitleKey(id)]: 'New skill',
      [skillDescriptionKey(id)]: 'Describe this skill.',
    };
  }
  if (key === 'stats') {
    return {
      [statTitleKey(id)]: 'New stat',
      [statDescriptionKey(id)]: 'Describe this stat.',
    };
  }
  if (key === 'items') {
    return {
      [itemTitleKey(id)]: 'New item',
      [itemDescriptionKey(id)]: 'Describe this item.',
    };
  }
  if (key === 'resources') {
    return {
      [resourceTitleKey(id)]: 'New resource',
    };
  }
  if (key === 'effects') {
    return {
      [effectTitleKey(id)]: 'New effect',
    };
  }
  if (key === 'interactionTypes') {
    return {
      [interactionTitleKey(id)]: 'New interaction',
      [interactionPlayerHitKey(id)]: 'Player hit',
      [interactionPlayerMissKey(id)]: 'Player miss',
      [interactionPlayerKillKey(id)]: 'Player kill',
      [interactionEntityHitKey(id)]: 'Entity hit',
      [interactionEntityMissKey(id)]: 'Entity miss',
      [interactionEntityKillKey(id)]: 'Entity kill',
    };
  }
  return {};
};

export const travelActionLocalePatch = (id: string, t: Translator) => ({
  [actionTitleKey(id)]: t('contribution.default.travelTitle'),
  [actionDescriptionKey(id)]: t('contribution.default.travelDescription'),
  [actionSuccessKey(id)]: t('contribution.default.travelSuccess'),
  [actionFailureKey(id)]: t('contribution.default.travelFailure'),
});

export const locationLocalePatch = (id: string, t: Translator) => ({
  [locationTitleKey(id)]: t('contribution.default.locationTitle'),
  [locationDescriptionKey(id)]: t('contribution.default.locationDescription'),
});
