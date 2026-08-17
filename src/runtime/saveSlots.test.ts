import { describe, expect, it } from 'vitest';
import { RuntimeError } from './runtime';
import { memoryDriver } from './store';
import {
  AUTOSAVE_SLOT,
  DEV_SLOT,
  DEV_SNAPSHOT_SLOT,
  PLAYER_SLOT,
  autosave,
  autosaveDue,
  autosaveSeconds,
  createSaveContext,
  devSnapshot,
  enterDev,
  leaveDev,
  liveSlot,
  saveNow,
  saveReport,
  setAutosaveSeconds,
  type SaveContext,
} from './saveSlots';

// The driver is shared and the context is not, because that is exactly what a
// restart is: the slots outlive the process and what the session was the game of
// does not. Built through `createSaveContext` rather than by copying the live
// context, so a reopened game is measured rather than described.
function turning(start = 1_000): { save: SaveContext; pass: (ms: number) => void; restarted: () => SaveContext } {
  let at = start;
  const now = (): number => at;
  const driver = memoryDriver();
  return { save: createSaveContext(driver, now), pass: (ms) => void (at += ms), restarted: () => createSaveContext(driver, now) };
}

// A store that refuses every write, which is what stands between an author and
// their work when a directory goes read-only or something is in the way.
function refusing(save: SaveContext): void {
  (save.store as { write: (name: string, payload: string) => unknown }).write = (name) => {
    throw new RuntimeError(`slot ${name} cannot be written`);
  };
}

// A slot whose bytes are there and mean nothing here, which is a hand edit or a
// build that has moved on.
function unreadable(save: SaveContext, name: string): void {
  const readable = save.store.read.bind(save.store);
  (save.store as { read: (slot: string) => unknown }).read = (slot) => {
    if (slot !== name) return readable(slot);
    throw new RuntimeError(`slot ${name} does not parse`);
  };
}

describe('the cadence is a slot like any other (c4)', () => {
  it('starts at never, so a session that was never asked to save writes nothing', () => {
    const { save, pass } = turning();

    expect(autosaveSeconds(save)).toBe(0);
    pass(10 * 60 * 1000);
    expect(autosaveDue(save)).toBe(false);
    expect(autosave(save, () => 'payload')).toEqual({ kind: 'waited' });
    expect(save.store.list()).toEqual([]);
  });

  it('measures real seconds since the live slot was last written', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);

    // A new game is the empty player slot's game, so there is a span to be
    // inside of from the first write onward.
    expect(autosave(save, () => 'first')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });

    pass(29_999);
    expect(autosaveDue(save)).toBe(false);
    expect(autosave(save, () => 'second')).toEqual({ kind: 'waited' });
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('first');

    pass(1);
    expect(autosaveDue(save)).toBe(true);
    expect(autosave(save, () => 'second')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('second');
  });

  it('holds the cadence in a slot of its own, which is the store being asked for something that is not a save', () => {
    const { save } = turning();
    setAutosaveSeconds(save, 45);

    expect(save.store.list()).toEqual([AUTOSAVE_SLOT]);
    expect(save.store.read(AUTOSAVE_SLOT)?.payload).toBe('45');
    expect(autosaveSeconds(save)).toBe(45);
  });

  it('refuses a cadence that is not seconds, and says so when the slot holds one', () => {
    const { save } = turning();

    expect(() => setAutosaveSeconds(save, -1)).toThrow(RuntimeError);
    expect(() => setAutosaveSeconds(save, Number.NaN)).toThrow(RuntimeError);

    save.store.write(AUTOSAVE_SLOT, 'often');
    expect(() => autosaveSeconds(save)).toThrow(/slot autosave does not hold a cadence/);
  });

  it('is due when the live slot cannot be dated, because the next write replaces it anyway', () => {
    const { save } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'good');
    expect(autosaveDue(save)).toBe(false);

    unreadable(save, PLAYER_SLOT);
    expect(autosaveDue(save)).toBe(true);
  });
});

