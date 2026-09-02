import { RuntimeError } from './error';
import { describe, expect, it } from 'vitest';
import { memoryDriver } from './store';
import {
  AUTOSAVE_SLOT,
  DEV_SLOT,
  DEV_SNAPSHOT_SLOT,
  PLAYER_SLOT,
  autosave,
  autosaveDue,
  cadenceOrUnreadable,
  createSaveContext,
  devSnapshot,
  enterDev,
  leaveDev,
  liveSlot,
  NEVER,
  saveNow,
  saveReport,
  setAutosaveCadence,
  type SaveContext,
} from './saveSlots';

function turning(start = 1_000): { save: SaveContext; pass: (ms: number) => void; restarted: () => SaveContext } {
  let at = start;
  const now = (): number => at;
  const driver = memoryDriver();
  return { save: createSaveContext(driver, now), pass: (ms) => void (at += ms), restarted: () => createSaveContext(driver, now) };
}

function refusing(save: SaveContext): void {
  (save.store as { write: (name: string, payload: string) => unknown }).write = (name) => {
    throw new RuntimeError(`slot ${name} cannot be written`);
  };
}

function unreadable(save: SaveContext, name: string): void {
  const readable = save.store.read.bind(save.store);
  (save.store as { read: (slot: string) => unknown }).read = (slot) => {
    if (slot !== name) return readable(slot);
    throw new RuntimeError(`slot ${name} does not parse`);
  };
}

