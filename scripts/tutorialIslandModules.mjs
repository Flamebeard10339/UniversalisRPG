// Content definitions for the Tutorial Island mods.
// This module only produces DATA. Getting that data into the game happens
// entirely through the real content editor (see build-tutorial-island.mjs,
// which drives scripts/mod-editor-cli.mjs's authorModule command) — nothing
// here writes to public/content directly.

const moduleHeader = (id, dependencies = []) => ({
  $schema: 'https://universalis-rpg.local/schema/module.schema.json',
  id,
  version: '1.0.0',
  universe: 'base',
  author: 'UniversalisRPG',
  game_version: '1.0',
  dependencies,
});

const state = (variable, comparison, value) => ({ kind: 'state-variable', variable, comparison, value });
const hasItem = (itemId, amount = 0) => state(`item:${itemId}`, 'greater-than', amount);
const hasFlag = (flagId) => state(`flag:${flagId}`, 'equal', true);
const not = (condition) => ({ kind: 'not', condition });
const all = (...conditions) => ({ kind: 'all', conditions });
const any = (...conditions) => ({ kind: 'any', conditions });
const completed = (actionId, amount = 0) => state(`action-completions:${actionId}`, 'greater-than', amount);

const item = (id, tags) => ({ id, ...(tags ? { tags } : {}) });
const flag = (id, initialValue = false) => ({ id, initialValue });
const skill = (id, statId = id) => ({ id, maxLevel: 100, statId });
const stat = (id, base = 6) => ({ id, base });
const loc = (id, x, y, entities = [], actions = [], extra = {}) => ({ id, position: { x, y }, entities, actions, ...extra });
const chat = (key) => ({ kind: 'chat', messageKey: key });
const setFlag = (flagId, expiresAfterSeconds) => ({ kind: 'flag', flagId, value: true, ...(expiresAfterSeconds ? { expiresAfterSeconds } : {}) });
const take = (itemId, amount = 1) => ({ kind: 'item', itemId, amount: -amount });
const give = (itemId, amount = 1) => ({ kind: 'item', itemId, amount });
const xp = (skillId, amount) => ({ kind: 'skill-xp', skillId, amount });
const xpReward = (skillId, amount) => ({ kind: 'skillXp', skillId, amount });
const hurt = (amount) => ({ kind: 'resource', resourceId: 'health', amount: -amount });
const relocate = (locationId) => ({ kind: 'relocate', locationId });
const dialogueResult = (dialogueId) => ({ kind: 'dialogue', dialogueId });

const action = (id, results, options = {}) => ({ id, instant: true, rewards: [], results, ...options });
const timed = (id, rewards, options = {}) => ({
  id,
  durationSeconds: options.durationSeconds ?? 2,
  rewards,
  ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'durationSeconds')),
});
const entity = (id, actions) => ({ id, actions });
// A station action has no fixed rewards/results/duration of its own — the UI
// populates its options from whichever `recipes` entries the player currently
// holds the ingredients for, so new items never require a new hardcoded action.
const station = (id, stationId) => ({ id, stationId, rewards: [] });
const ingredient = (itemId, amount = 1) => ({ itemId, amount });
const recipe = (id, stationId, inputs, outputs, options = {}) => ({ id, stationId, inputs, outputs, ...options });

// ---------------------------------------------------------------------------
// tutorial-island-reset — remove the wayside-crossroads starter world.
// ---------------------------------------------------------------------------
const reset = {
  ...moduleHeader('tutorial-island-reset', ['+base-core', '+wayside-supplies']),
  'data-updates': {
    remove: {
      locations: ['crossroads', 'emberwood', 'old-quarry'],
      entities: ['goblin', 'oak-tree', 'ent', 'ork', 'tutorial-guide'],
      actions: [
        'travel-crossroads-to-emberwood',
        'travel-emberwood-to-crossroads',
        'travel-crossroads-to-old-quarry',
        'travel-old-quarry-to-crossroads',
        'gather-rumors',
        'forage-embers',
        'survey-stonework',
        'mine-iron-ore-vein',
      ],
      dialogues: ['tutorial-guide'],
      collectionLogs: ['goblin-kills', 'oak-tree-kills', 'ent-kills', 'ork-kills'],
      items: ['wayside-token'],
    },
  },
};

// ---------------------------------------------------------------------------
// tutorial-island-foundation — shared stats/skills/items/flags/quest.
// ---------------------------------------------------------------------------
const itemNames = {
  gold: ['Gold', 'Small bright coins.'],
  lockpick: ['Lockpick', 'A bent bit of metal for impatient doors.'],
  note: ['Handwritten Note', "A note in someone else's hand, tossed onto a shelf."],
  'small-net': ['Small Net', 'A net suited to shallow shoals.'],
  'raw-shrimp': ['Raw Shrimp', 'Fresh and not yet dinner.'],
  'cooked-shrimp': ['Cooked Shrimp', 'A simple meal that keeps you going.'],
  herb: ['River Herb', 'A sleepy-smelling green herb.'],
  bowl: ['Bowl', 'Cracked, but still useful.'],
  'uncooked-sleeping-draught': ['Uncooked Sleeping Draught', 'A murky mix that needs heat.'],
  'sleeping-draught': ['Sleeping Draught', 'A warm draught with a suspiciously calm smell.'],
  'copper-ore': ['Copper Ore', 'A soft reddish ore.'],
  'tin-ore': ['Tin Ore', 'A pale chunk of tin-bearing stone.'],
  'bronze-bar': ['Bronze Bar', 'Freshly smelted bronze.'],
  'iron-dagger': ['Iron Dagger', "A sharp shortcut from Denzel's chest.", 'mainhand (1 attack), +3 attack'],
};

