import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { restorePools } from './effects';
import { armAction, armCraft, armFightAction, armTravel, buffsOf, createGameState, grantBuff, PLAYER, statValue } from './runtime';
import { IMPLICIT_TARGET_FULL } from './encounter';
import { engineLocale, loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { openModalNamed } from './modalStack';
import { compareSave, compareSaveOnly, diffState, initialState, loadSave, pruneStateForRegistry, SAVE_FIELDS, SAVE_VERSION, serializeSave, type SaveField } from './save';
import { parseSaveSection, type ParsedSave } from '../content/sections/save';
import { runTest } from './session';
import { travelAction, TRAVEL_ADDRESS } from './actionLookup';
import { actionAddress, actionWords } from '../content/sections/action';
import { type Registry } from '../content/registry';
import { CRAFT_ADDRESS } from '../content/sections/recipe';
import { loadUniverse } from '../content/load';
import { GameState, type ModalFrame } from './state';
import { settingNamed, SETTING_NAMES } from './settings';
import { toMilliUnits } from './units';
import { receiveItem } from './itemInstance';

const MODULE =
  FIXTURE_WORLD +
  `
# item gold
title: Gold

# stat might
base: 3

# item charm
slot: neck
+2 might

# item blade
slot: hand
item-level: 2

# flag done

# resource health
max: max-health

# flag opened

# entity chest
open:
  give: 1 gold
  set: opened

# race human

# race elf
`;

describe('initialState', () => {
  it('places a fresh game at the registry starting location, like startSession', () => {
    const registry = loadInEnglish(MODULE);
    expect(initialState(registry).location).toBe('camp');
  });
});

describe('diffState', () => {
  it('is empty for a fresh state against the baseline', () => {
    const registry = loadInEnglish(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    expect(diffState(state, baseline)).toEqual({});
  });

  it('captures only the inventory entry that changed', () => {
    const registry = loadInEnglish(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    state.inventory.bread = 1;
    expect(diffState(state, baseline)).toEqual({ inventory: { bread: 1 } });
  });

  // Derived from what each record field declares its sparsest holding to be, so a record field added next month is covered here without an edit.
  it.each((Object.keys(SAVE_FIELDS) as SaveField[]).filter((field) => SAVE_FIELDS[field].shape === 'record'))('says nothing of a %s key held at its sparsest value', (field) => {
    const registry = loadInEnglish(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    (state[field] as Record<string, unknown>)['nothing-here'] = SAVE_FIELDS[field].sparsest;

    expect(diffState(state, baseline)).toEqual({});
  });

  it('still says a holding that fell to its sparsest value from a baseline that was not', () => {
    const registry = loadInEnglish(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    expect(baseline.resources.health).toBeGreaterThan(0);
    restorePools(state, { health: 0 });

    expect(diffState(state, baseline)).toEqual({ resources: { health: 0 } });
  });

  it('captures only location on a relocation', () => {
    const registry = loadInEnglish(MODULE);
    const baseline = initialState(registry);
    const state = initialState(registry);
    state.location = 'elsewhere';
    expect(diffState(state, baseline)).toEqual({ location: 'elsewhere' });
  });
});

describe('serializeSave', () => {
  it('is single-line JSON carrying the version and only the changed fields', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.inventory.bread = 2;
    const serialized = serializeSave(state, registry);
    expect(serialized.includes('\n')).toBe(false);
    expect(JSON.parse(serialized)).toEqual({ version: SAVE_VERSION, inventory: { bread: 2 } });
  });

  it('serializes a fresh game as just the version', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    expect(JSON.parse(serializeSave(state, registry))).toEqual({ version: SAVE_VERSION });
  });
});

describe('loadSave', () => {
  it('round-trips through serialize -> parseSaveSection -> loadSave', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.inventory.gold = 3;
    state.flags.done = true;
    restorePools(state, { health: toMilliUnits(4) });
    const serialized = serializeSave(state, registry);
    expect(JSON.parse(serialized).resources).toEqual({ health: toMilliUnits(4) });

    const saved = parseSaveSection({
      kind: 'save',
      id: 'x',
      body: [{ text: serialized, span: { start: 0, end: 0 }, children: [] }],
      span: { start: 0, end: 0 },
    });

    const target = createGameState();
    loadSave(target, saved, registry);

    // The log and what the player was last told they carry are what a session holds rather than
    // what a save does, and neither crosses the round trip.
    const { log: _targetLog, carriedTold: _targetTold, ...targetRest } = target;
    const { log: _stateLog, carriedTold: _stateTold, ...stateRest } = state;
    expect(targetRest).toEqual(stateRest);
  });

  it('loads the state the world opens on from a save that says nothing, clearing what the target held', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    state.location = 'camp';
    state.inventory.bread = 99;
    state.flags.stale = true;

    loadSave(state, { version: SAVE_VERSION, diff: {} }, registry);

    const { log: _loadedLog, carriedTold: _loadedTold, ...loaded } = state;
    const { log: _openingLog, carriedTold: _openingTold, ...opening } = initialState(registry);
    expect(loaded).toEqual(opening);
  });

  it('throws a clear error on a version mismatch', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    expect(() => loadSave(state, { version: SAVE_VERSION + 1, diff: {} }, registry)).toThrow(/version/);
  });

  it('carries an open modal stack across a round trip, and refuses a body that is not one', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    openModalNamed(state, 'choose-race');
    openModalNamed(state, 'choose-name');

    const { version, ...diff } = JSON.parse(serializeSave(state, registry));
    const restored = createGameState();
    loadSave(restored, { version, diff }, registry);
    expect(restored.modals).toEqual([
      { name: 'choose-race', answers: {} },
      { name: 'choose-name', answers: {} },
    ]);

    for (const body of [
      'choose-name',
      [{ answers: {} }],
      [{ name: 'choose-name' }],
      [{ name: 'choose-name', answers: { name: 7 } }],
      [{ name: 'dialogue', answers: {} }],
      [{ name: 'dialogue', answers: {}, cursor: { dialogue: 'chat', node: 'greeting', resumeIndex: 1.5, replay: true } }],
      [{ name: 'dialogue', answers: {}, cursor: { dialogue: 'chat', node: 'greeting', resumeIndex: 1 } }],
      [{ name: 'item-plane', answers: {}, target: 'charm' }],
      [{ name: 'item-plane', answers: {}, hex: '0,0' }],
      [{ name: 'item-plane', answers: {}, target: 'charm', hex: 0 }],
    ]) {
      expect(() => loadSave(createGameState(), { version: SAVE_VERSION, diff: { modals: body } as never }, registry), JSON.stringify(body)).toThrow(/modals holds/);
    }
  });

  it('carries a plane screen across a round trip while the copy it grows is still carried', () => {
    const registry = loadInEnglish(MODULE);
    const state = createGameState();
    receiveItem(state, registry, 'blade', 1);
    (state.modals as ModalFrame[]).push({ name: 'item-plane', answers: {}, target: '1', hex: '0,0' });

    const { version, ...diff } = JSON.parse(serializeSave(state, registry));
    const restored = createGameState();
    expect(loadSave(restored, { version, diff }, registry)).toEqual([]);
    expect(restored.modals).toEqual([{ name: 'item-plane', answers: {}, target: '1', hex: '0,0' }]);
  });

  it('closes a modal frame the loaded registry cannot answer, and reports it, instead of restoring it', () => {
    const registry = loadInEnglish(MODULE);
    for (const [frame, message] of [
      [{ name: 'haggling', answers: {} }, 'Closed modal Haggling because it is not a modal this engine knows.'],
      [{ name: 'dialogue', answers: {}, cursor: { dialogue: 'gone', node: 'greeting', resumeIndex: 1, replay: true } }, 'Closed modal Dialogue because dialogue gone is not loaded.'],
      [{ name: 'choose-name', answers: { name: 'Rowan' } }, 'Closed modal Choose Name because it was saved with every option already answered.'],
      [{ name: 'choose-race', answers: { race: 'wyvern' } }, 'Closed modal Choose Race because it has no race that takes "wyvern".'],
      [{ name: 'item-plane', answers: {}, target: 'charm', hex: '0,0' }, 'Closed modal Item Plane because it grows charm, which the player no longer carries.'],
      [{ name: 'item-plane', answers: {}, target: '4', hex: '0,0' }, 'Closed modal Item Plane because it grows 4, which the player no longer carries.'],
    ] as const) {
      const state = createGameState();
      const warnings = loadSave(state, { version: SAVE_VERSION, diff: { modals: [frame] } as never }, registry);

      expect(state.modals, JSON.stringify(frame)).toEqual([]);
      expect(warnings.map((warning) => warning.message)).toContain(message);
      expect(state.log).toEqual([]);
    }
  });
});

