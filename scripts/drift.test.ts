import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_CHANGES_MODULE_ID } from '../src/content/localChanges';
import { withEngineLocale } from '../src/content/engineLocale';
import { OPENING_CELLS } from '../src/runtime/openUniverseFixture';
import { loadUniverseWithDiagnostics } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';
import { COMMANDS, runLine, type AuthoringContext, type CommandResult } from '../src/runtime/command';
import { createSaveContext } from '../src/runtime/saveSlots';
import { serializeSession } from '../src/runtime/session';
import { slotStore, type SlotDriver } from '../src/runtime/store';
import { browserSlots } from '../src/ui/browserStore';
import { createDriver, type Driver } from '../src/ui/driver';
import { pageStorage } from '../src/ui/agent/pageStorage';
import { SHIPPED_SOURCES } from '../src/ui/shippedContent';
import { appendOutputs } from '../src/ui/transcript';
import { fileSlots } from './lib/slotFile';
import { openRepl, type Repl } from './play-cli';

const refused = (result: CommandResult): boolean => result.output.some((each) => each.kind === 'message' && each.tone === 'error');

// The carve-out this file used to carry is gone. The GUI had no authoring
// context, so a section edit was the one line it answered differently and it
// was counted rather than compared; it has one now, over a store of its own,
// and every line in the table is held to identical output on both sides again.

const made: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-drift-'));
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

// One clock both drivers read, so a stamp is not a reason for two slots holding
// the same game to differ in a byte.
const STAMP = 1_700_000_000_000;

// The three table entries whose names are shapes rather than words, given one
// line each of that shape. Every other line below is the name the table itself
// carries, so a command added tomorrow is replayed here on the day it exists
// and nobody edits this file — or anything under src/ui — to make that happen.
const SHAPED: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'go to the door' };

// Both drivers armed the same way. `driving` decides whether a spannable
// action is armed or resolved where it stands, and the GUI always arms, so a
// comparison against a REPL that resolves would compare two different games.
//
// Both authoring the same way too, and both writing: the REPL keeps its local
// module in a slot here rather than in a file, because what is being compared
// is the pair of drivers and not the pair of stores, and a REPL that could not
// write would equalise the two by taking the capability away.
const withStorage = (): (() => Storage) => {
  const storage = pageStorage();
  return () => storage;
};

function bothOver(base: readonly ModuleSource[], local: string): { repl: Repl; gui: Driver; slots: { repl: SlotDriver; gui: SlotDriver } } {
  // The engine's own English on both sides: the REPL puts it there itself and
  // the browser's glob has already, so a fixture that named neither would be
  // two different universes compared with each other.
  const shipped = withEngineLocale(base);
  const localSource: ModuleSource = { name: LOCAL_CHANGES_MODULE_ID, text: local };
  const sources = local === '' ? shipped : [...shipped, localSource];
  const dependencies = loadUniverseWithDiagnostics(sources).loadedModules.filter((id) => id !== LOCAL_CHANGES_MODULE_ID);
  // The store each driver's own player would have: one file per slot under the
  // CLI, one prefixed key per slot under the browser. Two stores rather than
  // one, because a shared store would let one driver read what the other wrote
  // and hide exactly the drift this measures.
  const slots = { repl: fileSlots(tempDir()), gui: browserSlots(withStorage()) };
  const save = createSaveContext(slots.repl, () => STAMP);
  for (const driver of local === '' ? [] : [slots.repl, slots.gui]) slotStore(driver, () => STAMP).write(LOCAL_CHANGES_MODULE_ID, local);
  const authoring: AuthoringContext = {
    baseSources: [...shipped],
    dependencies,
    localSource,
    writeLocalChanges: (text) => void save.store.write(LOCAL_CHANGES_MODULE_ID, text),
    readLocalChanges: () => save.store.read(LOCAL_CHANGES_MODULE_ID)?.payload ?? '',
  };
  return {
    repl: openRepl(sources, { authoring, save, driving: true }),
    gui: createDriver(shipped, { ticker: () => () => undefined, slots: slots.gui, now: () => STAMP }),
    slots,
  };
}

const bothDrivers = (): { repl: Repl; gui: Driver; slots: { repl: SlotDriver; gui: SlotDriver } } => bothOver(SHIPPED_SOURCES, '');

