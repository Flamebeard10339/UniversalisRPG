import { describe, expect, it } from 'vitest';
import { RuntimeError } from './runtime';
import { memoryDriver } from './store';
import {
  AUTOSAVE_SLOT,
  DEV_SLOT,
  DEV_SNAPSHOT_SLOT,
  PLAYER_SLOT,
  adopted,
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

function turning(start = 1_000): { save: SaveContext; pass: (ms: number) => void } {
  let at = start;
  const save = createSaveContext(memoryDriver(), () => at);
  return { save, pass: (ms) => void (at += ms) };
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

    // Nothing written yet: there is no span to be inside of, and no slot to
    // be somebody else's.
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
    expect(() => autosaveSeconds(save)).toThrow(/slot autosave holds "often"/);
  });

  it('is due when the live slot cannot be dated, because the next write replaces it anyway', () => {
    const { save } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'good');
    expect(autosaveDue(save)).toBe(false);

    // Hand-edited to something the store cannot read.
    const readable = save.store.read.bind(save.store);
    (save.store as { read: (name: string) => unknown }).read = (name) => {
      if (name !== PLAYER_SLOT) return readable(name);
      throw new RuntimeError('slot player does not parse');
    };
    expect(autosaveDue(save)).toBe(true);
  });
});

describe('a session writes back only what it came out of (c4, c9)', () => {
  it('will not autosave over a slot it never read, which is what a reopened game is', () => {
    const first = turning();
    setAutosaveSeconds(first.save, 30);
    first.save.store.write(PLAYER_SLOT, 'an hour of play');

    // The same directory, a session later. The cadence outlives the process and
    // the adoption does not, which is the whole of the difference.
    const restarted: SaveContext = { ...first.save, dev: false };
    first.pass(3_600_000);

    expect(autosaveDue(restarted)).toBe(true);
    expect(autosave(restarted, () => 'a brand new game')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(restarted.store.read(PLAYER_SLOT)?.payload).toBe('an hour of play');
  });

  it('writes it once the session has been told it came out of it', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');
    const restarted: SaveContext = { ...save, dev: false };
    pass(3_600_000);

    adopted(restarted, PLAYER_SLOT);
    expect(autosave(restarted, () => 'an hour and one command')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(restarted.store.read(PLAYER_SLOT)?.payload).toBe('an hour and one command');
  });

  it('takes the slot outright when it is said out loud', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'an hour of play');
    const restarted: SaveContext = { ...save, dev: false };

    saveNow(restarted, 'replaced deliberately');
    pass(30_000);
    expect(autosave(restarted, () => 'and kept from here')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
    expect(restarted.store.read(PLAYER_SLOT)?.payload).toBe('and kept from here');
  });

  it('holds the player slot again the moment dev mode is left', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    saveNow(save, 'the player');

    enterDev(save);
    pass(30_000);
    autosave(save, () => 'authoring');
    const snapshot = devSnapshot(save);
    expect(snapshot).toBe('the player');
    leaveDev(save, snapshot);

    pass(30_000);
    expect(autosave(save, () => 'authoring, one command later')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');
  });

  it('will not autosave into an empty player slot after dev mode, where a fresh game would', () => {
    const fresh = turning();
    setAutosaveSeconds(fresh.save, 30);
    // A game nobody has loaded may take the empty slot: that is a new game.
    expect(autosave(fresh.save, () => 'a new game')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });

    const authoring = turning();
    setAutosaveSeconds(authoring.save, 30);
    enterDev(authoring.save);
    authoring.pass(30_000);
    autosave(authoring.save, () => 'authoring');
    leaveDev(authoring.save, devSnapshot(authoring.save));

    // The same empty slot, and a session that has just been told it is not its.
    expect(authoring.save.store.read(PLAYER_SLOT)).toBeNull();
    authoring.pass(30_000);
    expect(autosave(authoring.save, () => 'authoring, one command later')).toEqual({ kind: 'held', slot: PLAYER_SLOT });
    expect(authoring.save.store.read(PLAYER_SLOT)).toBeNull();
  });

  it('takes an unreadable slot as one with nothing to lose, rather than refusing every answer', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(PLAYER_SLOT, 'good');
    const readable = save.store.read.bind(save.store);
    (save.store as { read: (name: string) => unknown }).read = (name) => {
      if (name !== PLAYER_SLOT) return readable(name);
      throw new RuntimeError('slot player does not parse');
    };

    // The report still answers, and the next write is allowed to replace bytes
    // nothing can read — which is what the reader beside it already decided.
    expect(saveReport(save).slots).toContainEqual({ name: PLAYER_SLOT, writtenAt: null });
    expect(saveReport(save).adopted).toBe(true);
    pass(30_000);
    expect(autosave(save, () => 'replaced')).toEqual({ kind: 'wrote', slot: PLAYER_SLOT });
  });

  it('will not autosave over a dev slot a crashed session left behind', () => {
    const { save, pass } = turning();
    setAutosaveSeconds(save, 30);
    save.store.write(DEV_SLOT, 'what the last dev session was doing');

    enterDev(save);
    pass(30_000);
    expect(autosave(save, () => 'a different dev session')).toEqual({ kind: 'held', slot: DEV_SLOT });
    expect(save.store.read(DEV_SLOT)?.payload).toBe('what the last dev session was doing');
  });

  it('reports which it is, so a surface draws the answer rather than guessing', () => {
    const { save } = turning();
    save.store.write(PLAYER_SLOT, 'somebody else');
    const restarted: SaveContext = { ...save, dev: false };

    expect(saveReport(restarted).adopted).toBe(false);
    adopted(restarted, PLAYER_SLOT);
    expect(saveReport(restarted).adopted).toBe(true);
  });
});

