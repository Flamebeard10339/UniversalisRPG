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
};
