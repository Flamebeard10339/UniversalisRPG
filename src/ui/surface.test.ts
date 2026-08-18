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
import { SURFACE_BUILDERS } from './agent/surfaces';
import { createSurfaceRegistry, installTestHarness } from './agent/testHarness';
import { TOUCH_FLOOR } from './viewport';
import { LABELS } from './labels';
import { createTransientChannel } from './transient';

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

// The modules that exist only to be driven, derived from where they are and
// from nothing else. bundle.test.ts reads the same directory, so the two guards
// cannot disagree about what the set is, and a third such module is covered the
// day it is written.
//
// The predicate used to be "reached by a dynamic import", which is how a module
// happened to be brought in rather than what it is: it exempted anything
// written outside that spelling, and it would have refused the first React.lazy
// of a pane by demanding it hide behind a constant a production build folds
// away. A directory refuses neither.
const AGENT_DIR = 'src/ui/agent/';

const AGENT_ONLY = SOURCES.filter((source) => source.file.startsWith(AGENT_DIR));

const SHIPPED = SOURCES.filter((source) => !source.file.startsWith(AGENT_DIR));

// Any quoted path into the runtime, whatever brought it in. Matching `from`
// and one quote style would be matching a coding habit: a dynamic import in
// backticks reaches exactly as far and reads nothing like an import.
const REACHES = /['"`][^'"`]*\/runtime\/([\w.-]+)['"`]/g;

function reaches(source: { text: string }): string[] {
  return [...source.text.matchAll(REACHES)].map(([, module]) => module);
}

// What the runtime publishes for a driver to render and dispatch through, plus
// the module declaring what a published string may be: a driver that holds one
// has to be able to name its type, and c3 makes every word this layer draws one
// of them.
// plus the two the driver now stands in rather than renders: the slot-store
// interface a browser adapter satisfies, and the save context built over it.
// Neither publishes anything to draw, which is why they are a widening of this
// list rather than an exception to it — a driver keeps slots or it does not.
// plus the one door a universe is opened through, which is what src/ui reaches
// instead of the load path it used to reach past this list into.
const PLAY_SURFACE = ['session', 'command', 'localized', 'store', 'saveSlots', 'openUniverse'];

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
const DISPATCHES = [
  'askedOption',
  'BASE_LANGUAGE',
  'createTicker',
  'LIVE_TICK_MS',
  'localizerFor',
  'newContext',
  // The one call that opens a universe. src/ui hands it sources and is handed
  // back a session, the modules that loaded and a list of problems; what
  // loading has stages is not something this layer is told.
  'openUniverse',
  // And the same question with the author's module set aside, which is how the
  // shell knows whether the control that discards it changes anything. Asked of
  // the door rather than worked out here, because working it out means writing
  // the module the way `/local clear` does, and that is the load-and-adopt path
  // this layer is closed to.
  'openWithLocalCleared',
  'runLine',
  'serializeSession',
  'sessionLocalizer',
  'view',
  // The store half: the context a driver keeps slots in, the refusal every slot
  // driver raises, and the driver a session with nowhere to write falls back on.
  'createSaveContext',
  'memoryDriver',
  'RuntimeError',
  // Which lines name a dev-only power, which is the table's own mark read back.
  // A reading, not a second table: the shell refuses what the marks say and
  // holds no list of its own for one to fall behind the other.
  'devTokenIn',
];

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

// What a control says drives it, written on its own tag. An attribute rather
// than a table beside the tree, because a table is a second place to remember
// and the whole point is that a control that declares nothing fails.
const DRIVEN_BY = /\bdata-drive="([^"]*)"/;

// A control that needs no driving says so here, with why. Nothing in the tree
// uses this today — every control answers to an action — and it exists so the
// rule has an answer other than being argued with.
const NEEDS_NONE = /^none: \S/;

// Everything the harness offers, taken from the harness rather than listed:
// the actions the driver installs, plus the ones every surface builder makes.
// A builder is called with a value that answers to anything, because an action
// map is built the moment the surface is and reads nothing to do it — so this
// needs to know what the surfaces are called and nothing about what they hold.
function offered(): string[] {
  const anything = new Proxy(() => anything, { get: () => anything }) as never;
  const surfaces = createSurfaceRegistry();
  for (const name of Object.keys(SURFACE_BUILDERS) as Array<keyof typeof SURFACE_BUILDERS>) {
    surfaces.register(name, () => SURFACE_BUILDERS[name](anything));
  }
  return installTestHarness({ transient: createTransientChannel() } as never, {}, { surfaces }).actions();
}

const OFFERED = offered();

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
  // being an engine value or one of these. After c3 the table holds keys rather
  // than words, so what this keeps out of a component is the key: a component
  // reaching the localizer directly would be a second vocabulary, and the whole
  // point is that there is one and it lives in exactly one file.
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

  // The half the table cannot hold: nothing under src/ui may reach the one cast
  // that makes a `Localized` without a localizer, so a component with a word to
  // draw has no door but a key.
  it('mints no Localized of its own', () => {
    for (const source of SOURCES) {
      expect(source.text, source.file).not.toContain('localizedFixture');
      expect(source.text, source.file).not.toMatch(/[^A-Za-z]as Localized[^A-Za-z]/);
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

  // c2. The set is read off the tree by the same scanner the floor rule uses,
  // so a component that adds a control and names nothing fails rather than
  // passing quietly, and the name is checked against what the harness actually
  // offers, so a control naming an action no surface has fails too.
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
    // A scanner that found nothing would pass every control above.
    expect(named).toBeGreaterThan(6);
  });

  it('reads a control whole, however much of a handler sits inside its tag', () => {
    const written = '<button onClick={() => (a > b ? x : y)} className="h-[12px]">go</button>';

    expect(controls(written)).toEqual(['<button onClick={() => (a > b ? x : y)} className="h-[12px]"']);
  });

  // A registration has two halves and they fail differently. That it does not
  // lie is held by the seam — each component assembles one value, draws from it
  // and hands that same value over, so render.test.tsx fails on a lie. That it
  // exists at all is held here.
  //
  // The rule this replaced named App.tsx and MapPane.tsx, which was a list of
  // two filenames; removing it left the existing half unheld, and deleting a
  // component's whole call survived all 2523 tests. The set is derived instead:
  // a builder and a registration are the same surface named twice, so the
  // builders are what says which registrations must exist.
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

  // c6's structural half — bundle.test.ts builds the release and reads the
  // module graph, which is the other. A module that ships may reach into the
  // directory only from inside a branch the DEV constant folds away, and never
  // by bringing one in as a value at the top: that would keep it reachable
  // however the branch folds.
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
    // The rule the dynamic-import predicate would have failed. Splitting a pane
    // out for loading is an ordinary thing to want on a phone, and demanding it
    // sit behind a constant a production build folds away is exactly wrong.
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

// Every effect this layer schedules, counted off the tree rather than listed.
// An effect is where a component reaches the DOM or the world after a render —
// putting a scroll position back, writing a slot, measuring a node — and what
// is below is the one statement about all of them.
const EFFECTS = SOURCES.flatMap((source) => [...source.text.matchAll(/\buse(?:Layout)?Effect\s*\(/g)].map(() => source.file));

// What would have to be here for this suite to run one. The environment is
// unset in the vite config and none of these is a dependency, so nothing in
// the suite mounts a component: `renderToStaticMarkup` produces the first
// frame and stops. Named by what they are rather than by version, so a runner
// added under any of these names trips the rule.
const AN_EFFECT_RUNNER = ['jsdom', 'happy-dom', '@testing-library', '@vitest/browser'];

const CONFIG = readFileSync(resolve(here, '..', '..', 'vite.config.ts'), 'utf8');

const MANIFEST = readFileSync(resolve(here, '..', '..', 'package.json'), 'utf8');

// The boundary of what this suite reaches, stated once for the layer instead of
// per component in a commit body. Two effects were declared untested where
// there were four, which is the enumeration failure this repository names
// first; a count and a reason cannot be born short.
//
// This is CLAUDE.md's testing rule 5 as a check rather than as prose: a UI
// feature is tested by the author, and what an agent owes is the pure decision
// beside the component. Every effect below wires one of those — `editControls`,
// `gripFor`, `remembered`, `rowsIn` — and the wiring is the author's to look at.
// If a runner is ever added, this fails, and the declaration is rewritten
// against a suite that can reach them rather than quietly outliving its reason.
describe('what this suite reaches, and what it leaves to the author', () => {
  it('schedules effects under src/ui, so the statement below is about something', () => {
    expect(EFFECTS.length).toBeGreaterThan(6);
    expect(new Set(EFFECTS).size).toBeGreaterThan(3);
  });

  it('runs none of them, because there is nothing here that could', () => {
    expect(CONFIG, 'vite.config.ts names a test environment, so effects may now run').not.toMatch(/\benvironment\s*:/);
    for (const runner of AN_EFFECT_RUNNER) {
      expect(MANIFEST, `${runner} is a dependency, so effects may now run`).not.toContain(`"${runner}`);
    }
  });
});

