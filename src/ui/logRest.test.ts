import { describe, expect, it } from 'vitest';
import type { CommandOutput } from '../runtime/command';
import { asLocalized } from '../runtime/localizedFixture';
import { restingAt, startedAt } from './logRest';
import { appendOutputs, emptyTranscript, type Transcript } from './transcript';

const said = (text: string): CommandOutput => ({ kind: 'message', words: 'player', tone: 'plain', text: asLocalized(text) });

const turn = (transcript: Transcript, ...lines: string[]): Transcript => appendOutputs(transcript, lines.map(said));

describe('which line a turn began at', () => {
  it('is the first line the turn minted, not the last', () => {
    const before = turn(emptyTranscript(), 'one', 'two');
    const after = turn(before, 'three', 'four', 'five');

    expect(startedAt(before, after)).toBe(3);
    expect(after.entries.map((entry) => entry.text)).toEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('is the first line of the log when the log was empty', () => {
    expect(startedAt(emptyTranscript(), turn(emptyTranscript(), 'hello'))).toBe(1);
  });

  it('is nowhere when the turn wrote nothing', () => {
    const held = turn(emptyTranscript(), 'one');

    expect(startedAt(held, held)).toBe(null);
    expect(startedAt(held, appendOutputs(held, []))).toBe(null);
  });

  it('is the line that was said again, since the log counts a repeat rather than minting one', () => {
    const before = turn(emptyTranscript(), 'one', 'two');
    const after = turn(before, 'two');

    expect(after.entries).toHaveLength(2);
    expect(startedAt(before, after)).toBe(2);
  });

  it('is nowhere when a repeat was the whole of an earlier turn, so the log does not jump twice', () => {
    const before = turn(turn(emptyTranscript(), 'one'), 'one');

    expect(startedAt(before, before)).toBe(null);
  });

  it('is nowhere when the log was thrown away and started over, which is not a turn', () => {
    const before = turn(emptyTranscript(), 'one', 'two', 'three');

    expect(startedAt(before, turn(emptyTranscript(), 'fresh'))).toBe(null);
  });
});

describe('where the log comes to rest', () => {
  it('puts the turn at the top when the turn is longer than the column', () => {
    expect(restingAt(400, 2000, 500)).toBe(400);
  });

  it('goes no further than the end, so a short turn rests at the bottom the way a scrollback does', () => {
    expect(restingAt(1900, 2000, 500)).toBe(1500);
  });

  it('stays at the top when there is less to read than there is room for', () => {
    expect(restingAt(0, 300, 500)).toBe(0);
    expect(restingAt(200, 300, 500)).toBe(0);
  });
});