const PRUNE_MODULE =
  FIXTURE_WORLD +
  `
# location camp
flags: lit

# location cave
x: 1, y: 0

# item bread

# item helm
slot: head

# flag known

# skill cooking

# stat strength
base: 1

# resource health
max: max-health

# dialogue miki
node hello:
  Hi.
`;

const WIDER_MODULE = `${PRUNE_MODULE}
# stat agility

# item lost-meal
food, +1 strength, 60s
`
  .replace('# item bread\n', '# item bread\nfood, +1 strength, 60s\n')
  .replace('# item helm\nslot: head\n', '# item helm\nslot: head\n+1 agility\n');


describe('pruneStateForRegistry', () => {
  it('removes state entries whose content ids are not loaded', () => {
    const registry = loadInEnglish(PRUNE_MODULE);
    const state = initialState(registry);
    state.location = 'missing-camp';
    state.inventory.bread = 1;
    state.inventory['mod.gem'] = 2;
    state.flags.known = true;
    state.flags['camp.lit'] = true;
    state.flags['cave.discovered'] = true;
    state.flags['mod.flag'] = true;
    state.visits['miki.hello'] = 1;
    state.visits['mod.dialogue.hello'] = 3;
    state.xp.cooking = 4;
    state.xp.mining = 5;
    restorePools(state, { health: toMilliUnits(6), mana: toMilliUnits(7) });
    const wider = loadInEnglish(WIDER_MODULE);
    grantBuff(state, PLAYER, wider.items.get('bread')!, 10);
    grantBuff(state, PLAYER, wider.items.get('lost-meal')!, 10);
    grantBuff(state, PLAYER, wider.items.get('helm')!, 10);
    grantBuff(state, 'ghost', wider.items.get('bread')!, 10);
    state.activeAction = {
      ownerRef: 'item.mod.gem',
      actionSlug: 'eat',
      repeating: false,
      implicitTarget: IMPLICIT_TARGET_FULL,
      cadences: { [PLAYER]: { progress: 0, attemptsMade: 0 } },
    };

    const warnings = pruneStateForRegistry(state, registry);

    expect(state.location).toBe('camp');
    expect(state.inventory).toEqual({ bread: 1 });
    expect(state.flags).toEqual({ known: true, 'camp.lit': true, 'cave.discovered': true });
    expect(state.visits).toEqual({ 'miki.hello': 1 });
    expect(state.xp).toEqual({ cooking: 4 });
    expect(state.resources).toEqual({ health: toMilliUnits(6) });
    expect(Object.keys(state.buffs)).toEqual([PLAYER]);
    expect(buffsOf(state, PLAYER).map((buff) => buff.source)).toEqual(['bread']);
    expect(state.activeAction).toBeNull();
    expect(warnings.map((warning) => warning.path)).toEqual(
      expect.arrayContaining([
        'location',
        'inventory.mod.gem',
        'flags.mod.flag',
        'visits.mod.dialogue.hello',
        'xp.mining',
        'resources.mana',
        'buffs.player.lost-meal',
        'buffs.player.helm',
        'buffs.ghost',
        'activeAction',
      ]),
    );
  });

  it('clears a race the loaded world no longer declares, and keeps the name the player chose', () => {
    const registry = loadInEnglish(`${PRUNE_MODULE}
# race human
`);
    const state = createGameState();
    const warnings = loadSave(state, { version: SAVE_VERSION, diff: { player: { name: 'Rowan', race: 'elf' } } }, registry);

    expect(state.player).toEqual({ name: 'Rowan', race: '' });
    expect(warnings).toEqual([{ path: 'player.race', id: 'elf', message: "Cleared the player's race because elf is not loaded." }]);
    expect(loadSave(createGameState(), { version: SAVE_VERSION, diff: { player: { name: 'Rowan', race: 'human' } } }, registry)).toEqual([]);
  });

  it('keeps object-owned flags and map discovery, which live only in the namespace', () => {
    const registry = loadInEnglish(PRUNE_MODULE);
    const state = initialState(registry);
    state.flags['camp.lit'] = true;
    state.flags['cave.discovered'] = true;
    const saved = { version: SAVE_VERSION, diff: diffState(state, initialState(registry)) };

    const target = createGameState();
    const warnings = loadSave(target, saved, registry);

    expect(warnings).toEqual([]);
    expect(target.flags).toEqual({ 'camp.lit': true, 'cave.discovered': true });
  });

  it('loadSave prunes restored stale ids, reporting them to its caller and not to the player', () => {
    const registry = loadInEnglish(PRUNE_MODULE);
    const state = createGameState();
    const warnings = loadSave(state, { version: SAVE_VERSION, diff: { inventory: { 'mod.gem': 2 }, flags: { 'mod.flag': true } } }, registry);

    expect(state.inventory).toEqual({});
    expect(state.flags).toEqual({});
    expect(warnings.map((warning) => warning.path)).toEqual(['inventory.mod.gem', 'flags.mod.flag']);
    expect(state.log).toEqual([]);
  });
});