// Everything that ships, wherever it lives: the two rules below are about the
// whole tree rather than about this layer, so the set they walk is not the one
// the rules above walk. Test modules are out, because the scanner has to be
// able to name what it is refusing.
const TREE: Array<{ file: string; text: string }> = [
  ...modulesUnder(resolve(here, '..'), 'src'),
  ...modulesUnder(resolve(here, '..', '..', 'scripts'), 'scripts'),
].map(({ file, path }) => ({ file, text: readFileSync(path, 'utf8') }));

// What opening a universe used to be done with, and the apparatus that existed
// only to guess which module was at fault. Counted off the tree rather than
// listed against filenames, so a site written next month is caught and a rename
// is not a way to satisfy this.
// The two places a universe is opened from, which is where a catch around the
// opening would have to be.
const DRIVING = TREE.filter((source) => source.file.startsWith('src/ui/') || source.file.startsWith('scripts/'));

const THE_LOAD_PATH = ['loadUniverseWithDiagnostics', 'loadUniverse'];

const THE_GUESS = ['FAULT_AT', 'FaultAt', 'Fault.at', 'localTrouble', 'wordless'];

// A `try` block, whole, however many braces sit inside it: the same brace-aware
// walk the control scanner does, aimed at a keyword instead of a tag.
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
