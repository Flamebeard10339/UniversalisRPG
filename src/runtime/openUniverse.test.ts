import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';
import { FALLBACK_SOURCE, openUniverse, REQUIREMENTS, type RequirementId } from './openUniverse';
import { BASE, BASE_ID, CELL_COUNT, OPENING_CELLS, sourcesOf } from './openUniverseFixture';
import { resumptionNotes } from './command';
import { SAVE_VERSION } from './save';
import { autosave, createSaveContext, PLAYER_SLOT, setAutosaveCadence, saveNow, writesLive, type SaveContext } from './saveSlots';
import { serializeSession, view, wait, type PlaySession } from './session';
import { memoryDriver, type SlotDriver } from './store';

const CELLS = OPENING_CELLS;

const opened = (cell: { base: readonly ModuleSource[]; local: string }) => openUniverse(sourcesOf(cell));

const reported = (problems: ReadonlyArray<{ modules: readonly string[] }>): Set<string> => new Set(problems.flatMap((problem) => problem.modules));

const requirement = (id: RequirementId) => REQUIREMENTS.find((each) => each.id === id)!;

describe('the door answers for every input, and what it hands back is startable (c1)', () => {
  it('crosses both published spines with both placements, so nothing here is a shape somebody thought of', () => {
    expect(CELL_COUNT).toBe(CELLS.length);
    expect(CELLS.length).toBeGreaterThan(6);
  });

  it('places every aim in a base module and in the local one, which the count cannot tell you', () => {
    const placed = new Map<string, string[]>();
    for (const cell of CELLS) {
      if (cell.broke === null) continue;
      const aim = cell.aim.kind === 'stage' ? cell.aim.stage : cell.aim.id;
      placed.set(aim, [...(placed.get(aim) ?? []), cell.broke === LOCAL_CHANGES_MODULE_ID ? 'local' : 'base']);
    }

    expect(placed.size).toBeGreaterThan(6);
    for (const [aim, where] of placed) expect([...where].sort(), aim).toEqual(['base', 'local']);
  });

  it('lands each fixture on the stage or the requirement it is keyed under', () => {
    for (const cell of CELLS) {
      if (cell.aim.kind === 'stage') {
        expect(loadUniverseWithDiagnostics(sourcesOf(cell)).diagnostics.map((each) => each.stage), cell.where).toContain(cell.aim.stage);
        continue;
      }
      expect(opened(cell).unmet, cell.where).toEqual([cell.aim.id]);
    }
  });

  it('returns a session for every cell, and the session opens on a place', () => {
    for (const cell of CELLS) {
      const answer = opened(cell);

      expect(answer.session, cell.where).toBeDefined();
      expect(view(answer.session).location.id, cell.where).not.toBe('');
    }
  });

  it('opens the universe itself where every requirement is met, rather than standing in for it', () => {
    const answer = openUniverse([BASE]);

    expect({ unmet: answer.unmet, problems: answer.problems, modules: answer.modules }).toEqual({ unmet: [], problems: [], modules: [BASE_ID] });
    expect(view(answer.session).location.id).toBe('base.hall');
  });
});

describe('what is at fault is read off the loader, never inferred (c2)', () => {
  it('names, for every cell, exactly the modules the fixture broke and no others', () => {
    for (const cell of CELLS) {
      const answer = opened(cell);

      expect(reported(answer.problems), cell.where).toEqual(new Set(cell.names));
      for (const name of reported(answer.problems)) expect(name, cell.where).toBe(cell.broke);
    }
  });

  it('names no module for a requirement nothing met, whichever module broke it', () => {
    const cells = CELLS.filter((cell) => opened(cell).unmet.length > 0);
    expect(cells.length).toBeGreaterThan(1);

    for (const cell of cells) {
      const answer = opened(cell);
      const unmet = answer.problems.filter((problem) => answer.unmet.some((id) => requirement(id).unmet === problem.message));

      expect(unmet.length, cell.where).toBe(answer.unmet.length);
      for (const problem of unmet) expect(problem.modules, cell.where).toEqual([]);
    }
  });

  it('says something about every cell, so no cell above is asserting over an empty list', () => {
    for (const cell of CELLS) expect(opened(cell).problems.length, cell.where).toBeGreaterThan(0);
  });

  it('carries the text the loader wrote for a module it disabled', () => {
    const cell = CELLS.find((each) => each.aim.kind === 'stage' && each.aim.stage === 'parse' && each.broke === 'broken')!;

    expect(opened(cell).problems).toEqual([{ modules: ['broken'], words: 'tool', message: expect.stringContaining('[broken] parse:') }]);
  });
});

