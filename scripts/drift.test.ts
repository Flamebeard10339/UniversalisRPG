import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCAL_CHANGES_MODULE_ID } from '../src/content/localChanges';
import { withEngineLocale } from '../src/content/engineLocale';
import { OPENING_CELLS } from '../src/runtime/openUniverseFixture';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import type { ModuleSource } from '../src/content/universe';
import { COMMANDS, runLine, type AuthoringContext, type CommandResult } from '../src/runtime/command';
import { createSaveContext } from '../src/runtime/saveSlots';
import { serializeSession, type PlayChoice } from '../src/runtime/session';
import { slotStore, type SlotDriver } from '../src/runtime/store';
import { browserSlots } from '../src/ui/browserStore';
import { createDriver, type Driver } from '../src/ui/driver';
import { pageStorage } from '../src/ui/agent/pageStorage';
import { appendOutputs } from '../src/ui/transcript';
import { fileSlots } from './lib/slotFile';
import { openRepl, type Repl } from './play-cli';
import { fixtureSources } from '../src/content/worldFixture';

const refused = (result: CommandResult): boolean => result.output.some((each) => each.kind === 'message' && each.tone === 'error');

const made: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-drift-'));
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const STAMP = 1_700_000_000_000;

const SHAPED: Record<string, string> = { '<N>': '1', '<enter>': '', '<directive>': 'go to the door' };

const withStorage = (): (() => Storage) => {
  const storage = pageStorage();
  return () => storage;
};

function bothOver(base: readonly ModuleSource[], local: string): { repl: Repl; gui: Driver; slots: { repl: SlotDriver; gui: SlotDriver } } {
  const shipped = withEngineLocale(base);
  const localSource: ModuleSource = { name: LOCAL_CHANGES_MODULE_ID, text: local };
  const sources = local === '' ? shipped : [...shipped, localSource];
  const dependencies = loadUniverseWithDiagnostics(sources).loadedModules.filter((id) => id !== LOCAL_CHANGES_MODULE_ID);
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

const bothDrivers = (): { repl: Repl; gui: Driver; slots: { repl: SlotDriver; gui: SlotDriver } } => bothOver(fixtureSources(), '');

function slotBytes(driver: SlotDriver): Record<string, unknown> {
  const store = slotStore(driver, () => STAMP);
  return Object.fromEntries(store.list().map((name) => [name, store.read(name)]));
}

function inStep(repl: Repl, gui: Driver, line: string, dispatch: () => void = () => gui.send(line)): { result: CommandResult } {
  const before = gui.snapshot().transcript;
  const result = runLine(repl.context, line);
  dispatch();

  const where = `after ${JSON.stringify(line)}`;
  expect(gui.snapshot().transcript.entries, where).toEqual(appendOutputs(before, result.output).entries);
  expect(gui.serialized(), where).toBe(serializeSession(repl.context.session));
  return { result };
}

const CRAFTING_ROUTE: ReadonlyArray<readonly [string, string]> = [
  ['verb', 'grow'],
  ['plane', 'allocate: position 2'],
  ['plane', 'allocate: position 3'],
  ['plane', 'allocate: position 4'],
  ['plane', 'allocate: slot e'],
  ['plane', 'slot: e with core.keen-edge-jewel'],
  ['plane', 'go: 1,0'],
  ['plane', 'allocate: position 1'],
  ['plane', 'back'],
  ['verb', 'equip'],
  ['verb', 'close'],
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
      '/dsl location fixture-town.green x: 9, y: 9',
      '/local list',
      '/local show',
      '/reload',
      '/save',
      '/help',
    ];
    const { repl, gui, slots } = bothDrivers();
    expect(gui.serialized()).toBe(serializeSession(repl.context.session));

    for (const line of script) inStep(repl, gui, line);

    expect(gui.snapshot().transcript.entries.length).toBeGreaterThan(script.length);
    const written = slotBytes(slots.repl);
    expect(Object.keys(written).sort()).toEqual([LOCAL_CHANGES_MODULE_ID, 'player']);
    expect(slotBytes(slots.gui)).toEqual(written);
  });

  it('dispatches every entry in the shared table the way the REPL does', () => {
    const { repl, gui, slots } = bothDrivers();
    expect(COMMANDS.length).toBeGreaterThan(10);
    let accepted = 0;

    for (const spec of COMMANDS) {
      const bare = SHAPED[spec.name] ?? spec.name;
      if (spec.audience === 'cheat') inStep(repl, gui, '/dev on');
      for (const line of [bare, `${bare} 1`]) {
        if (!refused(inStep(repl, gui, line).result)) accepted += 1;
      }
      if (spec.audience === 'cheat') inStep(repl, gui, '/dev off');
    }

    expect(accepted).toBeGreaterThan(7);
    const written = slotBytes(slots.repl);
    expect(Object.keys(written).length).toBeGreaterThan(1);
    expect(slotBytes(slots.gui)).toEqual(written);
  });

  it('answers a modal through the shared table, by the line the table parses', () => {
    const { repl, gui } = bothDrivers();
    const at = (found: (choice: PlayChoice) => boolean): string => String(gui.snapshot().view.choices.findIndex(found) + 1);

    inStep(repl, gui, at((choice) => choice.of === 'entity.fixture-town.keeper'));
    inStep(repl, gui, at((choice) => choice.id === 'talk:fixture-town.keeper'));

    for (const _ of [0, 1]) {
      const asked = gui.snapshot().view.modals[0].options[0];
      inStep(repl, gui, `submit-modal: ${asked.key}=${asked.values![0].value}`, () => gui.answer(asked.key, asked.values![0].value));
    }

    expect(gui.snapshot().view.modals).toEqual([]);
  });

  it('walks the crafting route through both drivers, gesture against typed line', () => {
    const { repl, gui } = bothDrivers();
    inStep(repl, gui, 'goto: fixture-town.store');
    inStep(repl, gui, 'use: entity.fixture-town.chest.open-the-strongbox');
    inStep(repl, gui, '/inv 1', () => gui.open('1'));
    for (const [key, value] of CRAFTING_ROUTE) inStep(repl, gui, `submit-modal: ${key}=${value}`, () => gui.answer(key, value));

    expect(gui.snapshot().view.modals).toEqual([]);
    const grown = JSON.parse(gui.serialized()) as SerializedGrowth;
    const [minted] = Object.keys(grown.instances.byId);
    expect(Object.keys(grown.instances.byId[minted!]!.payload.plane)).toEqual(['0,0', '1,0']);
    expect(Object.values(grown.equipped)).toEqual([minted]);
  });
});

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

    expect(reported).toBeGreaterThan(OPENING_CELLS.length - 1);
  });

  it('takes a line on either side of the door, from a universe that would not open', () => {
    const cell = OPENING_CELLS.find((each) => each.local === '')!;
    const { repl, gui } = bothOver(cell.base, cell.local);

    inStep(repl, gui, '/look');
    inStep(repl, gui, '/state');

    expect(gui.snapshot().problems.length).toBeGreaterThan(0);
  });
});
