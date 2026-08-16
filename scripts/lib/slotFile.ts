import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { RuntimeError } from '../../src/runtime/runtime';
import type { SlotDriver } from '../../src/runtime/store';

export const SLOT_SUFFIX = '.slot';

// A slot name is a file name here, so it is held to being one: nothing that
// could climb out of the directory it is written under reaches the filesystem.
const SLOT_NAME = /^[a-z][a-z0-9-]*$/;

function fileFor(dir: string, name: string): string {
  if (!SLOT_NAME.test(name)) throw new RuntimeError(`${JSON.stringify(name)} is not a slot name`);
  return path.join(dir, `${name}${SLOT_SUFFIX}`);
}

// Whatever is at the staging path, gone: the path is this write's own, and a
// failure that left something there must not be reported as that something.
function clear(staging: string): void {
  rmSync(staging, { force: true, recursive: true });
}

// Staged beside the slot and renamed over it, because `writeFileSync` truncates
// and then streams: a process that dies inside that window leaves a prefix, and
// the save it was replacing is already gone. A rename is atomic, so a slot holds
// either the bytes that were there or the bytes going in, and a write that never
// finished costs nothing at all.
//
// Deliberately without the retry loop `docs/tasks.jsonl` takes around the same
// rename. That store is written by whichever `tasks` processes are in flight and
// has to win the race; a save slot is written by the one game playing it, so a
// rename that loses says so and the next autosave comes back in a cadence.
function replace(staging: string, file: string, name: string): void {
  try {
    renameSync(staging, file);
  } catch (error) {
    clear(staging);
    throw new RuntimeError(`slot ${name} could not be replaced: ${error instanceof Error ? error.message : String(error)}. It still holds what it held.`);
  }
}

// One file per slot under one directory, created on the first write. Nothing
// here reads the text it moves: what a slot means is decided above this.
export function fileSlots(dir: string): SlotDriver {
  return {
    read(name) {
      const file = fileFor(dir, name);
      return existsSync(file) ? readFileSync(file, 'utf8') : null;
    },
    write(name, text) {
      const file = fileFor(dir, name);
      mkdirSync(path.dirname(file), { recursive: true });
      const staging = `${file}.${process.pid}.tmp`;
      try {
        writeFileSync(staging, text, 'utf8');
      } catch (error) {
        clear(staging);
        throw new RuntimeError(`slot ${name} could not be written: ${error instanceof Error ? error.message : String(error)}. It still holds what it held.`);
      }
      replace(staging, file, name);
    },
    remove(name) {
      rmSync(fileFor(dir, name), { force: true });
    },
    names() {
      if (!existsSync(dir)) return [];
      return readdirSync(dir)
        .filter((entry) => entry.endsWith(SLOT_SUFFIX))
        .map((entry) => entry.slice(0, -SLOT_SUFFIX.length));
    },
  };
}
