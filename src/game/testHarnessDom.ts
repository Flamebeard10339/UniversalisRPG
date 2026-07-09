// Thin, DOM-only companion to testHarness.ts. Deliberately kept separate and small:
// the bulk of the harness logic stays pure/unit-testable, while this file's only job
// is finding real rendered buttons (via the data-* attributes added to ActionPanel,
// DialoguePanel, InventoryPanel, and App.tsx's tab groups) and clicking them for
// real, so wiring bugs in the actual React handlers are exercised the same way a
// human click would be — not bypassed via a direct store dispatch.

export type DomButtonInfo = {
  text: string;
  actionId: string | null;
  dialogueOptionId: string | null;
  dialogueContinue: boolean;
  navTab: string | null;
  homeTab: string | null;
  characterTab: string | null;
  disabled: boolean;
};

const describeButton = (element: HTMLButtonElement): DomButtonInfo => ({
  text: element.textContent?.trim() ?? '',
  actionId: element.getAttribute('data-action-id'),
  dialogueOptionId: element.getAttribute('data-dialogue-option-id'),
  dialogueContinue: element.hasAttribute('data-dialogue-continue'),
  navTab: element.getAttribute('data-nav-tab'),
  homeTab: element.getAttribute('data-home-tab'),
  characterTab: element.getAttribute('data-character-tab'),
  disabled: element.disabled,
});

export const listButtons = (): DomButtonInfo[] =>
  Array.from(document.querySelectorAll('button')).map(describeButton);

export const findActionButton = (id: string): HTMLButtonElement | null =>
  document.querySelector(`[data-action-id="${id}"]`);

export const findDialogueOptionButton = (id: string): HTMLButtonElement | null =>
  document.querySelector(`[data-dialogue-option-id="${id}"]`);

export const findDialogueContinueButton = (): HTMLButtonElement | null =>
  document.querySelector('[data-dialogue-continue]');

export const findNavTabButton = (tab: string): HTMLButtonElement | null =>
  document.querySelector(`[data-nav-tab="${tab}"]`);

export const findHomeTabButton = (tab: string): HTMLButtonElement | null =>
  document.querySelector(`[data-home-tab="${tab}"]`);

export const findCharacterTabButton = (tab: string): HTMLButtonElement | null =>
  document.querySelector(`[data-character-tab="${tab}"]`);

export const findUnequipButton = (slot: string): HTMLButtonElement | null =>
  document.querySelector(`[data-unequip-slot="${slot}"]`);

export const findEquipButton = (itemId: string, slot: string): HTMLButtonElement | null =>
  document.querySelector(`[data-item-id="${itemId}"][data-equip-slot="${slot}"]`);

/** Clicks a real button element (mirrors an actual user click, exercising the true
 * React onClick handler). Returns false if the element doesn't exist or is disabled. */
export const clickElement = (element: HTMLButtonElement | null): boolean => {
  if (!element || element.disabled) return false;
  element.click();
  return true;
};

// document.getAnimations() reports every running CSS animation/transition and
// Web Animation on the page (e.g. the examine-button flash's `animate-pulse`,
// a continuous-action's progress fill) — a stable, framework-agnostic signal
// instead of a per-effect custom poll.
export const getRunningAnimationCount = (): number => document.getAnimations().length;

// Most "animations" in this app are actually React state flipping a class on
// and off after a hardcoded setTimeout (instant-action pulse, map/examine
// flash) rather than a native animation with a `finished` promise — so
// waiting on document.getAnimations() alone doesn't cover them. This instead
// waits for the DOM itself (attributes, children, text) to stop changing for
// `quietMs`, which catches both cases — any CSS animation, class toggle, or
// re-render — without the caller needing to know which mechanism is in play.
// Resolves `{settled: true}` once things go quiet, or `{settled: false}` if
// `timeoutMs` elapses first (the DOM never stopped changing — e.g. a genuine
// infinite-loop animation like a persistent pulse ring).
export const waitForDomIdle = (options: { quietMs?: number; timeoutMs?: number } = {}): Promise<{ settled: boolean; waitedMs: number }> => {
  const quietMs = options.quietMs ?? 300;
  const timeoutMs = options.timeoutMs ?? 5000;
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let quietTimer: ReturnType<typeof setTimeout>;
    let hardTimeout: ReturnType<typeof setTimeout>;

    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(quietTimer);
      clearTimeout(hardTimeout);
      resolve({ settled: result, waitedMs: Date.now() - startedAt });
    };
    const scheduleQuiet = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(() => finish(true), quietMs);
    };

    const observer = new MutationObserver(scheduleQuiet);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    hardTimeout = setTimeout(() => finish(false), timeoutMs);
    scheduleQuiet();
  });
};

// Ready-to-use adapter matching TestHarnessDeps['dom'] in testHarness.ts — composes
// the primitives above so App.tsx only needs to wire one object.
export const domAdapter = {
  listButtons,
  findActionButton,
  clickActionButton: (buttonKey: string) => clickElement(findActionButton(buttonKey)),
  findDialogueOptionButton,
  clickDialogueOptionButton: (optionId: string) => clickElement(findDialogueOptionButton(optionId)),
  findDialogueContinueButton,
  clickDialogueContinueButton: () => clickElement(findDialogueContinueButton()),
  clickNavTab: (tab: string) => clickElement(findNavTabButton(tab)),
  clickHomeTab: (tab: string) => clickElement(findHomeTabButton(tab)),
  clickCharacterTab: (tab: string) => clickElement(findCharacterTabButton(tab)),
  clickUnequip: (slot: string) => clickElement(findUnequipButton(slot)),
  clickEquip: (itemId: string, slot: string) => clickElement(findEquipButton(itemId, slot)),
  getRunningAnimationCount,
  waitForDomIdle,
};
