import type { ContentBundle, UniversePlayState } from './types';
import { collectionDropKey, collectionKillKey, collectionTrackedItemIds } from './collectionLog';

export type ModuleCleanupReport = {
  removedInventoryIds: string[];
  removedEquipmentItemIds: string[];
  removedSkillIds: string[];
  removedStatIds: string[];
  removedResourceIds: string[];
  removedFlagIds: string[];
  removedActionIds: string[];
  removedLocationIds: string[];
  cancelledActionId?: string;
  cancelledTravelActionId?: string;
  cancelledDialogueId?: string;
  cancelledDialogueNodeId?: string;
  relocatedToLocationId?: string;
};

const emptyReport = (): ModuleCleanupReport => ({
  removedInventoryIds: [],
  removedEquipmentItemIds: [],
  removedSkillIds: [],
  removedStatIds: [],
  removedResourceIds: [],
  removedFlagIds: [],
  removedActionIds: [],
  removedLocationIds: [],
});

export const hasModuleCleanupChanges = (report: ModuleCleanupReport) =>
  report.removedInventoryIds.length > 0 ||
  report.removedEquipmentItemIds.length > 0 ||
  report.removedSkillIds.length > 0 ||
  report.removedStatIds.length > 0 ||
  report.removedResourceIds.length > 0 ||
  report.removedFlagIds.length > 0 ||
  report.removedActionIds.length > 0 ||
  report.removedLocationIds.length > 0 ||
  Boolean(report.cancelledActionId || report.cancelledTravelActionId || report.cancelledDialogueId || report.cancelledDialogueNodeId || report.relocatedToLocationId);

const filterRecord = <T>(
  record: Record<string, T>,
  allowed: Set<string>,
) => Object.fromEntries(Object.entries(record).filter(([id]) => allowed.has(id))) as Record<string, T>;

const removedKeys = <T>(record: Record<string, T>, allowed: Set<string>) =>
  Object.keys(record).filter((id) => !allowed.has(id));

