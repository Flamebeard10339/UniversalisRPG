import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MODAL_NAMES } from '../runtime/modals';
import { SURFACE_BUILDERS } from './agent/surfaces';
import { createSurfaceRegistry, installTestHarness } from './agent/testHarness';
import { TOUCH_FLOOR } from './viewport';
import { LABELS } from './labels';
import { createTransientChannel } from './transient';

const here = fileURLToPath(new URL('.', import.meta.url));

function modulesUnder(directory: string, prefix: string): Array<{ file: string; path: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, path }];
  });
}

const SOURCES: Array<{ file: string; text: string }> = [
  ...modulesUnder(here, 'src/ui'),
  { file: 'src/main.tsx', path: resolve(here, '..', 'main.tsx') },
].map(({ file, path }) => ({ file, text: readFileSync(path, 'utf8') }));

const AGENT_DIR = 'src/ui/agent/';

const AGENT_ONLY = SOURCES.filter((source) => source.file.startsWith(AGENT_DIR));

const SHIPPED = SOURCES.filter((source) => !source.file.startsWith(AGENT_DIR));

const REACHES = /['"`][^'"`]*\/runtime\/([\w.-]+)['"`]/g;

function reaches(source: { text: string }): string[] {
  return [...source.text.matchAll(REACHES)].map(([, module]) => module);
}

const PLAY_SURFACE = ['session', 'command', 'localized', 'store', 'saveSlots', 'openUniverse', 'runFiling', 'runLog', 'waysOut'];

const BROUGHT_IN = /import\s+(type\s+)?\{([^}]*)\}\s*from\s*['"`][^'"`]*\/runtime\/[\w.-]+['"`]/g;

function calls(source: { text: string }): string[] {
  return [...source.text.matchAll(BROUGHT_IN)].flatMap(([, typeOnly, names]) =>
    typeOnly ? [] : names.split(',').map((name) => name.trim()).filter((name) => name !== '' && !name.startsWith('type ')),
  );
}

const DISPATCHES = [
  'askedOption',
  'waysOut',
  'BASE_LANGUAGE',
  'createTicker',
  'LIVE_TICK_MS',
  'localizerFor',
  'newContext',
  'openUniverse',
  'openWithLocalCleared',
  'fileRun',
  'stagedRuns',
  'dropRun',
  'runLine',
  'serializeSession',
  'sessionLocalizer',
  'standingLine',
  'view',
  'createSaveContext',
  'memoryDriver',
  'RuntimeError',
  'devTokenIn',
  'runAsSections',
  'startSession',
  'testSteps',
  'walkTest',
  'runId',
  'isPlayed',
  'NO_NOTES',
  'NOTE_FIELDS',
  'parseRun',
  'outcomeOf',
  'PLAYTEST_SLOT',
  'refusedLine',
  'resumptionNotes',
  'serializeRun',
  'turnRecord',
];

const STYLESHEET = readFileSync(resolve(here, '..', 'index.css'), 'utf8');

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

const SIZED = /\b(?:min-|max-)?[hw]-\[(\d+(?:\.\d+)?)px\]/g;

const DRIVEN_BY = /\bdata-drive="([^"]*)"/;

const NEEDS_NONE = /^none: \S/;

function offered(): string[] {
  const anything = new Proxy(() => anything, { get: () => anything }) as never;
  const surfaces = createSurfaceRegistry();
  for (const name of Object.keys(SURFACE_BUILDERS) as Array<keyof typeof SURFACE_BUILDERS>) {
    surfaces.register(name, () => SURFACE_BUILDERS[name](anything));
  }
  return installTestHarness({ transient: createTransientChannel() } as never, {}, { surfaces }).actions();
}

