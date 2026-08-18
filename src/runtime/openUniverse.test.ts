import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/registry';
import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';
import { FALLBACK_SOURCE, openUniverse, REQUIREMENTS, type RequirementId } from './openUniverse';
import { BASE, BASE_ID, CELL_COUNT, OPENING_CELLS, sourcesOf } from './openUniverseFixture';
import { autosave, createSaveContext, PLAYER_SLOT, setAutosaveSeconds, saveNow, writesLive } from './saveSlots';
import { serializeSession, view } from './session';
import { memoryDriver } from './store';

const CELLS = OPENING_CELLS;

// Every cell opened the way a driver opens it: the base modules, and the local
// module over them where the cell holds one.
const opened = (cell: { base: readonly ModuleSource[]; local: string }) => openUniverse(sourcesOf(cell));

const reported = (problems: ReadonlyArray<{ modules: readonly string[] }>): Set<string> => new Set(problems.flatMap((problem) => problem.modules));

const requirement = (id: RequirementId) => REQUIREMENTS.find((each) => each.id === id)!;

describe('the door answers for every input, and what it hands back is startable (c1)', () => {
  it('crosses both published spines with both placements, so nothing here is a shape somebody thought of', () => {
    expect(CELL_COUNT).toBe(CELLS.length);
    expect(CELLS.length).toBeGreaterThan(6);
  });

  // The arithmetic above is the family counting itself: both sides of it come
  // from the same list of placements, so dropping one moves both and the count
  // still agrees. Where each aim was actually placed is a property of the cells
  // and does not move with it.
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
        // Asked of the loader rather than of the door: what is being checked is
        // that the fixture trips the stage it claims, which is a fact about the
        // fixture and not about what the door did with it.
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
      // The half a list of expected names cannot state about itself: every
      // module the door named is the module this cell broke. A cell that broke
      // a base module and stands a clean local module beside it is where that
      // used to come out wrong, and it is in the family now.
      for (const name of reported(answer.problems)) expect(name, cell.where).toBe(cell.broke);
    }
  });

  // A requirement is unmet of the universe the modules came to, and nothing in
  // the loader's report says which of them owes it. So the door says no module
  // — the one answer that is not a guess dressed as a fact.
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

  // The half a promise cannot make: the session it stands the player in is the
  // same session byte for byte whatever universe it stood in for, so nothing in
  // it can have been read out of that universe.
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
      // A first launch: the player's slot is empty, which is the state
      // `createSaveContext` calls this session's game.
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

    for (const save of [stood, played]) setAutosaveSeconds(save, 1);

    expect(writesLive(stood)).toBe('not-ours');
    expect(autosave(stood, () => 'bytes')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(autosave(played, () => 'bytes')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(stood.store.read(PLAYER_SLOT)).toBeNull();
  });

  // Twice over one context, which is what `reopen` and clearing local changes
  // both are: the driver builds the save context once and hands it to the door
  // at every open. A session that recovers is the slot's game again, and an
  // author who cleared a broken module went on playing with no autosave for the
  // life of the page while the field stayed where the first open put it.
  it('answers whose game this is at every open, rather than latching at the first', () => {
    const save = context();

    openUniverse([], { save });
    expect(save.synced).toBeNull();

    openUniverse([BASE], { save });

    expect(save.synced).toBe(PLAYER_SLOT);
    expect(writesLive(save)).toBe('yes');
    setAutosaveSeconds(save, 1);
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