describe('compareSave', () => {
  it('returns no differences for a matching state', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.inventory.bread = 1;
    const saved = { version: SAVE_VERSION, diff: diffState(state, initialState(registry)) };
    expect(compareSave(state, saved, registry)).toEqual([]);
  });

  it('reports a human-readable mismatch', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.flags['side-quest'] = true;
    const saved = { version: SAVE_VERSION, diff: { flags: { 'side-quest': false } } };
    expect(compareSave(state, saved, registry)).toEqual(['flags.side-quest: true vs false']);
  });

  // A path is what the player did, so what the numbers came to is not compared however a sheet
  // names it. This is the whole of what keeps a balance pass out of the suite, so it is proved on
  // a field that is not walked rather than left to the corpus to notice.
  it('is blind to a field a walked path is not made of, however loudly the save names it', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.inventory.bread = 2;
    state.xp['tutorial.baking'] = 900;
    state.time = 12345;
    const saved = { version: SAVE_VERSION, diff: { inventory: { bread: 1 }, xp: { 'tutorial.baking': 3 }, time: 7 } };
    expect(compareSave(state, saved, registry)).toEqual([]);
    expect(compareSaveOnly(state, saved, registry)).toEqual([]);
  });

  it('reports a flag present in the save but absent from the state', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    const saved = { version: SAVE_VERSION, diff: { flags: { 'tutorial.quest-given': true } } };
    expect(compareSave(state, saved, registry)).toEqual(['flags.tutorial.quest-given: (absent) vs true']);
  });

  it('throws a clear error on a version mismatch', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    expect(() => compareSave(state, { version: SAVE_VERSION + 1, diff: {} }, registry)).toThrow(/version/);
  });
});

