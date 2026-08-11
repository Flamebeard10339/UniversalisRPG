import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The names read off the definitions rather than copied from them, so a modal
// added to the runtime is checked from the day it exists. This file reaches
// past the play surface the rules below hold the driver to, which is allowed
// of a test and of nothing else here: SOURCES excludes it.
import { MODAL_NAMES } from '../runtime/modals';

const here = fileURLToPath(new URL('.', import.meta.url));

// Every module beneath src/ui, not every module directly inside it: a rule
// that stops at the top level exempts the whole of src/ui/tabs/ from all four
// of the rules below at once, and a directory is how this layer will grow.
function modulesUnder(directory: string, prefix: string): Array<{ file: string; path: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, path }];
  });
}

// The whole driver, entry point included: a door left out of the rule is a
// door with no rule on it.
const SOURCES: Array<{ file: string; text: string }> = [
  ...modulesUnder(here, 'src/ui'),
  { file: 'src/main.tsx', path: resolve(here, '..', 'main.tsx') },
].map(({ file, path }) => ({ file, text: readFileSync(path, 'utf8') }));

// Any quoted path into the runtime, whatever brought it in. Matching `from`
// and one quote style would be matching a coding habit: a dynamic import in
// backticks reaches exactly as far and reads nothing like an import.
const REACHES = /['"`][^'"`]*\/runtime\/([\w.-]+)['"`]/g;

function reaches(source: { text: string }): string[] {
  return [...source.text.matchAll(REACHES)].map(([, module]) => module);
}

// What the runtime publishes for a driver to render and dispatch through.
const PLAY_SURFACE = ['session', 'command'];

// A named import off the play surface, and whether the statement brought it in
// as a type. A type is a shape to render; a value is a thing to call.
const BROUGHT_IN = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"`][^'"`]*\/runtime\/[\w.-]+['"`]/g;

function calls(source: { text: string }): string[] {
  return [...source.text.matchAll(BROUGHT_IN)].flatMap(([, typeOnly, names]) =>
    typeOnly ? [] : names.split(',').map((name) => name.trim()).filter((name) => name !== '' && !name.startsWith('type ')),
  );
}

// Everything src/ui takes off the play surface as a value: the entries a
// driver dispatches through, the cadence both drivers tick at, and the ticker
// that turns two clock readings into an elapsed span.
const DISPATCHES = ['askedOption', 'createTicker', 'LIVE_TICK_MS', 'newContext', 'runLine', 'serializeSession', 'startSession', 'view'];

// The other half of the same rule, and the half that does not depend on how a
// name arrived. The allowlist above reads `import { x } from`; this reads the
// call, so `(await import('../runtime/session')).wait(…)` is caught by the one
// spelling that cannot be avoided — using the thing. Time advances in src/ui
// only by handing elapsed milliseconds to the run the command surface armed.
const MOVES_THE_WORLD = /\b(wait|apply|applyDirective|beginAction|cancelAction|submitModal)\s*\(/;


describe('the rules the driver is held to', () => {
  it('reads the tree it is a rule about', () => {
    expect(SOURCES.map((source) => source.file)).toContain('src/main.tsx');
    expect(SOURCES.length).toBeGreaterThan(6);
  });

  it('descends, so a module in a directory is held to every rule below', () => {
    const root = mkdtempSync(join(tmpdir(), 'ui-sweep-'));
    mkdirSync(join(root, 'tabs'));
    writeFileSync(join(root, 'tabs', 'Map.tsx'), '');
    writeFileSync(join(root, 'top.ts'), '');
    writeFileSync(join(root, 'top.test.ts'), '');

    const found = modulesUnder(root, 'src/ui').map((module) => module.file);

    rmSync(root, { recursive: true, force: true });
    expect(found.sort()).toEqual(['src/ui/tabs/Map.tsx', 'src/ui/top.ts']);
  });

  it('reaches the runtime only through the play surface', () => {
    for (const source of SOURCES) {
      for (const target of reaches(source)) expect(PLAY_SURFACE, `${source.file} reaches ${target}`).toContain(target);
    }
  });

  it('brings in only what a driver dispatches through, so it cannot advance a clock of its own', () => {
    for (const source of SOURCES) {
      for (const name of calls(source)) expect(DISPATCHES, `${source.file} brings in ${name}`).toContain(name);
      // A namespace import reaches every one of them and names none.
      expect(source.text, source.file).not.toMatch(/import\s+\*\s+as\s+\w+\s+from\s*['"`][^'"`]*\/runtime\//);
    }
  });

  it('calls nothing that moves the world, however the name reached it', () => {
    for (const source of SOURCES) expect(source.text, source.file).not.toMatch(MOVES_THE_WORLD);
  });

  it('names no game state, so it can hold none', () => {
    for (const source of SOURCES) expect(source.text, source.file).not.toContain('GameState');
  });

  it('names no modal, so it cannot be rendering one it knows', () => {
    expect(MODAL_NAMES.length).toBeGreaterThan(0);
    for (const source of SOURCES) {
      for (const id of MODAL_NAMES) expect(source.text, `${source.file} names the modal ${id}`).not.toContain(`'${id}'`);
    }
  });

  it('asks nothing of a network or a filesystem', () => {
    for (const source of SOURCES) {
      expect(source.text, source.file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|public\/content/);
    }
  });
});
