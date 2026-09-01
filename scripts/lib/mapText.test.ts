import { describe, expect, it } from 'vitest';
import { asLocalized } from '../../src/runtime/localizedFixture';
import { sheetOf, type Place, type Sheet } from '../../src/runtime/map';
import type { PlayChoice } from '../../src/runtime/session';
import { drawnCompass, drawnMap } from './mapText';

const place = (id: string, x: number, y: number, z = 0, ...adjacent: string[]): Place => ({
  id,
  title: asLocalized(id.replace(/(^|-)([a-z])/g, (_whole, lead: string, letter: string) => `${lead === '' ? '' : ' '}${letter.toUpperCase()}`)),
  x,
  y,
  z,
  adjacent: adjacent.map((to) => ({ to, open: true })),
});

const travel = (to: string): PlayChoice => ({ id: `travel:${to}`, kind: 'travel', label: asLocalized(`Travel to ${to}`), leadsTo: to, legs: 1 });

const sheet = (places: readonly Place[], here: string, choices: readonly PlayChoice[] = []): Sheet =>
  sheetOf({ discovered: places, undiscovered: [], regions: [], location: { id: here }, choices, mapGrid: 140 }, null);

const ROW = [place('west-gate', 0, 0, 0, 'square'), place('square', 1, 0, 0, 'west-gate', 'east-gate'), place('east-gate', 2, 0, 0, 'square')];

const drawn = (places: readonly Place[], here: string, choices: readonly PlayChoice[] = []): string => drawnMap(sheet(places, here, choices)).join('\n');

describe('the map drawn as characters', () => {
  it('writes every place the sheet holds, once', () => {
    const text = drawn(ROW, 'square');

    for (const each of ['West Gate', 'Square', 'East Gate']) expect(text.split(each)).toHaveLength(2);
  });

  it('marks where the player stands and the number that walks to everywhere else', () => {
    const text = drawn(ROW, 'square', [travel('west-gate'), travel('east-gate')]);

    expect(text).toContain('>Square');
    expect(text).toContain('1:West Gate');
    expect(text).toContain('2:East Gate');
  });

  it('joins two places on one row with a road, and leaves an unjoined pair unjoined', () => {
    const joined = drawn(ROW, 'square');
    const apart = drawn([place('west-gate', 0, 0), place('square', 1, 0), place('east-gate', 2, 0)], 'square');

    expect(joined).toMatch(/West Gate─+/);
    expect(apart).not.toContain('─');
  });

  it('draws a road up the page between two places in one column', () => {
    const column = [place('low', 0, 0, 0, 'high'), place('high', 0, 1, 0, 'low')];

    expect(drawn(column, 'low')).toContain('│');
  });

  it('draws a road across a corner as a slope', () => {
    const corner = [place('low', 0, 0, 0, 'high'), place('high', 1, 1, 0, 'low')];

    expect(drawn(corner, 'low')).toMatch(/[\\/]/);
  });

  it('draws a road bending where it cannot be drawn straight', () => {
    const bending = [place('west', 0, 0, 0, 'east'), place('middle', 1, 0), place('east', 2, 1, 0, 'west')];

    const text = drawn(bending, 'west');

    expect(text).toContain('└');
    expect(text).toContain('┐');
    expect(text).not.toContain('also:');
  });

  it('leaves the paper to a road that can be drawn straight, and says the bend it then cannot draw', () => {
    const crossed = [place('west', 0, 0, 0, 'south-east'), place('north', 1, 0, 0, 'south'), place('south', 1, 2, 0, 'north'), place('south-east', 2, 1, 0, 'west')];

    const text = drawn(crossed, 'west');
    const said = text.split('\n').filter((line) => line.startsWith('also:')).join('\n');

    expect(text).toContain('│');
    expect(text).not.toContain('└');
    expect(said).toMatch(/West/);
    expect(said).toMatch(/South East/);
  });

  it('says in words the roads it could not draw, rather than dropping them', () => {
    const blocked = [place('one', 0, 0, 0, 'three'), place('two', 1, 0), place('three', 2, 0, 0, 'one')];

    const text = drawn(blocked, 'one');

    expect(text).toContain('also:');
    expect(text).toMatch(/One.*Three/);
  });

  it('draws a road nobody can walk in dots, and says once what the dots are', () => {
    const shut = [{ ...place('camp', 0, 0), adjacent: [{ to: 'vault', open: false }] }, place('vault', 1, 0, 0, 'camp')];

    const text = drawn(shut, 'camp');

    expect(text).toContain('a road that is shut');
    expect(text).not.toContain('─');
    expect(drawn(ROW, 'square')).not.toContain('a road that is shut');
  });

  it('has nothing to draw for a map with nothing on it', () => {
    expect(drawnMap(sheet([], 'nowhere'))).toEqual([]);
  });
});

describe('the nine squares drawn as characters', () => {
  const CROSS = [
    place('middle', 1, 1, 0, 'north', 'east', 'cellar'),
    place('north', 1, 0, 0, 'middle'),
    place('east', 2, 1, 0, 'middle'),
    place('cellar', 1, 1, -1, 'middle'),
  ];

  const compass = (choices: readonly PlayChoice[]): string[] => drawnCompass(sheet(CROSS, 'middle', choices), (way) => String(way.to));

  it('lays each way out in the row and column it lies in', () => {
    const rows = compass([travel('north'), travel('east')]);

    expect(rows[0]).toContain('1: north');
    expect(rows[1]).toContain('2: east');
    expect(rows[1]).toContain('> here');
  });

  it('says under the grid what no square of a compass points at', () => {
    const rows = compass([travel('cellar')]);

    expect(rows.join('\n')).toContain('also down: 1: cellar');
  });

  it('draws nothing at all where there is nowhere to go', () => {
    expect(compass([])).toEqual([]);
  });
});