// What each store is standing in, slot by slot, as the bytes it holds. c15's
// comparison: a view is what a driver was told and this is what it is standing
// in, so two drivers told the same lines must have written the same slots.
function slotBytes(driver: SlotDriver): Record<string, unknown> {
  const store = slotStore(driver, () => STAMP);
  return Object.fromEntries(store.list().map((name) => [name, store.read(name)]));
}

// One line through both, held to the two things the clause names: the GUI's
// log gains exactly the REPL's output and nothing else, and the two sessions
// serialize to the same bytes. Per line rather than at the end, because a
// divergence that cancels itself out is still one and only this names the line
// it happened on.
function inStep(repl: Repl, gui: Driver, line: string, dispatch: () => void = () => gui.send(line)): { result: CommandResult } {
  const before = gui.snapshot().transcript;
  const result = runLine(repl.context, line);
  dispatch();

  const where = `after ${JSON.stringify(line)}`;
  expect(gui.snapshot().transcript.entries, where).toEqual(appendOutputs(before, result.output).entries);
  expect(gui.serialized(), where).toBe(serializeSession(repl.context.session));
  return { result };
}

// The whole crafting route as the answers a player gives, each of which is a
// value the screen it is given to published. The GUI answers through its own
// gesture and the REPL through the line the shared table parses, so a screen
// only one driver can walk is a step that fails rather than a difference nobody
// measures. It is the route `growing-through-the-inventory-screen` replays over
// shipped content; here it is walked twice at once.
const CRAFTING_ROUTE: ReadonlyArray<readonly [string, string]> = [
  ['verb', 'grow'],
  ['plane', 'allocate: slot e'],
  ['plane', 'slot: e with tutorial-island.crossroads-jewel'],
  ['plane', "feed: with tutorial-island.masters-whetstone"],
  ['plane', 'go: 1,0'],
  ['plane', 'allocate: position 1'],
  ['plane', 'allocate: slot ne'],
  ['plane', 'slot: ne with tutorial-island.keen-edge-jewel'],
  ['plane', 'go: 2,-1'],
  ['plane', 'allocate: position 1'],
  ['plane', 'back'],
  ['verb', 'equip'],
];

interface SerializedGrowth {
  equipped: Record<string, string>;
  instances: { byId: Record<string, { payload: { plane: Record<string, unknown> } }> };
}

