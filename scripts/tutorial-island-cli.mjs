import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const universeId = 'base';
const contentRoot = path.join(process.cwd(), 'public', 'content', 'universes', universeId);
const modulesRoot = path.join(contentRoot, 'modules');
const playtestRoot = path.join(process.cwd(), '.playtests');

const argsMap = (argv) => {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = argv[index + 1]?.startsWith('--') ? true : argv[index + 1] ?? true;
    args.set(key, value);
    if (value !== true) index += 1;
  }
  return args;
};

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'));
const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};

const moduleHeader = (id, dependencies = []) => ({
  $schema: 'https://universalis-rpg.local/schema/module.schema.json',
  id,
  version: '1.0.0',
  universe: universeId,
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
const travel = (id, to, visibleWhen, requirements) => ({
  id,
  role: 'travel',
  durationSeconds: 1,
  rewards: [],
  ...(visibleWhen ? { visibleWhen } : {}),
  ...(requirements ? { requirements } : {}),
  results: [{ kind: 'relocate', locationId: to }],
});
const chat = (key) => ({ kind: 'chat', messageKey: key });
const setFlag = (flagId) => ({ kind: 'flag', flagId, value: true });
const take = (itemId, amount = 1) => ({ kind: 'item', itemId, amount: -amount });
const give = (itemId, amount = 1) => ({ kind: 'item', itemId, amount });
const xp = (skillId, amount) => ({ kind: 'skill-xp', skillId, amount });
const hurt = (amount) => ({ kind: 'resource', resourceId: 'health', amount: -amount });

const action = (id, results, options = {}) => ({
  id,
  instant: true,
  rewards: [],
  results,
  ...options,
});

const timed = (id, rewards, options = {}) => ({
  id,
  durationSeconds: options.durationSeconds ?? 1,
  rewards,
  ...Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'durationSeconds')),
});

const entity = (id, actions) => ({ id, actions });

const baseLocale = {
  'collection.category.enemies.title': 'Enemies',
  'skill.fishing.title': 'Fishing',
  'skill.fishing.description': 'Catching useful food from water.',
  'skill.cooking.title': 'Cooking',
  'skill.cooking.description': 'Turning raw supplies into safer meals.',
  'skill.thieving.title': 'Thieving',
  'skill.thieving.description': 'Opening what was meant to stay closed.',
  'skill.smithing.title': 'Smithing',
  'skill.smithing.description': 'Smelting metal and shaping gear.',
  'stat.fishing.title': 'Fishing',
  'stat.fishing.description': 'Power applied to fishing actions.',
  'stat.cooking.title': 'Cooking',
  'stat.cooking.description': 'Power applied to cooking actions.',
  'stat.thieving.title': 'Thieving',
  'stat.thieving.description': 'Power applied to locks and sleight of hand.',
  'stat.smithing.title': 'Smithing',
  'stat.smithing.description': 'Power applied to smelting and forging.',
};

const titles = {
  'tutorial-guide-house': ['Guide House', 'A small room with a locked front door and too many helpful objects.', 'The room is quiet now.'],
  'tutorial-beach': ['Shell Beach', 'Low shoals glitter beside a smoky campfire.', 'The beach settles into gull cries and surf.'],
  'tutorial-hermit-grove': ['Hermit Grove', 'Herbs grow around a weathered hut beyond the palms.', 'The grove smells of crushed leaves.'],
  'tutorial-bridge': ['Bridge Toll', 'A narrow bridge crosses the river. Something large waits below.', 'The river keeps sliding past.'],
  'tutorial-bank': ['Island Bank', 'A tidy counter, a ledger, and an open trapdoor share the room.', 'The teller returns to sorting coins.'],
  'tutorial-mine': ['Training Mine', 'Copper and tin glint in a cramped cave.', 'Dust hangs in the lamplight.'],
  'tutorial-forge': ['Cave Forge', 'A furnace and anvil are wedged into a hot alcove.', 'The forge pops and cools.'],
  'tutorial-rat-cage': ['Combat Cage', 'A rat cage, a portal, and a broad-shouldered instructor wait underground.', 'The cage is still.'],
  'mainland-arrival': ['Mainland Pier', 'Open roads begin beyond a salt-stained pier.', 'The pier creaks gently.'],
};

const entityNames = {
  miki: 'Miki',
  'front-door': 'Front Door',
  mirror: 'Mirror',
  drawer: 'Drawer',
  bookshelf: 'Bookshelf',
  brianna: 'Brianna',
  shoals: 'Shrimp Shoals',
  campfire: 'Campfire',
  'supply-crate': 'Supply Crate',
  'bridge-sign': 'Bridge Sign',
  hermit: 'Hermit',
  'herb-patch': 'Herb Patch',
  'cracked-bowl': 'Cracked Bowl',
  river: 'River',
  gommi: 'Gommi',
  'loose-plank': 'Loose Plank',
  'bank-teller': 'Bank Teller',
  'vault-counter': 'Vault Counter',
  trapdoor: 'Trapdoor',
  denzel: 'Denzel',
  'copper-rock': 'Copper Rock',
  'tin-rock': 'Tin Rock',
  'locked-chest': 'Locked Chest',
  'mine-tunnel': 'Mine Tunnel',
  furnace: 'Furnace',
  anvil: 'Anvil',
  'forge-table': 'Forge Table',
  orloth: 'Orloth',
  'giant-rat': 'Giant Rat',
  'rat-cage-door': 'Rat Cage Door',
  portal: 'Mainland Portal',
  'mainland-greeter': 'Dock Greeter',
};

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
  'iron-dagger': ['Iron Dagger', 'A sharp shortcut from Denzel\'s chest.', 'mainhand (1 attack), +5 attack'],
};