const foundation = {
  ...moduleHeader('tutorial-island-foundation', ['tutorial-island-reset']),
  data: {
    stats: [stat('fishing'), stat('cooking'), stat('thieving'), stat('smithing')],
    skills: [skill('fishing'), skill('cooking'), skill('thieving'), skill('smithing')],
    items: Object.entries(itemNames).map(([id, [, , tags]]) => {
      if (id === 'note') return { ...item(id, tags), actions: [action('read', [dialogueResult('note')])] };
      if (id === 'cooked-shrimp') {
        return { ...item(id, tags), actions: [action('eat', [take('cooked-shrimp'), setFlag('well-fed', 60), chat('chat.item.cooked-shrimp.eat')])] };
      }
      return item(id, tags);
    }),
    flags: [
      flag('tutorial.miki-cleared'),
      flag('tutorial.bridge-open'),
      flag('tutorial.gommi-asleep'),
      flag('tutorial.bank-visited'),
      flag('tutorial.mining-cleared'),
      flag('tutorial.combat-cleared'),
      flag('tutorial.cage-locked-by-orloth'),
      flag('tutorial.reached-mainland'),
      flag('quest.leave-tutorial-island.accepted'),
      flag('well-fed'),
      flag('tutorial.bookshelf-note-taken'),
      flag('tutorial.drawer-coins-taken'),
      flag('tutorial.drawer-lockpick-taken'),
      flag('tutorial.crate-net-taken'),
      flag('tutorial.crate-bowl-taken'),
    ],
    statModifiers: [
      { id: 'well-fed-regen-buff', statId: 'regeneration', amount: 3, kind: 'added', activeWhen: hasFlag('well-fed') },
    ],
    dialogues: [{ id: 'note', startNodeId: 'start', nodes: [{ id: 'start', narratorKey: 'dialogue.note.start' }] }],
    quests: [{
      id: 'leave-tutorial-island',
      titleKey: 'quest.leave-tutorial-island.title',
      stages: [
        { id: 'accept', descriptionKey: 'quest.leave-tutorial-island.stage.accept', condition: hasFlag('quest.leave-tutorial-island.accepted') },
        { id: 'leave-house', descriptionKey: 'quest.leave-tutorial-island.stage.leave-house', condition: hasFlag('tutorial.miki-cleared') },
        { id: 'visit-bank', descriptionKey: 'quest.leave-tutorial-island.stage.visit-bank', condition: hasFlag('tutorial.bank-visited') },
        { id: 'clear-mining', descriptionKey: 'quest.leave-tutorial-island.stage.clear-mining', condition: hasFlag('tutorial.mining-cleared') },
        { id: 'clear-combat', descriptionKey: 'quest.leave-tutorial-island.stage.clear-combat', condition: hasFlag('tutorial.combat-cleared') },
        { id: 'complete', descriptionKey: 'quest.leave-tutorial-island.stage.complete', condition: hasFlag('tutorial.reached-mainland') },
      ],
    }],
  },
  locale: {
    en: {
      'stat.fishing.title': 'Fishing', 'stat.fishing.description': 'Power applied to fishing actions.',
      'stat.cooking.title': 'Cooking', 'stat.cooking.description': 'Power applied to cooking actions.',
      'stat.thieving.title': 'Thieving', 'stat.thieving.description': 'Power applied to locks and sleight of hand.',
      'stat.smithing.title': 'Smithing', 'stat.smithing.description': 'Power applied to smelting and forging.',
      'skill.fishing.title': 'Fishing', 'skill.fishing.description': 'Catching food from open water.',
      'skill.cooking.title': 'Cooking', 'skill.cooking.description': 'Turning raw supplies into safer meals.',
      'skill.thieving.title': 'Thieving', 'skill.thieving.description': 'Opening what was meant to stay closed.',
      'skill.smithing.title': 'Smithing', 'skill.smithing.description': 'Smelting metal and shaping gear.',
      ...Object.fromEntries(Object.entries(itemNames).flatMap(([id, [title, description]]) => [
        [`item.${id}.title`, title],
        [`item.${id}.description`, description],
      ])),
      'quest.leave-tutorial-island.title': 'Leave Tutorial Island',
      'quest.leave-tutorial-island.stage.accept': 'You have not taken on a task yet. Someone in this house looks like they know the island — try talking to them.',
      'quest.leave-tutorial-island.stage.leave-house': 'Miki the tutorial guide has tasked you with finding a way off of tutorial island. Step one is probably to leave his house.',
      'quest.leave-tutorial-island.stage.visit-bank': "You have made it outside. Word is there is a bank somewhere along the coast — worth a look before you go much further.",
      'quest.leave-tutorial-island.stage.clear-mining': 'The bank is behind you now. Something below the island — through that trapdoor — is worth investigating.',
      'quest.leave-tutorial-island.stage.clear-combat': "You have got gear from the cave. Somewhere further in, Denzel mentioned voices — that is probably where you are headed next.",
      'quest.leave-tutorial-island.stage.complete': 'Whatever is holding the mainland back from you will not last much longer. Keep pushing.',
      'action.item.note.read.title': 'Read', 'action.item.note.read.description': 'Read the handwritten note.',
      'dialogue.note.start': "It reads:\n- Remember to tell them about the Quests tab.\n- Remember to explain the colors: red, yellow, green.\n- Remember to unlock the door before they leave.",
      'action.item.cooked-shrimp.eat.title': 'Eat', 'action.item.cooked-shrimp.eat.description': 'Eat the cooked shrimp.',
      'chat.item.cooked-shrimp.eat': 'Warmth spreads. You feel steadier for a while.',
      'modulePack.tutorial-island.title': 'Tutorial Island',
    },
  },
};

