// Dev-only test harness exposed on window.__test (see App.tsx's mounting useEffect,
// gated by import.meta.env.DEV). Gives synchronous, structured, scriptable access to
// the REAL live app — state, inventory/bank, location, dialogue, tab navigation, and
// a real-DOM-click path for actions — replacing screenshot-based manual verification.
//
// Kept deliberately free of `document`/DOM references: all DOM interaction is
// injected via `deps.dom` (see testHarnessDom.ts), so this factory is unit-testable
// with fake deps under vitest's default (non-jsdom) environment. When adding a new
// action/dialogue/UI affordance kind, update src/game/choices.ts (the single shared
// "what can the player do" derivation) and this harness together.
import { ACTION_PREFIX, DIALOGUE_PREFIX, RECIPE_SEPARATOR, visibleChoices, currentDialogueNode } from './choices';
import { skillLevelFromXp } from './skills';
import { createInitialPlayState } from './timers';
import type { Translator } from './i18n';
import type {
  ActionResolutionContext,
  ContentBundle,
  EquipmentSlot,
  GameAction,
  IdleReport,
  UniversePlayState,
} from './types';
import type { DomButtonInfo } from './testHarnessDom';

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

export type TestHarnessDomAdapter = {
  listButtons: () => DomButtonInfo[];
  findActionButton: (buttonKey: string) => { disabled: boolean } | null;
  clickActionButton: (buttonKey: string) => boolean;
  findDialogueOptionButton: (optionId: string) => { disabled: boolean } | null;
  clickDialogueOptionButton: (optionId: string) => boolean;
  findDialogueContinueButton: () => { disabled: boolean } | null;
  clickDialogueContinueButton: () => boolean;
  clickNavTab: (tab: string) => boolean;
  clickHomeTab: (tab: string) => boolean;
  clickCharacterTab: (tab: string) => boolean;
  clickUnequip: (slot: string) => boolean;
  clickEquip: (itemId: string, slot: string) => boolean;
};

export type ProfileFixture = Partial<
  Pick<UniversePlayState, 'currentLocationId' | 'discoveredLocationIds' | 'flags' | 'inventory' | 'bank'>
>;

export type TestHarnessDeps = {
  getBundle: () => ContentBundle;
  getPlayState: () => UniversePlayState | undefined;
  getActionContext: () => ActionResolutionContext;
  getRuntimeUniverseId: () => string;
  getStartingLocationId: () => string;
  getTranslator: () => Translator;
  getTabs: () => { activeTab: string; homeTab: string; characterTab: string };
  dom: TestHarnessDomAdapter;

  setTab: (tab: string) => void;
  setHomeTab: (tab: string) => void;
  setCharacterTab: (tab: string) => void;

  startAction: (action: GameAction, context: ActionResolutionContext, recipeId?: string) => void;
  stopAction: (context: ActionResolutionContext) => void;
  chooseDialogueOption: (context: ActionResolutionContext, optionId?: string) => void;
  cancelDialogue: () => void;
  resolveIdle: (context: ActionResolutionContext, options: { debugEnabled?: boolean; showReport?: boolean }, now?: number) => IdleReport;
  setCurrentLocation: (locationId: string) => void;
  equipItem: (itemId: string, slot: EquipmentSlot, context: ActionResolutionContext) => void;
  unequipSlot: (slot: EquipmentSlot) => void;
  depositToBank: (context: ActionResolutionContext, itemId: string, amount: number) => void;
  withdrawFromBank: (context: ActionResolutionContext, itemId: string, amount: number) => void;
  closeModal: () => void;
  replaceUniverseState: (playState: UniversePlayState) => Promise<void>;
  resetUniverse: () => Promise<void>;
  debugSetFlag: (flagId: string, value: boolean | number | string) => void;
  debugSetResource: (resourceId: string, current: number) => void;
  debugSetSkillXp: (skillId: string, xp: number) => void;
  debugSetInventoryItem: (itemId: string, amount: number) => void;
  debugGiveItem: (context: ActionResolutionContext, itemId: string, amount: number) => void;
  debugSetBankItem: (itemId: string, amount: number) => void;

  listProfileNames: () => string[];
  loadProfileFixture: (name: string) => ProfileFixture | null;
};

