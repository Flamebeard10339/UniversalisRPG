// The in-game text CLI. This is deliberately the same "what can the player do,
// what does the player have" surface an autonomous agent would want: list
// commands, read state (inventory/equipment/stats/skills/quests), and act
// (eat/drop/pickup/equip/unequip/goto/do). It reuses the exact same shared
// helpers the real GUI and the dev test harness already use (choices.ts's
// visibleChoices, travel.ts's findTravelPath, characterStats.ts) rather than
// re-deriving any of that logic, and every action command ends by calling the
// same gameState.ts store actions the GUI buttons call — the GUI and the CLI
// are two front ends over one game-logic layer, not two separate ones.
import { ACTION_PREFIX, DIALOGUE_PREFIX, RECIPE_SEPARATOR, currentDialogueNode, visibleChoices } from './choices';
import { itemDescriptionKey, itemTitleKey, locationDescriptionKey, locationTitleKey, skillTitleKey, statTitleKey } from './contentIds';
import { canEatItem, equipmentSlots, formatItemTag, getItemTags, itemSlots } from './equipment';
import { getCharacterStatTotals } from './characterStats';
import { skillLevelFromXp } from './skills';
import { currentQuestStage, deriveQuestStatus } from './quests';
import { findTravelPath, type AvailableTravelEdge } from './travel';
import type { ActionResolutionContext, ContentBundle, EquipmentSlot, UniversePlayState } from './types';
import type { Translator } from './i18n';

export type CliRuntime = {
  getBundle: () => ContentBundle;
  getPlayState: () => UniversePlayState;
  getActionContext: () => ActionResolutionContext;
  getTranslator: () => Translator;
  isDebugEnabled: () => boolean;
  appendMessage: (text: string, author?: 'system' | 'player') => void;

  startAction: (actionId: string, recipeId?: string) => void;
  chooseDialogueOption: (optionId?: string) => void;
  equipItem: (itemId: string, slot: EquipmentSlot) => void;
  unequipSlot: (slot: EquipmentSlot) => void;
  eatItem: (itemId: string) => void;
  dropInventoryItem: (itemId: string) => void;
  pickUpGroundItem: (groundItemId: string) => void;
  travelTo: (path: AvailableTravelEdge[]) => void;
  changeSetting: (key: string, value: string) => { ok: boolean; message: string };

  debugGiveItem: (itemId: string, amount: number) => void;
  debugSetFlag: (flagId: string, value: boolean | number | string) => void;
  debugSetSkillXp: (skillId: string, xp: number) => void;
  teleport: (locationId: string) => void;
};

export type CliCommand = {
  name: string;
  aliases?: string[];
  usage: string;
  description: string;
  cheat?: boolean;
  run: (args: string[], rt: CliRuntime) => void;
};

const findItemByName = (bundle: ContentBundle, t: Translator, name: string) => {
  const needle = name.trim().toLowerCase();
  return bundle.items.find((item) => item.id.toLowerCase() === needle || t(itemTitleKey(item.id), item.id).toLowerCase() === needle);
};

const findLocationByName = (bundle: ContentBundle, t: Translator, name: string) => {
  const needle = name.trim().toLowerCase();
  return bundle.locations.find((location) => location.id.toLowerCase() === needle || t(locationTitleKey(location.id), location.id).toLowerCase() === needle);
};

const parseSlot = (value: string): EquipmentSlot | undefined =>
  equipmentSlots.find((slot) => slot === value.trim().toLowerCase());

const listInventory = (rt: CliRuntime) => {
  const t = rt.getTranslator();
  const play = rt.getPlayState();
  const entries = Object.entries(play.inventory).filter(([, amount]) => amount > 0);

  if (entries.length === 0) {
    rt.appendMessage(t('cli.inventory.empty', 'You are not carrying anything.'));
    return;
  }

  const lines = entries.map(([itemId, amount]) => `${t(itemTitleKey(itemId), itemId)} x${amount}`);
  rt.appendMessage(`${t('cli.inventory.title', 'Inventory')}: ${lines.join(', ')}`);
};

const listEquipment = (rt: CliRuntime) => {
  const t = rt.getTranslator();
  const play = rt.getPlayState();
  const lines = equipmentSlots.map((slot) => {
    const itemId = play.equipment?.[slot];
    const label = itemId ? t(itemTitleKey(itemId), itemId) : t('equipment.emptySlot', 'Empty');
    return `${t(`equipment.slot.${slot}`, slot)}: ${label}`;
  });
  rt.appendMessage(`${t('cli.equipment.title', 'Equipment')} - ${lines.join(', ')}`);
};

