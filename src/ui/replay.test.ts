import { describe, expect, it } from 'vitest';
import { parseDirectiveLine, printDirective, type Directive } from '../content/sections/test';
import { advances, clamped, pageAt, REPLAY_SPEED, REPLAY_SPEEDS, replayLines, stepKind } from './replay';

const steps = (...lines: string[]): Directive[] => lines.map((line) => parseDirectiveLine(line)!);

const RUN = steps('load: run-start', 'page: home/home', 'use: entity.first-steps.mirror.look-in', 'confusion: the refusal is fancy about failing', 'page: character/inventory', 'travel: tulsa.nowhere', 'refused');

describe('what a step reads as', () => {
  it('reads every step in the words the file writes it in', () => {
    expect(replayLines(RUN).map((line) => line.text)).toEqual(RUN.map(printDirective));
  });

  it('tells a line the game took from what the player said about it, and from where they went', () => {
    expect(replayLines(RUN).map((line) => line.kind)).toEqual(['played', 'moved', 'played', 'said', 'moved', 'played', 'refused']);
  });

  it('numbers each line by where it stands, since that is what a scrub names', () => {
    expect(replayLines(RUN).map((line) => line.at)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('reads a kind it has never met as a line the game took, rather than as nothing', () => {
    expect(stepKind({ kind: 'wait-out', until: 'done' })).toBe('played');
  });
});

describe('the cursor', () => {
  it('does not walk off either end of the record', () => {
    expect(clamped(-4, RUN)).toBe(0);
    expect(clamped(99, RUN)).toBe(RUN.length);
    expect(clamped(3, RUN)).toBe(3);
  });

  it('stops where the record runs out', () => {
    expect(advances({ at: RUN.length - 1, steps: RUN, failure: null })).toBe(true);
    expect(advances({ at: RUN.length, steps: RUN, failure: null })).toBe(false);
  });

  it('stops where the record and the world have parted, however much record is left', () => {
    expect(advances({ at: 0, steps: RUN, failure: 'travel: tulsa.nowhere was not refused' })).toBe(false);
  });
});

describe('which page the run was on', () => {
  it('is the last page it moved to at or before the step', () => {
    expect(pageAt(RUN, 2)).toEqual({ layer: 'home', subpage: 'home' });
    expect(pageAt(RUN, 5)).toEqual({ layer: 'character', subpage: 'inventory' });
  });

  it('goes back with the cursor rather than staying where the replay last walked', () => {
    expect(pageAt(RUN, RUN.length)).toEqual({ layer: 'character', subpage: 'inventory' });
    expect(pageAt(RUN, 3)).toEqual({ layer: 'home', subpage: 'home' });
  });

  it('is nothing before the run moved anywhere, so the app stays where the author left it', () => {
    expect(pageAt(RUN, 0)).toBeNull();
    expect(pageAt(RUN, 1)).toBeNull();
  });

  it('does not walk off the end of a record shorter than the cursor', () => {
    expect(pageAt(RUN, 999)).toEqual({ layer: 'character', subpage: 'inventory' });
    expect(pageAt([], 3)).toBeNull();
  });
});

describe('how fast it runs itself', () => {
  it('offers the default among the speeds it offers, so the dial can show which one is standing', () => {
    expect(REPLAY_SPEEDS).toContain(REPLAY_SPEED);
  });

  it('offers them slowest-last, since the dial is read in order', () => {
    expect([...REPLAY_SPEEDS].sort((left, right) => left - right)).toEqual([...REPLAY_SPEEDS]);
  });
});
