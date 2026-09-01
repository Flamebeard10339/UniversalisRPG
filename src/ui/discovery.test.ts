import { describe, expect, it } from 'vitest';
import { asLocalized } from '../runtime/localizedFixture';
import type { Node, Place } from '../runtime/map';
import { CLIMB_NUDGE, sheetOf } from '../runtime/map';
import { mapBox, newlyFound, onWalk, walkingAt, walkLine } from './discovery';

const GRID = 140;

const place = (id: string, x: number, y: number, z: number, ...adjacent: string[]): Place => ({
  id,
  title: asLocalized(id.toUpperCase()),
  x,
  y,
  z,
  adjacent: adjacent.map((to) => ({ to, open: true })),
});

const HOUSE: Place[] = [
  place('hall', 0, 0, 0, 'landing', 'cellar', 'beach'),
  place('landing', 0, 0, 1, 'hall'),
  place('cellar', 0, 0, -1, 'hall'),
  place('beach', 1, 0, 0, 'hall'),
  place('cove', 2, 0, 0, 'beach'),
];

const drawn = (here: string, plane: number) => sheetOf({ discovered: HOUSE, undiscovered: [], regions: [], location: { id: here }, choices: [], mapGrid: GRID }, plane);

describe('the room the map takes up', () => {
  it('is the places it draws, turned into the pixels a viewport is held against', () => {
    expect(mapBox(drawn('hall', 0).nodes, GRID)).toEqual({
      minX: -CLIMB_NUDGE * GRID,
      minY: -CLIMB_NUDGE * GRID,
      maxX: 2 * GRID,
      maxY: CLIMB_NUDGE * GRID,
    });
  });
});

describe('what the world just gave up', () => {
  it('names only what was not there before', () => {
    expect(newlyFound([place('hall', 0, 0, 0)], HOUSE)).toEqual(['landing', 'cellar', 'beach', 'cove']);
  });

  it('says nothing when the same places come round again', () => {
    expect(newlyFound(HOUSE, HOUSE)).toEqual([]);
  });

  it('says nothing for a place that left, since only an arrival is acknowledged', () => {
    expect(newlyFound(HOUSE, [place('hall', 0, 0, 0)])).toEqual([]);
  });
});

describe('the walk under way', () => {
  const journey = { to: 'd', legs: ['b', 'c', 'd'] };

  it('runs from where the player is standing to where they are going', () => {
    expect(walkLine('a', journey)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is nothing at all when nobody is walking', () => {
    expect(walkLine('a', null)).toEqual([]);
    expect(walkLine('a', { to: 'd', legs: [] })).toEqual([]);
  });

  it('takes the road between two places it crosses in a row, either way round', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'a', 'b')?.stretch).toBe('now');
    expect(onWalk(line, 'c', 'b')?.stretch).toBe('ahead');
    expect(onWalk(line, 'c', 'd')?.stretch).toBe('ahead');
  });

  it('tells the road under the player from the rest of the route, whichever end it was drawn from', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'a', 'b')).toEqual({ stretch: 'now', along: true });
    expect(onWalk(line, 'b', 'a')).toEqual({ stretch: 'now', along: false });
  });

  it('says which way a road is drawn against the way it is walked, so a march along it goes forwards', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'b', 'c')?.along).toBe(true);
    expect(onWalk(line, 'c', 'b')?.along).toBe(false);
  });

  it('leaves the roads it does not take, including a short cut between two places on it', () => {
    const line = walkLine('a', journey);

    expect(onWalk(line, 'a', 'c')).toBeNull();
    expect(onWalk(line, 'b', 'elsewhere')).toBeNull();
    expect(onWalk([], 'a', 'b')).toBeNull();
  });
});

const at = (id: string, here = false): Node => ({ place: place(id, 0, 0, 0), here, climb: 0, at: { x: 0, y: 0 }, goes: null, bearing: null, found: true });

describe('what a place is while a journey is on', () => {
  const line = walkLine('a', { to: 'd', legs: ['b', 'c', 'd'] });

  it('tells the four apart: where the player stands, the next stop, one further on, and the far end', () => {
    expect(line.map((id) => walkingAt(line, at(id, id === 'a')))).toEqual(['here', 'next', 'ahead', 'target']);
  });

  it('says nothing of a place the journey does not pass through', () => {
    expect(walkingAt(line, at('elsewhere'))).toBeUndefined();
  });

  it('says where the player stands even when no journey is under way, and nothing of anywhere else', () => {
    expect(walkingAt([], at('a', true))).toBe('here');
    expect(walkingAt([], at('b'))).toBeUndefined();
  });

  it('says target rather than next for a journey of one leg, which is the fact the player chose', () => {
    const short = walkLine('a', { to: 'b', legs: ['b'] });

    expect(walkingAt(short, at('b'))).toBe('target');
  });

  it('gives every place on the line one of the four and never nothing, so no leg goes undrawn', () => {
    expect(line.map((id) => walkingAt(line, at(id, id === 'a'))).filter((each) => each === undefined)).toEqual([]);
  });
});