const addLocationLocale = (locale, ids) => {
  for (const id of ids) {
    const [title, description, exhausted] = titles[id];
    locale[`location.${id}.title`] = title;
    locale[`location.${id}.description`] = description;
    locale[`location.${id}.exhausted`] = exhausted;
  }
};

const addItemLocale = (locale, ids) => {
  for (const id of ids) {
    locale[`item.${id}.title`] = itemNames[id][0];
    locale[`item.${id}.description`] = itemNames[id][1];
  }
};

const addEntityLocale = (locale, ids) => {
  for (const id of ids) locale[`entity.${id}.title`] = entityNames[id];
};

const addActionLocale = (locale, id, title, description = title, success = 'Done.', failure = 'Nothing happens.') => {
  locale[`action.${id}.title`] = title;
  locale[`action.${id}.description`] = description;
  locale[`action.${id}.success`] = success;
  locale[`action.${id}.failure`] = failure;
};

const addEntityActionLocale = (locale, entityId, actionId, title, description = title, success = 'Done.', failure = 'Nothing happens.') =>
  addActionLocale(locale, `entity.${entityId}.${actionId}`, title, description, success, failure);

const addDialogueLocale = (locale, entries) => {
  for (const [key, value] of Object.entries(entries)) locale[key] = value;
};