// ActionPanel/InventoryPanel render `data-action-id` using `action.id` or
// `action.id:recipeId` (colon separator); the shared choices.ts derivation returns
// choiceIds as `action:action.id` or `action:action.id@recipeId` (ACTION_PREFIX +
// RECIPE_SEPARATOR). Converting between the two is exactly the kind of mismatch this
// feature exists to catch early rather than leave as a silent, permanent bug.
const choiceIdToButtonKey = (choiceId: string): string => {
  const withoutPrefix = choiceId.startsWith(ACTION_PREFIX) ? choiceId.slice(ACTION_PREFIX.length) : choiceId;
  return withoutPrefix.replace(RECIPE_SEPARATOR, ':');
};

const splitActionChoiceId = (choiceId: string): { actionId: string; recipeId?: string } => {
  const raw = choiceId.startsWith(ACTION_PREFIX) ? choiceId.slice(ACTION_PREFIX.length) : choiceId;
  const [actionId, recipeId] = raw.split(RECIPE_SEPARATOR);
  return { actionId, recipeId };
};

export const createTestHarness = (deps: TestHarnessDeps) => {
  const requirePlayState = (): UniversePlayState | null => deps.getPlayState() ?? null;

  const state = {
    get: (): UniversePlayState | null => requirePlayState(),
    getFlags: () => requirePlayState()?.flags ?? {},
    setFlag: (flagId: string, value: boolean | number | string): Result => {
      deps.debugSetFlag(flagId, value);
      return { ok: true };
    },
    getResources: () => requirePlayState()?.resourcePools ?? {},
    setResource: (resourceId: string, current: number): Result => {
      const pools = requirePlayState()?.resourcePools ?? {};
      if (!pools[resourceId]) return { ok: false, error: 'unknown-resource' };
      deps.debugSetResource(resourceId, current);
      return { ok: true };
    },
    getSkills: () => {
      const play = requirePlayState();
      const bundle = deps.getBundle();
      if (!play) return {};
      return Object.fromEntries((bundle.skills ?? []).map((skill) => {
        const xp = play.skillXp[skill.id] ?? 0;
        return [skill.id, { xp, level: skillLevelFromXp(xp, bundle.manifest.experienceCurve) }];
      }));
    },
    setSkillXp: (skillId: string, xp: number): Result => {
      deps.debugSetSkillXp(skillId, xp);
      return { ok: true };
    },
    getLocation: () => {
      const play = requirePlayState();
      return { id: play?.currentLocationId ?? null, discovered: play?.discoveredLocationIds ?? [] };
    },
    reset: async (): Promise<Result> => {
      await deps.resetUniverse();
      return { ok: true };
    },
  };

  const inventory = {
    get: () => requirePlayState()?.inventory ?? {},
    set: (itemId: string, amount: number): Result => {
      deps.debugSetInventoryItem(itemId, amount);
      return { ok: true };
    },
    give: (itemId: string, amount: number): Result => {
      deps.debugGiveItem(deps.getActionContext(), itemId, amount);
      return { ok: true };
    },
  };

  const bank = {
    get: () => requirePlayState()?.bank ?? {},
    deposit: (itemId: string, amount: number): Result => {
      const available = requirePlayState()?.inventory[itemId] ?? 0;
      if (available <= 0) return { ok: false, error: 'item-not-held' };
      deps.depositToBank(deps.getActionContext(), itemId, amount);
      return { ok: true };
    },
    withdraw: (itemId: string, amount: number): Result => {
      const available = requirePlayState()?.bank[itemId] ?? 0;
      if (available <= 0) return { ok: false, error: 'item-not-in-bank' };
      deps.withdrawFromBank(deps.getActionContext(), itemId, amount);
      return { ok: true };
    },
    set: (itemId: string, amount: number): Result => {
      deps.debugSetBankItem(itemId, amount);
      return { ok: true };
    },
  };

  const equipment = {
    get: () => requirePlayState()?.equipment ?? {},
    equip: (itemId: string, slot: EquipmentSlot): Result<{ viaDom?: boolean }> => {
      const item = deps.getBundle().items.find((candidate) => candidate.id === itemId);
      if (!item) return { ok: false, error: 'unknown-item' };
      if (deps.dom.clickEquip(itemId, slot)) return { ok: true, viaDom: true };
      deps.equipItem(itemId, slot, deps.getActionContext());
      return { ok: true, viaDom: false };
    },
    unequip: (slot: EquipmentSlot): Result<{ viaDom?: boolean }> => {
      if (deps.dom.clickUnequip(slot)) return { ok: true, viaDom: true };
      deps.unequipSlot(slot);
      return { ok: true, viaDom: false };
    },
  };

  const location = {
    get: () => requirePlayState()?.currentLocationId ?? null,
    teleport: (locationId: string): Result => {
      const exists = deps.getBundle().locations.some((candidate) => candidate.id === locationId);
      if (!exists) return { ok: false, error: 'unknown-location' };
      deps.setCurrentLocation(locationId);
      return { ok: true };
    },
    discover: (locationId: string): Result => {
      const exists = deps.getBundle().locations.some((candidate) => candidate.id === locationId);
      if (!exists) return { ok: false, error: 'unknown-location' };
      const current = requirePlayState();
      if (!current) return { ok: false, error: 'no-active-universe' };
      const from = current.currentLocationId;
      deps.setCurrentLocation(locationId);
      deps.setCurrentLocation(from);
      return { ok: true };
    },
  };

  const profile = {
    list: (): string[] => deps.listProfileNames(),
    load: async (name: string): Promise<Result> => {
      const fixture = deps.loadProfileFixture(name);
      if (!fixture) return { ok: false, error: 'unknown-profile' };
      const base = createInitialPlayState(deps.getRuntimeUniverseId(), deps.getStartingLocationId(), { manifest: deps.getBundle().manifest });
      await deps.replaceUniverseState({ ...base, ...fixture, universeId: deps.getRuntimeUniverseId() });
      return { ok: true };
    },
    save: (): ProfileFixture => {
      const play = requirePlayState();
      if (!play) return {};
      return {
        currentLocationId: play.currentLocationId,
        discoveredLocationIds: play.discoveredLocationIds,
        flags: play.flags,
        inventory: play.inventory,
        bank: play.bank,
      };
    },
  };

  const choices = {
    list: () => {
      const play = requirePlayState();
      const bundle = deps.getBundle();
      if (!play) return [];
      return visibleChoices(bundle, deps.getActionContext(), play, deps.getTranslator()).map((choice) => ({
        id: choice.choiceId,
        label: choice.title,
        description: choice.description,
        kind: choice.kind,
        requirementsMet: choice.requirementsMet,
        entityId: choice.entityId,
        itemId: choice.itemId,
      }));
    },
    click: (id: string): (
      | { ok: true; startedActionId?: string; viaDom: boolean }
      | { ok: false; error: string; available?: string[] }
    ) => {
      const available = choices.list();
      const match = available.find((choice) => choice.id === id);
      if (!match) return { ok: false, error: 'choice-not-visible', available: available.map((choice) => choice.id) };
      if (!match.requirementsMet) return { ok: false, error: 'requirements-not-met' };

      if (id.startsWith(DIALOGUE_PREFIX)) {
        const optionRaw = id.slice(DIALOGUE_PREFIX.length);
        const optionId = optionRaw === 'continue' ? undefined : optionRaw;
        const foundOption = optionId ? deps.dom.findDialogueOptionButton(optionId) : null;
        if (foundOption) {
          deps.dom.clickDialogueOptionButton(optionId as string);
          return { ok: true, viaDom: true };
        }
        const continueButton = deps.dom.findDialogueContinueButton();
        if (continueButton) {
          deps.dom.clickDialogueContinueButton();
          return { ok: true, viaDom: true };
        }
        deps.chooseDialogueOption(deps.getActionContext(), optionId);
        return { ok: true, viaDom: false };
      }

      const buttonKey = choiceIdToButtonKey(id);
      const button = deps.dom.findActionButton(buttonKey);
      if (button) {
        const clicked = deps.dom.clickActionButton(buttonKey);
        return clicked ? { ok: true, startedActionId: buttonKey, viaDom: true } : { ok: false, error: 'requirements-not-met' };
      }

      const { actionId, recipeId } = splitActionChoiceId(id);
      const action = deps.getBundle().actions.find((candidate) => candidate.id === actionId);
      if (!action) return { ok: false, error: 'unknown-action' };
      deps.startAction(action, deps.getActionContext(), recipeId);
      return { ok: true, startedActionId: actionId, viaDom: false };
    },
  };

  const dialogue = {
    get: () => {
      const play = requirePlayState();
      const bundle = deps.getBundle();
      if (!play?.activeDialogue) return { active: false as const };
      const node = currentDialogueNode(bundle, play);
      if (!node) return { active: false as const };
      const t = deps.getTranslator();
      const speaker = node.speakerId ? t(`dialogue.${play.activeDialogue.dialogueId}.speaker.${node.speakerId}`, node.speakerId) : undefined;
      const text = node.textKey ? t(node.textKey) : node.narratorKey ? t(node.narratorKey) : '';
      return {
        active: true as const,
        dialogueId: play.activeDialogue.dialogueId,
        nodeId: play.activeDialogue.nodeId,
        speaker,
        text,
        options: (node.options ?? []).map((option) => ({ id: option.id, label: t(option.labelKey) })),
      };
    },
    choose: (optionId?: string): Result => {
      const play = requirePlayState();
      if (!play?.activeDialogue) return { ok: false, error: 'no-active-dialogue' };
      const node = currentDialogueNode(deps.getBundle(), play);
      if (node?.options && node.options.length > 0 && optionId !== undefined && !node.options.some((option) => option.id === optionId)) {
        return { ok: false, error: 'invalid-option' };
      }
      if (optionId !== undefined && deps.dom.findDialogueOptionButton(optionId)) {
        deps.dom.clickDialogueOptionButton(optionId);
        return { ok: true };
      }
      if (optionId === undefined && deps.dom.findDialogueContinueButton()) {
        deps.dom.clickDialogueContinueButton();
        return { ok: true };
      }
      deps.chooseDialogueOption(deps.getActionContext(), optionId);
      return { ok: true };
    },
    cancel: (): Result => {
      deps.cancelDialogue();
      return { ok: true };
    },
  };

  const nav = {
    setTab: (tab: string): Result => {
      const clicked = deps.dom.clickNavTab(tab);
      if (!clicked) deps.setTab(tab);
      return { ok: true };
    },
    setHomeTab: (tab: string): Result => {
      const clicked = deps.dom.clickHomeTab(tab);
      if (!clicked) deps.setHomeTab(tab);
      return { ok: true };
    },
    setCharacterTab: (tab: string): Result => {
      const clicked = deps.dom.clickCharacterTab(tab);
      if (!clicked) deps.setCharacterTab(tab);
      return { ok: true };
    },
    getTabs: () => deps.getTabs(),
  };

  const modal = {
    get: () => requirePlayState()?.openModalId ?? null,
    close: (): Result => {
      deps.closeModal();
      return { ok: true };
    },
  };

  const time = {
    skip: (seconds: number): { ok: true; report: IdleReport } => {
      const report = deps.resolveIdle(deps.getActionContext(), { debugEnabled: true, showReport: true }, Date.now() + seconds * 1000);
      return { ok: true, report };
    },
    now: () => Date.now(),
  };

  const buttons = {
    list: () => deps.dom.listButtons(),
  };

  const debug = {
    dump: () => ({
      universeId: deps.getRuntimeUniverseId(),
      playState: requirePlayState(),
      tabs: deps.getTabs(),
    }),
  };

  return { state, inventory, bank, equipment, location, profile, choices, dialogue, nav, modal, time, buttons, debug };
};

export type TestHarnessApi = ReturnType<typeof createTestHarness>;

declare global {
  interface Window {
    __test?: TestHarnessApi;
  }
}