const listActions = (rt: CliRuntime) => {
  const bundle = rt.getBundle();
  const t = rt.getTranslator();
  const play = rt.getPlayState();
  const context = rt.getActionContext();

  const dialogueNode = currentDialogueNode(bundle, play);
  if (dialogueNode) {
    const text = dialogueNode.textKey ? t(dialogueNode.textKey) : dialogueNode.narratorKey ? t(dialogueNode.narratorKey) : '';
    if (text) rt.appendMessage(text);
  } else {
    const location = bundle.locations.find((candidate) => candidate.id === play.currentLocationId);
    if (location) {
      rt.appendMessage(`${t(locationTitleKey(location.id), location.id)} - ${t(locationDescriptionKey(location.id), '')}`);
    }
  }

  const choices = visibleChoices(bundle, context, play, t);
  if (choices.length === 0) {
    rt.appendMessage(t('cli.look.noActions', 'Nothing to do here.'));
    return;
  }

  const lines = choices.map((choice, index) => `${index + 1}. ${choice.title}${choice.requirementsMet ? '' : ` (${t('cli.look.locked', 'requirements not met')})`}`);
  rt.appendMessage(lines.join('\n'));
};

const groundItemsHere = (rt: CliRuntime) => {
  const play = rt.getPlayState();
  return play.groundItems.filter((stack) => stack.locationId === play.currentLocationId);
};

