import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));

// The whole driver, entry point included: a door left out of the rule is a
// door with no rule on it.
const SOURCES: Array<{ file: string; text: string }> = [
  ...readdirSync(here)
    .filter((name) => /\.tsx?$/.test(name) && !name.includes('.test.'))
    .map((name) => ({ file: `src/ui/${name}`, path: join(here, name) })),
  { file: 'src/main.tsx', path: resolve(here, '..', 'main.tsx') },
].map(({ file, path }) => ({ file, text: readFileSync(path, 'utf8') }));

const IMPORTS = /\bfrom\s*'([^']+)'/g;

function reaches(source: { file: string; text: string }): string[] {
  const from = posix.dirname(source.file);
  return [...source.text.matchAll(IMPORTS)]
    .map(([, specifier]) => (specifier.startsWith('.') ? posix.normalize(posix.join(from, specifier)) : specifier))
    .filter((target) => target.startsWith('src/runtime/'));
}

// What the runtime publishes for a driver to render and dispatch through.
const PLAY_SURFACE = ['src/runtime/session', 'src/runtime/command'];

// Neither is written under src/ui, which is the point; naming them here is how
// the absence is checked.
const MODAL_IDS = ['character-creation', 'dialogue'];

describe('the rules the driver is held to', () => {
  it('reads the tree it is a rule about', () => {
    expect(SOURCES.map((source) => source.file)).toContain('src/main.tsx');
    expect(SOURCES.length).toBeGreaterThan(6);
  });

  it('reaches the runtime only through the play surface', () => {
    for (const source of SOURCES) {
      for (const target of reaches(source)) expect(PLAY_SURFACE, `${source.file} reaches ${target}`).toContain(target);
    }
  });

  it('names no game state, so it can hold none', () => {
    for (const source of SOURCES) expect(source.text, source.file).not.toContain('GameState');
  });

  it('names no modal, so it cannot be rendering one it knows', () => {
    for (const source of SOURCES) {
      for (const id of MODAL_IDS) expect(source.text, `${source.file} names the modal ${id}`).not.toContain(`'${id}'`);
    }
  });

  it('asks nothing of a network or a filesystem', () => {
    for (const source of SOURCES) {
      expect(source.text, source.file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|public\/content/);
    }
  });
});
