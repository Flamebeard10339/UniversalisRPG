import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..', '..');

interface Part {
  fileName: string;
  type: string;
  code?: string;
  source?: string | Uint8Array;
  // Which source files the chunk was rolled up from, as Rollup reports them.
  modules?: Record<string, unknown>;
}

interface Emitted {
  name: string;
  text: string;
  from: string[];
}

// What a player's browser is actually handed. Built in memory rather than onto
// disk: nothing is left behind for the next run to read instead of building,
// and a dist/ someone happens to have is not what this passes or fails on.
//
// NODE_ENV, and not the mode, is what decides whether the build is a production
// one — measured both ways, and a mode of production under a NODE_ENV of test
// still emits the development bundle. The release runs this with NODE_ENV
// unset; a test run has it set to test, so it is put back for the length of the
// build and restored after.
async function shipped(): Promise<Emitted[]> {
  const held = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const built = (await build({
      configFile: resolve(root, 'vite.config.ts'),
      configLoader: 'runner',
      logLevel: 'silent',
      mode: 'production',
      build: { write: false },
    })) as unknown as { output: Part[] } | Array<{ output: Part[] }>;

    return (Array.isArray(built) ? built : [built])
      .flatMap((one) => one.output)
      .map((part) => ({
        name: part.fileName,
        text: part.code ?? (typeof part.source === 'string' ? part.source : ''),
        from: Object.keys(part.modules ?? {}).map(slashed),
      }));
  } finally {
    process.env.NODE_ENV = held;
  }
}

const slashed = (path: string): string => path.replace(/\\/g, '/');

// Every message a module can throw, as the parts of the literal that are not
// interpolated. A minifier renames a binding and leaves a quoted string alone,
// so this is the half of a name check that survives a production build — and it
// is what a grep over dist/ found the builders by.
function messages(text: string): string[] {
  return [...text.matchAll(/new Error\((`[^`]*`|'[^']*')/g)]
    .flatMap(([, literal]) => literal.slice(1, -1).split(/\$\{[^}]*\}/))
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
}

function sourcesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

// Where the modules only a driving agent reaches live. The directory is the
// whole derivation of the set — a module is agent-only because of where it is —
// so this test and the source rule under surface.test.ts cannot disagree about
// what the set is, and a third such module is covered from the day it is
// written rather than from the day someone remembers to widen a list.
export const AGENT_DIR = 'src/ui/agent';

const OWNERS = sourcesUnder(resolve(here, 'agent')).map((path) => ({ path: slashed(path), text: readFileSync(path, 'utf8') }));

const OWNED = new Set(OWNERS.map((module) => module.path));

// A wording anything else in the tree also writes cannot say whether an
// agent-only module reached the bundle, so it is dropped rather than reported.
// Contained and not equal, because the shared half of a message is usually a
// phrase inside a longer one.
const ELSEWHERE = sourcesUnder(resolve(here, '..'))
  .filter((path) => !OWNED.has(slashed(path)))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

// The exported names are read at run time rather than off a static import: a
// static one would keep the modules in this test's own graph and, more to the
// point, would be a list again. Every part of what is checked — the file, the
// names it exports, the words only it can throw — comes off the module itself.
const AGENT_ONLY = await Promise.all(
  OWNERS.map(async (module) => ({
    path: module.path,
    names: Object.keys((await import(/* @vite-ignore */ pathToFileURL(module.path).href)) as object),
    says: messages(module.text).filter((message) => !ELSEWHERE.includes(message)),
  })),
);

// The one name a minifier cannot rename, because it is the property the harness
// is hung off the window by rather than a binding.
const GLOBAL = '__test';

describe('the bundle a release ships', () => {
  it('reads the directory it is a rule about, so a run that found nothing would prove nothing', () => {
    expect(AGENT_ONLY.map((module) => module.path.slice(module.path.indexOf(AGENT_DIR)))).toEqual(
      expect.arrayContaining([`${AGENT_DIR}/testHarness.ts`, `${AGENT_DIR}/surfaces.ts`]),
    );
  });

  it('carries the content, and none of the modules only a driving agent reaches', async () => {
    const parts = await shipped();

    // A build that emitted nothing would pass every absence below.
    expect(parts.map((part) => part.name)).toContain('index.html');
    expect(parts.filter((part) => part.text.includes('guide-house'))).not.toHaveLength(0);
    // And a build that reported no modules would pass the first of them.
    expect(parts.flatMap((part) => part.from)).toContain(slashed(resolve(here, 'App.tsx')));

    for (const module of AGENT_ONLY) {
      expect(module.names.length, `${module.path} exports nothing to check`).toBeGreaterThan(0);
      expect(module.says.length, `${module.path} says nothing only it can say`).toBeGreaterThan(0);
      expect(
        parts.filter((part) => part.from.includes(module.path)).map((part) => part.name),
        `${module.path} is rolled into the shipped bundle`,
      ).toEqual([]);

      for (const trace of [GLOBAL, ...module.names, ...module.says]) {
        expect(
          parts.filter((part) => part.text.includes(trace)).map((part) => part.name),
          `${trace} reaches the shipped bundle`,
        ).toEqual([]);
      }
    }
  }, 120_000);
});