describe('compareSaveOnly', () => {
  it('ignores a live key the save is silent on', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.flags['named'] = true;
    state.flags['side-quest'] = true;
    const saved = { version: SAVE_VERSION, diff: { flags: { named: true } } };
    expect(compareSaveOnly(state, saved, registry)).toEqual([]);
  });

  it('reports a human-readable mismatch on a key the save does name', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.flags['side-quest'] = true;
    const saved = { version: SAVE_VERSION, diff: { flags: { 'side-quest': false } } };
    expect(compareSaveOnly(state, saved, registry)).toEqual(['flags.side-quest: true vs false']);
  });

  it('reads through to the field default for a key the live state never touched', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    const saved = { version: SAVE_VERSION, diff: { flags: { 'tutorial.quest-given': true } } };
    expect(compareSaveOnly(state, saved, registry)).toEqual(['flags.tutorial.quest-given: false vs true']);
  });

  it('ignores a scalar field the save does not mention, however far the live state has drifted', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    state.time = 5000;
    state.location = 'elsewhere';
    const saved = { version: SAVE_VERSION, diff: {} };
    expect(compareSaveOnly(state, saved, registry)).toEqual([]);
  });

  it('throws a clear error on a version mismatch', () => {
    const registry = loadInEnglish(MODULE);
    const state = initialState(registry);
    expect(() => compareSaveOnly(state, { version: SAVE_VERSION + 1, diff: {} }, registry)).toThrow(/version/);
  });
});

const SAVE_TEST_MODULE =
  FIXTURE_WORLD +
  `
# item gold
title: Gold

# stat might
base: 3

# item charm
slot: neck
+2 might

# flag opened

# entity chest
open:
  give: 1 gold
  set: opened

# save empty
{"version":${SAVE_VERSION},"flags":{"camp.discovered":true,"camp.touched":true}}

# test load-and-match
load: empty
expect: empty

# test load-then-diverge
load: empty
use: entity.chest.open
expect: empty

# test load-then-diverge-only
load: empty
use: entity.chest.open
expect only: empty

# test never-loaded-fails-only
expect only: empty

# test equips-a-charm
equip: charm
assert: has charm

# test equips-then-unequips
equip: charm
unequip: neck
assert: has charm
`;

describe('a # test section records an equip', () => {
  function replaying(testId: string): ReturnType<typeof createGameState> {
    const registry = loadInEnglish(SAVE_TEST_MODULE);
    const state = createGameState('camp');
    state.inventory['charm'] = 1;
    expect(runTest(testId, registry, state)).toEqual({ passed: true });
    return state;
  }

  it('equips by authored id, fills the slot, and moves the stat', () => {
    const state = replaying('equips-a-charm');
    expect(state.equipped).toEqual({ neck: 'charm' });
    expect(statValue('might', state, loadInEnglish(SAVE_TEST_MODULE))).toBe(5);
    expect(state.inventory['charm']).toBe(0);
  });

  it('unequips by slot, emptying it again', () => {
    expect(replaying('equips-then-unequips').equipped).toEqual({});
  });
});

describe('# save section wired through load: / expect: test directives', () => {
  it('passes when the loaded state still matches the save', () => {
    const registry = loadInEnglish(SAVE_TEST_MODULE);
    const state = createGameState();
    expect(runTest('load-and-match', registry, state)).toEqual({ passed: true });
  });

  it('fails with a save-mismatch failure once state diverges after loading', () => {
    const registry = loadInEnglish(SAVE_TEST_MODULE);
    const state = createGameState();
    const result = runTest('load-then-diverge', registry, state);
    expect(result.passed).toBe(false);
    expect(result.failure).toMatch(/^save mismatch empty:/);
    expect(result.failure).toMatch(/flags\.opened/);
  });

  it('expect only: passes on the same divergence, since the save never names that flag', () => {
    const registry = loadInEnglish(SAVE_TEST_MODULE);
    const state = createGameState();
    expect(runTest('load-then-diverge-only', registry, state)).toEqual({ passed: true });
  });

  it('expect only: still fails when a key the save does name has not been reached', () => {
    const registry = loadInEnglish(SAVE_TEST_MODULE);
    const state = createGameState();
    const result = runTest('never-loaded-fails-only', registry, state);
    expect(result.passed).toBe(false);
    expect(result.failure).toMatch(/^save mismatch empty:/);
    expect(result.failure).toMatch(/flags\.camp\.discovered/);
  });
});