describe('a session writes the one slot whose game it is (c4, c9)', () => {
  it('is the empty player slot the moment it is built, which is what a new game is', () => {
    const { save } = turning();

    expect(save.synced).toBe(PLAYER_SLOT);
    expect(saveReport(save).writes).toBe('yes');
  });

  it('is no slot"s when it is built over one that already holds a game, which is a reopened one', () => {
    const { save, pass, restarted } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');

    const next = restarted();
    expect(next.synced).toBeNull();
    pass(3_600_000);

    expect(autosaveDue(next)).toBe(true);
    expect(autosave(next, () => 'a brand new game')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('an hour of play');
  });

  it('is no slot"s when it is built over bytes it cannot read, rather than free to replace them', () => {
    const { save, restarted } = turning();
    save.store.write(PLAYER_SLOT, 'good');
    unreadable(save, PLAYER_SLOT);

    const next = restarted();
    unreadable(next, PLAYER_SLOT);
    expect(next.synced).toBeNull();
    expect(saveReport(next).writes).toBe('unreadable');
  });

  it('writes once it has been loaded out of the slot', () => {
    const { save, pass, restarted } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');
    const next = restarted();
    pass(3_600_000);

    next.synced = PLAYER_SLOT;
    expect(autosave(next, () => 'an hour and one command')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('an hour and one command');
  });

  it('takes the slot outright when it is said out loud', () => {
    const { save, pass, restarted } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');
    const next = restarted();

    saveNow(next, 'replaced deliberately');
    pass(30_000);
    expect(autosave(next, () => 'and kept from here')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('and kept from here');
  });

  it('leaves bytes nobody can read alone, and still answers every question about them', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'good');
    unreadable(save, PLAYER_SLOT);
    save.synced = null;

    // Dating it and being entitled to replace it are different questions, and
    // an unreadable slot answers them differently: the report still stands, and
    // the bytes stay where they are until somebody asks for them to go.
    expect(saveReport(save).slots).toContainEqual({ name: PLAYER_SLOT, writtenAt: null });
    expect(saveReport(save).writes).toBe('unreadable');
    pass(30_000);
    expect(autosave(save, () => 'replaced')).toEqual({ kind: 'unreadable', slot: PLAYER_SLOT });

    // And saying so outright is what replaces them.
    saveNow(save, 'replaced');
    expect(saveReport(save).writes).toBe('yes');
  });

  it('will not autosave over a dev slot a crashed session left behind', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(DEV_SLOT, 'what the last dev session was doing');

    enterDev(save, 'the session being played');
    pass(30_000);
    expect(autosave(save, () => 'a different dev session')).toEqual({ kind: 'held', slot: DEV_SLOT });
    expect(save.store.read(DEV_SLOT)?.payload).toBe('what the last dev session was doing');
  });

  it('reports which it is, so a surface draws the answer rather than guessing', () => {
    const { save, restarted } = turning();
    save.store.write(PLAYER_SLOT, 'somebody else');
    const next = restarted();

    expect(saveReport(next).writes).toBe('not-ours');
    next.synced = PLAYER_SLOT;
    expect(saveReport(next).writes).toBe('yes');
  });
});

describe('the rule is which slot, not whether there is one', () => {
  it('refuses a slot this session is synced to something else instead of', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    save.store.write(DEV_SLOT, 'somebody authoring');
    save.dev = true;

    // Synced, and to a real slot — just not the one being written. A rule that
    // asked only whether this session is synced to anything would say yes.
    save.synced = PLAYER_SLOT;
    expect(liveSlot(save)).toBe(DEV_SLOT);
    expect(saveReport(save).writes).toBe('not-ours');
  });

  it('is not in dev at all when the snapshot could not be put down', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    const writing = save.store.write.bind(save.store);
    (save.store as { write: (name: string, payload: string) => unknown }).write = (name, payload) => {
      if (name === DEV_SNAPSHOT_SLOT) throw new RuntimeError('slot dev-snapshot could not be written');
      return writing(name, payload);
    };

    // The snapshot is what leaving comes back from, so a mode entered without
    // one is a mode with no way out. It is not entered.
    expect(() => enterDev(save, 'the session as it stands')).toThrow(/dev-snapshot/);
    expect(save.dev).toBe(false);
    expect(liveSlot(save)).toBe(PLAYER_SLOT);
  });
});