// ---------------------------------------------------------------------------
// tutorial-island-guide-house — module 1.
// ---------------------------------------------------------------------------
const guideHouse = {
  ...moduleHeader('tutorial-island-guide-house', ['tutorial-island-foundation']),
  data: {
    locations: [loc('tutorial-guide-house', 0, 0, ['miki', 'front-door', 'mirror', 'drawer', 'bookshelf'], [], { starting: true, tags: ['tutorial', 'indoors'] })],
    interactionTypes: [
      { id: 'lockpicking', sourceStatId: 'thieving', targetStatId: 'thieving', targetPlayerHealth: false },
    ],
    entities: [
      entity('miki', [
        action('talk', [dialogueResult('miki')]),
        action('examine', [chat('chat.entity.miki.examine')]),
      ]),
      entity('front-door', [
        timed('pick', [xpReward('thieving', 4)], {
          interactionTypeId: 'lockpicking',
          enemy: { interactionTypeId: 'lockpicking', stats: { attack: 0, defense: 3, health: 12, rate: 0 }, showHealthBar: true, rewards: [] },
          results: [setFlag('tutorial.miki-cleared'), setFlag('quest.leave-tutorial-island.accepted'), chat('chat.entity.front-door.pick')],
          visibleWhen: not(hasFlag('tutorial.miki-cleared')),
          requirements: hasItem('lockpick'),
        }),
        action('examine', [chat('chat.entity.front-door.examine')]),
      ]),
      entity('mirror', [action('look', [chat('chat.entity.mirror.look'), { kind: 'open-modal', modalId: 'name-editor' }])]),
      entity('drawer', [
        action('examine', [chat('chat.entity.drawer.examine-neither')], { visibleWhen: not(any(hasFlag('tutorial.drawer-coins-taken'), hasFlag('tutorial.drawer-lockpick-taken'))) }),
        action('examine-coins-only', [chat('chat.entity.drawer.examine-coins-only')], { visibleWhen: all(hasFlag('tutorial.drawer-coins-taken'), not(hasFlag('tutorial.drawer-lockpick-taken'))) }),
        action('examine-lockpick-only', [chat('chat.entity.drawer.examine-lockpick-only')], { visibleWhen: all(not(hasFlag('tutorial.drawer-coins-taken')), hasFlag('tutorial.drawer-lockpick-taken')) }),
        action('examine-both', [chat('chat.entity.drawer.examine-both')], { visibleWhen: all(hasFlag('tutorial.drawer-coins-taken'), hasFlag('tutorial.drawer-lockpick-taken')) }),
        action('take-coins', [give('gold', 5), setFlag('tutorial.drawer-coins-taken'), chat('chat.entity.drawer.take-coins')], { visibleWhen: not(hasFlag('tutorial.drawer-coins-taken')), maxCompletions: 1 }),
        action('take-lockpick', [give('lockpick'), setFlag('tutorial.drawer-lockpick-taken'), chat('chat.entity.drawer.take-lockpick')], { visibleWhen: not(hasFlag('tutorial.drawer-lockpick-taken')), maxCompletions: 1 }),
      ]),
      entity('bookshelf', [
        action('examine', [chat('chat.entity.bookshelf.examine-with-note')], { visibleWhen: not(hasFlag('tutorial.bookshelf-note-taken')) }),
        action('take-note', [give('note'), setFlag('tutorial.bookshelf-note-taken'), chat('chat.entity.bookshelf.take-note')], { visibleWhen: not(hasFlag('tutorial.bookshelf-note-taken')), maxCompletions: 1 }),
        action('examine-taken', [chat('chat.entity.bookshelf.examine-taken')], { visibleWhen: hasFlag('tutorial.bookshelf-note-taken') }),
      ]),
    ],
    dialogues: [{
      id: 'miki',
      startNodeId: 'start',
      nodes: [
        { id: 'start', speakerId: 'miki', textKey: 'dialogue.miki.start', options: [
          { id: 'ask-quests', labelKey: 'dialogue.miki.option.ask-quests', gotoNodeId: 'explain-quests' },
          { id: 'ask-colors', labelKey: 'dialogue.miki.option.ask-colors', gotoNodeId: 'explain-colors' },
          { id: 'impatient', labelKey: 'dialogue.miki.option.impatient', gotoNodeId: 'offer-quest' },
        ] },
        { id: 'explain-quests', speakerId: 'miki', textKey: 'dialogue.miki.explain-quests', options: [
          { id: 'ask-colors', labelKey: 'dialogue.miki.option.ask-colors', gotoNodeId: 'explain-colors' },
          { id: 'continue', labelKey: 'dialogue.miki.option.continue', gotoNodeId: 'offer-quest' },
        ] },
        { id: 'explain-colors', speakerId: 'miki', textKey: 'dialogue.miki.explain-colors', options: [
          { id: 'ask-quests', labelKey: 'dialogue.miki.option.ask-quests', gotoNodeId: 'explain-quests' },
          { id: 'continue', labelKey: 'dialogue.miki.option.continue', gotoNodeId: 'offer-quest' },
        ] },
        { id: 'offer-quest', speakerId: 'miki', textKey: 'dialogue.miki.offer-quest', options: [
          { id: 'accept', labelKey: 'dialogue.miki.option.accept', gotoNodeId: 'check-tab-prompt' },
          { id: 'not-yet', labelKey: 'dialogue.miki.option.not-yet', gotoNodeId: 'maybe-later' },
        ] },
        { id: 'maybe-later', speakerId: 'miki', textKey: 'dialogue.miki.maybe-later' },
        { id: 'check-tab-prompt', speakerId: 'miki', textKey: 'dialogue.miki.check-tab-prompt', options: [
          { id: 'checked', labelKey: 'dialogue.miki.option.checked', results: [setFlag('quest.leave-tutorial-island.accepted')], gotoNodeId: 'accept-node' },
        ] },
        { id: 'accept-node', speakerId: 'miki', textKey: 'dialogue.miki.accept-node', gotoNodeId: 'farewell' },
        { id: 'farewell', speakerId: 'miki', textKey: 'dialogue.miki.farewell', results: [setFlag('tutorial.miki-cleared')] },
      ],
    }],
  },
  locale: {
    en: {
      'location.tutorial-guide-house.title': 'Guide House',
      'location.tutorial-guide-house.description': 'A small room with a locked front door and too many helpful objects.',
      'location.tutorial-guide-house.exhausted': 'The room is quiet now.',
      'entity.miki.title': 'Miki',
      'entity.front-door.title': 'Front Door',
      'entity.mirror.title': 'Mirror',
      'entity.drawer.title': 'Drawer',
      'entity.bookshelf.title': 'Bookshelf',
      'interaction.lockpicking.title': 'Lockpicking',
      'interaction.lockpicking.player.hit': 'You work the lock and feel it give a little.',
      'interaction.lockpicking.player.miss': 'The lockpick slips without catching.',
      'interaction.lockpicking.player.kill': 'The lock finally gives.',
      'interaction.lockpicking.entity.hit': 'The lock does not fight back.',
      'interaction.lockpicking.entity.miss': 'The lock does not fight back.',
      'interaction.lockpicking.entity.kill': 'The lock does not fight back.',
      'action.entity.miki.talk.title': 'Talk', 'action.entity.miki.talk.description': 'Ask Miki about the island.',
      'action.entity.miki.examine.title': 'Examine', 'action.entity.miki.examine.description': 'Look at Miki.',
      'action.entity.front-door.pick.title': 'Pick Lock', 'action.entity.front-door.pick.description': 'Work the lock with the lockpick.',
      'action.entity.front-door.examine.title': 'Examine', 'action.entity.front-door.examine.description': 'Check the front door.',
      'action.entity.mirror.look.title': 'Look', 'action.entity.mirror.look.description': 'Catch your reflection.',
      'action.entity.drawer.examine.title': 'Examine', 'action.entity.drawer.examine.description': 'Examine the drawer.',
      'action.entity.drawer.examine-coins-only.title': 'Examine', 'action.entity.drawer.examine-coins-only.description': 'Examine the drawer.',
      'action.entity.drawer.examine-lockpick-only.title': 'Examine', 'action.entity.drawer.examine-lockpick-only.description': 'Examine the drawer.',
      'action.entity.drawer.examine-both.title': 'Examine', 'action.entity.drawer.examine-both.description': 'Examine the drawer.',
      'action.entity.drawer.take-coins.title': 'Take coins', 'action.entity.drawer.take-coins.description': 'Take the coins from the drawer.',
      'action.entity.drawer.take-lockpick.title': 'Take lockpick', 'action.entity.drawer.take-lockpick.description': 'Take the lockpick from the drawer.',
      'action.entity.bookshelf.examine.title': 'Examine', 'action.entity.bookshelf.examine.description': 'Examine the bookshelf.',
      'action.entity.bookshelf.examine-taken.title': 'Examine', 'action.entity.bookshelf.examine-taken.description': 'Examine the bookshelf.',
      'action.entity.bookshelf.take-note.title': 'Take note', 'action.entity.bookshelf.take-note.description': 'Take the handwritten note.',
      'chat.entity.miki.examine': 'A guide with one eye on the door.',
      'chat.entity.front-door.examine': 'A heavy door. The keyhole looks scratched, like someone was here before you.',
      'chat.entity.front-door.pick': 'The lock gives with a soft click. Whatever is out there, you can reach it now.',
      'chat.entity.mirror.look': 'You catch your reflection. Something about it does not feel like you yet.',
      'chat.entity.drawer.examine-neither': 'You examine the drawer. A drawer full of random stuff. You see some coins on the bottom as well as a worn set of lockpicks.',
      'chat.entity.drawer.examine-coins-only': 'A cluttered drawer with a worn set of lockpicks at the bottom.',
      'chat.entity.drawer.examine-lockpick-only': 'A cluttered drawer with a few coins scattered among the junk.',
      'chat.entity.drawer.examine-both': 'A drawer full of random junk.',
      'chat.entity.drawer.take-coins': 'You take the coins.',
      'chat.entity.drawer.take-lockpick': 'You take the lockpick.',
      'chat.entity.bookshelf.examine-with-note': 'A packed bookshelf with leather bound tomes. There is a handwritten note tossed on the second shelf.',
      'chat.entity.bookshelf.examine-taken': 'A packed bookshelf with leather bound tomes.',
      'chat.entity.bookshelf.take-note': 'You take the note.',
      'dialogue.miki.start': "Oh — hi. You're the new arrival, right? I'm Miki, I look after new folks passing through here. What's on your mind before you head out?",
      'dialogue.miki.option.ask-quests': "What's this Quests tab I keep hearing about?",
      'dialogue.miki.option.ask-colors': 'What do the colors mean?',
      'dialogue.miki.option.impatient': "I'm ready to go, thanks.",
      'dialogue.miki.option.continue': "Anyway — go on.",
      'dialogue.miki.explain-quests': "Right, the Quests tab — it's under Character, second row. Anything you take on shows up there with a line about what to do next. Handy when you forget what you were doing five minutes ago. Which, no judgment, happens to everyone here.",
      'dialogue.miki.explain-colors': "Quick version: red means you haven't started something, yellow means you're partway through, green means it's done. Glance at the dot before you open anything if you just want the status.",
      'dialogue.miki.offer-quest': 'Speaking of which — want an actual task instead of just wandering? I can point you somewhere real.',
      'dialogue.miki.option.not-yet': 'Maybe later.',
      'dialogue.miki.maybe-later': "Sure thing. Door's right there whenever you want to explore first — come find me again when you're ready.",
      'dialogue.miki.option.accept': 'Go on then, give me something to do.',
      'dialogue.miki.check-tab-prompt': "Take a look at your Quests tab right now — you'll see it listed, red, since you haven't actually started it yet. Go on, I'll wait.",
      'dialogue.miki.option.checked': 'Okay, I see it.',
      'dialogue.miki.accept-node': "There — now it should read yellow. That's you, officially underway. Leave Tutorial Island: find your way off this place.",
      'dialogue.miki.farewell': "Door's unlocked. Go on, get curious.",
    },
  },
};

