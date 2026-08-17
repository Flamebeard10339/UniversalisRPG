import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { RuntimeError } from '../../src/runtime/runtime';
import { fileSlots, SLOT_SUFFIX } from './slotFile';

const made: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'universalis-slotfile-'));
  made.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('one file per slot, under one directory', () => {
  it('makes the directory on the first write and not before', () => {
    const dir = path.join(tempDir(), 'not-yet');
    const driver = fileSlots(dir);

    expect(driver.read('player')).toBeNull();
    expect(driver.names()).toEqual([]);
    expect(existsSync(dir)).toBe(false);

    driver.write('player', 'text');
    expect(readdirSync(dir)).toEqual([`player${SLOT_SUFFIX}`]);
  });

  it('moves text without reading it, and removing what is not there is not a failure', () => {
    const dir = tempDir();
    const driver = fileSlots(dir);
    const payload = '{"version":11}\nnot even one line\r\n';

    driver.write('player', payload);
    expect(driver.read('player')).toBe(payload);
    expect(readFileSync(path.join(dir, `player${SLOT_SUFFIX}`), 'utf8')).toBe(payload);

    driver.remove('player');
    expect(driver.read('player')).toBeNull();
    expect(() => driver.remove('player')).not.toThrow();
  });

  it('lists slots by name, and nothing in the directory that is not one', () => {
    const dir = tempDir();
    const driver = fileSlots(dir);
    driver.write('player', 'a');
    driver.write('dev-snapshot', 'b');
    writeFileSync(path.join(dir, 'notes.txt'), 'not a slot', 'utf8');

    expect(driver.names().sort()).toEqual(['dev-snapshot', 'player']);
  });

  // The reason the write is staged: `writeFileSync` truncates and then streams,
  // so a process that dies inside that window leaves a prefix where a save was.
  // A rename cannot half-happen, which is the filesystem's guarantee rather than
  // this file's — what is testable here is the other half of it, that a write
  // which does not complete leaves the slot holding exactly what it held.
  describe('a write that does not finish costs nothing', () => {
    const staging = (dir: string, name: string): string => path.join(dir, `${name}${SLOT_SUFFIX}.${process.pid}.tmp`);

    it('leaves no staging file behind when it works', () => {
      const dir = tempDir();
      const driver = fileSlots(dir);
      driver.write('player', 'first');
      driver.write('player', 'second');

      expect(readdirSync(dir)).toEqual([`player${SLOT_SUFFIX}`]);
      expect(driver.read('player')).toBe('second');
    });

    it('keeps the old bytes when the staged write cannot be made', () => {
      const dir = tempDir();
      const driver = fileSlots(dir);
      driver.write('player', 'an hour of play');
      // Something already standing where the staged bytes would go.
      mkdirSync(staging(dir, 'player'));

      expect(() => driver.write('player', 'a brand new game')).toThrow(/slot player could not be written/);
      expect(driver.read('player')).toBe('an hour of play');
      expect(driver.names()).toEqual(['player']);
    });

    it('keeps the old bytes when the staged write cannot be moved into place', () => {
      const dir = tempDir();
      const driver = fileSlots(dir);
      // A slot that is a directory: the staging write lands, and the rename
      // onto it cannot.
      const file = path.join(dir, `player${SLOT_SUFFIX}`);
      mkdirSync(file);
      writeFileSync(path.join(file, 'in the way'), 'x', 'utf8');

      expect(() => driver.write('player', 'a brand new game')).toThrow(/slot player could not be replaced/);
      expect(existsSync(staging(dir, 'player'))).toBe(false);
    });

    it('does not list a staging file as a slot', () => {
      const dir = tempDir();
      const driver = fileSlots(dir);
      driver.write('player', 'kept');
      writeFileSync(staging(dir, 'player'), 'half of something', 'utf8');

      expect(driver.names()).toEqual(['player']);
    });
  });

  // The guard is the whole of what stops a slot name reaching the filesystem as
  // a path. Nothing hands it a name from a person today; the branch that adds a
  // save-slot picker is the one that will, and this is what it will find.
  const REFUSED = ['..', '../escape', 'a/b', 'a\\b', '/absolute', 'C:name', '.hidden', 'Upper', '', ' '];

  for (const name of REFUSED) {
    it(`refuses ${JSON.stringify(name)} as a slot name, on every verb`, () => {
      const driver = fileSlots(tempDir());

      expect(() => driver.read(name)).toThrow(RuntimeError);
      expect(() => driver.write(name, 'x')).toThrow(RuntimeError);
      expect(() => driver.remove(name)).toThrow(RuntimeError);
    });
  }

  it('nothing it refused reached the directory', () => {
    const dir = tempDir();
    const driver = fileSlots(dir);
    for (const name of REFUSED) {
      try {
        driver.write(name, 'x');
      } catch {
        // The point of the loop is that none of them landed.
      }
    }

    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });
});
