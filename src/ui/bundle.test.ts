import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

interface Part {
  fileName: string;
  type: string;
  code?: string;
  source?: string | Uint8Array;
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
async function shipped(): Promise<Array<{ name: string; text: string }>> {
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
      .map((part) => ({ name: part.fileName, text: part.code ?? (typeof part.source === 'string' ? part.source : '') }));
  } finally {
    process.env.NODE_ENV = held;
  }
}

describe('the bundle a release ships', () => {
  it('carries the content and no trace of the harness that drives it', async () => {
    const parts = await shipped();

    // A build that emitted nothing would pass every absence below.
    expect(parts.map((part) => part.name)).toContain('index.html');
    expect(parts.filter((part) => part.text.includes('guide-house'))).not.toHaveLength(0);

    for (const trace of ['__test', 'installTestHarness', 'registerTestSurface']) {
      expect(
        parts.filter((part) => part.text.includes(trace)).map((part) => part.name),
        `${trace} reaches the shipped bundle`,
      ).toEqual([]);
    }
  }, 120_000);
});