describe('a # save body is checked past its version', () => {
  const registry = loadInEnglish(PRUNE_MODULE);
  const load = (diff: Record<string, unknown>) => () => loadSave(createGameState(), { version: SAVE_VERSION, diff }, registry);

  it('refuses a scalar of the wrong type', () => {
    expect(load({ time: 'potato' })).toThrow(/save field time holds "potato"/);
    expect(load({ location: 3 })).toThrow(/save field location holds 3/);
  });

  it('refuses a record written as anything but an object of ids', () => {
    expect(load({ flags: 'known' })).toThrow(/save field flags must be an object of ids/);
    expect(load({ inventory: ['bread'] })).toThrow(/save field inventory must be an object of ids/);
  });

  it('refuses a record member of the wrong type', () => {
    expect(load({ inventory: { bread: 'lots' } })).toThrow(/save field inventory\.bread holds "lots"/);
  });

  it('refuses a field the engine does not keep', () => {
    expect(load({ inventroy: {} })).toThrow(/save holds an unknown field: inventroy/);
  });

  it('still accepts every field written correctly', () => {
    expect(load({ time: 3, location: 'camp', flags: { known: true }, inventory: { bread: 2 } })).not.toThrow();
  });

  it('rejects a fractional rng cursor (audit-2026-07-30-rng-integer-check)', () => {
    expect(load({ rng: 0.5 })).toThrow(/save field rng holds 0.5/);
  });

  it('requires each equipped slot to hold an item id', () => {
    expect(load({ equipped: { head: 'helm' } })).not.toThrow();
    expect(load({ equipped: { head: 7 } })).toThrow(/save field equipped.head holds 7/);
  });
});

describe('a # save written over others', () => {
  // A real item copy, because the ids are being followed through a load and pruning throws away a
  // copy of a kind nothing claims before there is anything left to look at.
  const plane = { '0,0': { jewel: null, entry: null, roll: 0.5, allocatedPositions: [], allocatedSlots: [], effects: [] } };
  const copy = (id: string, template = 'helm') => ({ next: Number(id) + 1, byId: { [id]: { kind: 'item', template, payload: { roll: 0.5, plane } } } });

  const laid = (saves: Record<string, ParsedSave>, source = PRUNE_MODULE): Registry => {
    const registry = loadInEnglish(source);
    for (const [id, saved] of Object.entries(saves)) registry.saves.set(id, saved);
    return registry;
  };

  it('refuses a chain that comes back to where it started, and says the way round', () => {
    const registry = laid({ here: { version: SAVE_VERSION, over: ['there'], diff: {} }, there: { version: SAVE_VERSION, over: ['here'], diff: {} } });
    expect(() => loadSave(createGameState(), registry.saves.get('here')!, registry)).toThrow(/written over itself: .*there.*here/);
  });

  it('refuses a layer nothing declares', () => {
    const registry = laid({});
    expect(() => loadSave(createGameState(), { version: SAVE_VERSION, over: ['nowhere'], diff: {} }, registry)).toThrow(/written over nowhere, which nothing declares/);
  });

  // Both layers were written by runs that minted from the same counter, so both call their own copy
  // `1`. What is asked here is that the second one is dealt a fresh id and that every way its body
  // names the copy follows it -- worn, in the pack, and under way -- while the first keeps the id it
  // was written with.
  it('renumbers the second of two layers that each minted copies, and takes its references with it', () => {
    // A second helm with an action of its own, because what is under way is pruned off a save that
    // names an action nothing declares. It is aimed at the copy rather than owned by one: an
    // `item.<copy>` owner is pruned on every load, which is a fault of its own and not this one's.
    const swinging = `${PRUNE_MODULE}\n# item swung-helm\nslot: head\nswing:\n  say: Thump.\n`;
    const registry = laid({ grown: { version: SAVE_VERSION, diff: { instances: copy('1'), equipped: { head: '1' } } } }, swinging);
    const state = createGameState();
    loadSave(
      state,
      { version: SAVE_VERSION, over: ['grown'], diff: { instances: copy('1', 'swung-helm'), packOrder: ['1'], activeAction: { ownerRef: 'item.swung-helm', actionSlug: 'swing', repeating: false, implicitTarget: 0, cadences: {}, roster: { player: { ownerRef: 'item.swung-helm', actionSlug: 'swing', target: '1' } } } } },
      registry,
    );

    expect(Object.keys(state.instances.byId).sort()).toEqual(['1', '2']);
    expect(state.instances.next).toBe(3);
    expect(state.equipped).toEqual({ head: '1' });
    expect(state.packOrder).toEqual(['2']);
    expect(state.activeAction?.roster?.['player']).toMatchObject({ target: '2' });
  });

  it('leaves the ids of a lone minting layer exactly as they were written, whichever layer it is', () => {
    const registry = laid({ grown: { version: SAVE_VERSION, diff: { instances: copy('4'), equipped: { head: '4' } } } });
    const state = createGameState();
    loadSave(state, { version: SAVE_VERSION, over: ['grown'], diff: { flags: { known: true } } }, registry);

    expect(Object.keys(state.instances.byId)).toEqual(['4']);
    expect(state.equipped).toEqual({ head: '4' });
  });

  it('takes a layer that carries copies where it is the only one that does', () => {
    const registry = laid({ grown: { version: SAVE_VERSION, diff: { instances: copy('1') } } });
    const state = createGameState();
    expect(() => loadSave(state, { version: SAVE_VERSION, over: ['grown'], diff: { flags: { known: true } } }, registry)).not.toThrow();
    expect(state.flags['known']).toBe(true);
  });

  it('checks a layer against its own version, so a stale one beneath is refused too', () => {
    const registry = laid({ stale: { version: SAVE_VERSION - 1, diff: {} } });
    expect(() => loadSave(createGameState(), { version: SAVE_VERSION, over: ['stale'], diff: {} }, registry)).toThrow(/version mismatch/);
  });

  it('serializes to what is left over its layers, so a body records what the layers do not already hold', () => {
    const registry = laid({ beneath: { version: SAVE_VERSION, diff: { inventory: { bread: 2 }, location: 'camp' } } });
    const state = createGameState();
    loadSave(state, { version: SAVE_VERSION, over: ['beneath'], diff: {} }, registry);
    state.inventory['bread'] = 5;
    const { version, ...residual } = JSON.parse(serializeSave(state, registry, ['beneath'])) as { version: number } & Record<string, unknown>;
    expect(version).toBe(SAVE_VERSION);
    expect(residual).toEqual({ inventory: { bread: 5 } });
  });
});

