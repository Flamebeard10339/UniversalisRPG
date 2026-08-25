import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runAsSections, startSaveId, type KeptRun } from './runLog';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function modulesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

const SOURCES = ['src', 'scripts'].flatMap((tree) => modulesUnder(join(repoRoot, tree))).map((path) => ({ file: path.slice(repoRoot.length + 1).split(sep).join(posix.sep), text: readFileSync(path, 'utf8') }));

// A template literal whose value ends in `-start`, which is how the naming would be spelled a
// second time. A class name like `items-start` is not one, so the sweep does not have to know
// about stylesheets.
const MINTS_A_START = /`[^`\n]*-start`/;

const HOME = 'src/runtime/runLog.ts';

describe('a recorded run names its starting save in one place (c1)', () => {
  it('sweeps both trees, so what it finds below is about more than this layer', () => {
    expect(SOURCES.map((source) => source.file)).toContain(HOME);
    expect(SOURCES.map((source) => source.file)).toContain('scripts/playbot.ts');
    expect(SOURCES.length).toBeGreaterThan(100);
  });

  it('reads a second spelling as one and a stylesheet word as none, so the sweep is about what it says', () => {
    expect(MINTS_A_START.test('const startSaveId = `${id}-start`;')).toBe(true);
    expect(MINTS_A_START.test('className="items-start self-start"')).toBe(false);
  });

  it('mints one nowhere else, so no second writer can drift from it', () => {
    const minting = SOURCES.filter((source) => MINTS_A_START.test(source.text)).map((source) => source.file);

    expect(minting).toEqual([HOME]);
  });

  it('writes the save it names and names the save it writes, which is the whole of what the one home is for', () => {
    const kept: KeptRun = { run: { id: 'a-run', log: [] }, from: '{"version":0}' };

    const [saved, walked] = runAsSections(kept);

    expect(saved[0]).toBe(`# save ${startSaveId('a-run')}`);
    expect(walked.slice(0, 2)).toEqual(['# test a-run', `load: ${startSaveId('a-run')}`]);
  });
});