export const sanitizePlayStateForBundle = (
  state: UniversePlayState,
  bundle: ContentBundle,
  fallbackLocationId: string,
) => {
  const report = emptyReport();
  const locationIds = new Set(bundle.locations.map((location) => location.id));
  const actionIds = new Set(bundle.actions.map((action) => action.id));
  const skillIds = new Set(bundle.skills.map((skill) => skill.id));
  const statIds = new Set(bundle.stats.map((stat) => stat.id));
  const itemIds = new Set((bundle.items ?? []).map((item) => item.id));
  const flagIds = new Set((bundle.flags ?? []).map((flag) => flag.id));
  const resourceIds = new Set((bundle.resourceDefinitions ?? []).map((resource) => resource.id));
  const dialogueIds = new Set((bundle.dialogues ?? []).map((dialogue) => dialogue.id));
  const collectionLogIds = new Set([
    ...bundle.locations.map((location) => `location:${location.id}:explored`),
    ...(bundle.entities ?? []).flatMap((entity) =>
      (entity.collectionLog ?? []).flatMap((definition) => [
      collectionKillKey(entity.id),
      ...collectionTrackedItemIds(definition, bundle).map((itemId) => collectionDropKey(entity.id, itemId)),
      ]),
    ),
  ]);
  const validFallbackLocationId = locationIds.has(fallbackLocationId)
    ? fallbackLocationId
    : bundle.locations.find((location) => location.starting)?.id ?? bundle.locations[0]?.id ?? state.currentLocationId;

  report.removedInventoryIds = removedKeys(state.inventory ?? {}, itemIds);
  report.removedEquipmentItemIds = Object.values(state.equipment ?? {}).filter((itemId): itemId is string => Boolean(itemId && !itemIds.has(itemId)));
  report.removedSkillIds = Array.from(new Set([
    ...removedKeys(state.skillXp ?? {}, skillIds),
    ...removedKeys(state.equipmentSkillBonuses ?? {}, skillIds),
  ]));
  report.removedStatIds = removedKeys(state.statOverrides ?? {}, statIds);
  report.removedResourceIds = Array.from(new Set([
    ...removedKeys(state.resources ?? {}, resourceIds),
    ...removedKeys(state.resourcePools ?? {}, resourceIds),
  ]));
  report.removedFlagIds = removedKeys(state.flags ?? {}, flagIds);
  report.removedActionIds = Array.from(new Set([
    ...removedKeys(state.actionCompletions ?? {}, actionIds),
    ...removedKeys(state.actionProgress ?? {}, actionIds),
  ]));
  report.removedLocationIds = (state.discoveredLocationIds ?? []).filter((id) => !locationIds.has(id));

  const activeAction = state.activeAction && actionIds.has(state.activeAction.actionId) ? state.activeAction : null;
  if (state.activeAction && !activeAction) report.cancelledActionId = state.activeAction.actionId;

  const activeTravel = state.activeTravel &&
    actionIds.has(state.activeTravel.actionId) &&
    state.activeTravel.pathActionIds.every((actionId) => actionIds.has(actionId)) &&
    state.activeTravel.pathLocationIds.every((locationId) => locationIds.has(locationId)) &&
    locationIds.has(state.activeTravel.fromLocationId) &&
    locationIds.has(state.activeTravel.toLocationId)
    ? state.activeTravel
    : null;
  if (state.activeTravel && !activeTravel) report.cancelledTravelActionId = state.activeTravel.actionId;

  const activeDialogueDefinition = state.activeDialogue
    ? (bundle.dialogues ?? []).find((dialogue) => dialogue.id === state.activeDialogue?.dialogueId)
    : null;
  const activeDialogue = state.activeDialogue &&
    activeDialogueDefinition &&
    activeDialogueDefinition.nodes.some((node) => node.id === state.activeDialogue?.nodeId)
    ? state.activeDialogue
    : null;
  if (state.activeDialogue && !activeDialogue) {
    if (!activeDialogueDefinition) {
      report.cancelledDialogueId = state.activeDialogue.dialogueId;
    } else {
      report.cancelledDialogueNodeId = `${state.activeDialogue.dialogueId}.${state.activeDialogue.nodeId}`;
    }
  }

  const currentLocationId = locationIds.has(state.currentLocationId) ? state.currentLocationId : validFallbackLocationId;
  if (currentLocationId !== state.currentLocationId) report.relocatedToLocationId = currentLocationId;

  const discoveredLocationIds = Array.from(new Set([
    currentLocationId,
    ...(state.discoveredLocationIds ?? []).filter((id) => locationIds.has(id)),
  ]));

  return {
    state: {
      ...state,
      currentLocationId,
      discoveredLocationIds,
      activeAction,
      activeTravel,
      activeDialogue,
      inventory: filterRecord(state.inventory ?? {}, itemIds),
      equipment: Object.fromEntries(Object.entries(state.equipment ?? {}).filter(([, itemId]) => itemId && itemIds.has(itemId))),
      skillXp: filterRecord(state.skillXp ?? {}, skillIds),
      equipmentSkillBonuses: filterRecord(state.equipmentSkillBonuses ?? {}, skillIds),
      statOverrides: filterRecord(state.statOverrides ?? {}, statIds),
      resources: filterRecord(state.resources ?? {}, resourceIds),
      resourcePools: filterRecord(state.resourcePools ?? {}, resourceIds),
      flags: filterRecord(state.flags ?? {}, flagIds),
      actionCompletions: filterRecord(state.actionCompletions ?? {}, actionIds),
      collectionLog: filterRecord(state.collectionLog ?? {}, collectionLogIds),
      actionProgress: filterRecord(state.actionProgress ?? {}, actionIds),
      lastTickAt: Date.now(),
    },
    report,
  };
};