describe('equipped survives a registry that no longer matches it', () => {
  const registry = loadInEnglish(PRUNE_MODULE);

  function pruned(equipped: Record<string, string>): { state: ReturnType<typeof createGameState>; warnings: ReturnType<typeof pruneStateForRegistry> } {
    const state = createGameState('camp');
    state.inventory['helm'] = 1;
    state.equipped = equipped;
    return { state, warnings: pruneStateForRegistry(state, registry) };
  }

  it('keeps a slot whose item still declares it', () => {
    const { state, warnings } = pruned({ head: 'helm' });
    expect(state.equipped).toEqual({ head: 'helm' });
    expect(warnings).toEqual([]);
  });

  it('drops a slot whose item is gone, saying so rather than crashing', () => {
    const { state, warnings } = pruned({ head: 'ghost-helm' });
    expect(state.equipped).toEqual({});
    expect(warnings.map((w) => w.message)).toEqual(['Unequipped head because its item ghost-helm is not loaded.']);
  });

  it('drops a slot the item no longer declares', () => {
    const { state, warnings } = pruned({ tail: 'helm' });
    expect(state.equipped).toEqual({});
    expect(warnings.map((w) => w.message)).toEqual(['Unequipped tail because its item helm no longer declares that slot.']);
  });
});

describe('a walk under way survives its destination being retitled', () => {
  const ISLAND = (far: string): string => ['# info isla', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting', 'adjacent:', '  far', '', '# location far', `title: ${far}`, 'x: 30, y: 0', 'adjacent:', '  shore'].join('\n');

  const walking = (): GameState => {
    const registry = loadInEnglish(ISLAND('Far Beach'));
    const state = initialState(registry);
    armTravel('isla.shore', 'isla.far', registry, state);
    expect(state.activeAction, 'the walk did not arm').not.toBeNull();
    return state;
  };

  it('stores an id rather than the sentence a player reads', () => {
    expect(walking().activeAction!.actionSlug).toBe(TRAVEL_ADDRESS);
    expect(JSON.parse(serializeSave(walking(), loadInEnglish(ISLAND('Far Beach')))).activeAction.actionSlug).toBe(TRAVEL_ADDRESS);
  });

  it('reads back as words that are not the address, so reaching for the wrong one does not arm', () => {
    const registry = loadInEnglish(ISLAND('Far Beach'));
    const action = travelAction('isla.shore', 'isla.far', registry);

    expect(actionAddress(action)).toBe(TRAVEL_ADDRESS);
    expect(actionWords(action).text).not.toBe(TRAVEL_ADDRESS);
  });

  it('keeps the walk when the destination is retitled underneath it', () => {
    const state = walking();

    expect(pruneStateForRegistry(state, loadInEnglish(ISLAND('Distant Beach')))).toEqual([]);
    expect(state.activeAction).not.toBeNull();
  });

  it('stops the walk when the destination is gone, and says so from a key', () => {
    const state = walking();
    const registry = loadInEnglish(['# info isla', 'version: 1.0.0', '', '# location shore', 'x: 0, y: 0', 'starting'].join('\n'));

    const warnings = pruneStateForRegistry(state, registry);
    expect(warnings.map((warning) => warning.message)).toEqual(['Stopped unavailable action travel.isla.shore>isla.far.travel: unknown travel destination: isla.far.']);
    expect(state.activeAction).toBeNull();
  });
});

describe('a craft under way stores an id, not the sentence it is offered as', () => {
  const KITCHEN = (recipe: string): string =>
    ['# info cocina', 'version: 1.0.0', 'language: es', '', '# location horno', 'x: 0, y: 0', 'starting', '', '# item harina', 'title: Harina', '', '# item pan', 'title: Pan', '', `# recipe ${recipe}`, 'time: 60', 'in: 1 harina', 'out: 1 pan'].join('\n');

  const SPANISH = [
    '# info cocina-es',
    'version: 1.0.0',
    'dependencies:',
    '  cocina',
    '',
    '# locale es',
    'engine.prune.action: Detenida la accion {action}: {reason}.',
    'engine.action.stale.owner: no hay ningun {kind} {id}.',
  ].join('\n');

  const universe = (recipe: string): Registry => loadUniverse([engineLocale(), { name: 'cocina', text: KITCHEN(recipe) }, { name: 'cocina-es', text: SPANISH }]);

  const cooking = (): GameState => {
    const registry = universe('pan');
    const state = initialState(registry, 'es');
    state.inventory['cocina.harina'] = 5;
    armCraft('cocina.pan', registry, state);
    expect(state.activeAction, 'the craft did not arm').not.toBeNull();
    return state;
  };

  it('stores an id rather than the sentence a player reads', () => {
    expect(cooking().activeAction!.actionSlug).toBe(CRAFT_ADDRESS);
    expect(JSON.parse(serializeSave(cooking(), universe('pan'))).activeAction.actionSlug).toBe(CRAFT_ADDRESS);
  });

  it('reads back as words that are not the address, so reaching for the wrong one does not arm', () => {
    const action = universe('pan').recipeActions.get('cocina.pan')!;

    expect(actionAddress(action)).toBe(CRAFT_ADDRESS);
    expect(actionWords(action).text).not.toBe(CRAFT_ADDRESS);
  });

  it('keeps the craft when the recipe is retitled underneath it', () => {
    const state = cooking();
    const renamed = loadUniverse([engineLocale(), { name: 'cocina', text: KITCHEN('pan') }, { name: 'cocina-es', text: [SPANISH, 'cocina.recipe.pan.title: Barra'].join('\n') }]);

    expect(pruneStateForRegistry(state, renamed)).toEqual([]);
    expect(state.activeAction).not.toBeNull();
  });

  it('says the craft is gone with no word the played language did not supply', () => {
    const state = cooking();

    const warnings = pruneStateForRegistry(state, universe('barra'));
    expect(warnings.map((warning) => warning.message)).toEqual(['Detenida la accion recipe.cocina.pan.craft: no hay ningun recipe cocina.pan..']);
    expect(state.activeAction).toBeNull();
  });
});

describe('a fight under way survives its action being retitled', () => {
  const ARENA = (title: string): string =>
    [
      '# info isla',
      'version: 1.0.0',
      'language: es',
      '',
      '# location arena',
      'x: 0, y: 0',
      'starting',
      'entities:',
      '  rata',
      '',
      '# stat attack',
      'base: 4',
      '',
      '# stat dr',
      '',
      '# stat attack-rate',
      'base: 60',
      '',
      '# stat max-health',
      '',
      '# resource health',
      'max: max-health',
      '',
      '# action melee-combat',
      `title: ${title}`,
      'rate: my attack-rate',
      'damage: my attack vs their dr',
      'depletes: their health',
      '',
      '# entity player',
      'stats: max-health 1000, attack 4, attack-rate 60',
      'uses: melee-combat',
      '',
      '# entity rata',
      'stats: max-health 1000',
      '',
      '# entity comoda',
      `${title.toLowerCase()} drawer:`,
      '  instant',
      '  say: polvo',
    ].join('\n');

  const SPANISH = [
    '# info isla-es',
    'version: 1.0.0',
    'dependencies:',
    '  isla',
    '',
    '# locale es',
    'engine.prune.action: Detenida la accion {action}: {reason}.',
    'engine.action.stale.action: no existe la accion {action} en {owner}',
  ].join('\n');

  const universe = (title: string): Registry => loadUniverse([engineLocale(), { name: 'isla', text: ARENA(title) }, { name: 'isla-es', text: SPANISH }]);

  const fighting = (): GameState => {
    const registry = universe('Fight');
    const state = initialState(registry, 'es');
    armFightAction('isla.melee-combat', 'isla.rata', registry, state);
    expect(state.activeAction, 'the fight did not arm').not.toBeNull();
    return state;
  };

  it('stores an id rather than the title a player reads, on the roster as well', () => {
    expect(fighting().activeAction!.actionSlug).toBe('melee-combat');
    expect(fighting().activeAction!.roster![PLAYER].actionSlug).toBe('melee-combat');
    expect(JSON.parse(serializeSave(fighting(), universe('Fight'))).activeAction.actionSlug).toBe('melee-combat');
  });

  it('keeps the fight when the action is retitled underneath it', () => {
    const state = fighting();

    expect(pruneStateForRegistry(state, universe('Combat'))).toEqual([]);
    expect(state.activeAction).not.toBeNull();
  });

  const searching = (): GameState => {
    const registry = universe('Fight');
    const state = initialState(registry, 'es');
    armAction('entity', 'isla.comoda', 'fight-drawer', registry, state);
    expect(state.activeAction, 'the search did not arm').not.toBeNull();
    return state;
  };

  it('says a block that is gone is gone, with no English in the log', () => {
    const state = searching();

    const warnings = pruneStateForRegistry(state, universe('Combat'));
    expect(warnings.map((warning) => warning.message)).toEqual(['Detenida la accion entity.isla.comoda.fight-drawer: no existe la accion fight-drawer en entity.isla.comoda.']);
    expect(state.activeAction).toBeNull();
  });
});

describe('what checkSave accepts, loadSave can read, for every field there is', () => {
  const registry = loadInEnglish(MODULE);
  const entries = Object.entries(SAVE_FIELDS);

  it('walks every field a save carries', () => {
    expect(entries.length).toBeGreaterThan(15);
  });

  for (const [field, rule] of entries) {
    it(`admits the sparsest ${field}`, () => {
      expect(rule.holds(rule.sparsest)).toBe(true);
    });

    it(`loads the sparsest ${field}`, () => {
      const diff = rule.shape === 'record' ? { [field]: { 'nobody.declares-this': rule.sparsest } } : { [field]: rule.sparsest };
      expect(() => loadSave(createGameState(), { version: SAVE_VERSION, diff }, registry)).not.toThrow();
    });
  }

  // A save written before a setting was declared holds nothing under its name. Refusing that would
  // mean every setting added is a setting that shuts the saves written the month before it.
  it('opens a save written before any one setting there is was declared', () => {
    for (const missing of SETTING_NAMES) {
      const settings = Object.fromEntries(SETTING_NAMES.filter((name) => name !== missing).map((name) => [name, settingNamed(name).standing]));
      expect(() => loadSave(createGameState(), { version: SAVE_VERSION, diff: { settings } }, registry), missing).not.toThrow();
    }
    expect(() => loadSave(createGameState(), { version: SAVE_VERSION, diff: { settings: { hardcore: {} } } }, registry)).toThrow(/^save field settings/);
  });

  it('turns a raise from below the checks into a diagnostic, whatever raised', () => {
    const raising = loadInEnglish(MODULE);
    const asking = raising.locations.has.bind(raising.locations);
    raising.locations.has = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'indexOf')");
    };

    try {
      expect(() => loadSave(createGameState(), { version: SAVE_VERSION, diff: { time: 5 } }, raising)).toThrow(RuntimeError);
      expect(() => loadSave(createGameState(), { version: SAVE_VERSION, diff: { time: 5 } }, raising)).toThrow(/this save cannot be loaded/);
    } finally {
      raising.locations.has = asking;
    }
  });

  it('refuses the shapes that used to reach the loader, naming the field rather than raising from inside it', () => {
    const refuses = (diff: Record<string, unknown>) => expect(() => loadSave(createGameState(), { version: SAVE_VERSION, diff }, registry)).toThrow(/^save field/);

    refuses({ activeAction: {} });
    refuses({ activeAction: { ownerRef: 'entity.chest', actionSlug: 'open', repeating: false, implicitTarget: 0 } });
    refuses({ activeAction: { ownerRef: 'entity.chest', actionSlug: 'open', repeating: false, implicitTarget: 0, cadences: {}, actors: { rat: {} } } });
    refuses({ journey: {} });
    refuses({ journey: { to: 'camp' } });
    refuses({ journey: { to: 'camp', legs: [3] } });
    refuses({ player: {} });
    refuses({ player: { name: 'Rowan' } });
  });
});

describe('no load path advances time', () => {
  const registry = loadInEnglish(MODULE);

  it('leaves state.time at exactly what the payload holds', () => {
    for (const time of [0, 1, 5_000, 90_061_000]) {
      const state = initialState(registry);
      state.time = 777;
      loadSave(state, { version: SAVE_VERSION, diff: { time } }, registry);
      expect(state.time).toBe(time);
    }
  });

  it('leaves it at the baseline when the payload carries no time at all', () => {
    const state = initialState(registry);
    state.time = 777;
    loadSave(state, { version: SAVE_VERSION, diff: {} }, registry);
    expect(state.time).toBe(0);
  });

  it('round-trips a clock that was moved, through the bytes a `# save` section is made of', () => {
    const state = initialState(registry);
    state.time = 42_000;
    const saved = parseSaveSection({ kind: 'save', id: 'x', body: [{ text: serializeSave(state, registry), span: { start: 0, end: 0 }, children: [] }], span: { start: 0, end: 0 } });

    const target = initialState(registry);
    loadSave(target, saved, registry);
    expect(target.time).toBe(42_000);
  });
});