const modules = () => {
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

  const foundationLocale = { ...baseLocale };
  const foundationItems = Object.keys(itemNames).map((id) => {
    const tags = itemNames[id][2];
    return item(id, tags);
  });
  addItemLocale(foundationLocale, Object.keys(itemNames));
  const foundation = {
    ...moduleHeader('tutorial-island-foundation', ['tutorial-island-reset']),
    data: {
      stats: [stat('fishing'), stat('cooking'), stat('thieving'), stat('smithing')],
      skills: [skill('fishing'), skill('cooking'), skill('thieving'), skill('smithing')],
      items: foundationItems,
      flags: [
        flag('tutorial.miki-cleared'),
        flag('tutorial.bridge-open'),
        flag('tutorial.gommi-asleep'),
        flag('tutorial.bank-visited'),
        flag('tutorial.mining-cleared'),
        flag('tutorial.combat-cleared'),
        flag('tutorial.spawn-mainland'),
      ],
    },
    locale: { en: foundationLocale },
  };

  const guideLocale = {};
  addLocationLocale(guideLocale, ['tutorial-guide-house']);
  addEntityLocale(guideLocale, ['miki', 'front-door', 'mirror', 'drawer', 'bookshelf']);
  for (const [entityId, actionId, title, desc, success] of [
    ['miki', 'talk', 'Talk', 'Ask Miki about the island.', 'Miki points out the tabs, settings, and short quest hints.'],
    ['miki', 'examine', 'Examine', 'Look at Miki.', 'Miki watches the door more than you.'],
    ['front-door', 'open', 'Open', 'Try the front door.', 'The door opens onto salt air.'],
    ['front-door', 'pick', 'Pick Lock', 'Worry the lock with the lockpick.', 'The lock gives with a soft click.'],
    ['front-door', 'examine', 'Examine', 'Check the front door.', 'The latch is locked, but the keyhole is scratched.'],
    ['mirror', 'examine', 'Examine', 'Study the mirror.', 'The mirror is polished enough to rethink your look.'],
    ['drawer', 'search', 'Search', 'Search the small drawer.', 'You find coins, a lockpick, and a tiny guide book.'],
    ['bookshelf', 'read', 'Read', 'Skim the thin island primer.', 'Quest colors: red starts, yellow reminds, green finishes.'],
  ]) addEntityActionLocale(guideLocale, entityId, actionId, title, desc, success);
  addDialogueLocale(guideLocale, {
    'dialogue.miki.start': 'Welcome. Keep your map open, poke what looks useful, and ignore any lecture that gets too long.',
    'dialogue.miki.option.ready': 'I can find my way.',
    'dialogue.miki.ready': 'Good. The door is open. Curiosity is allowed here.',
  });
  const guideHouse = {
    ...moduleHeader('tutorial-island-guide-house', ['tutorial-island-foundation']),
    data: {
      locations: [loc('tutorial-guide-house', 0, 0, ['miki', 'front-door', 'mirror', 'drawer', 'bookshelf'], [], { starting: true, tags: ['tutorial', 'indoors'] })],
      entities: [
        entity('miki', [
          action('talk', [{ kind: 'dialogue', dialogueId: 'miki' }]),
          action('examine', [chat('chat.entity.miki.examine')]),
        ]),
        entity('front-door', [
          action('open', [setFlag('tutorial.miki-cleared'), { kind: 'relocate', locationId: 'tutorial-beach' }], { visibleWhen: hasFlag('tutorial.miki-cleared') }),
          action('pick', [xp('thieving', 10), setFlag('tutorial.miki-cleared'), { kind: 'relocate', locationId: 'tutorial-beach' }], { visibleWhen: not(hasFlag('tutorial.miki-cleared')), requirements: hasItem('lockpick') }),
          action('examine', [chat('chat.entity.front-door.examine')], { visibleWhen: not(hasFlag('tutorial.miki-cleared')) }),
        ]),
        entity('mirror', [action('examine', [chat('chat.entity.mirror.examine')])]),
        entity('drawer', [action('search', [give('gold', 5), give('lockpick'), give('guide-book'), chat('chat.entity.drawer.search')], { maxCompletions: 1 })]),
        entity('bookshelf', [action('read', [chat('chat.entity.bookshelf.read')])]),
      ],
      dialogues: [{
        id: 'miki',
        startNodeId: 'start',
        nodes: [
          { id: 'start', speakerId: 'miki', textKey: 'dialogue.miki.start', options: [{ id: 'ready', labelKey: 'dialogue.miki.option.ready', results: [setFlag('tutorial.miki-cleared')], gotoNodeId: 'ready' }] },
          { id: 'ready', speakerId: 'miki', textKey: 'dialogue.miki.ready' },
        ],
      }],
    },
    locale: { en: { ...guideLocale, 'chat.entity.miki.examine': 'A guide with one eye on the door.', 'chat.entity.front-door.examine': 'Locked. The keyhole is scratched by previous impatience.', 'chat.entity.mirror.examine': 'You can change your appearance later; for now, you look ready enough.', 'chat.entity.drawer.search': 'The drawer was not locked. That feels deliberate.', 'chat.entity.bookshelf.read': 'The guide book has diagrams instead of paragraphs. Merciful.' } },
  };

  const survivalLocale = {};
  addLocationLocale(survivalLocale, ['tutorial-beach', 'tutorial-hermit-grove', 'tutorial-bridge']);
  addEntityLocale(survivalLocale, ['brianna', 'shoals', 'campfire', 'supply-crate', 'bridge-sign', 'hermit', 'herb-patch', 'cracked-bowl', 'river', 'gommi', 'loose-plank']);
  for (const row of [
    ['brianna', 'talk', 'Talk', 'Ask about surviving here.', 'Brianna keeps it brief: net, shrimp, fire, bridge.'],
    ['shoals', 'fish', 'Fish', 'Sweep the shallows with a small net.', 'You catch shrimp.'],
    ['shoals', 'examine', 'Examine', 'Look into the shoals.', 'Tiny shadows flicker in the shallows.'],
    ['campfire', 'cook-shrimp', 'Cook Shrimp', 'Cook raw shrimp over the campfire.', 'The shrimp curls pink.'],
    ['campfire', 'cook-draught', 'Cook Draught', 'Warm the bitter draught.', 'The draught steams softly.'],
    ['supply-crate', 'search', 'Search', 'Search the open crate.', 'You take the supplies left in plain sight.'],
    ['bridge-sign', 'read', 'Read', 'Read the rough bridge sign.', 'TOLL: FOOD. Also, no splashing.'],
    ['hermit', 'talk', 'Talk', 'Ask the hermit about the river.', 'The hermit gestures at herbs, bowls, fish, and fire.'],
    ['herb-patch', 'gather', 'Gather', 'Pick a sleepy-smelling herb.', 'You pick a river herb.'],
    ['cracked-bowl', 'take', 'Take', 'Take the cracked bowl.', 'It leaks slowly, which is good enough.'],
    ['river', 'use-draught', 'Use Draught', 'Pour the draught into the slow eddy.', 'The bridge grows quiet. Very quiet.'],
    ['river', 'examine', 'Examine', 'Watch the river.', 'The current swirls under the bridge where a cupful might carry far.'],
    ['gommi', 'pay-toll', 'Pay Toll', 'Offer cooked food at the bridge.', 'Gommi accepts the toll and waves you across.'],
    ['gommi', 'examine', 'Examine', 'Look under the bridge.', 'Gommi sniffs the air and watches every snack.'],
    ['loose-plank', 'examine', 'Examine', 'Check the loose plank.', 'It wiggles. Not enough to cross, enough to notice.'],
  ]) addEntityActionLocale(survivalLocale, ...row);
  for (const edge of [
    ['travel-house-to-beach', 'Travel to Shell Beach'],
    ['travel-beach-to-house', 'Travel to Guide House'],
    ['travel-beach-to-hermit-grove', 'Travel to Hermit Grove'],
    ['travel-hermit-grove-to-beach', 'Travel to Shell Beach'],
    ['travel-beach-to-bridge', 'Travel to Bridge Toll'],
    ['travel-bridge-to-beach', 'Travel to Shell Beach'],
    ['travel-bridge-to-bank', 'Travel to Island Bank'],
  ]) addActionLocale(survivalLocale, edge[0], edge[1], edge[1], 'You arrive.', 'You lose the path.');
  addDialogueLocale(survivalLocale, {
    'dialogue.brianna.start': 'Net from the crate, shrimp from the shoals, heat from the fire. Eat one if you get scratched.',
    'dialogue.hermit.start': 'Trolls sleep. Rivers carry. Bitter things become useful when cooked.',
  });
  const survival = {
    ...moduleHeader('tutorial-island-survival', ['tutorial-island-guide-house']),
    data: {
      locations: [
        loc('tutorial-beach', 180, 0, ['brianna', 'shoals', 'campfire', 'supply-crate', 'bridge-sign'], ['travel-beach-to-house', 'travel-beach-to-hermit-grove', 'travel-beach-to-bridge'], { tags: ['tutorial', 'shore'] }),
        loc('tutorial-hermit-grove', 180, -120, ['hermit', 'herb-patch', 'cracked-bowl'], ['travel-hermit-grove-to-beach'], { tags: ['tutorial', 'forest'] }),
        loc('tutorial-bridge', 360, 0, ['gommi', 'river', 'loose-plank'], ['travel-bridge-to-beach', 'travel-bridge-to-bank'], { tags: ['tutorial', 'river'] }),
      ],
      actions: [
        travel('travel-house-to-beach', 'tutorial-beach', hasFlag('tutorial.miki-cleared')),
        travel('travel-beach-to-house', 'tutorial-guide-house'),
        travel('travel-beach-to-hermit-grove', 'tutorial-hermit-grove'),
        travel('travel-hermit-grove-to-beach', 'tutorial-beach'),
        travel('travel-beach-to-bridge', 'tutorial-bridge'),
        travel('travel-bridge-to-beach', 'tutorial-beach'),
        travel('travel-bridge-to-bank', 'tutorial-bank', any(hasFlag('tutorial.bridge-open'), hasFlag('tutorial.gommi-asleep'))),
      ],
      entities: [
        entity('brianna', [action('talk', [{ kind: 'dialogue', dialogueId: 'brianna' }])]),
        entity('shoals', [timed('fish', [{ kind: 'item', itemId: 'raw-shrimp', amount: 1 }, { kind: 'skillXp', skillId: 'fishing', amount: 4 }], { requirements: hasItem('small-net') }), action('examine', [chat('chat.entity.shoals.examine')])]),
        entity('campfire', [
          timed('cook-shrimp', [{ kind: 'skillXp', skillId: 'cooking', amount: 4 }], { requirements: hasItem('raw-shrimp'), results: [take('raw-shrimp'), give('cooked-shrimp')] }),
          timed('cook-draught', [{ kind: 'skillXp', skillId: 'cooking', amount: 6 }], { requirements: hasItem('uncooked-sleeping-draught'), results: [take('uncooked-sleeping-draught'), give('sleeping-draught')] }),
        ]),
        entity('supply-crate', [action('search', [give('small-net'), give('bowl'), chat('chat.entity.supply-crate.search')], { maxCompletions: 1 })]),
        entity('bridge-sign', [action('read', [chat('chat.entity.bridge-sign.read')])]),
        entity('hermit', [action('talk', [{ kind: 'dialogue', dialogueId: 'hermit' }])]),
        entity('herb-patch', [timed('gather', [{ kind: 'item', itemId: 'herb', amount: 1 }, { kind: 'skillXp', skillId: 'fishing', amount: 1 }])]),
        entity('cracked-bowl', [action('take', [give('bowl'), chat('chat.entity.cracked-bowl.take')], { maxCompletions: 1 })]),
        entity('river', [
          action('use-draught', [take('sleeping-draught'), setFlag('tutorial.gommi-asleep'), chat('chat.entity.river.use-draught')], { requirements: hasItem('sleeping-draught') }),
          action('examine', [chat('chat.entity.river.examine')]),
        ]),
        entity('gommi', [
          action('pay-toll', [take('cooked-shrimp'), setFlag('tutorial.bridge-open'), chat('chat.entity.gommi.pay-toll')], { requirements: hasItem('cooked-shrimp') }),
          action('examine', [chat('chat.entity.gommi.examine')]),
        ]),
        entity('loose-plank', [action('examine', [chat('chat.entity.loose-plank.examine')])]),
      ],
      dialogues: [
        { id: 'brianna', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'brianna', textKey: 'dialogue.brianna.start' }] },
        { id: 'hermit', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'hermit', textKey: 'dialogue.hermit.start', results: [give('uncooked-sleeping-draught')] }] },
      ],
    },
    'data-updates': { patches: [{ targetModId: 'tutorial-island-guide-house', objectType: 'locations', objectId: 'tutorial-guide-house', ops: [{ op: 'add', path: '/actions/-', value: 'travel-house-to-beach' }] }] },
    locale: { en: { ...survivalLocale, 'chat.entity.shoals.examine': 'Shrimp dart away from your shadow.', 'chat.entity.supply-crate.search': 'A net and bowl sit on top, practically accusing you of missing them.', 'chat.entity.bridge-sign.read': 'The word FOOD is carved deeper than the rest.', 'chat.entity.cracked-bowl.take': 'The bowl leaves a damp ring behind.', 'chat.entity.river.use-draught': 'Gommi slumps under the bridge, snoring like a sawmill.', 'chat.entity.river.examine': 'A slow eddy curls under Gommi\'s bridge.', 'chat.entity.gommi.pay-toll': 'Gommi eats first and negotiates never.', 'chat.entity.gommi.examine': 'Big hands. Bigger appetite.', 'chat.entity.loose-plank.examine': 'A tempting plank, but not a bridge by itself.' } },
  };

  const bankLocale = {};
  addLocationLocale(bankLocale, ['tutorial-bank']);
  addEntityLocale(bankLocale, ['bank-teller', 'vault-counter', 'trapdoor']);
  for (const row of [
    ['bank-teller', 'talk', 'Talk', 'Ask about banks.', 'The teller says banks share storage across the world. Handy.'],
    ['vault-counter', 'withdraw', 'Withdraw Coins', 'Check the starting account.', 'You withdraw the coins kept for new travelers.'],
    ['trapdoor', 'descend', 'Descend', 'Climb down the open trapdoor.', 'You climb into the cave below.'],
  ]) addEntityActionLocale(bankLocale, ...row);
  addDialogueLocale(bankLocale, { 'dialogue.bank-teller.start': 'Inventory is tight. Banks are not. This account has a few coins for the road.' });
  const bank = {
    ...moduleHeader('tutorial-island-bank', ['tutorial-island-survival']),
    data: {
      locations: [loc('tutorial-bank', 520, 0, ['bank-teller', 'vault-counter', 'trapdoor'], [], { tags: ['tutorial', 'settlement'] })],
      entities: [
        entity('bank-teller', [action('talk', [{ kind: 'dialogue', dialogueId: 'bank-teller' }, setFlag('tutorial.bank-visited')])]),
        entity('vault-counter', [action('withdraw', [give('gold', 25), setFlag('tutorial.bank-visited'), chat('chat.entity.vault-counter.withdraw')], { maxCompletions: 1 })]),
        entity('trapdoor', [action('descend', [{ kind: 'relocate', locationId: 'tutorial-mine' }])]),
      ],
      dialogues: [{ id: 'bank-teller', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'bank-teller', textKey: 'dialogue.bank-teller.start' }] }],
    },
    locale: { en: { ...bankLocale, 'chat.entity.vault-counter.withdraw': 'The ledger already had your name penciled in.' } },
  };

  const miningLocale = {};
  addLocationLocale(miningLocale, ['tutorial-mine', 'tutorial-forge']);
  addEntityLocale(miningLocale, ['denzel', 'copper-rock', 'tin-rock', 'locked-chest', 'mine-tunnel', 'furnace', 'anvil', 'forge-table']);
  for (const row of [
    ['denzel', 'talk', 'Talk', 'Ask about mining.', 'Denzel gives you a pickaxe and points at the rocks.'],
    ['denzel', 'examine', 'Examine', 'Look at Denzel.', 'He mutters about serving his sentence one tutorial at a time.'],
    ['copper-rock', 'mine', 'Mine Copper', 'Mine a copper rock.', 'Copper ore breaks free.'],
    ['tin-rock', 'mine', 'Mine Tin', 'Mine a tin rock.', 'Tin ore breaks free.'],
    ['locked-chest', 'pick', 'Pick Lock', 'Try Denzel\'s personal chest.', 'The chest snaps open. Painfully.'],
    ['locked-chest', 'examine', 'Examine', 'Check the chest.', 'A prison-issue padlock guards something better than rocks.'],
    ['mine-tunnel', 'enter-forge', 'Enter Forge', 'Walk deeper to the forge alcove.', 'You reach the forge.'],
    ['furnace', 'smelt', 'Smelt Bronze', 'Smelt copper and tin into bronze.', 'A bronze bar cools in the mold.'],
    ['anvil', 'smith-dagger', 'Smith Dagger', 'Hammer a bronze dagger.', 'A dagger takes shape.'],
    ['forge-table', 'return-mine', 'Return', 'Return to the mine chamber.', 'You return to Denzel\'s chamber.'],
  ]) addEntityActionLocale(miningLocale, ...row);
  addDialogueLocale(miningLocale, { 'dialogue.denzel.start': 'Copper plus tin makes bronze. Furnace first, anvil second. The chest is private.' });
  const mining = {
    ...moduleHeader('tutorial-island-mining', ['tutorial-island-bank']),
    data: {
      locations: [
        loc('tutorial-mine', 520, 140, ['denzel', 'copper-rock', 'tin-rock', 'locked-chest', 'mine-tunnel'], [], { tags: ['tutorial', 'cave'] }),
        loc('tutorial-forge', 680, 140, ['furnace', 'anvil', 'forge-table'], [], { tags: ['tutorial', 'cave'] }),
      ],
      entities: [
        entity('denzel', [action('talk', [give('bronze-pickaxe'), { kind: 'dialogue', dialogueId: 'denzel' }], { maxCompletions: 1 }), action('examine', [chat('chat.entity.denzel.examine')])]),
        entity('copper-rock', [timed('mine', [{ kind: 'item', itemId: 'copper-ore', amount: 1 }, { kind: 'skillXp', skillId: 'mining', amount: 5 }], { requirements: { kind: 'item-tag', tag: 'pickaxe' } })]),
        entity('tin-rock', [timed('mine', [{ kind: 'item', itemId: 'tin-ore', amount: 1 }, { kind: 'skillXp', skillId: 'mining', amount: 5 }], { requirements: { kind: 'item-tag', tag: 'pickaxe' } })]),
        entity('locked-chest', [
          action('pick', [hurt(2), xp('thieving', 20), give('copper-ore'), give('tin-ore'), give('bronze-bar'), give('iron-dagger'), setFlag('tutorial.mining-cleared'), chat('chat.entity.locked-chest.pick')], { requirements: hasItem('lockpick'), maxCompletions: 1 }),
          action('examine', [chat('chat.entity.locked-chest.examine')]),
        ]),
        entity('mine-tunnel', [action('enter-forge', [{ kind: 'relocate', locationId: 'tutorial-forge' }])]),
        entity('furnace', [timed('smelt', [{ kind: 'skillXp', skillId: 'smithing', amount: 8 }], { requirements: all(hasItem('copper-ore'), hasItem('tin-ore')), results: [take('copper-ore'), take('tin-ore'), give('bronze-bar')] })]),
        entity('anvil', [timed('smith-dagger', [{ kind: 'skillXp', skillId: 'smithing', amount: 10 }], { requirements: hasItem('bronze-bar'), results: [take('bronze-bar'), give('bronze-dagger'), setFlag('tutorial.mining-cleared')] })]),
        entity('forge-table', [action('return-mine', [{ kind: 'relocate', locationId: 'tutorial-mine' }])]),
      ],
      dialogues: [{ id: 'denzel', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'denzel', textKey: 'dialogue.denzel.start' }] }],
    },
    locale: { en: { ...miningLocale, 'chat.entity.denzel.examine': 'Denzel keeps checking the chest, then pretending he did not.', 'chat.entity.locked-chest.pick': 'The lock bites your knuckles, then gives up its contents.', 'chat.entity.locked-chest.examine': 'The lock is better than the chest.' } },
  };

  const combatLocale = {};
  addLocationLocale(combatLocale, ['tutorial-rat-cage', 'mainland-arrival']);
  addEntityLocale(combatLocale, ['orloth', 'giant-rat', 'rat-cage-door', 'portal', 'mainland-greeter']);
  for (const row of [
    ['orloth', 'talk', 'Talk', 'Ask about combat.', 'Orloth says to equip a blade and fight the rat.'],
    ['orloth', 'fight', 'Fight', 'Take a swing at Orloth.', 'Orloth laughs, trains you hard, and locks the empty cage.'],
    ['giant-rat', 'fight', 'Fight', 'Fight the training rat.', 'You defeat the rat.'],
    ['rat-cage-door', 'unlock', 'Unlock', 'Unlock the rat cage.', 'The cage opens. Orloth is inside, disappointed.'],
    ['portal', 'step-through', 'Step Through', 'Leave Tutorial Island.', 'The portal drops you on the mainland.'],
    ['mainland-greeter', 'talk', 'Talk', 'Talk to the dock greeter.', 'Thanks for playing. The rest of the world is next.'],
  ]) addEntityActionLocale(combatLocale, ...row);
  addDialogueLocale(combatLocale, {
    'dialogue.orloth.start': 'Weapons go in equipment. Rats go in cages. Heroes go through portals.',
    'dialogue.mainland-greeter.start': 'Thanks for playing Tutorial Island. Go make trouble somewhere larger.',
    'interaction.training-combat.title': 'Training Combat',
    'interaction.training-combat.player.hit': 'You hit the {target}.',
    'interaction.training-combat.player.miss': 'You miss the {target}.',
    'interaction.training-combat.player.kill': 'You defeat the {target}.',
    'interaction.training-combat.entity.hit': 'The {source} bites you.',
    'interaction.training-combat.entity.miss': 'The {source} misses you.',
    'interaction.training-combat.entity.kill': 'The {source} drops you.',
  });
  const combat = {
    ...moduleHeader('tutorial-island-combat', ['tutorial-island-mining']),
    data: {
      interactionTypes: [{ id: 'training-combat', sourceStatId: 'attack', targetStatId: 'defense', targetPlayerHealth: true }],
      locations: [
        loc('tutorial-rat-cage', 840, 140, ['orloth', 'giant-rat', 'rat-cage-door', 'portal'], [], { tags: ['tutorial', 'cave'] }),
        loc('mainland-arrival', 1040, 120, ['mainland-greeter'], [], { tags: ['mainland'] }),
      ],
      entities: [
        entity('orloth', [
          action('talk', [{ kind: 'dialogue', dialogueId: 'orloth' }]),
          action('fight', [hurt(9), xp('attack', 60), xp('defense', 30), setFlag('tutorial.combat-cleared'), chat('chat.entity.orloth.fight')], { visibleWhen: not(hasFlag('tutorial.combat-cleared')) }),
        ]),
        entity('giant-rat', [timed('fight', [{ kind: 'skillXp', skillId: 'attack', amount: 20 }, { kind: 'skillXp', skillId: 'defense', amount: 10 }], { interactionTypeId: 'training-combat', enemy: { interactionTypeId: 'training-combat', stats: { attack: 2, defense: 1, health: 5, rate: 10 }, showHealthBar: true, rewards: [{ kind: 'skillXp', skillId: 'attack', amount: 20 }] }, results: [setFlag('tutorial.combat-cleared')] })]),
        entity('rat-cage-door', [action('unlock', [chat('chat.entity.rat-cage-door.unlock')], { requirements: hasItem('lockpick'), visibleWhen: hasFlag('tutorial.combat-cleared') })]),
        entity('portal', [action('step-through', [setFlag('tutorial.spawn-mainland'), { kind: 'relocate', locationId: 'mainland-arrival' }], { visibleWhen: any(hasFlag('tutorial.combat-cleared'), completed('entity.giant-rat.fight')) })]),
        entity('mainland-greeter', [action('talk', [{ kind: 'dialogue', dialogueId: 'mainland-greeter' }])]),
      ],
      dialogues: [
        { id: 'orloth', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'orloth', textKey: 'dialogue.orloth.start' }] },
        { id: 'mainland-greeter', startNodeId: 'start', nodes: [{ id: 'start', speakerId: 'mainland-greeter', textKey: 'dialogue.mainland-greeter.start' }] },
      ],
    },
    'data-updates': { patches: [{ targetModId: 'tutorial-island-mining', objectType: 'entities', objectId: 'forge-table', ops: [{ op: 'add', path: '/actions/-', value: action('continue', [{ kind: 'relocate', locationId: 'tutorial-rat-cage' }]) }] }] },
    locale: { en: { ...combatLocale, 'action.entity.forge-table.continue.title': 'Continue', 'action.entity.forge-table.continue.description': 'Follow the cave toward voices.', 'action.entity.forge-table.continue.success': 'You reach the combat cage.', 'action.entity.forge-table.continue.failure': 'The tunnel echoes.', 'chat.entity.orloth.fight': 'Orloth approves. Your health does not.', 'chat.entity.rat-cage-door.unlock': 'The cage is empty except for Orloth, who is somehow already disappointed.' } },
  };

  return [reset, foundation, guideHouse, survival, bank, mining, combat];
};