describe('a fallback is announced, and is never mistaken for the game (c3)', () => {
  it('says which requirement was unmet, wherever a requirement is unmet', () => {
    const cells = CELLS.filter((cell) => opened(cell).unmet.length > 0);
    expect(cells.length).toBeGreaterThan(0);

    for (const cell of cells) {
      const answer = opened(cell);
      for (const id of answer.unmet) expect(answer.problems.map((problem) => problem.message), cell.where).toContain(requirement(id).unmet);
    }
  });

  it('is hermetic by construction: it loads alone, clean, and meets every requirement there is', () => {
    const alone = loadUniverseWithDiagnostics([FALLBACK_SOURCE]);

    expect(alone.diagnostics).toEqual([]);
    expect(alone.loadedModules).toEqual([FALLBACK_SOURCE.name]);
    for (const each of REQUIREMENTS) expect(each.met(alone.registry), each.id).toBe(true);
  });

  it('stands in the same session whatever it stood in for', () => {
    const stood = CELLS.filter((cell) => opened(cell).unmet.length > 0).map((cell) => serializeSession(opened(cell).session));
    expect(stood.length).toBeGreaterThan(1);

    expect(new Set(stood).size).toBe(1);
    expect(new Set(stood)).not.toContain(serializeSession(openUniverse([BASE]).session));
  });

  it('is not a place the universe it stood in for could have offered', () => {
    const cell = CELLS.find((each) => each.aim.kind === 'requirement' && each.broke === LOCAL_CHANGES_MODULE_ID)!;
    const answer = opened(cell);

    expect(view(answer.session).location.id.startsWith(`${FALLBACK_SOURCE.name}.`)).toBe(true);
    expect([...loadUniverseWithDiagnostics(sourcesOf(cell)).registry.locations.keys()]).not.toContain(view(answer.session).location.id);
  });
});

