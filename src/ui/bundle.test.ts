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
  modules?: Record<string, unknown>;
}

interface Emitted {
  name: string;
  text: string;
  from: string[];
}

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

export const AGENT_DIR = 'src/ui/agent';

const OWNERS = sourcesUnder(resolve(here, 'agent')).map((path) => ({ path: slashed(path), text: readFileSync(path, 'utf8') }));

const OWNED = new Set(OWNERS.map((module) => module.path));

const ELSEWHERE = sourcesUnder(resolve(here, '..'))
  .filter((path) => !OWNED.has(slashed(path)))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');

const AGENT_ONLY = await Promise.all(
  OWNERS.map(async (module) => ({
    path: module.path,
    names: Object.keys((await import(pathToFileURL(module.path).href)) as object),
    says: messages(module.text).filter((message) => !ELSEWHERE.includes(message)),
  })),
);

const GLOBAL = '__test';

describe('the bundle a release ships', () => {
  it('reads the directory it is a rule about, so a run that found nothing would prove nothing', () => {
    expect(AGENT_ONLY.map((module) => module.path.slice(module.path.indexOf(AGENT_DIR)))).toEqual(
      expect.arrayContaining([`${AGENT_DIR}/testHarness.ts`, `${AGENT_DIR}/surfaces.ts`]),
    );
  });

  it('carries the content, and none of the modules only a driving agent reaches', async () => {
    const parts = await shipped();

    expect(parts.map((part) => part.name)).toContain('index.html');
    expect(parts.filter((part) => part.text.includes('guide-house'))).not.toHaveLength(0);
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
  });
});