describe('dev mode moves which slot receives a write (c9, c10, c11, c12, c13)', () => {
  it('snapshots the session on the way in, and no slot needs putting back on the way out', () => {
    const { save, pass } = turning();
    saveNow(save, 'the player');

    enterDev(save, 'the session being played');
    expect(save.store.read(DEV_SNAPSHOT_SLOT)?.payload).toBe(JSON.stringify({ payload: 'the session being played', synced: PLAYER_SLOT }));

    pass(1_000);
    saveNow(save, 'authoring');
    saveNow(save, 'more authoring');
    expect(save.store.read(DEV_SLOT)?.payload).toBe('more authoring');
    // c10 is why there is nothing to put back: dev never reached it.
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');

    const exit = devSnapshot(save);
    expect(exit).toEqual({ kind: 'restore', payload: 'the session being played', synced: PLAYER_SLOT });
    leaveDev(save, exit.kind === 'restore' ? exit.synced : null);
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');
    expect(save.store.read(DEV_SNAPSHOT_SLOT)).toBeNull();
    // The dev slot is an author's work and stays; the session is not its game
    // any more, so nothing writes over it either.
    expect(save.store.read(DEV_SLOT)?.payload).toBe('more authoring');
  });

  it('writes no slot on the way out, so nothing on that path can fail and strand an author', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    enterDev(save, 'the session being played');
    saveNow(save, 'authoring');
    const authored = save.store.read(DEV_SLOT)?.payload;

    const exit = devSnapshot(save);
    refusing(save);
    expect(() => leaveDev(save, exit.kind === 'restore' ? exit.synced : null)).not.toThrow();
    expect(save.dev).toBe(false);
    expect(save.synced).toBe(PLAYER_SLOT);
    expect(save.store.read(DEV_SLOT)?.payload).toBe(authored);
  });

  it('is out of the mode even when the store refuses to take the snapshot away', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    enterDev(save, 'the session being played');
    const exit = devSnapshot(save);

    // Taking the snapshot away is tidiness — a stale one is overwritten by the
    // next `/dev on` and costs nothing — so it goes last, after the mode is
    // already off. Done first, a store that refuses it would keep somebody in
    // dev with no command that leaves, which is the shape the restore write had.
    (save.store as { remove: (name: string) => unknown }).remove = (name) => {
      throw new RuntimeError(`slot ${name} cannot be removed`);
    };
    expect(() => leaveDev(save, exit.kind === 'restore' ? exit.synced : null)).toThrow(/cannot be removed/);
    expect(save.dev).toBe(false);
    expect(save.synced).toBe(PLAYER_SLOT);
  });

  it('leaves the stamp alone on a slot nothing touched', () => {
    const { save, pass } = turning();
    saveNow(save, 'the player');
    const written = save.store.read(PLAYER_SLOT)!.writtenAt;

    enterDev(save, 'the session being played');
    pass(90_000);
    saveNow(save, 'authoring');
    leaveDev(save, PLAYER_SLOT);

    expect(save.store.read(PLAYER_SLOT)?.writtenAt).toBe(written);
  });

  it('comes back out to the standing it went in with, so a session that was nobody"s stays nobody"s', () => {
    const { save, pass, restarted } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');

    // A reopened game, which is no slot's until it says so. Dev must not
    // launder that into an entitlement on the way back out.
    const next = restarted();
    expect(next.synced).toBeNull();

    enterDev(next, 'a brand new game');
    const exit = devSnapshot(next);
    expect(exit).toEqual({ kind: 'restore', payload: 'a brand new game', synced: null });
    leaveDev(next, exit.kind === 'restore' ? exit.synced : null);

    pass(3_600_000);
    expect(autosave(next, () => 'a brand new game, one command later')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('an hour of play');
  });

  it('will not autosave into an empty player slot after dev mode, where a fresh game would', () => {
    const fresh = turning();
    setAutosaveSeconds(fresh.save, 30);
    // A game nobody has loaded may take the empty slot: that is a new game.
    expect(autosave(fresh.save, () => 'a new game')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });

    const authoring = turning();
    setAutosaveSeconds(authoring.save, 30);
    enterDev(authoring.save, 'the session being played');
    authoring.pass(30_000);
    autosave(authoring.save, () => 'authoring');
    // The session dev built could not be put back, so it is no slot's game, and
    // an empty slot cannot make it one — which a rule asked at the write did.
    leaveDev(authoring.save, null);

    expect(authoring.save.store.read(PLAYER_SLOT)).toBeNull();
    authoring.pass(30_000);
    expect(autosave(authoring.save, () => 'authoring, one command later')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(authoring.save.store.read(PLAYER_SLOT)).toBeNull();
  });

  it('loses nothing when the process dies in dev: the snapshot and the player slot are both on disk', () => {
    const { save, restarted } = turning();
    saveNow(save, 'the player');
    enterDev(save, 'the session being played');
    saveNow(save, 'authoring');

    // The mode lives in memory and the slots do not, so a session that never
    // reached `leaveDev` is exactly this store with a fresh context over it.
    const next = restarted();
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('the player');
    expect(liveSlot(next)).toBe(PLAYER_SLOT);
    expect(next.store.read(DEV_SNAPSHOT_SLOT)?.payload).toBe(JSON.stringify({ payload: 'the session being played', synced: PLAYER_SLOT }));
  });

  it('leaves when the snapshot is gone rather than keeping somebody in a mode with no way out', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    enterDev(save, 'the session being played');
    saveNow(save, 'authoring');
    save.store.remove(DEV_SNAPSHOT_SLOT);

    const exit = devSnapshot(save);
    expect(exit).toEqual({ kind: 'no-snapshot', why: 'slot dev-snapshot is gone' });
    leaveDev(save, null);
    expect(save.dev).toBe(false);
    // Nothing was restorable, so nothing was touched and the session is no
    // slot's game.
    expect(save.synced).toBeNull();
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');
    expect(save.store.read(DEV_SLOT)?.payload).toBe('authoring');
  });

  it('says a snapshot it cannot make sense of is one it has not got', () => {
    const { save } = turning();
    enterDev(save, 'the session being played');
    save.store.write(DEV_SNAPSHOT_SLOT, '"the shape a snapshot used to have"');

    expect(devSnapshot(save)).toEqual({ kind: 'no-snapshot', why: 'slot dev-snapshot does not hold a snapshot' });
  });

  it('refuses to enter twice and to leave when it was never entered', () => {
    const { save } = turning();

    expect(() => devSnapshot(save)).toThrow(/not in dev mode/);
    expect(() => leaveDev(save, null)).toThrow(/not in dev mode/);
    enterDev(save, 'the session being played');
    expect(() => enterDev(save, 'again')).toThrow(/already in dev mode/);
  });

  it('creates no dev slot at all while the mode is off', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 1);
    saveNow(save, 'the player');
    pass(5_000);
    autosave(save, () => 'later');

    expect(save.store.list()).toEqual([AUTOSAVE_SLOT, PLAYER_SLOT]);
  });

  it('answers which slot is live, whether the mode is on, and what is kept', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    saveNow(save, 'the player');

    expect(saveReport(save)).toEqual({
      dev: false,
      slot: PLAYER_SLOT,
      writes: 'yes',
      autosaveSeconds: 30,
      slots: [
        { name: AUTOSAVE_SLOT, writtenAt: 1_000 },
        { name: PLAYER_SLOT, writtenAt: 1_000 },
      ],
    });

    pass(500);
    enterDev(save, 'the session being played');
    const report = saveReport(save);
    expect(report.dev).toBe(true);
    expect(report.slot).toBe(DEV_SLOT);
    expect(report.slots.map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT, DEV_SNAPSHOT_SLOT, PLAYER_SLOT]);
  });

  it('reports a cadence it cannot read as no cadence, rather than refusing the whole answer', () => {
    const { save } = turning();
    setAutosaveSeconds(save, 30);
    saveNow(save, 'the player');
    save.store.write(AUTOSAVE_SLOT, 'whenever');

    const report = saveReport(save);
    expect(report.autosaveSeconds).toBeNull();
    // Everything else the report is for still answers.
    expect(report.slot).toBe(PLAYER_SLOT);
    expect(report.writes).toBe('yes');
    expect(report.slots.map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT, PLAYER_SLOT]);
    // And what has to act on a cadence still refuses to guess at one.
    expect(() => autosaveSeconds(save)).toThrow(/does not hold a cadence/);
  });

  it('takes an empty dev slot on every visit, not only the first', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 1);
    saveNow(save, 'the player');

    expect(enterDev(save, 'the session being played')).toBeNull();
    pass(2_000);
    expect(autosave(save, () => 'the first authoring session')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
    leaveDev(save, PLAYER_SLOT);

    // Emptied between visits, by a hand or by an author starting over. The slot
    // is empty and this session is the one entering it, so it is this session's
    // — a rule that remembered being told otherwise could never take it again.
    save.store.remove(DEV_SLOT);
    expect(enterDev(save, 'the session being played')).toBeNull();
    pass(2_000);
    expect(autosave(save, () => 'the second authoring session')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
  });

  it('says a cadence it cannot read is unknown, rather than quietly meaning never', () => {
    const { save } = turning();
    setAutosaveSeconds(save, 30);
    saveNow(save, 'the player');
    // Bytes the store cannot make sense of, which is a different arm from a
    // slot that reads and holds something that is not a number: `never` and
    // `nobody can tell` are two answers and only one of them is silent.
    const readable = save.store.read.bind(save.store);
    (save.store as { read: (name: string) => unknown }).read = (name) => {
      if (name !== AUTOSAVE_SLOT) return readable(name);
      throw new RuntimeError('slot autosave does not parse');
    };

    expect(saveReport(save).autosaveSeconds).toBeNull();
    expect(() => autosaveSeconds(save)).toThrow(/does not hold a cadence/);
    // The rest of the report still stands.
    expect(saveReport(save).writes).toBe('yes');
  });

  it('picks the dev slot up on the way in, so a second visit is not a session refused', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 1);
    saveNow(save, 'the player');

    expect(enterDev(save, 'the session being played')).toBeNull();
    pass(2_000);
    expect(autosave(save, () => 'the first authoring session')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
    leaveDev(save, PLAYER_SLOT);

    // Second visit: the slot is still there, and this is what it holds.
    expect(enterDev(save, 'the session being played')).toBe('the first authoring session');
    // Which the caller loaded, and says so.
    save.synced = DEV_SLOT;
    pass(2_000);
    expect(autosave(save, () => 'the second')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
  });

  it('leaves a dev slot nobody has loaded as no session"s until the caller says it picked it up', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 1);
    save.store.write(DEV_SLOT, 'what the last dev session was doing');

    expect(enterDev(save, 'the session being played')).toBe('what the last dev session was doing');
    pass(2_000);
    // The caller has not said it loaded, so it is nobody's yet.
    expect(autosave(save, () => 'a different dev session')).toEqual({ kind: 'held', slot: DEV_SLOT });
    expect(save.store.read(DEV_SLOT)?.payload).toBe('what the last dev session was doing');
  });

  it('is entered from a player slot it cannot read, because what it snapshots is the session', () => {
    const { save } = turning();
    save.store.write(PLAYER_SLOT, 'good');
    unreadable(save, PLAYER_SLOT);
    save.synced = null;

    expect(() => enterDev(save, 'the session being played')).not.toThrow();
    expect(save.dev).toBe(true);
    // And the bytes it cannot read are still there, untouched, on the way out.
    const exit = devSnapshot(save);
    expect(exit).toEqual({ kind: 'restore', payload: 'the session being played', synced: null });
    leaveDev(save, exit.kind === 'restore' ? exit.synced : null);
    expect(saveReport(save).writes).toBe('unreadable');
  });

  it('reports a slot it cannot read as one with no date rather than refusing the whole answer', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    save.store.write('spoiled', 'x');
    (save.store as { read: (name: string) => unknown }).read = (name) => {
      if (name === 'spoiled') throw new RuntimeError('slot spoiled does not parse');
      return null;
    };

    expect(saveReport(save).slots).toEqual([
      { name: PLAYER_SLOT, writtenAt: null },
      { name: 'spoiled', writtenAt: null },
    ]);
  });
});
