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
import { TOUCH_FLOOR } from './discovery';
import { LABELS } from './labels';

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

// A module this layer reaches by a dynamic import, which is the seam a DEV
// branch is folded away at. Read off the tree rather than listed, so the rule
// below covers a second agent-only module from the day something imports it.
const DEAD_BRANCH = /\bimport\(\s*['"`]\.\/([\w.-]+)['"`]\s*\)/g;

const AGENT_ONLY = [...new Set(SOURCES.flatMap((source) => [...source.text.matchAll(DEAD_BRANCH)].map(([, module]) => module)))];

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

// The stylesheet the floor is set in, read as text: it is one rule over four
// element names, so this is the whole of what holds a control that declares
// nothing — which, after this branch, is most of them.
const STYLESHEET = readFileSync(resolve(here, '..', 'index.css'), 'utf8');

// Every control in the tree, as the attributes it was written with. Brace-aware
// rather than a regex to the first `>`, because an onClick with an arrow in it
// puts a `>` inside the tag and a scan that stops there stops mid-handler.
function controls(text: string): string[] {
  const found: string[] = [];
  for (const opening of text.matchAll(/<(?:button|input|select|textarea)\b/g)) {
    let depth = 0;
    let at = opening.index + opening[0].length;
    while (at < text.length) {
      const char = text[at];
      if (char === '{') depth += 1;
      else if (char === '}') depth -= 1;
      else if (char === '>' && depth === 0) break;
      at += 1;
    }
    found.push(text.slice(opening.index, at));
  }
  return found;
}

// A Tailwind arbitrary size in pixels, whichever axis and whichever bound it
// sets. A control may ask for more room than the floor and may not ask for
// less, so the check is on the number and not on which utility carries it.
const SIZED = /\b(?:min-|max-)?[hw]-\[(\d+(?:\.\d+)?)px\]/g;

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

  // The other half of the render sweep, which holds every word on the screen to
  // being an engine value or one of these. That leaves the table itself free to
  // grow, so this is what keeps a component from writing its own word: the
  // vocabulary is a table because it lives in exactly one file.
  it("writes each of the shell's own words in the table and nowhere else", () => {
    const table = SOURCES.filter((source) => source.file.endsWith('/labels.ts'));
    expect(table).toHaveLength(1);

    for (const word of Object.values(LABELS)) {
      for (const source of SOURCES) {
        if (source === table[0]) continue;
        expect(source.text, `${source.file} writes the word ${word} rather than reading it`).not.toContain(`'${word}'`);
        expect(source.text, `${source.file} writes the word ${word} rather than reading it`).not.toContain(`>${word}<`);
      }
    }
  });

  // c6's floor, held where it is set rather than once per component. The two
  // together are the whole rule: the stylesheet gives every control the floor
  // by being a control, and nothing in the tree takes it back.
  it('floors every control in the stylesheet, on both axes', () => {
    const rule = STYLESHEET.match(/button,\s*input,\s*select,\s*textarea\s*\{([^}]*)\}/);
    expect(rule, 'no rule in src/index.css covers the four control elements').not.toBeNull();

    for (const axis of ['min-height', 'min-width']) {
      const floor = rule![1].match(new RegExp(`${axis}:\\s*(\\d+)px`));
      expect(floor, `the control rule sets no ${axis}`).not.toBeNull();
      expect(Number(floor![1]), axis).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }
  });

  it('lets no control in the tree ask for less room than the floor', () => {
    let checked = 0;
    for (const source of SOURCES) {
      for (const control of controls(source.text)) {
        checked += 1;
        for (const [utility, size] of control.matchAll(SIZED)) {
          expect(Number(size), `${source.file} sizes a control ${utility}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
        }
      }
    }
    // A scanner that found nothing would pass every line above.
    expect(checked).toBeGreaterThan(6);
  });

  it('reads a control whole, however much of a handler sits inside its tag', () => {
    const written = '<button onClick={() => (a > b ? x : y)} className="h-[12px]">go</button>';

    expect(controls(written)).toEqual(['<button onClick={() => (a > b ? x : y)} className="h-[12px]"']);
  });

  it('writes the registration call in every component that holds what an agent has to move', () => {
    const registering = SOURCES.filter((source) => /\buseTestSurface\s*\(/.test(source.text)).map((source) => source.file);

    expect(registering).toContain('src/ui/App.tsx');
    expect(registering).toContain('src/ui/MapPane.tsx');
  });

  // c9's last sentence, as the structure that makes it true rather than as the
  // bundle it makes true — bundle.test.ts builds and reads that. This one names
  // the files: an agent-only module is reached by an import inside a branch the
  // DEV constant folds away, so no module may bring one in as a value at the
  // top.
  it('reaches every agent-only module only from a branch a production build folds away', () => {
    expect(AGENT_ONLY, 'nothing in the tree is reached by a dead-branch import').toContain('testHarness');

    for (const module of AGENT_ONLY) {
      const reaching = SOURCES.filter((source) => !source.file.endsWith(`/${module}.ts`) && source.text.includes(module));

      expect(reaching.length, `nothing in the tree reaches ${module}`).toBeGreaterThan(0);
      for (const source of reaching) {
        expect(source.text, `${source.file} names ${module} with no DEV constant to fold it away`).toContain('import.meta.env.DEV');
        expect(source.text, `${source.file} brings ${module} in as a value at the top`).not.toMatch(new RegExp(`import\\s+(?!type\\b)[^;]*from\\s*['"\`][^'"\`]*${module}['"\`]`));
      }
    }
  });

  it('asks nothing of a network or a filesystem', () => {
    for (const source of SOURCES) {
      expect(source.text, source.file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|public\/content/);
    }
  });
});
