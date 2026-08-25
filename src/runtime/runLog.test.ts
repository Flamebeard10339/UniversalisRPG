import { readdirSync, readFileSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { endSaveId, parseRun, runAsSections, serializeRun, startSaveId, type KeptRun } from './runLog';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');

function modulesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

const SOURCES = ['src', 'scripts'].flatMap((tree) => modulesUnder(join(repoRoot, tree))).map((path) => ({ file: path.slice(repoRoot.length + 1).split(sep).join(posix.sep), text: readFileSync(path, 'utf8') }));

// A template literal whose value ends in `-start` or `-end`, which is how either naming would be
// spelled a second time. A class name like `items-start` is not one, so the sweep does not have to
// know about stylesheets.
const MINTS_A_SAVE = /`[^`\n]*-(start|end)`/;

const HOME = 'src/runtime/runLog.ts';

describe('a recorded run names the saves at either end of it in one place (c1)', () => {
  it('sweeps both trees, so what it finds below is about more than this layer', () => {
    expect(SOURCES.map((source) => source.file)).toContain(HOME);
    expect(SOURCES.map((source) => source.file)).toContain('scripts/playbot.ts');
    expect(SOURCES.length).toBeGreaterThan(100);
  });

  it('reads a second spelling as one and a stylesheet word as none, so the sweep is about what it says', () => {
    expect(MINTS_A_SAVE.test('const startSaveId = `${id}-start`;')).toBe(true);
    expect(MINTS_A_SAVE.test('const endSaveId = `${id}-end`;')).toBe(true);
    expect(MINTS_A_SAVE.test('className="items-start self-end"')).toBe(false);
  });

  it('mints one nowhere else, so no second writer can drift from it', () => {
    const minting = SOURCES.filter((source) => MINTS_A_SAVE.test(source.text)).map((source) => source.file);

    expect(minting).toEqual([HOME]);
  });

  it('writes the saves it names and names the saves it writes, which is the whole of what the one home is for', () => {
    const kept: KeptRun = { run: { id: 'a-run', log: [] }, from: { bytes: '{"version":0}' }, ends: '{"version":1}' };

    const [started, ended, walked] = runAsSections(kept);

    expect(started).toEqual([`# save ${startSaveId('a-run')}`, '{"version":0}']);
    expect(ended).toEqual([`# save ${endSaveId('a-run')}`, '{"version":1}']);
    expect(walked).toEqual(['# test a-run', `load: ${startSaveId('a-run')}`, `expect: ${endSaveId('a-run')}`]);
  });

  it('names the save it was handed instead of minting one, and then writes no save at all', () => {
    const kept: KeptRun = { run: { id: 'a-run', log: [] }, from: { save: 'tulsa.after-the-storm' } };

    expect(runAsSections(kept)).toEqual([['# test a-run', 'load: tulsa.after-the-storm']]);
  });

  it('reads a run kept before a start could be a name, because an author mid-sitting has one', () => {
    const before = JSON.stringify({ id: 'a-run', log: [], from: '{"version":0}' });

    expect(parseRun(before)).toEqual({ run: { id: 'a-run', log: [] }, from: { bytes: '{"version":0}' }, ends: undefined });
    expect(parseRun(serializeRun({ run: { id: 'a-run', log: [] }, from: { save: 'tulsa.after-the-storm' } }))?.from).toEqual({ save: 'tulsa.after-the-storm' });
  });
});
