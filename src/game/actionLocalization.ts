import { actionDescriptionKey, actionFailureKey, actionSuccessKey, actionTitleKey, locationTitleKey } from './contentIds';
import { getPureTravelDestination } from './travel';
import type { ContentBundle, GameAction } from './types';
import type { Translator } from './i18n';

export const isTravelAction = (action: GameAction) => action.role === 'travel' && Boolean(getPureTravelDestination(action));

export const travelActionLocalizationKeys = (action: GameAction) =>
  isTravelAction(action)
    ? [
        actionTitleKey(action.id),
        actionDescriptionKey(action.id),
        actionSuccessKey(action.id),
        actionFailureKey(action.id),
      ]
    : [];

const travelActionLocationLabel = (bundle: ContentBundle, locationId: string, t: Translator) => {
  const location = bundle.locations.find((item) => item.id === locationId);
  return location ? t(locationTitleKey(location.id), location.id) : locationId;
};

export const getActionTitleText = (action: GameAction, bundle: ContentBundle, t: Translator) => {
  const destinationId = getPureTravelDestination(action);
  if (destinationId) {
    return t(actionTitleKey(action.id), t('action.travel.title', { location: travelActionLocationLabel(bundle, destinationId, t) }));
  }
  return t(actionTitleKey(action.id), action.id);
};

export const getActionDescriptionText = (action: GameAction, bundle: ContentBundle, t: Translator) => {
  const destinationId = getPureTravelDestination(action);
  if (destinationId) {
    return t(actionDescriptionKey(action.id), t('action.travel.description', { location: travelActionLocationLabel(bundle, destinationId, t) }));
  }
  return t(actionDescriptionKey(action.id), action.id);
};
