import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { Entry } from './sheet';
import { doll, GRID } from './sheetLayout';

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

describe('the body the equipment page draws', () => {
  const slot = (name: string, at?: { column: number; row: number }): Entry => ({ name: asLocalized(name), value: asLocalized('Empty'), ...(at ? { at } : {}) });

  it('is as wide and as tall as the slots that say where they sit reach, and no wider', () => {
    const placed = doll([slot('Main Hand', { column: 1, row: 1 }), slot('Head', { column: 2, row: 3 })]);

    expect(placed.columns).toBe(2);
    expect(placed.rows).toBe(3);
    expect(placed.body.map((entry) => entry.name)).toEqual(['Main Hand', 'Head']);
    expect(placed.beneath).toEqual([]);
  });

  it('drops a slot that says nothing about where it sits to the row beneath, so no slot is undrawn', () => {
    const placed = doll([slot('Main Hand', { column: 1, row: 1 }), slot('Quiver')]);

    expect(placed.body.map((entry) => entry.name)).toEqual(['Main Hand']);
    expect(placed.beneath.map((entry) => entry.name)).toEqual(['Quiver']);
  });

  it('draws no body at all where nothing says where it sits, and still draws every slot', () => {
    const placed = doll([slot('Quiver'), slot('Pocket')]);

    expect(placed.columns).toBe(0);
    expect(placed.rows).toBe(0);
    expect(placed.beneath).toHaveLength(2);
  });

  it('has nothing to draw for a player with no slots at all', () => {
    expect(doll([])).toEqual({ body: [], beneath: [], columns: 0, rows: 0 });
  });
});