const loadCreatedModules = async () => {
  const manifest = await readJson(path.join(contentRoot, 'universe.json'));
  return Promise.all((manifest.modules ?? []).map((id) => readJson(path.join(modulesRoot, `${id}.json`))));
};

const applyData = (bundle, data = {}) => {
  const next = { ...bundle };
  for (const key of ['locations', 'entities', 'actions', 'stats', 'skills', 'items', 'flags', 'resources', 'interactionTypes', 'dialogues']) {
    const outKey = key === 'resources' ? 'resourceDefinitions' : key;
    next[outKey] = [...(next[outKey] ?? []), ...(data[key] ?? [])];
  }
  return next;
};

const patchObject = (object, op) => {
  if (op.op === 'add' && op.path.endsWith('/-')) {
    const key = op.path.slice(1, -2);
    return { ...object, [key]: [...(object[key] ?? []), op.value] };
  }
  return object;
};

const applyModules = (loadedModules, enabledIds) => {
  let bundle = { locations: [], entities: [], actions: [], stats: [], skills: [], items: [], flags: [], resourceDefinitions: [], interactionTypes: [], dialogues: [] };
  const byId = new Map(loadedModules.map((module) => [module.id, module]));
  const enabled = enabledIds.map((id) => byId.get(id)).filter(Boolean);
  for (const module of enabled) bundle = applyData(bundle, module.data);
  for (const module of enabled) {
    const updates = module['data-updates'];
    if (!updates) continue;
    for (const [key, ids] of Object.entries(updates.remove ?? {})) {
      const outKey = key === 'resources' ? 'resourceDefinitions' : key;
      if (Array.isArray(ids)) bundle[outKey] = (bundle[outKey] ?? []).filter((row) => !ids.includes(row.id));
    }
    bundle = applyData(bundle, updates);
    for (const patch of updates.patches ?? []) {
      const key = patch.objectType === 'resources' ? 'resourceDefinitions' : patch.objectType;
      bundle[key] = (bundle[key] ?? []).map((row) => row.id === patch.objectId ? patch.ops.reduce(patchObject, row) : row);
    }
  }
  return bundle;
};