export const cliCommands: CliCommand[] = [
  {
    name: 'help',
    aliases: ['h', 'commands'],
    usage: '/help [command]',
    description: 'List every available command, or show detailed usage for one command.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const debugEnabled = rt.isDebugEnabled();
      const available = cliCommands.filter((command) => !command.cheat || debugEnabled);

      if (args.length === 0) {
        const names = available.map((command) => `/${command.name}`).join(', ');
        rt.appendMessage(`${t('cli.help.title', 'Commands')}: ${names}. ${t('cli.help.detail', 'Type /help <command> for details.')}`);
        return;
      }

      const query = args[0].toLowerCase().replace(/^\//, '');
      const command = available.find((candidate) => candidate.name === query || candidate.aliases?.includes(query));
      if (!command) {
        rt.appendMessage(t('cli.help.unknown', 'Unknown command: {command}', { command: query }));
        return;
      }
      rt.appendMessage(`${command.usage} - ${command.description}`);
    },
  },
  {
    name: 'look',
    aliases: ['actions', 'l'],
    usage: '/look',
    description: 'Describe your surroundings and list numbered actions available right now.',
    run: (_args, rt) => listActions(rt),
  },
  {
    name: 'do',
    aliases: ['act'],
    usage: '/do <number>',
    description: 'Perform the numbered action shown by the most recent /look.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const play = rt.getPlayState();
      const context = rt.getActionContext();
      const index = Number(args[0]);

      if (!Number.isInteger(index) || index < 1) {
        rt.appendMessage(t('cli.do.usage', 'Usage: /do <number>. Run /look first to see numbered actions.'));
        return;
      }

      const choices = visibleChoices(bundle, context, play, t);
      const choice = choices[index - 1];
      if (!choice) {
        rt.appendMessage(t('cli.do.outOfRange', "There's no action #{index}. Run /look to see what's available.", { index }));
        return;
      }
      if (!choice.requirementsMet) {
        rt.appendMessage(t('cli.do.requirementsNotMet', "You don't meet the requirements for that."));
        return;
      }

      if (choice.choiceId.startsWith(DIALOGUE_PREFIX)) {
        const optionId = choice.choiceId.slice(DIALOGUE_PREFIX.length);
        rt.chooseDialogueOption(optionId === 'continue' ? undefined : optionId);
        return;
      }

      const raw = choice.choiceId.slice(ACTION_PREFIX.length);
      const [actionId, recipeId] = raw.split(RECIPE_SEPARATOR);
      rt.startAction(actionId, recipeId);
    },
  },
  {
    name: 'goto',
    aliases: ['travel', 'go'],
    usage: '/goto <location>',
    description: 'Travel to a discovered location by name.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const play = rt.getPlayState();
      const context = rt.getActionContext();
      const name = args.join(' ');

      if (!name) {
        rt.appendMessage(t('cli.goto.usage', 'Usage: /goto <location>'));
        return;
      }

      const location = findLocationByName(bundle, t, name);
      if (!location) {
        rt.appendMessage(t('cli.goto.unknownLocation', "You don't know a place called \"{name}\".", { name }));
        return;
      }

      const path = findTravelPath(play, context, location.id);
      if (path.status !== 'found') {
        rt.appendMessage(t('chat.travelPathTooFar', "That route is too far away to path automatically."));
        return;
      }
      if (path.edges.length > 0) rt.travelTo(path.edges);
      else rt.appendMessage(t('cli.goto.alreadyThere', "You're already there."));
    },
  },
  {
    name: 'inventory',
    aliases: ['i', 'inv'],
    usage: '/inventory',
    description: 'List everything you are carrying.',
    run: (_args, rt) => listInventory(rt),
  },
  {
    name: 'equipment',
    aliases: ['eq'],
    usage: '/equipment',
    description: 'List what is equipped in each slot.',
    run: (_args, rt) => listEquipment(rt),
  },
  {
    name: 'examine',
    aliases: ['x'],
    usage: '/examine <item>',
    description: 'Show an item\'s description.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const name = args.join(' ');
      const item = findItemByName(bundle, t, name);
      if (!item) {
        rt.appendMessage(t('cli.examine.unknownItem', "You don't have anything called \"{name}\".", { name }));
        return;
      }
      const description = t(itemDescriptionKey(item.id), '');
      const tags = getItemTags(item).map((tag) => formatItemTag(tag, t));
      rt.appendMessage([t(itemTitleKey(item.id), item.id), description, tags.length > 0 ? tags.join(', ') : null].filter(Boolean).join(' - '));
    },
  },
  {
    name: 'eat',
    usage: '/eat <item>',
    description: 'Eat a food item from your inventory.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const play = rt.getPlayState();
      const name = args.join(' ');
      const item = findItemByName(bundle, t, name);
      if (!item || (play.inventory[item.id] ?? 0) <= 0) {
        rt.appendMessage(t('cli.eat.dontHave', "You don't have any {name} to eat.", { name }));
        return;
      }
      if (!canEatItem(item)) {
        rt.appendMessage(t('cli.eat.notFood', "You can't eat that."));
        return;
      }
      rt.eatItem(item.id);
    },
  },
  {
    name: 'drop',
    usage: '/drop <item>',
    description: 'Drop an item from your inventory onto the ground.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const play = rt.getPlayState();
      const name = args.join(' ');
      const item = findItemByName(bundle, t, name);
      if (!item || (play.inventory[item.id] ?? 0) <= 0) {
        rt.appendMessage(t('cli.drop.dontHave', "You don't have any {name} to drop.", { name }));
        return;
      }
      rt.dropInventoryItem(item.id);
    },
  },
  {
    name: 'pickup',
    aliases: ['take', 'get'],
    usage: '/pickup <item>',
    description: 'Pick up an item stack from the ground at your current location.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const name = args.join(' ');
      const item = findItemByName(bundle, t, name);
      const stack = item ? groundItemsHere(rt).find((candidate) => candidate.itemId === item.id) : undefined;
      if (!stack) {
        rt.appendMessage(t('cli.pickup.notHere', "There's no {name} on the ground here.", { name }));
        return;
      }
      rt.pickUpGroundItem(stack.id);
    },
  },
  {
    name: 'equip',
    usage: '/equip <item> <slot>',
    description: 'Equip an item into a slot (head, body, legs, boots, gloves, ring, necklace, mainhand, offhand).',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const slotArg = args[args.length - 1];
      const slot = parseSlot(slotArg ?? '');
      const name = slot ? args.slice(0, -1).join(' ') : args.join(' ');
      const item = findItemByName(bundle, t, name);

      if (!item) {
        rt.appendMessage(t('cli.equip.unknownItem', "You don't have anything called \"{name}\".", { name }));
        return;
      }
      const targetSlot = slot ?? itemSlots(item)[0]?.slot;
      if (!targetSlot) {
        rt.appendMessage(t('cli.equip.usage', 'Usage: /equip <item> <slot>'));
        return;
      }
      rt.equipItem(item.id, targetSlot);
    },
  },
  {
    name: 'unequip',
    usage: '/unequip <slot>',
    description: 'Unequip whatever is in a slot.',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const slot = parseSlot(args[0] ?? '');
      if (!slot) {
        rt.appendMessage(t('cli.unequip.usage', 'Usage: /unequip <slot>'));
        return;
      }
      rt.unequipSlot(slot);
    },
  },
  {
    name: 'stats',
    usage: '/stats',
    description: 'List your effective stats.',
    run: (_args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const play = rt.getPlayState();
      const context = rt.getActionContext();
      const lines = bundle.stats.map((stat) => {
        const totals = getCharacterStatTotals(play, bundle.stats, stat.id, bundle.skills, bundle.items, bundle.manifest.experienceCurve, bundle.statModifiers);
        return `${t(statTitleKey(stat.id), stat.id)}: ${totals.effectiveTotal.toFixed(2)}`;
      });
      rt.appendMessage(lines.join(', '));
    },
  },
  {
    name: 'skills',
    usage: '/skills',
    description: 'List your skill levels.',
    run: (_args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const play = rt.getPlayState();
      const lines = bundle.skills.map((skill) => {
        const level = skillLevelFromXp(play.skillXp[skill.id] ?? 0, bundle.manifest.experienceCurve);
        return `${t(skillTitleKey(skill.id), skill.id)}: ${level}`;
      });
      rt.appendMessage(lines.join(', '));
    },
  },
  {
    name: 'quests',
    usage: '/quests',
    description: 'List your quest log and current stage.',
    run: (_args, rt) => {
      const t = rt.getTranslator();
      const bundle = rt.getBundle();
      const play = rt.getPlayState();
      const context = rt.getActionContext();
      const quests = bundle.quests ?? [];
      if (quests.length === 0) {
        rt.appendMessage(t('quests.empty', 'No quests yet.'));
        return;
      }
      const lines = quests.map((quest) => {
        const status = deriveQuestStatus(play, quest, context);
        const stage = currentQuestStage(play, quest, context);
        const detail = status === 'complete' ? t('quests.status.complete', 'Complete.') : stage ? t(stage.descriptionKey) : '';
        return `${t(quest.titleKey)}: ${detail}`;
      });
      rt.appendMessage(lines.join('\n'));
    },
  },
  {
    name: 'change-setting',
    aliases: ['set'],
    usage: '/change-setting <key> <value>',
    description: 'Change a game setting, e.g. /change-setting show-gui true',
    run: (args, rt) => {
      const t = rt.getTranslator();
      const [key, ...rest] = args;
      if (!key || rest.length === 0) {
        rt.appendMessage(t('cli.changeSetting.usage', 'Usage: /change-setting <key> <value>'));
        return;
      }
      const result = rt.changeSetting(key, rest.join(' '));
      if (!result.ok) rt.appendMessage(result.message);
    },
  },
  {
    name: 'cheat',
    usage: '/cheat <give|set-flag|set-xp|teleport> ...',
    description: 'Debug-only cheat commands.',
    cheat: true,
    run: (args, rt) => {
      const t = rt.getTranslator();
      const [sub, ...rest] = args;

      if (sub === 'give') {
        const amount = Number(rest[rest.length - 1]);
        const hasAmount = Number.isFinite(amount) && rest.length > 1;
        const name = hasAmount ? rest.slice(0, -1).join(' ') : rest.join(' ');
        const item = findItemByName(rt.getBundle(), t, name);
        if (!item) {
          rt.appendMessage(t('cli.cheat.unknownItem', "No such item: {name}", { name }));
          return;
        }
        rt.debugGiveItem(item.id, hasAmount ? amount : 1);
        return;
      }
      if (sub === 'set-flag') {
        const [flagId, value] = rest;
        if (!flagId) return;
        rt.debugSetFlag(flagId, value === 'false' ? false : value === 'true' ? true : (Number.isFinite(Number(value)) ? Number(value) : value));
        return;
      }
      if (sub === 'set-xp') {
        const [skillId, amount] = rest;
        if (!skillId || !Number.isFinite(Number(amount))) return;
        rt.debugSetSkillXp(skillId, Number(amount));
        return;
      }
      if (sub === 'teleport') {
        const location = findLocationByName(rt.getBundle(), t, rest.join(' '));
        if (!location) {
          rt.appendMessage(t('cli.cheat.unknownLocation', 'No such location.'));
          return;
        }
        rt.teleport(location.id);
        return;
      }
      rt.appendMessage(t('cli.cheat.usage', 'Usage: /cheat <give|set-flag|set-xp|teleport> ...'));
    },
  },
];

