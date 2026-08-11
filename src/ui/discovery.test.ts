import { describe, expect, it } from 'vitest';
import { mapRows, newlyFound, type Place } from './discovery';

const place = (id: string, ...adjacent: string[]): Place => ({ id, title: id.toUpperCase(), adjacent });

// Deliberately not in walking order, so a test that passes by luck of the
// registry's ordering fails here.
const KNOWN: Place[] = [place('shore', 'camp'), place('summit', 'ridge'), place('camp', 'shore', 'ridge'), place('ridge', 'camp', 'summit')];

describe('the map, read outward from where the player is', () => {
  it('puts where the player is standing first', () => {
    expect(mapRows(KNOWN, 'camp')[0].place.id).toBe('camp');
    expect(mapRows(KNOWN, 'camp')[0].here).toBe(true);
  });

  it('orders by how many roads away, not by how the registry happened to list them', () => {
    expect(mapRows(KNOWN, 'shore').map((row) => row.place.id)).toEqual(['shore', 'camp', 'ridge', 'summit']);
    expect(mapRows(KNOWN, 'shore').map((row) => row.distance)).toEqual([0, 1, 2, 3]);
  });

  it('keeps a place no road reaches, at the end, rather than dropping it', () => {
    const stranded = [...KNOWN, place('vault')];

    const rows = mapRows(stranded, 'camp');

    expect(rows.map((row) => row.place.id)).toContain('vault');
    expect(rows[rows.length - 1].place.id).toBe('vault');
    expect(rows[rows.length - 1].distance).toBeNull();
  });

  it('draws every discovered place even when the player is somewhere it has never heard of', () => {
    const rows = mapRows(KNOWN, 'nowhere');

    expect(rows.map((row) => row.place.id).sort()).toEqual(['camp', 'ridge', 'shore', 'summit']);
    expect(rows.every((row) => row.distance === null)).toBe(true);
    expect(rows.some((row) => row.here)).toBe(false);
  });

  it('marks exactly one place as the one the player is in', () => {
    expect(mapRows(KNOWN, 'ridge').filter((row) => row.here)).toHaveLength(1);
  });

  it('has nothing to draw before anything has been found', () => {
    expect(mapRows([], 'camp')).toEqual([]);
  });
});

describe('what the world just gave up', () => {
  it('names only what was not there before', () => {
    expect(newlyFound([place('camp')], [place('camp'), place('ridge')])).toEqual(['ridge']);
  });

  it('says nothing when the same places come round again', () => {
    expect(newlyFound(KNOWN, KNOWN)).toEqual([]);
  });

  it('says nothing for a place that left, since only an arrival is acknowledged', () => {
    expect(newlyFound(KNOWN, [place('camp')])).toEqual([]);
  });

  it('names every arrival when several land at once', () => {
    expect(newlyFound([], [place('camp'), place('ridge')])).toEqual(['camp', 'ridge']);
  });
});