const moduleOrder = [
  'base-core',
  'wayside-supplies',
  'tutorial-island-reset',
  'tutorial-island-foundation',
  'tutorial-island-guide-house',
  'tutorial-island-survival',
  'tutorial-island-bank',
  'tutorial-island-mining',
  'tutorial-island-combat',
];

const visibleEntities = (bundle, locationId) => bundle.locations.find((location) => location.id === locationId)?.entities ?? [];

const runPlaytest = async (scope) => {
  await mkdir(playtestRoot, { recursive: true });
  const allModules = await loadCreatedModules();
  const index = moduleOrder.indexOf(scope);
  const enabled = index >= 0 ? moduleOrder.slice(0, index + 1) : moduleOrder;
  const bundle = applyModules(allModules, enabled);
  const lines = [];
  lines.push(`# Tutorial Island playtest: ${scope}`);
  lines.push(`Enabled modules: ${enabled.join(', ')}`);
  lines.push('');
  let failed = false;
  for (const location of bundle.locations) {
    const count = (location.entities ?? []).length;
    lines.push(`Location ${location.id}: ${count} entities (${(location.entities ?? []).join(', ') || 'none'})`);
    if (count > 5) {
      failed = true;
      lines.push(`FEEDBACK: Too many entities in ${location.id}; split the space or move an interaction.`);
    }
  }
  const requirements = [
    ['tutorial-island-guide-house', 'tutorial-guide-house', ['miki', 'front-door', 'drawer']],
    ['tutorial-island-survival', 'tutorial-beach', ['brianna', 'shoals', 'campfire', 'supply-crate'], 'tutorial-bridge'],
    ['tutorial-island-bank', 'tutorial-bank', ['bank-teller', 'vault-counter', 'trapdoor']],
    ['tutorial-island-mining', 'tutorial-mine', ['denzel', 'copper-rock', 'tin-rock', 'locked-chest'], 'tutorial-forge'],
    ['tutorial-island-combat', 'tutorial-rat-cage', ['orloth', 'giant-rat', 'portal'], 'mainland-arrival'],
  ];
  for (const [moduleId, locationId, expected, extraLocation] of requirements) {
    if (!enabled.includes(moduleId)) continue;
    const present = visibleEntities(bundle, locationId);
    for (const id of expected) {
      if (!present.includes(id)) {
        failed = true;
        lines.push(`FEEDBACK: Expected ${id} at ${locationId}, but it is missing.`);
      }
    }
    if (extraLocation && !bundle.locations.some((location) => location.id === extraLocation)) {
      failed = true;
      lines.push(`FEEDBACK: Expected location ${extraLocation}, but it is missing.`);
    }
  }
  const primaryAlternativeChecks = [
    ['tutorial-island-guide-house', 'Miki opens the door', 'drawer lockpick opens the same door', 'front-door examine hints the scratched keyhole'],
    ['tutorial-island-survival', 'cook shrimp and pay Gommi', 'hermit draught puts Gommi to sleep', 'river and bridge sign show the trick without naming it'],
    ['tutorial-island-bank', 'talk/withdraw and descend', 'trapdoor is open immediately', 'trapdoor is visible in the room'],
    ['tutorial-island-mining', 'mine-smelt-smith a bronze dagger', 'pick Denzel chest for materials and iron dagger', 'Denzel/chest text points at sentence/private chest'],
    ['tutorial-island-combat', 'fight the rat and use portal', 'fight Orloth and skip rats', 'Fight appears on Orloth'],
  ];
  for (const [moduleId, primary, alternative, hint] of primaryAlternativeChecks) {
    if (!enabled.includes(moduleId)) continue;
    lines.push(`Path check ${moduleId}: primary=${primary}; alternative=${alternative}; subtle hint=${hint}.`);
  }
  lines.push('');
  lines.push(failed ? 'RESULT: fail' : 'RESULT: pass');
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${scope}.md`;
  await writeFile(path.join(playtestRoot, fileName), `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ ok: !failed, scope, log: path.join('.playtests', fileName) }, null, 2));
  if (failed) process.exitCode = 1;
};

const create = async () => {
  await mkdir(modulesRoot, { recursive: true });
  const generated = modules();
  for (const module of generated) await writeJson(path.join(modulesRoot, `${module.id}.json`), module);

  const manifestPath = path.join(contentRoot, 'universe.json');
  const manifest = await readJson(manifestPath);
  const nextManifest = {
    ...manifest,
    modules: moduleOrder,
  };
  await writeJson(manifestPath, nextManifest);
  await writeJson(path.join(contentRoot, 'module-packs.json'), [
    { id: 'starter', modules: moduleOrder },
    { id: 'tutorial-island', titleKey: 'modulePack.tutorial-island.title', modules: generated.map((module) => module.id) },
  ]);
  console.log(JSON.stringify({ ok: true, modules: generated.map((module) => module.id) }, null, 2));
};

export const runTutorialIslandCli = async (argv) => {
  const command = argv[0] ?? 'help';
  const args = argsMap(argv.slice(1));
  if (command === 'create') return create();
  if (command === 'playtest') return runPlaytest(String(args.get('module') ?? 'tutorial-island-combat'));
  console.log('Usage: npm run mod-editor:cli -- tutorial-island create');
  console.log('       npm run mod-editor:cli -- tutorial-island playtest --module tutorial-island-survival');
};
