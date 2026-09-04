import { describe, expect, it } from 'vitest';
import { movedBetween, runRecord, type Asked, type Cost, type Reach } from './authorbot';

const ASKED: Asked = { brief: 'C:/planning/a-brief.md', target: 'combat.dsl', open: false, turns: 150, minutes: 40, model: 'claude-sonnet-5', watch: false, once: false, askFor: 10, said: null };

const COST: Cost = { turns: 55, seconds: 388.94, calls: 33, usage: { input_tokens: 48, output_tokens: 22840 } };

const reach = (decision: Reach['decision']): Reach => ({ turn: 1, tool: 'Bash', target: 'grep', decision, at: 0 });

const AT = new Date('2026-09-04T21:00:00.000Z');

describe('what a run cost, written down so a later one can be compared with it', () => {
  it('counts the lines a run moved in the module it was given, in both directions', () => {
    const moved = movedBetween(['a', 'b', 'c'].join('\n'), ['a', 'c', 'd', 'e'].join('\n'));
    expect(moved).toEqual({ added: 2, removed: 1 });
  });

  it('counts a line moved twice as two, so a repeated body is not read as one', () => {
    expect(movedBetween('x', ['x', 'x', 'x'].join('\n'))).toEqual({ added: 2, removed: 0 });
  });

  it('reads a module the run created from nothing as every line added', () => {
    const moved = movedBetween('', ['# info new', 'version: 1.0.0'].join('\n'));
    expect(moved).toEqual({ added: 2, removed: 0 });
  });

  it('ignores blank lines on both sides, so reflowing a body is not counted as work', () => {
    expect(movedBetween(['a', '', 'b'].join('\n'), ['a', '', '', 'b', ''].join('\n'))).toEqual({ added: 0, removed: 0 });
  });

  it('records what was asked for beside what it took, which is the whole point of keeping it', () => {
    const record = runRecord(ASKED, COST, [reach('allow'), reach('deny'), reach('asked')], ['one', 'two'].join('\n'), 'a', ['a', 'b'].join('\n'), AT);
    expect(record).toMatchObject({
      at: '2026-09-04T21:00:00.000Z',
      brief: 'a-brief.md',
      target: 'combat.dsl',
      model: 'claude-sonnet-5',
      askedTurns: 150,
      askedMinutes: 40,
      briefLines: 2,
      replies: 55,
      calls: 33,
      seconds: 388.9,
      linesBefore: 1,
      linesAfter: 2,
      linesAdded: 1,
      linesRemoved: 0,
    });
  });

  it('counts only the reaches that were not plain tool calls, which is what a run is measured on', () => {
    expect(runRecord(ASKED, COST, [reach('allow'), reach('allow'), reach('deny')], '', '', '', AT).reaches).toBe(1);
  });

  it('leaves usage off rather than writing zeroes for a run that billed nothing', () => {
    expect(runRecord(ASKED, { ...COST, usage: undefined }, [], '', '', '', AT)).not.toHaveProperty('usage');
  });

  it('writes one line of JSON, so a hundred runs are one file a later pass can read', () => {
    const record = runRecord(ASKED, COST, [], '', '', '', AT);
    expect(JSON.stringify(record)).not.toContain('\n');
    expect(JSON.parse(JSON.stringify(record))).toEqual(record);
  });
});