const OFFERED = offered();

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

  it("names each of the shell's own words in the table and nowhere else", () => {
    const table = SOURCES.filter((source) => source.file.endsWith('/labels.ts'));
    expect(table).toHaveLength(1);

    for (const key of Object.values(LABELS)) {
      for (const source of SOURCES) {
        if (source === table[0]) continue;
        expect(source.text, `${source.file} names the key ${key} rather than reading it off the table`).not.toContain(`'${key}'`);
      }
    }
  });

  it('mints no Localized of its own', () => {
    for (const source of SOURCES) {
      expect(source.text, source.file).not.toContain('localizedFixture');
      expect(source.text, source.file).not.toMatch(/[^A-Za-z]as Localized[^A-Za-z]/);
    }
  });

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
    expect(checked).toBeGreaterThan(6);
  });

  it('offers what the harness offers, read off the harness rather than written down here', () => {
    expect(OFFERED).toContain('send');
    expect(OFFERED).toContain('shell.layer');
    expect(OFFERED).toContain('map.plane');
  });

  it('names on every control the harness action that drives it, or why it needs none', () => {
    let named = 0;
    for (const source of SOURCES) {
      for (const control of controls(source.text)) {
        const declared = DRIVEN_BY.exec(control)?.[1];

        expect(declared, `${source.file} renders a control that names no driver: ${control.slice(0, 60)}`).toBeDefined();
        named += 1;
        if (NEEDS_NONE.test(declared!)) continue;
        expect(OFFERED, `${source.file} names the driver ${declared}, which the harness does not offer`).toContain(declared);
      }
    }
    expect(named).toBeGreaterThan(6);
  });

  it('reads a control whole, however much of a handler sits inside its tag', () => {
    const written = '<button onClick={() => (a > b ? x : y)} className="h-[12px]">go</button>';

    expect(controls(written)).toEqual(['<button onClick={() => (a > b ? x : y)} className="h-[12px]"']);
  });

  it('registers every surface a builder can make, and none a builder cannot', () => {
    const registering = SHIPPED.flatMap((source) =>
      [...source.text.matchAll(/\buseTestSurface\s*\(\s*'([^']+)'/g)].map(([, surface]) => ({ surface, file: source.file })),
    );
    const buildable = Object.keys(SURFACE_BUILDERS);

    expect(buildable.length, 'no surface has a builder, so every check below holds vacuously').toBeGreaterThan(0);
    for (const surface of buildable) {
      expect(registering.map((one) => one.surface), `nothing under src/ui registers the ${surface} surface`).toContain(surface);
    }
    for (const one of registering) {
      expect(buildable, `${one.file} registers ${one.surface}, which no builder makes`).toContain(one.surface);
    }
  });

  it('reaches the agent directory only from a branch a production build folds away', () => {
    expect(AGENT_ONLY, 'the agent directory is empty, so every rule below holds vacuously').not.toHaveLength(0);

    const reaching = SHIPPED.filter((source) => source.text.includes('/agent/'));

    expect(reaching.length, 'nothing that ships reaches the agent directory at all').toBeGreaterThan(0);
    for (const source of reaching) {
      expect(source.text, `${source.file} reaches the agent directory with no DEV constant to fold it away`).toContain('import.meta.env.DEV');
      expect(source.text, `${source.file} brings an agent-only module in as a value at the top`).not.toMatch(/import\s+(?!type\b)[^;]*from\s*['"`][^'"`]*\/agent\/[^'"`]*['"`]/);
    }
  });

  it('asks nothing of a pane that is merely loaded late, because that is not what makes a module agent-only', () => {
    const lazily = { file: 'src/ui/Ledger.tsx', text: "const Body = lazy(() => import('./LedgerBody'));" };

    expect(lazily.file.startsWith(AGENT_DIR)).toBe(false);
    expect(lazily.text).not.toMatch(/\/agent\//);
  });

  it('asks nothing of a network or a filesystem', () => {
    for (const source of SOURCES) {
      expect(source.text, source.file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|public\/content/);
    }
  });
});

const TREE: Array<{ file: string; text: string }> = [
  ...modulesUnder(resolve(here, '..'), 'src'),
  ...modulesUnder(resolve(here, '..', '..', 'scripts'), 'scripts'),
].map(({ file, path }) => ({ file, text: readFileSync(path, 'utf8') }));

const DRIVING = TREE.filter((source) => source.file.startsWith('src/ui/') || source.file.startsWith('scripts/'));

const THE_LOAD_PATH = ['loadUniverseWithDiagnostics', 'loadUniverse'];

const THE_GUESS = ['FAULT_AT', 'FaultAt', 'Fault.at', 'localTrouble', 'wordless'];

function tryBlocks(text: string): string[] {
  const found: string[] = [];
  for (const opening of text.matchAll(/\btry\s*\{/g)) {
    let depth = 1;
    let at = opening.index + opening[0].length;
    while (at < text.length && depth > 0) {
      if (text[at] === '{') depth += 1;
      else if (text[at] === '}') depth -= 1;
      at += 1;
    }
    found.push(text.slice(opening.index, at));
  }
  return found;
}

describe('src/ui does not open a universe, and the apparatus that guessed is gone (c6)', () => {
  it('walks the whole tree, so the counts below are about more than this layer', () => {
    expect(TREE.map((source) => source.file)).toContain('scripts/play-cli.ts');
    expect(TREE.map((source) => source.file)).toContain('src/runtime/openUniverse.ts');
    expect(TREE.length).toBeGreaterThan(SOURCES.length);
  });

  it('calls the load path nowhere under src/ui', () => {
    for (const source of SOURCES) {
      for (const name of THE_LOAD_PATH) expect(source.text, `${source.file} calls ${name}`).not.toContain(name);
    }
  });

  it('leaves it reachable where it belongs, so the rule above is about where it is called rather than about it existing', () => {
    expect(TREE.filter((source) => source.text.includes(THE_LOAD_PATH[0])).map((source) => source.file)).toContain('src/runtime/openUniverse.ts');
  });

  it('names nothing that guessed, anywhere in the tree', () => {
    for (const source of TREE) {
      for (const name of THE_GUESS) expect(source.text, `${source.file} names ${name}`).not.toContain(name);
    }
  });
});

describe('no caller classifies a failure by where it was standing (c2)', () => {
  it('reads a try block whole, however much sits inside it', () => {
    expect(tryBlocks('try { if (a) { b(); } } catch {}')).toEqual(['try { if (a) { b(); } }']);
  });

  it('finds the try blocks there are, so the rule below is about something', () => {
    const blocks = DRIVING.flatMap((source) => tryBlocks(source.text));

    expect(blocks.length).toBeGreaterThan(6);
  });

  it('puts no call to the door inside one, under src/ui or scripts', () => {
    for (const source of DRIVING) {
      for (const block of tryBlocks(source.text)) {
        expect(block, `${source.file} catches around a call to the door`).not.toMatch(/\bopenUniverse\s*\(/);
      }
    }
  });
});
