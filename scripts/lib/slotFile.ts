import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
      writeFileSync(file, text, 'utf8');
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
