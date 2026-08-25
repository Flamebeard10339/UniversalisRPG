import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GRID } from './sheetLayout';

const here = fileURLToPath(new URL('.', import.meta.url));

function modulesUnder(directory: string, prefix: string): Array<{ file: string; text: string }> {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return modulesUnder(path, `${prefix}/${entry.name}`);
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) return [];
    return [{ file: `${prefix}/${entry.name}`, text: readFileSync(path, 'utf8') }];
  });
}

const SOURCES = modulesUnder(here, 'src/ui');

describe('the grid every dense page is laid out on', () => {
  it('is written in one file, so a second page cannot drift from the first', () => {
    expect(SOURCES.filter((source) => source.text.includes('auto-fill')).map((source) => source.file)).toEqual(['src/ui/sheetLayout.ts']);
  });

  it('is reached by more than one page, which is why it is written apart from any of them', () => {
    const taking = SOURCES.filter((source) => source.file !== 'src/ui/sheetLayout.ts' && /\bGRID\b/.test(source.text));

    expect(taking.length, 'nothing takes the grid, so nothing is laid out on it').toBeGreaterThan(1);
  });

  it('lets the width decide how many columns there are, rather than a page deciding for it', () => {
    expect(GRID).toContain('auto-fill');
    expect(GRID).toMatch(/minmax\(\d/);
  });
});