describe('dev mode moves which slot receives a write (c9, c10, c11, c12, c13)', () => {
  it('persists the player slot before the mode is on, and puts it back on the way out', () => {
    const { save, pass } = turning();
    saveNow(save, 'the player');

    enterDev(save);
    expect(save.store.read(DEV_SNAPSHOT_SLOT)?.payload).toBe(JSON.stringify('the player'));

    pass(1_000);
    saveNow(save, 'authoring');
    saveNow(save, 'more authoring');
    expect(save.store.read(DEV_SLOT)?.payload).toBe('more authoring');
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');

    leaveDev(save, devSnapshot(save));
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');
    expect(save.store.read(DEV_SLOT)).toBeNull();
    expect(save.store.read(DEV_SNAPSHOT_SLOT)).toBeNull();
  });

  it('leaves the stamp alone on a slot nothing touched', () => {
    const { save, pass } = turning();
    const written = saveNow(save, 'the player') && save.store.read(PLAYER_SLOT)!.writtenAt;

    enterDev(save);
    pass(90_000);
    saveNow(save, 'authoring');
    leaveDev(save, devSnapshot(save));

    expect(save.store.read(PLAYER_SLOT)?.writtenAt).toBe(written);
  });

  it('restores byte-identically over a slot something did overwrite', () => {
    const { save } = turning();
    saveNow(save, '{"version":11,"time":5000}');

    enterDev(save);
    save.store.write(PLAYER_SLOT, 'a save-breaking mistake');
    leaveDev(save, devSnapshot(save));

    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('{"version":11,"time":5000}');
  });

  it('snapshots the absence of a slot, and leaving takes the mode back to having none', () => {
    const { save } = turning();

    enterDev(save);
    expect(save.store.read(DEV_SNAPSHOT_SLOT)?.payload).toBe('null');
    saveNow(save, 'authoring');
    save.store.write(PLAYER_SLOT, 'written by something in dev');

    leaveDev(save, devSnapshot(save));
    expect(save.store.read(PLAYER_SLOT)).toBeNull();
  });

  it('loses nothing when the process dies in dev: the snapshot and the player slot are both on disk', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    enterDev(save);
    saveNow(save, 'authoring');

    // The mode lives in memory and the slots do not, so a session that never
    // reached `leaveDev` is exactly this store with a fresh context over it.
    const restarted: SaveContext = { ...save, dev: false };
    expect(restarted.store.read(PLAYER_SLOT)?.payload).toBe('the player');
    expect(liveSlot(restarted)).toBe(PLAYER_SLOT);
    expect(restarted.store.read(DEV_SNAPSHOT_SLOT)?.payload).toBe(JSON.stringify('the player'));
  });

  it('refuses to leave when the snapshot is gone rather than erasing what it cannot restore', () => {
    const { save } = turning();
    saveNow(save, 'the player');
    enterDev(save);
    saveNow(save, 'authoring');
    save.store.remove(DEV_SNAPSHOT_SLOT);

    expect(() => devSnapshot(save)).toThrow(/slot dev-snapshot is gone/);
    expect(save.dev).toBe(true);
    expect(save.store.read(PLAYER_SLOT)?.payload).toBe('the player');
    // Nothing was committed, so the authoring is still where it was.
    expect(save.store.read(DEV_SLOT)?.payload).toBe('authoring');
  });

  it('refuses to enter twice and to leave when it was never entered', () => {
    const { save } = turning();

    expect(() => devSnapshot(save)).toThrow(/not in dev mode/);
    expect(() => leaveDev(save, null)).toThrow(/not in dev mode/);
    enterDev(save);
    expect(() => enterDev(save)).toThrow(/already in dev mode/);
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
      adopted: true,
      autosaveSeconds: 30,
      slots: [
        { name: AUTOSAVE_SLOT, writtenAt: 1_000 },
        { name: PLAYER_SLOT, writtenAt: 1_000 },
      ],
    });

    pass(500);
    enterDev(save);
    const report = saveReport(save);
    expect(report.dev).toBe(true);
    expect(report.slot).toBe(DEV_SLOT);
    expect(report.slots.map((slot) => slot.name)).toEqual([AUTOSAVE_SLOT, DEV_SNAPSHOT_SLOT, PLAYER_SLOT]);
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