describe('the two drivers cannot drift', () => {
  it('reaches byte-identical state and says the same things, over a scripted sequence', () => {
    const script = [
      '/look',
      '/inventory',
      '/state',
      '1',
      '/wait 3',
      '/speed 2',
      '/look',
      '/bogus',
      '/assert time >= 3',
      '/expect empty',
      '/dsl location tutorial-island.guide-house x: 9, y: 9',
      '/local list',
      '/local show',
      '/reload',
      '/save',
      '/help',
    ];
    const { repl, gui, slots } = bothDrivers();
    expect(gui.serialized()).toBe(serializeSession(repl.context.session));

    for (const line of script) inStep(repl, gui, line);

    // A pair of drivers that both said nothing at every step would pass every
    // line above.
    expect(gui.snapshot().transcript.entries.length).toBeGreaterThan(script.length);
    // c15, on the two slots this script writes: the module an author edited and
    // the game they saved. Bytes, because a message can agree while the thing
    // standing behind it does not.
    const written = slotBytes(slots.repl);
    expect(Object.keys(written).sort()).toEqual([LOCAL_CHANGES_MODULE_ID, 'player']);
    expect(slotBytes(slots.gui)).toEqual(written);
  });

  // The clause's other half, and the half that keeps holding as the table
  // grows: the corpus is read off COMMANDS. Each entry goes through twice,
  // bare and with an argument, so a command that takes one is exercised on the
  // path where it works as well as the path where it complains.
  it('dispatches every entry in the shared table the way the REPL does', () => {
    const { repl, gui, slots } = bothDrivers();
    expect(COMMANDS.length).toBeGreaterThan(10);
    let accepted = 0;

    for (const spec of COMMANDS) {
      const bare = SHAPED[spec.name] ?? spec.name;
      // A dev power is refused by the driver that is the game while the session
      // is the player's, which is the one difference between the two by design.
      // Compared inside the dev slot instead, so what the pair does with it is
      // still held to being identical — and the entering and the leaving are
      // two more lines that have to match.
      if (spec.dev) inStep(repl, gui, '/dev on');
      for (const line of [bare, `${bare} 1`]) {
        if (!refused(inStep(repl, gui, line).result)) accepted += 1;
      }
      if (spec.dev) inStep(repl, gui, '/dev off');
    }

    // A table every entry of which was refused would prove nothing about
    // dispatch, only about parsing.
    expect(accepted).toBeGreaterThan(7);
    // c15. The table holds /save, /autosave and the dev pair, so walking it is
    // what puts bytes in both stores; a walk that wrote none would compare two
    // empty records and say nothing.
    const written = slotBytes(slots.repl);
    expect(Object.keys(written).length).toBeGreaterThan(1);
    expect(slotBytes(slots.gui)).toEqual(written);
  });

  it('answers a modal through the shared table, by the line the table parses', () => {
    const { repl, gui } = bothDrivers();
    const talk = String(gui.snapshot().view.choices.findIndex((choice) => choice.id === 'talk:tutorial-island.miki') + 1);
    inStep(repl, gui, talk);

    const asked = gui.snapshot().view.modals[0].options[0];
    // The GUI's own route in, held to the line the REPL would have typed.
    inStep(repl, gui, `submit-modal: ${asked.key}=${asked.values![0].value}`, () => gui.answer(asked.key, asked.values![0].value));

    expect(gui.snapshot().view.modals).toEqual([]);
  });

  it('walks the crafting route through both drivers, gesture against typed line', () => {
    const { repl, gui } = bothDrivers();
    inStep(repl, gui, 'use: entity.tutorial-island.smiths-chest.open');
    // The one route onto the screen: a GUI inventory row dispatches the shared
    // command with the item named, so what the row does is a line the REPL types.
    inStep(repl, gui, '/inv tutorial-island.iron-sword', () => gui.open('tutorial-island.iron-sword'));
    for (const [key, value] of CRAFTING_ROUTE) inStep(repl, gui, `submit-modal: ${key}=${value}`, () => gui.answer(key, value));

    expect(gui.snapshot().view.modals).toEqual([]);
    const grown = JSON.parse(gui.serialized()) as SerializedGrowth;
    // A route every step of which was refused would leave both drivers standing
    // in the same unmoved game, and every comparison above would pass over it.
    expect(Object.keys(grown.instances.byId['1'].payload.plane)).toEqual(['0,0', '1,0', '2,-1']);
    expect(grown.equipped).toEqual({ mainhand: '1' });
  });
});

// c5. Opening is the one line the two drivers never took together: the GUI
// recovered and the REPL stranded, so the comparison below could not be made at
// all. It is the same call now, and what it answers is compared over every cell
// of the door's own family — content that will not parse, will not resolve,
// will not order, and content that loads and leaves nowhere to begin.
describe('the two drivers open the same way, over content that will not load', () => {
  it('reaches the same session and reports the same problems, cell by cell', () => {
    expect(OPENING_CELLS.length).toBeGreaterThan(6);
    let reported = 0;

    for (const cell of OPENING_CELLS) {
      const { repl, gui } = bothOver(cell.base, cell.local);

      expect(gui.snapshot().problems, cell.where).toEqual(repl.opened.problems);
      expect(gui.serialized(), cell.where).toBe(serializeSession(repl.context.session));
      reported += repl.opened.problems.length;
    }

    // A family that said nothing anywhere would pass every line above.
    expect(reported).toBeGreaterThan(OPENING_CELLS.length - 1);
  });

  // And both go on taking lines from there, which is what "recovers" means:
  // stranding is a REPL that has no context to hand the next line to.
  it('takes a line on either side of the door, from a universe that would not open', () => {
    const cell = OPENING_CELLS.find((each) => each.local === '')!;
    const { repl, gui } = bothOver(cell.base, cell.local);

    inStep(repl, gui, '/look');
    inStep(repl, gui, '/state');

    // The premise, rather than that there is a session at all: the type says
    // the second, and a cell that quietly began opening cleanly would pass
    // every line above without this.
    expect(gui.snapshot().problems.length).toBeGreaterThan(0);
  });
});