// ---------------------------------------------------------------------------
// tutorial-island-survival — module 2.
// ---------------------------------------------------------------------------
const survival = {
  ...moduleHeader('tutorial-island-survival', ['tutorial-island-guide-house']),
  data: {
    locations: [
      loc('tutorial-beach', 180, 0, ['brianna', 'shoals', 'campfire', 'supply-crate', 'bridge-sign'], ['travel-beach-to-house', 'travel-beach-to-hermit-grove', 'travel-beach-to-bridge'], { tags: ['tutorial', 'shore'] }),
      loc('tutorial-hermit-grove', 180, -120, ['hermit', 'herb-patch', 'cracked-bowl'], ['travel-hermit-grove-to-beach'], { tags: ['tutorial', 'forest'] }),
      loc('tutorial-bridge', 360, 0, ['gommi', 'river', 'loose-plank'], ['travel-bridge-to-beach'], { tags: ['tutorial', 'river'] }),
    ],
    actions: [
      { id: 'travel-house-to-beach', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-beach')], visibleWhen: hasFlag('tutorial.miki-cleared') },
      { id: 'travel-beach-to-house', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-guide-house')] },
      { id: 'travel-beach-to-hermit-grove', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-hermit-grove')] },
      { id: 'travel-hermit-grove-to-beach', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-beach')] },
      { id: 'travel-beach-to-bridge', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-bridge')] },
      { id: 'travel-bridge-to-beach', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-beach')] },
    ],
    entities: [
      entity('brianna', [action('talk', [dialogueResult('brianna')])]),
      entity('shoals', [
        timed('fish', [xpReward('fishing', 4), give('raw-shrimp', 1)], { requirements: hasItem('small-net') }),
        action('examine', [chat('chat.entity.shoals.examine')]),
      ]),
      entity('campfire', [
        station('cook', 'tutorial-campfire'),
      ]),
      entity('supply-crate', [
        action('examine', [chat('chat.entity.supply-crate.examine-neither')], { visibleWhen: not(any(hasFlag('tutorial.crate-net-taken'), hasFlag('tutorial.crate-bowl-taken'))) }),
        action('examine-net-only', [chat('chat.entity.supply-crate.examine-net-only')], { visibleWhen: all(hasFlag('tutorial.crate-net-taken'), not(hasFlag('tutorial.crate-bowl-taken'))) }),
        action('examine-bowl-only', [chat('chat.entity.supply-crate.examine-bowl-only')], { visibleWhen: all(not(hasFlag('tutorial.crate-net-taken')), hasFlag('tutorial.crate-bowl-taken')) }),
        action('examine-both', [chat('chat.entity.supply-crate.examine-both')], { visibleWhen: all(hasFlag('tutorial.crate-net-taken'), hasFlag('tutorial.crate-bowl-taken')) }),
        action('take-net', [give('small-net'), setFlag('tutorial.crate-net-taken'), chat('chat.entity.supply-crate.take-net')], { visibleWhen: not(hasFlag('tutorial.crate-net-taken')), maxCompletions: 1 }),
        action('take-bowl', [give('bowl'), setFlag('tutorial.crate-bowl-taken'), chat('chat.entity.supply-crate.take-bowl')], { visibleWhen: not(hasFlag('tutorial.crate-bowl-taken')), maxCompletions: 1 }),
      ]),
      entity('bridge-sign', [action('read', [chat('chat.entity.bridge-sign.read')])]),
      entity('hermit', [action('talk', [dialogueResult('hermit')])]),
      entity('herb-patch', [timed('gather', [], { results: [give('herb', 1)] })]),
      entity('cracked-bowl', [
        action('take', [give('bowl'), chat('chat.entity.cracked-bowl.take')], { maxCompletions: 1 }),
        timed('combine', [xpReward('cooking', 2)], { requirements: all(hasItem('raw-shrimp'), hasItem('herb'), hasItem('bowl')), results: [take('raw-shrimp'), take('herb'), give('uncooked-sleeping-draught')] }),
      ]),
      entity('river', [
        action('use-draught', [take('sleeping-draught'), setFlag('tutorial.gommi-asleep'), chat('chat.entity.river.use-draught')], { requirements: hasItem('sleeping-draught') }),
        action('examine', [chat('chat.entity.river.examine')]),
      ]),
      entity('gommi', [
        action('pay-toll', [take('cooked-shrimp'), setFlag('tutorial.bridge-open'), chat('chat.entity.gommi.pay-toll')], { requirements: hasItem('cooked-shrimp'), visibleWhen: not(any(hasFlag('tutorial.bridge-open'), hasFlag('tutorial.gommi-asleep'))) }),
        action('examine', [chat('chat.entity.gommi.examine')], { visibleWhen: not(hasFlag('tutorial.gommi-asleep')) }),
        action('examine-asleep', [chat('chat.entity.gommi.examine-asleep')], { visibleWhen: hasFlag('tutorial.gommi-asleep') }),
      ]),
      entity('loose-plank', [action('examine', [chat('chat.entity.loose-plank.examine')])]),
    ],
    dialogues: [
      { id: 'brianna', startNodeId: 'start', nodes: [
        { id: 'start', speakerId: 'brianna', textKey: 'dialogue.brianna.start', options: [
          { id: 'ask-how', labelKey: 'dialogue.brianna.option.ask-how', gotoNodeId: 'explain-food' },
          { id: 'impatient', labelKey: 'dialogue.brianna.option.impatient', gotoNodeId: 'close' },
        ] },
        { id: 'explain-food', speakerId: 'brianna', textKey: 'dialogue.brianna.explain-food', options: [
          { id: 'ask-why-eat', labelKey: 'dialogue.brianna.option.ask-why-eat', gotoNodeId: 'explain-buff' },
          { id: 'continue', labelKey: 'dialogue.brianna.option.continue', gotoNodeId: 'close' },
        ] },
        { id: 'explain-buff', speakerId: 'brianna', textKey: 'dialogue.brianna.explain-buff', options: [
          { id: 'continue', labelKey: 'dialogue.brianna.option.continue', gotoNodeId: 'close' },
        ] },
        { id: 'close', speakerId: 'brianna', textKey: 'dialogue.brianna.close' },
      ] },
      { id: 'hermit', startNodeId: 'start', nodes: [
        { id: 'start', speakerId: 'hermit', textKey: 'dialogue.hermit.start', options: [
          { id: 'ask-help', labelKey: 'dialogue.hermit.option.ask-help', gotoNodeId: 'explain-draught' },
          { id: 'impatient', labelKey: 'dialogue.hermit.option.impatient', gotoNodeId: 'close' },
        ] },
        { id: 'explain-draught', speakerId: 'hermit', textKey: 'dialogue.hermit.explain-draught', options: [
          { id: 'continue', labelKey: 'dialogue.hermit.option.continue', gotoNodeId: 'close' },
        ] },
        { id: 'close', speakerId: 'hermit', textKey: 'dialogue.hermit.close' },
      ] },
    ],
    recipes: [
      recipe('cook-shrimp', 'tutorial-campfire', [ingredient('raw-shrimp')], [ingredient('cooked-shrimp')], { skillId: 'cooking', xpAmount: 4 }),
      recipe('cook-draught', 'tutorial-campfire', [ingredient('uncooked-sleeping-draught')], [ingredient('sleeping-draught')], { skillId: 'cooking', xpAmount: 6 }),
    ],
  },
  'data-updates': {
    patches: [
      { targetModId: 'tutorial-island-guide-house', objectType: 'locations', objectId: 'tutorial-guide-house', ops: [{ op: 'add', path: '/actions/-', value: 'travel-house-to-beach' }] },
    ],
  },
  locale: {
    en: {
      'location.tutorial-beach.title': 'Shell Beach', 'location.tutorial-beach.description': 'Low shoals glitter beside a smoky campfire.', 'location.tutorial-beach.exhausted': 'The beach settles into gull cries and surf.',
      'location.tutorial-hermit-grove.title': 'Hermit Grove', 'location.tutorial-hermit-grove.description': 'Herbs grow around a weathered hut beyond the palms.', 'location.tutorial-hermit-grove.exhausted': 'The grove smells of crushed leaves.',
      'location.tutorial-bridge.title': 'Bridge Toll', 'location.tutorial-bridge.description': 'A narrow bridge crosses the river. Something large waits below.', 'location.tutorial-bridge.exhausted': 'The river keeps sliding past.',
      'entity.brianna.title': 'Brianna', 'entity.shoals.title': 'Shrimp Shoals', 'entity.campfire.title': 'Campfire', 'entity.supply-crate.title': 'Supply Crate', 'entity.bridge-sign.title': 'Bridge Sign',
      'entity.hermit.title': 'Hermit', 'entity.herb-patch.title': 'Herb Patch', 'entity.cracked-bowl.title': 'Cracked Bowl',
      'entity.river.title': 'River', 'entity.gommi.title': 'Gommi', 'entity.loose-plank.title': 'Loose Plank',
      'action.travel-house-to-beach.title': 'Travel to Shell Beach', 'action.travel-house-to-beach.success': 'You arrive.',
      'action.travel-beach-to-house.title': 'Travel to Guide House', 'action.travel-beach-to-house.success': 'You arrive.',
      'action.travel-beach-to-hermit-grove.title': 'Travel to Hermit Grove', 'action.travel-beach-to-hermit-grove.success': 'You arrive.',
      'action.travel-hermit-grove-to-beach.title': 'Travel to Shell Beach', 'action.travel-hermit-grove-to-beach.success': 'You arrive.',
      'action.travel-beach-to-bridge.title': 'Travel to Bridge Toll', 'action.travel-beach-to-bridge.success': 'You arrive.',
      'action.travel-bridge-to-beach.title': 'Travel to Shell Beach', 'action.travel-bridge-to-beach.success': 'You arrive.',
      'action.entity.brianna.talk.title': 'Talk', 'action.entity.brianna.talk.description': 'Ask about surviving here.',
      'action.entity.shoals.fish.title': 'Fish', 'action.entity.shoals.fish.description': 'Sweep the shallows with a small net.',
      'action.entity.shoals.examine.title': 'Examine', 'action.entity.shoals.examine.description': 'Look into the shoals.',
      'action.entity.campfire.cook.title': 'Cook', 'action.entity.campfire.cook.description': 'Cook whatever you are carrying that the fire can warm.', 'action.entity.campfire.cook.success': 'It is ready.',
      'action.entity.supply-crate.examine.title': 'Examine', 'action.entity.supply-crate.examine.description': 'Examine the open crate.',
      'action.entity.supply-crate.examine-net-only.title': 'Examine', 'action.entity.supply-crate.examine-net-only.description': 'Examine the open crate.',
      'action.entity.supply-crate.examine-bowl-only.title': 'Examine', 'action.entity.supply-crate.examine-bowl-only.description': 'Examine the open crate.',
      'action.entity.supply-crate.examine-both.title': 'Examine', 'action.entity.supply-crate.examine-both.description': 'Examine the open crate.',
      'action.entity.supply-crate.take-net.title': 'Take net', 'action.entity.supply-crate.take-net.description': 'Take the small net.',
      'action.entity.supply-crate.take-bowl.title': 'Take bowl', 'action.entity.supply-crate.take-bowl.description': 'Take the bowl.',
      'action.entity.bridge-sign.read.title': 'Read', 'action.entity.bridge-sign.read.description': 'Read the rough bridge sign.',
      'action.entity.hermit.talk.title': 'Talk', 'action.entity.hermit.talk.description': 'Ask the hermit about the river.',
      'action.entity.herb-patch.gather.title': 'Gather', 'action.entity.herb-patch.gather.description': 'Pick a sleepy-smelling herb.',
      'action.entity.cracked-bowl.take.title': 'Take', 'action.entity.cracked-bowl.take.description': 'Take the cracked bowl.',
      'action.entity.cracked-bowl.combine.title': 'Combine', 'action.entity.cracked-bowl.combine.description': 'Mix shrimp and herb in the bowl.',
      'action.entity.river.use-draught.title': 'Use Draught', 'action.entity.river.use-draught.description': 'Pour the draught into the slow eddy.',
      'action.entity.river.examine.title': 'Examine', 'action.entity.river.examine.description': 'Watch the river.',
      'action.entity.gommi.pay-toll.title': 'Pay Toll', 'action.entity.gommi.pay-toll.description': 'Offer cooked food at the bridge.',
      'action.entity.gommi.examine.title': 'Examine', 'action.entity.gommi.examine.description': 'Look under the bridge.',
      'action.entity.gommi.examine-asleep.title': 'Examine', 'action.entity.gommi.examine-asleep.description': 'Look under the bridge.',
      'action.entity.loose-plank.examine.title': 'Examine', 'action.entity.loose-plank.examine.description': 'Check the loose plank.',
      'chat.entity.shoals.examine': 'Shrimp dart away from your shadow.',
      'chat.entity.supply-crate.examine-neither': 'A net and bowl sit on top, practically accusing you of missing them.',
      'chat.entity.supply-crate.examine-net-only': 'A bowl still sits at the bottom of the crate.',
      'chat.entity.supply-crate.examine-bowl-only': 'A small net still sits at the bottom of the crate.',
      'chat.entity.supply-crate.examine-both': 'An empty supply crate. Nothing left worth taking.',
      'chat.entity.supply-crate.take-net': 'You take the small net.',
      'chat.entity.supply-crate.take-bowl': 'You take the bowl.',
      'chat.entity.bridge-sign.read': 'The word FOOD is carved deeper than the rest.',
      'chat.entity.cracked-bowl.take': 'The bowl leaves a damp ring behind.',
      'chat.entity.river.use-draught': 'Gommi slumps under the bridge, snoring like a sawmill.',
      'chat.entity.river.examine': 'A slow eddy curls under Gommi’s bridge, deep enough to carry a cupful without a splash.',
      'chat.entity.gommi.pay-toll': 'Gommi eats first and negotiates never.',
      'chat.entity.gommi.examine': 'Big hands. Bigger appetite. He watches every snack that crosses the bridge.',
      'chat.entity.gommi.examine-asleep': 'Gommi is out cold, snoring louder than the river.',
      'chat.entity.loose-plank.examine': 'A tempting plank, but it wobbles and would not hold your weight over open water.',
      'dialogue.brianna.start': "You look hungry. Don't worry, we all showed up half-starved. Want the rundown?",
      'dialogue.brianna.option.ask-how': "Sure, what do I do?",
      'dialogue.brianna.option.impatient': "I'll figure it out.",
      'dialogue.brianna.explain-food': "Net from the crate, shrimp from the shoals, heat from the campfire. Simple enough once you've done it twice.",
      'dialogue.brianna.option.ask-why-eat': "Why bother eating, though?",
      'dialogue.brianna.option.continue': 'Got it, thanks.',
      'dialogue.brianna.explain-buff': "A hot meal makes you feel steadier for a while — your body recovers a bit faster than usual. Worth having a shrimp cooked and ready before you go looking for trouble.",
      'dialogue.brianna.close': 'Good luck out there.',
      'dialogue.hermit.start': "Hrmph. Another one. What do you want?",
      'dialogue.hermit.option.ask-help': "I could use some advice.",
      'dialogue.hermit.option.impatient': "Never mind.",
      'dialogue.hermit.explain-draught': "Fish and herb, mixed in a bowl, then warmed. What comes out sleeps whatever drinks it. Rivers carry things further than people expect — further than a bridge, even.",
      'dialogue.hermit.option.continue': 'Noted.',
      'dialogue.hermit.close': "Don't mix up the bowls.",
    },
  },
};

// ---------------------------------------------------------------------------
// tutorial-island-bank — module 3.
// ---------------------------------------------------------------------------
const bank = {
  ...moduleHeader('tutorial-island-bank', ['tutorial-island-survival']),
  data: {
    locations: [loc('tutorial-bank', 520, 0, ['bank-teller', 'trapdoor'], [], { tags: ['tutorial', 'settlement'] })],
    actions: [{ id: 'travel-bridge-to-bank', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-bank')] }],
    entities: [
      entity('bank-teller', [action('talk', [dialogueResult('bank-teller'), setFlag('tutorial.bank-visited')])]),
      entity('trapdoor', [action('examine', [chat('chat.entity.trapdoor.examine')])]),
    ],
    dialogues: [{
      id: 'bank-teller',
      startNodeId: 'start',
      nodes: [
        { id: 'start', speakerId: 'bank-teller', textKey: 'dialogue.bank-teller.start', options: [
          { id: 'ask-how', labelKey: 'dialogue.bank-teller.option.ask-how', gotoNodeId: 'explain' },
          { id: 'show-me', labelKey: 'dialogue.bank-teller.option.show-me', gotoNodeId: 'show-vault' },
        ] },
        { id: 'explain', speakerId: 'bank-teller', textKey: 'dialogue.bank-teller.explain', options: [
          { id: 'show-me', labelKey: 'dialogue.bank-teller.option.show-me', gotoNodeId: 'show-vault' },
          { id: 'not-now', labelKey: 'dialogue.bank-teller.option.not-now', gotoNodeId: 'not-now' },
        ] },
        { id: 'show-vault', speakerId: 'bank-teller', textKey: 'dialogue.bank-teller.show-vault', results: [{ kind: 'open-modal', modalId: 'bank' }] },
        { id: 'not-now', speakerId: 'bank-teller', textKey: 'dialogue.bank-teller.not-now' },
      ],
    }],
  },
  'data-updates': {
    patches: [{ targetModId: 'tutorial-island-survival', objectType: 'locations', objectId: 'tutorial-bridge', ops: [{ op: 'add', path: '/actions/-', value: 'travel-bridge-to-bank' }] }],
  },
  locale: {
    en: {
      'location.tutorial-bank.title': 'Island Bank', 'location.tutorial-bank.description': 'A tidy counter and an open trapdoor share the room.', 'location.tutorial-bank.exhausted': 'The teller returns to sorting coins.',
      'action.travel-bridge-to-bank.title': 'Travel to Island Bank', 'action.travel-bridge-to-bank.success': 'You arrive.',
      'entity.bank-teller.title': 'Bank Teller', 'entity.trapdoor.title': 'Trapdoor',
      'action.entity.bank-teller.talk.title': 'Talk', 'action.entity.bank-teller.talk.description': 'Ask about banking.',
      'action.entity.trapdoor.examine.title': 'Examine', 'action.entity.trapdoor.examine.description': 'Look down the open trapdoor.',
      'chat.entity.trapdoor.examine': 'A ladder disappears into the dark below. Someone left it open on purpose.',
      'dialogue.bank-teller.start': "Afternoon. Haven't seen you before — first time at a bank?",
      'dialogue.bank-teller.option.ask-how': 'How does this work?',
      'dialogue.bank-teller.option.show-me': 'Show me.',
      'dialogue.bank-teller.explain': "Every bank shares one account, anywhere in the world — deposit here, withdraw anywhere. Your pack only holds so many different kinds of things at once, so once it fills up, this is where the rest goes. You've already got a little gold sitting in yours.",
      'dialogue.bank-teller.option.not-now': 'Not right now.',
      'dialogue.bank-teller.show-vault': 'Here you go — have a look.',
      'dialogue.bank-teller.not-now': 'Come back whenever. The vault is not going anywhere.',
    },
  },
};

// ---------------------------------------------------------------------------
// tutorial-island-mining — module 4.
// ---------------------------------------------------------------------------
const mining = {
  ...moduleHeader('tutorial-island-mining', ['tutorial-island-bank']),
  data: {
    locations: [
      loc('tutorial-mine', 520, 140, ['denzel', 'copper-rock', 'tin-rock', 'locked-chest', 'mine-tunnel'], [], { tags: ['tutorial', 'cave'] }),
      loc('tutorial-forge', 680, 140, ['furnace', 'anvil', 'forge-table'], [], { tags: ['tutorial', 'cave'] }),
    ],
    actions: [{ id: 'descend-to-mine', role: 'travel', durationSeconds: 1, rewards: [], results: [relocate('tutorial-mine')] }],
    entities: [
      entity('denzel', [
        action('talk', [give('bronze-pickaxe', 1), dialogueResult('denzel')], { maxCompletions: 1 }),
        action('examine', [chat('chat.entity.denzel.examine')]),
      ]),
      entity('copper-rock', [timed('mine', [xpReward('mining', 5), give('copper-ore', 1)], { requirements: { kind: 'item-tag', tag: 'pickaxe' } })]),
      entity('tin-rock', [timed('mine', [xpReward('mining', 5), give('tin-ore', 1)], { requirements: { kind: 'item-tag', tag: 'pickaxe' } })]),
      entity('locked-chest', [
        action('pick', [xp('thieving', 25), give('copper-ore', 2), give('tin-ore', 2), give('iron-dagger', 1), setFlag('tutorial.mining-cleared'), chat('chat.entity.locked-chest.pick')], { requirements: hasItem('lockpick'), chance: 50, failureResults: [hurt(3), chat('chat.entity.locked-chest.fail')] }),
        action('examine', [chat('chat.entity.locked-chest.examine')]),
      ]),
      entity('mine-tunnel', [action('enter-forge', [relocate('tutorial-forge')])]),
      entity('furnace', [station('smelt', 'tutorial-furnace')]),
      entity('anvil', [station('smith', 'tutorial-anvil')]),
      entity('forge-table', [action('return-mine', [relocate('tutorial-mine')])]),
    ],
    dialogues: [{ id: 'denzel', startNodeId: 'start', nodes: [
      { id: 'start', speakerId: 'denzel', textKey: 'dialogue.denzel.start', options: [
        { id: 'ask-how', labelKey: 'dialogue.denzel.option.ask-how', gotoNodeId: 'explain-smithing' },
        { id: 'ask-sentence', labelKey: 'dialogue.denzel.option.ask-sentence', gotoNodeId: 'explain-sentence' },
        { id: 'impatient', labelKey: 'dialogue.denzel.option.impatient', gotoNodeId: 'close' },
      ] },
      { id: 'explain-smithing', speakerId: 'denzel', textKey: 'dialogue.denzel.explain-smithing', options: [
        { id: 'ask-sentence', labelKey: 'dialogue.denzel.option.ask-sentence', gotoNodeId: 'explain-sentence' },
        { id: 'continue', labelKey: 'dialogue.denzel.option.continue', gotoNodeId: 'close' },
      ] },
      { id: 'explain-sentence', speakerId: 'denzel', textKey: 'dialogue.denzel.explain-sentence', options: [
        { id: 'continue', labelKey: 'dialogue.denzel.option.continue', gotoNodeId: 'close' },
      ] },
      { id: 'close', speakerId: 'denzel', textKey: 'dialogue.denzel.close' },
    ] }],
    recipes: [
      recipe('smelt-bronze', 'tutorial-furnace', [ingredient('copper-ore'), ingredient('tin-ore')], [ingredient('bronze-bar')], { skillId: 'smithing', xpAmount: 8 }),
      recipe('smith-dagger', 'tutorial-anvil', [ingredient('bronze-bar')], [ingredient('bronze-dagger')], { skillId: 'smithing', xpAmount: 10, extraResults: [setFlag('tutorial.mining-cleared')] }),
    ],
  },
  'data-updates': {
    patches: [{ targetModId: 'tutorial-island-bank', objectType: 'locations', objectId: 'tutorial-bank', ops: [{ op: 'add', path: '/actions/-', value: 'descend-to-mine' }] }],
  },
  locale: {
    en: {
      'action.descend-to-mine.title': 'Descend', 'action.descend-to-mine.description': 'Climb down the open trapdoor.', 'action.descend-to-mine.success': 'You climb into the cave below.',
      'location.tutorial-mine.title': 'Training Mine', 'location.tutorial-mine.description': 'Copper and tin glint in a cramped cave.', 'location.tutorial-mine.exhausted': 'Dust hangs in the lamplight.',
      'location.tutorial-forge.title': 'Cave Forge', 'location.tutorial-forge.description': 'A furnace and anvil are wedged into a hot alcove.', 'location.tutorial-forge.exhausted': 'The forge pops and cools.',
      'entity.denzel.title': 'Denzel', 'entity.copper-rock.title': 'Copper Rock', 'entity.tin-rock.title': 'Tin Rock', 'entity.locked-chest.title': 'Locked Chest', 'entity.mine-tunnel.title': 'Mine Tunnel',
      'entity.furnace.title': 'Furnace', 'entity.anvil.title': 'Anvil', 'entity.forge-table.title': 'Forge Table',
      'action.entity.denzel.talk.title': 'Talk', 'action.entity.denzel.talk.description': 'Ask about mining.', 'action.entity.denzel.talk.success': 'Denzel hands over a pickaxe and points at the rocks.',
      'action.entity.denzel.examine.title': 'Examine', 'action.entity.denzel.examine.description': 'Look at Denzel.',
      'action.entity.copper-rock.mine.title': 'Mine Copper', 'action.entity.copper-rock.mine.description': 'Mine a copper rock.',
      'action.entity.tin-rock.mine.title': 'Mine Tin', 'action.entity.tin-rock.mine.description': 'Mine a tin rock.',
      'action.entity.locked-chest.pick.title': 'Pick Lock', 'action.entity.locked-chest.pick.description': "Try Denzel's personal chest.",
      'action.entity.locked-chest.examine.title': 'Examine', 'action.entity.locked-chest.examine.description': 'Check the chest.',
      'action.entity.mine-tunnel.enter-forge.title': 'Enter Forge', 'action.entity.mine-tunnel.enter-forge.description': 'Walk deeper to the forge alcove.', 'action.entity.mine-tunnel.enter-forge.success': 'You reach the forge.',
      'action.entity.furnace.smelt.title': 'Smelt', 'action.entity.furnace.smelt.description': 'Smelt whatever ores you are carrying that the furnace can use.', 'action.entity.furnace.smelt.success': 'The metal is ready.',
      'action.entity.anvil.smith.title': 'Smith', 'action.entity.anvil.smith.description': 'Hammer whatever bars you are carrying into shape.', 'action.entity.anvil.smith.success': 'The piece is done.',
      'action.entity.forge-table.return-mine.title': 'Return', 'action.entity.forge-table.return-mine.description': 'Return to the mine chamber.', 'action.entity.forge-table.return-mine.success': "You return to Denzel's chamber.",
      'chat.entity.denzel.examine': 'Denzel keeps glancing at the chest, then pretending he did not.',
      'chat.entity.locked-chest.pick': 'The lock gives all at once, spilling ore, bars, and a dagger better than anything at the anvil.',
      'chat.entity.locked-chest.fail': 'The lock bites back. That was going to leave a mark either way.',
      'chat.entity.locked-chest.examine': 'A prison-issue padlock, guarding something better than rocks.',
      'dialogue.denzel.start': "Pickaxe's yours, don't lose it. Rocks are through there. Anything else before you start swinging?",
      'dialogue.denzel.option.ask-how': "What am I actually making?",
      'dialogue.denzel.option.ask-sentence': "Why are you down here, anyway?",
      'dialogue.denzel.option.impatient': "Nothing, I'm good.",
      'dialogue.denzel.explain-smithing': "Copper plus tin makes bronze. Furnace first, anvil second — smelt it, then shape it. Simple, if you don't rush the furnace.",
      'dialogue.denzel.option.continue': "Makes sense.",
      'dialogue.denzel.explain-sentence': "Let's just say this posting is part of my... sentence. I'd be out of here already if I hadn't drawn it. And don't touch the chest — that's not a hint, that's a rule.",
      'dialogue.denzel.close': "Go on, then. Rocks won't mine themselves.",
    },
  },
};

// ---------------------------------------------------------------------------
// tutorial-island-combat — module 5 + 6.
// ---------------------------------------------------------------------------
const combat = {
  ...moduleHeader('tutorial-island-combat', ['tutorial-island-mining']),
  data: {
    locations: [
      loc('tutorial-rat-cage', 840, 140, ['orloth', 'giant-rat', 'rat-cage-door', 'portal'], [], { tags: ['tutorial', 'cave'] }),
      loc('mainland-arrival', 1040, 120, ['mainland-greeter'], [], { tags: ['mainland'] }),
    ],
    entities: [
      entity('orloth', [
        action('talk', [dialogueResult('orloth')]),
        action('fight', [hurt(4), xp('attack', 60), xp('defense', 30), setFlag('tutorial.combat-cleared'), setFlag('tutorial.cage-locked-by-orloth'), chat('chat.entity.orloth.fight')], { visibleWhen: not(hasFlag('tutorial.combat-cleared')) }),
      ]),
      entity('giant-rat', [timed('fight', [xpReward('attack', 20), xpReward('defense', 10)], {
        interactionTypeId: 'melee-combat',
        enemy: { interactionTypeId: 'melee-combat', stats: { attack: 1, defense: 1, health: 5, rate: 20 }, showHealthBar: true, rewards: [] },
        results: [setFlag('tutorial.combat-cleared')],
        visibleWhen: not(hasFlag('tutorial.cage-locked-by-orloth')),
        maxCompletions: 3,
      })]),
      entity('rat-cage-door', [
        action('unlock-orloth', [chat('chat.entity.rat-cage-door.unlock-orloth')], { requirements: hasItem('lockpick'), visibleWhen: hasFlag('tutorial.cage-locked-by-orloth') }),
        action('unlock', [chat('chat.entity.rat-cage-door.unlock')], { requirements: hasItem('lockpick'), visibleWhen: all(hasFlag('tutorial.combat-cleared'), not(hasFlag('tutorial.cage-locked-by-orloth'))) }),
      ]),
      entity('portal', [
        action('step-through', [setFlag('tutorial.reached-mainland'), { kind: 'set-spawn', locationId: 'mainland-arrival' }, relocate('mainland-arrival')], { visibleWhen: hasFlag('tutorial.combat-cleared') }),
      ]),
      entity('mainland-greeter', [action('talk', [dialogueResult('mainland-greeter')])]),
    ],
    dialogues: [
      { id: 'orloth', startNodeId: 'start', nodes: [
        { id: 'start', speakerId: 'orloth', textKey: 'dialogue.orloth.start', options: [
          { id: 'ask-equip', labelKey: 'dialogue.orloth.option.ask-equip', gotoNodeId: 'explain-equip' },
          { id: 'ask-stats', labelKey: 'dialogue.orloth.option.ask-stats', gotoNodeId: 'explain-stats' },
          { id: 'impatient', labelKey: 'dialogue.orloth.option.impatient', gotoNodeId: 'close' },
        ] },
        { id: 'explain-equip', speakerId: 'orloth', textKey: 'dialogue.orloth.explain-equip', options: [
          { id: 'ask-stats', labelKey: 'dialogue.orloth.option.ask-stats', gotoNodeId: 'explain-stats' },
          { id: 'continue', labelKey: 'dialogue.orloth.option.continue', gotoNodeId: 'close' },
        ] },
        { id: 'explain-stats', speakerId: 'orloth', textKey: 'dialogue.orloth.explain-stats', options: [
          { id: 'continue', labelKey: 'dialogue.orloth.option.continue', gotoNodeId: 'close' },
        ] },
        { id: 'close', speakerId: 'orloth', textKey: 'dialogue.orloth.close' },
      ] },
      { id: 'mainland-greeter', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'mainland-greeter', textKey: 'dialogue.mainland-greeter.start' }] },
    ],
  },
  'data-updates': {
    patches: [{ targetModId: 'tutorial-island-mining', objectType: 'entities', objectId: 'forge-table', ops: [{ op: 'add', path: '/actions/-', value: action('continue', [relocate('tutorial-rat-cage')]) }] }],
  },
  locale: {
    en: {
      'location.tutorial-rat-cage.title': 'Combat Cage', 'location.tutorial-rat-cage.description': 'A rat cage, a portal, and a broad-shouldered instructor wait underground.', 'location.tutorial-rat-cage.exhausted': 'The cage is still.',
      'location.mainland-arrival.title': 'Mainland Pier', 'location.mainland-arrival.description': 'Open roads begin beyond a salt-stained pier.', 'location.mainland-arrival.exhausted': 'The pier creaks gently.',
      'entity.orloth.title': 'Orloth', 'entity.giant-rat.title': 'Giant Rat', 'entity.rat-cage-door.title': 'Rat Cage Door', 'entity.portal.title': 'Mainland Portal', 'entity.mainland-greeter.title': 'Dock Greeter',
      'action.entity.forge-table.continue.title': 'Continue', 'action.entity.forge-table.continue.description': 'Follow the cave toward voices.', 'action.entity.forge-table.continue.success': 'You reach the combat cage.',
      'action.entity.orloth.talk.title': 'Talk', 'action.entity.orloth.talk.description': 'Ask about combat.',
      'action.entity.orloth.fight.title': 'Fight', 'action.entity.orloth.fight.description': 'Take a swing at Orloth.',
      'action.entity.giant-rat.fight.title': 'Fight', 'action.entity.giant-rat.fight.description': 'Fight the training rat.',
      'action.entity.rat-cage-door.unlock-orloth.title': 'Unlock', 'action.entity.rat-cage-door.unlock-orloth.description': 'Unlock the rat cage.',
      'action.entity.rat-cage-door.unlock.title': 'Unlock', 'action.entity.rat-cage-door.unlock.description': 'Unlock the rat cage.',
      'action.entity.portal.step-through.title': 'Step Through', 'action.entity.portal.step-through.description': 'Leave Tutorial Island.', 'action.entity.portal.step-through.success': 'The portal drops you on the mainland.',
      'action.entity.mainland-greeter.talk.title': 'Talk', 'action.entity.mainland-greeter.talk.description': 'Talk to the dock greeter.',
      'chat.entity.orloth.fight': 'Orloth laughs, trains you hard, and locks the empty cage behind him. Your health does not thank you for it.',
      'chat.entity.rat-cage-door.unlock-orloth': 'The cage is empty except for Orloth, arms crossed, unimpressed with your priorities.',
      'chat.entity.rat-cage-door.unlock': 'The cage is empty. The rats already had their say.',
      'dialogue.orloth.start': "So, you want to learn to fight. Good instinct, bad cage — those rats won't teach you finesse, but they'll teach you not to die. Questions before you go in?",
      'dialogue.orloth.option.ask-equip': "What do I actually equip?",
      'dialogue.orloth.option.ask-stats': "How do I know if I'm winning?",
      'dialogue.orloth.option.impatient': "No, I'm ready.",
      'dialogue.orloth.explain-equip': "Equipment tab, mainhand slot — any blade you've got will do for the cage.",
      'dialogue.orloth.option.continue': 'Got it.',
      'dialogue.orloth.explain-stats': "Attack wears the rats down, defense keeps you standing. Stats tab breaks down exactly how much of each you've got, if you want the numbers instead of a feeling.",
      'dialogue.orloth.close': "And don't try me directly. I'm not a rat.",
      'dialogue.mainland-greeter.start': 'Thanks for playing Tutorial Island. Go make trouble somewhere larger.',
    },
  },
};

export const tutorialIslandModules = [reset, foundation, guideHouse, survival, bank, mining, combat];
export const tutorialIslandModuleOrder = tutorialIslandModules.map((module) => module.id);
export const coreModuleOrder = ['base-core', 'wayside-supplies', ...tutorialIslandModuleOrder];
