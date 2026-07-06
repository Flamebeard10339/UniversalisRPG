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
  'guide-book': ['Guide Book', 'A short book with diagrams of tabs, settings, and quest colors.'],
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
    items: Object.entries(itemNames).map(([id, [, , tags]]) => item(id, tags)),
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
    ],
    effects: [{
      id: 'well-fed-regeneration',
      resourceId: 'health',
      sourceStat: 'regeneration',
      rateUnit: 'per-minute',
      activeWhen: hasFlag('well-fed'),
    }],
    quests: [{
      id: 'leave-tutorial-island',
      titleKey: 'quest.leave-tutorial-island.title',
      stages: [
        { id: 'accept', descriptionKey: 'quest.leave-tutorial-island.stage.accept', condition: hasFlag('quest.leave-tutorial-island.accepted') },
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
      'quest.leave-tutorial-island.stage.accept': 'Find your way off the island. Ask around if you are not sure where to start.',
      'quest.leave-tutorial-island.stage.complete': 'Keep heading deeper until the way out opens up.',
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
    entities: [
      entity('miki', [
        action('talk', [dialogueResult('miki')]),
        action('examine', [chat('chat.entity.miki.examine')]),
      ]),
      entity('front-door', [
        action('pick', [xp('thieving', 10), setFlag('tutorial.miki-cleared'), setFlag('quest.leave-tutorial-island.accepted'), chat('chat.entity.front-door.pick')], { visibleWhen: not(hasFlag('tutorial.miki-cleared')), requirements: hasItem('lockpick') }),
        action('examine', [chat('chat.entity.front-door.examine')]),
      ]),
      entity('mirror', [action('look', [chat('chat.entity.mirror.look')])]),
      entity('drawer', [action('search', [give('gold', 5), give('lockpick'), give('guide-book'), chat('chat.entity.drawer.search')], { maxCompletions: 1 })]),
      entity('bookshelf', [action('read', [setFlag('quest.leave-tutorial-island.accepted'), chat('chat.entity.bookshelf.read')])]),
    ],
    dialogues: [{
      id: 'miki',
      startNodeId: 'start',
      nodes: [
        { id: 'start', speakerId: 'miki', textKey: 'dialogue.miki.start', options: [{ id: 'ready', labelKey: 'dialogue.miki.option.ready', results: [setFlag('tutorial.miki-cleared'), setFlag('quest.leave-tutorial-island.accepted')], gotoNodeId: 'ready' }] },
        { id: 'ready', speakerId: 'miki', textKey: 'dialogue.miki.ready' },
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
      'action.entity.miki.talk.title': 'Talk', 'action.entity.miki.talk.description': 'Ask Miki about the island.',
      'action.entity.miki.examine.title': 'Examine', 'action.entity.miki.examine.description': 'Look at Miki.',
      'action.entity.front-door.pick.title': 'Pick Lock', 'action.entity.front-door.pick.description': 'Worry the lock with the lockpick.', 'action.entity.front-door.pick.success': 'The lock gives with a soft click.',
      'action.entity.front-door.examine.title': 'Examine', 'action.entity.front-door.examine.description': 'Check the front door.',
      'action.entity.mirror.look.title': 'Look', 'action.entity.mirror.look.description': 'Catch your reflection.',
      'action.entity.drawer.search.title': 'Search', 'action.entity.drawer.search.description': 'Search the small drawer.',
      'action.entity.bookshelf.read.title': 'Read', 'action.entity.bookshelf.read.description': 'Skim the thin island primer.',
      'chat.entity.miki.examine': 'A guide with one eye on the door.',
      'chat.entity.front-door.examine': 'A heavy door. The keyhole looks scratched, like someone was here before you.',
      'chat.entity.front-door.pick': 'The lock gives with a soft click. Whatever is out there, you can reach it now.',
      'chat.entity.mirror.look': 'You catch your reflection. The Character tab has more options if you want a different look.',
      'chat.entity.drawer.search': 'The drawer was not locked. Inside: a few coins, a lockpick, and a small guide book. That feels deliberate.',
      'chat.entity.bookshelf.read': 'The book has diagrams instead of paragraphs: tabs, settings, and quest colors. Red starts, yellow reminds, green finishes.',
      'dialogue.miki.start': 'Welcome. Keep your map open, poke what looks useful, and check the Quests tab if you forget what you were doing. Colors there mean red for not started, yellow for in progress, green for done. Ready to see the island?',
      'dialogue.miki.option.ready': 'I can find my way.',
      'dialogue.miki.ready': 'Good. The door is open. Curiosity is allowed here.',
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
        action('eat', [take('cooked-shrimp'), setFlag('well-fed', 60), chat('chat.entity.campfire.eat')], { requirements: hasItem('cooked-shrimp') }),
      ]),
      entity('supply-crate', [action('search', [give('small-net'), give('bowl'), chat('chat.entity.supply-crate.search')], { maxCompletions: 1 })]),
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
      { id: 'brianna', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'brianna', textKey: 'dialogue.brianna.start' }] },
      { id: 'hermit', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'hermit', textKey: 'dialogue.hermit.start' }] },
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
      'action.entity.campfire.eat.title': 'Eat', 'action.entity.campfire.eat.description': 'Eat a cooked shrimp by the fire.',
      'action.entity.supply-crate.search.title': 'Search', 'action.entity.supply-crate.search.description': 'Search the open crate.',
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
      'chat.entity.campfire.eat': 'Warmth spreads. You feel steadier for a while.',
      'chat.entity.supply-crate.search': 'A net and bowl sit on top, practically accusing you of missing them.',
      'chat.entity.bridge-sign.read': 'The word FOOD is carved deeper than the rest.',
      'chat.entity.cracked-bowl.take': 'The bowl leaves a damp ring behind.',
      'chat.entity.river.use-draught': 'Gommi slumps under the bridge, snoring like a sawmill.',
      'chat.entity.river.examine': 'A slow eddy curls under Gommi’s bridge, deep enough to carry a cupful without a splash.',
      'chat.entity.gommi.pay-toll': 'Gommi eats first and negotiates never.',
      'chat.entity.gommi.examine': 'Big hands. Bigger appetite. He watches every snack that crosses the bridge.',
      'chat.entity.gommi.examine-asleep': 'Gommi is out cold, snoring louder than the river.',
      'chat.entity.loose-plank.examine': 'A tempting plank, but it wobbles and would not hold your weight over open water.',
      'dialogue.brianna.start': 'Net from the crate, shrimp from the shoals, heat from the fire. Eat one if you get scratched up — it takes the edge off for a while.',
      'dialogue.hermit.start': 'Fish and herb, mixed in a bowl, then warmed. What comes out sleeps whatever drinks it. Rivers carry things further than people expect.',
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
    dialogues: [{ id: 'bank-teller', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'bank-teller', textKey: 'dialogue.bank-teller.start' }] }],
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
      'dialogue.bank-teller.start': 'Every bank shares one account, anywhere in the world. Yours already has a little gold in it — check the Bank tab under Character to move things between it and your pack. Your pack only holds 28 kinds of things at once, so the bank is where the rest goes.',
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
    dialogues: [{ id: 'denzel', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'denzel', textKey: 'dialogue.denzel.start' }] }],
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
      'dialogue.denzel.start': "Copper plus tin makes bronze. Furnace first, anvil second. I'd be out of here already if I hadn't drawn this posting as part of my... sentence. Don't touch the chest.",
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
      { id: 'orloth', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'orloth', textKey: 'dialogue.orloth.start' }] },
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
      'dialogue.orloth.start': "Equipment tab, mainhand slot, any blade you've got. Then it's just you against the rats in that cage — attack wears them down, defense keeps you standing. Stats tab breaks down exactly how much of each you've got, if you want the numbers.",
      'dialogue.mainland-greeter.start': 'Thanks for playing Tutorial Island. Go make trouble somewhere larger.',
    },
  },
};

export const tutorialIslandModules = [reset, foundation, guideHouse, survival, bank, mining, combat];
export const tutorialIslandModuleOrder = tutorialIslandModules.map((module) => module.id);
export const coreModuleOrder = ['base-core', 'wayside-supplies', ...tutorialIslandModuleOrder];