describe('a session opened over the fallback is no slot\'s game (c4)', () => {
  const context = () => createSaveContext(memoryDriver(), () => 1_000);

  it('forces the live slot loose exactly where it stood in, and leaves it alone where it did not', () => {
    const cells: Array<{ where: string; base: readonly ModuleSource[]; local: string }> = [...CELLS, { where: 'a universe that opens', base: [BASE], local: '' }];

    for (const cell of cells) {
      const save = context();
      expect(save.synced, cell.where).toBe(PLAYER_SLOT);

      const answer = openUniverse(sourcesOf(cell), { save });

      expect(save.synced === null, cell.where).toBe(answer.unmet.length > 0);
    }
  });

  it('refuses the autosave that a session over a universe that opened would have taken', () => {
    const stood = context();
    const played = context();
    openUniverse([], { save: stood });
    openUniverse([BASE], { save: played });

    for (const save of [stood, played]) setAutosaveCadence(save, 1);

    expect(writesLive(stood)).toBe('not-ours');
    expect(autosave(stood, () => 'bytes')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(autosave(played, () => 'bytes')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(stood.store.read(PLAYER_SLOT)).toBeNull();
  });

  it('answers whose game this is at every open, rather than latching at the first', () => {
    const save = context();

    openUniverse([], { save });
    expect(save.synced).toBeNull();

    openUniverse([BASE], { save });

    expect(save.synced).toBe(PLAYER_SLOT);
    expect(writesLive(save)).toBe('yes');
    setAutosaveCadence(save, 1);
    expect(autosave(save, () => 'bytes')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
  });

  it('takes the slot when it is said out loud, which is what stops this being a refusal to save at all', () => {
    const save = context();
    openUniverse([], { save });

    saveNow(save, 'bytes');

    expect(writesLive(save)).toBe('yes');
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('bytes');
  });
});

describe('an opening stands on what the live slot last held (c5)', () => {
  const shared = (): { driver: SlotDriver; context: () => SaveContext; tick: (ms: number) => void } => {
    const driver = memoryDriver();
    let at = 1_000;
    return { driver, context: () => createSaveContext(driver, () => at), tick: (ms) => void (at += ms) };
  };

  const raw = (driver: SlotDriver, payload: string): void => driver.write(PLAYER_SLOT, JSON.stringify({ writtenAt: 1_000, payload }));

  const played = (session: PlaySession): string => {
    wait(session, 90);
    return serializeSession(session);
  };

  it('picks the game back up, so closing the tab costs the session nothing', () => {
    const { context } = shared();
    const kept = played(openUniverse([BASE], { save: context() }).session);
    saveNow(context(), kept);

    const again = openUniverse([BASE], { save: context() });

    expect(again.resumed).toEqual({ kind: 'resumed', slot: PLAYER_SLOT, pruned: [] });
    expect(serializeSession(again.session)).toBe(kept);
    expect(serializeSession(again.session)).not.toBe(serializeSession(openUniverse([BASE]).session));
  });

  it('goes on writing the slot it came out of, which is what makes a second reload land here too', () => {
    const { context, tick } = shared();
    saveNow(context(), played(openUniverse([BASE], { save: context() }).session));

    const save = context();
    openUniverse([BASE], { save });

    expect(writesLive(save)).toBe('yes');
    setAutosaveCadence(save, 1);
    tick(2_000);
    expect(autosave(save, () => 'bytes')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
  });

  it('opens a game it has to prune, and says what it pruned rather than dropping it', () => {
    const { driver, context } = shared();
    raw(driver, JSON.stringify({ version: SAVE_VERSION, inventory: { 'base.rope': 2, 'base.hoe': 1 } }));

    const answer = openUniverse([BASE], { save: context() });

    expect(answer.resumed.kind).toBe('resumed');
    expect(resumptionNotes(answer.resumed).map((each) => each.tone)).toEqual(['ok', 'warn']);
    expect(serializeSession(answer.session)).toContain('base.rope');
    expect(serializeSession(answer.session)).not.toContain('base.hoe');
  });

  it('opens on a new game where the slot holds nothing, and takes it', () => {
    const save = shared().context();

    const answer = openUniverse([BASE], { save });

    expect(answer.resumed).toEqual({ kind: 'new' });
    expect(writesLive(save)).toBe('yes');
  });

  const UNOPENABLE: ReadonlyArray<{ where: string; hold: (driver: SlotDriver) => void }> = [
    { where: 'bytes that are no slot at all', hold: (driver) => driver.write(PLAYER_SLOT, 'not a slot') },
    { where: 'a slot holding something that is not a save', hold: (driver) => raw(driver, 'not a save') },
    { where: 'a save this build has moved on from', hold: (driver) => raw(driver, JSON.stringify({ version: 0, time: 90 })) },
    { where: 'a save holding something that is not what the field keeps', hold: (driver) => raw(driver, JSON.stringify({ version: SAVE_VERSION, time: 'soon' })) },
  ];

  it('never loses one it cannot open: the game is new, the slot is left alone, and it is said', () => {
    for (const { where, hold } of UNOPENABLE) {
      const { driver, context } = shared();
      hold(driver);
      const save = context();

      const answer = openUniverse([BASE], { save });

      expect(answer.resumed.kind, where).toBe('kept');
      expect(resumptionNotes(answer.resumed).map((each) => each.tone), where).toEqual(['error']);
      expect(serializeSession(answer.session), where).toBe(serializeSession(openUniverse([BASE]).session));

      const before = driver.read(PLAYER_SLOT);
      setAutosaveCadence(save, 1);
      autosave(save, () => 'bytes');

      expect(driver.read(PLAYER_SLOT), where).toBe(before);
    }
  });

  it('names the slot and what was wrong with it, rather than one sentence for every way of failing', () => {
    const said = UNOPENABLE.map(({ hold }) => {
      const { driver, context } = shared();
      hold(driver);
      return resumptionNotes(openUniverse([BASE], { save: context() }).resumed)[0].text;
    });

    expect(new Set(said).size).toBe(UNOPENABLE.length);
    for (const each of said) expect(each).toContain(PLAYER_SLOT);
  });

  it('reads no slot at all where the universe did not open, so a fallback cannot stand in for a game', () => {
    const { driver, context } = shared();
    saveNow(context(), played(openUniverse([BASE], { save: context() }).session));
    const before = driver.read(PLAYER_SLOT);

    const answer = openUniverse([], { save: context() });

    expect(answer.resumed).toEqual({ kind: 'new' });
    expect(serializeSession(answer.session)).toBe(serializeSession(openUniverse([]).session));
    expect(driver.read(PLAYER_SLOT)).toBe(before);
  });

  it('says nothing at all about an opening that picked nothing up, so a new game reads as one', () => {
    expect(resumptionNotes(openUniverse([BASE], { save: shared().context() }).resumed)).toEqual([]);
  });
});
