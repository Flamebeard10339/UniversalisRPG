import { describe, expect, it } from 'vitest';
import { offeringAt, type Addressed } from '../content/completion';
import { pathOf } from './grammarPath';

const KNOWN: readonly Addressed[] = [
  { kind: 'flag', address: 'tutorial-island.made-bread', module: 'tutorial-island' },
  { kind: 'item', address: 'tutorial-island.bread', module: 'tutorial-island' },
  { kind: 'event', address: 'tutorial-island.death', module: 'tutorial-island' },
];

const starting = (shapes: number): string => `${shapes} lines start this way`;

const path = (written: string): string[] => {
  const cursor = written.indexOf('|');
  const text = written.slice(0, cursor) + written.slice(cursor + 1);
  return pathOf(offeringAt(text, cursor, KNOWN), text, cursor, starting);
};

describe('the path down to where the cursor stands', () => {
  it('runs from the section through the blocks to the hole', () => {
    expect(path('# entity tutorial-island.oven\nswing:\n  if |')).toEqual(['# entity', '<action>:', 'if <condition>:', '<condition> — a # flag']);
  });

  it('names the kind a hole may name, where it names one', () => {
    const steps = path('# entity tutorial-island.oven\nswing:\n  give: |');
    expect(steps[steps.length - 1]).toContain('a # item');
  });

  it('stops at the line where the engine reads it as a whole shape and no hole is open', () => {
    expect(path('# entity tutorial-island.oven\ntitle: Oven|')).toEqual(['# entity', 'title: <text>', '<text> — like Rusty Sword']);
  });

  it('stops at what is written where the engine reads no shape yet, and says how many still begin that way', () => {
    expect(path('# entity tutorial-island.oven\nstats: health 5\non|')).toEqual(['# entity', 'on … 2 lines start this way']);
  });

  it('says only what is written where one shape begins that way', () => {
    expect(path('# entity tutorial-island.oven\nstats: health 5\nrespawn aft|')).toEqual(['# entity', 'respawn aft …']);
  });

  it('goes no further than the blocks where nothing is written on the line at all', () => {
    expect(path('# entity tutorial-island.oven\nswing:\n  |')).toEqual(['# entity', '<action>:']);
  });
});