describe('the cadence is a slot like any other (c4)', () => {
  it('starts at no interval at all, so a session nobody asked about is written after every act', () => {
    const { save, pass } = turning();

    expect(cadenceOrUnreadable(save)).toBe(0);
    expect(autosaveDue(save)).toBe(true);
    expect(autosave(save, () => 'first')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(autosave(save, () => 'second')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('second');
    pass(1);
    expect(autosave(save, () => 'third')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('third');
  });

  it('has a word for never, which is the absence of a cadence and not a quantity of one', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, NEVER);

    expect(cadenceOrUnreadable(save)).toBe(NEVER);
    pass(10 * 60 * 1000);
    expect(autosaveDue(save)).toBe(false);
    expect(autosave(save, () => 'payload')).toEqual({ kind: 'waited' });
    expect(save.store.list()).toEqual([AUTOSAVE_SLOT]);
  });

  it('measures real seconds since the live slot was last written', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, 30);

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
    setAutosaveCadence(save, 45);

    expect(save.store.list()).toEqual([AUTOSAVE_SLOT]);
    expect(save.store.read(AUTOSAVE_SLOT)?.payload).toBe('45');
    expect(cadenceOrUnreadable(save)).toBe(45);
  });

  it('refuses a cadence that is neither seconds nor the word, and stops autosaving when the slot holds one', () => {
    const { save } = turning();

    expect(() => setAutosaveCadence(save, -1)).toThrow(RuntimeError);
    expect(() => setAutosaveCadence(save, Number.NaN)).toThrow(RuntimeError);

    save.store.write(AUTOSAVE_SLOT, 'often');
    expect(cadenceOrUnreadable(save)).toBeNull();
    expect(autosaveDue(save)).toBe(false);
    expect(autosave(save, () => 'payload')).toEqual({ kind: 'waited' });
  });

  it('is due when the live slot cannot be dated, because the next write replaces it anyway', () => {
    const { save } = turning();
    setAutosaveCadence(save, 30);
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
    setAutosaveCadence(save, 30);
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
    setAutosaveCadence(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');
    const next = restarted();
    pass(3_600_000);

    next.synced = PLAYER_SLOT;
    expect(autosave(next, () => 'an hour and one command')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('an hour and one command');
  });

  it('takes the slot outright when it is said out loud', () => {
    const { save, pass, restarted } = turning();
    setAutosaveCadence(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');
    const next = restarted();

    saveNow(next, 'replaced deliberately');
    pass(30_000);
    expect(autosave(next, () => 'and kept from here')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('and kept from here');
  });

  it('leaves bytes nobody can read alone, and still answers every question about them', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, 30);
    save.store.write(PLAYER_SLOT, 'good');
    unreadable(save, PLAYER_SLOT);
    save.synced = null;

    expect(saveReport(save).slots).toContainEqual({ name: PLAYER_SLOT, writtenAt: null });
    expect(saveReport(save).writes).toBe('unreadable');
    pass(30_000);
    expect(autosave(save, () => 'replaced')).toEqual({ kind: 'unreadable', slot: PLAYER_SLOT });

    saveNow(save, 'replaced');
    expect(saveReport(save).writes).toBe('yes');
  });

  it('will not autosave over a dev slot a crashed session left behind', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, 30);
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
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');

    const exit = devSnapshot(save);
    expect(exit).toEqual({ kind: 'restore', payload: 'the session being played', synced: PLAYER_SLOT });
    leaveDev(save, exit.kind === 'restore' ? exit.synced : null);
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');
    expect(save.store.read(DEV_SNAPSHOT_SLOT)).toBeNull();
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
    setAutosaveCadence(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');

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
    setAutosaveCadence(fresh.save, 30);
    expect(autosave(fresh.save, () => 'a new game')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });

    const authoring = turning();
    setAutosaveCadence(authoring.save, 30);
    enterDev(authoring.save, 'the session being played');
    authoring.pass(30_000);
    autosave(authoring.save, () => 'authoring');
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

    const next = restarted();
    expect(next.dev, 'the snapshot standing is what says the mode was on').toBe(true);
    expect(liveSlot(next)).toBe(DEV_SLOT);
    expect(next.store.read(DEV_SLOT)?.payload).toBe('authoring');
    expect(next.store.read(PLAYER_SLOT)?.payload).toBe('the player');
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
    setAutosaveCadence(save, 1);
    saveNow(save, 'the player');
    pass(5_000);
    autosave(save, () => 'later');

    expect(save.store.list()).toEqual([AUTOSAVE_SLOT, PLAYER_SLOT]);
  });

  it('answers which slot is live, whether the mode is on, and what is kept', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, 30);
    saveNow(save, 'the player');

    expect(saveReport(save)).toEqual({
      dev: false,
      slot: PLAYER_SLOT,
      writes: 'yes',
      autosave: 30,
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
    setAutosaveCadence(save, 30);
    saveNow(save, 'the player');
    save.store.write(AUTOSAVE_SLOT, 'whenever');

    const report = saveReport(save);
    expect(report.autosave).toBeNull();
    expect(report.slot).toBe(PLAYER_SLOT);
    expect(report.writes).toBe('yes');
    expect(report.slots.map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT, PLAYER_SLOT]);
    expect(autosaveDue(save)).toBe(false);
  });

  it('takes an empty dev slot on every visit, not only the first', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, 1);
    saveNow(save, 'the player');

    expect(enterDev(save, 'the session being played')).toBeNull();
    pass(2_000);
    expect(autosave(save, () => 'the first authoring session')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
    leaveDev(save, PLAYER_SLOT);

    save.store.remove(DEV_SLOT);
    expect(enterDev(save, 'the session being played')).toBeNull();
    pass(2_000);
    expect(autosave(save, () => 'the second authoring session')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
  });

  it('says a cadence it cannot read is unknown, rather than quietly meaning never', () => {
    const { save } = turning();
    setAutosaveCadence(save, 30);
    saveNow(save, 'the player');
    const readable = save.store.read.bind(save.store);
    (save.store as { read: (name: string) => unknown }).read = (name) => {
      if (name !== AUTOSAVE_SLOT) return readable(name);
      throw new RuntimeError('slot autosave does not parse');
    };

    expect(saveReport(save).autosave).toBeNull();
    expect(autosaveDue(save)).toBe(false);
    expect(saveReport(save).writes).toBe('yes');
  });

  it('picks the dev slot up on the way in, so a second visit is not a session refused', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, 1);
    saveNow(save, 'the player');

    expect(enterDev(save, 'the session being played')).toBeNull();
    pass(2_000);
    expect(autosave(save, () => 'the first authoring session')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
    leaveDev(save, PLAYER_SLOT);

    expect(enterDev(save, 'the session being played')).toBe('the first authoring session');
    save.synced = DEV_SLOT;
    pass(2_000);
    expect(autosave(save, () => 'the second')).toEqual({ kind: 'wrote', slot: DEV_SLOT });
  });

  it('leaves a dev slot nobody has loaded as no session"s until the caller says it picked it up', () => {
    const { save, pass } = turning();
    setAutosaveCadence(save, 1);
    save.store.write(DEV_SLOT, 'what the last dev session was doing');

    expect(enterDev(save, 'the session being played')).toBe('what the last dev session was doing');
    pass(2_000);
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