const findCommand = (name: string, debugEnabled: boolean) =>
  cliCommands.find((command) => (command.name === name || command.aliases?.includes(name)) && (!command.cheat || debugEnabled));

// The single entry point both the player-facing chat input and (in principle)
// any scripted/agent driver should call: plain text becomes a chat message,
// `/`-prefixed text is parsed and dispatched against the command table above.
export const executeChatInput = (rawText: string, rt: CliRuntime): void => {
  const trimmed = rawText.trim();
  if (!trimmed) return;

  if (!trimmed.startsWith('/')) {
    rt.appendMessage(trimmed, 'player');
    return;
  }

  const t = rt.getTranslator();
  const [commandNameRaw, ...args] = trimmed.slice(1).split(/\s+/);
  const commandName = commandNameRaw.toLowerCase();
  const debugEnabled = rt.isDebugEnabled();

  rt.appendMessage(trimmed, 'player');

  const command = findCommand(commandName, debugEnabled);
  if (!command) {
    const cheatButDisabled = cliCommands.some((candidate) => candidate.cheat && (candidate.name === commandName || candidate.aliases?.includes(commandName)));
    rt.appendMessage(cheatButDisabled
      ? t('cli.cheatDisabled', 'Cheat commands are only available in debug mode.')
      : t('cli.unknownCommand', 'Unknown command: /{command}. Try /help.', { command: commandName }));
    return;
  }

  command.run(args, rt);
};
