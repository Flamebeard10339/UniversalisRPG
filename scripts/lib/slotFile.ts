import { RuntimeError } from '../../src/runtime/error';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { SlotDriver } from '../../src/runtime/store';

export const SLOT_SUFFIX = '.slot';

const SLOT_NAME = /^[a-z][a-z0-9-]*$/;

function fileFor(dir: string, name: string): string {
  if (!SLOT_NAME.test(name)) throw new RuntimeError(`${JSON.stringify(name)} is not a slot name`);
  return path.join(dir, `${name}${SLOT_SUFFIX}`);
}

function clear(staging: string): void {
  rmSync(staging, { force: true, recursive: true });
}

function replace(staging: string, file: string, name: string): void {
  try {
    renameSync(staging, file);
  } catch (error) {
    clear(staging);
    throw new RuntimeError(`slot ${name} could not be replaced: ${error instanceof Error ? error.message : String(error)}. It still holds what it held.`);
  }
}

function attempting<T>(what: string, act: () => T): T {
  try {
    return act();
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError(`${what}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function fileSlots(dir: string): SlotDriver {
  return {
    read(name) {
      const file = fileFor(dir, name);
      return attempting(`slot ${name} could not be read`, () => (existsSync(file) ? readFileSync(file, 'utf8') : null));
    },
    write(name, text) {
      const file = fileFor(dir, name);
      const staging = `${file}.${process.pid}.tmp`;
      attempting(`slot ${name} could not be written. It still holds what it held`, () => {
        mkdirSync(path.dirname(file), { recursive: true });
        try {
          writeFileSync(staging, text, 'utf8');
        } catch (error) {
          clear(staging);
          throw error;
        }
      });
      replace(staging, file, name);
    },
    remove(name) {
      const file = fileFor(dir, name);
      attempting(`slot ${name} could not be removed`, () => rmSync(file, { force: true }));
    },
    names() {
      if (!existsSync(dir)) return [];
      return attempting('the slots kept here could not be listed', () =>
        readdirSync(dir)
          .filter((entry) => entry.endsWith(SLOT_SUFFIX))
          .map((entry) => entry.slice(0, -SLOT_SUFFIX.length)),
      );
    },
  };
}
