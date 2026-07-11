import { describe, expect, it } from 'vitest';
import { mergeDslFiles } from './merge-dsl-files.mjs';

describe('merge-dsl-files tooling', () => {
  it('cleanly merges non-overlapping changes from both sides', () => {
    const base = 'line1\nline2\nline3\nline4\nline5\n';
    const ours = 'line1-ours\nline2\nline3\nline4\nline5\n';
    const theirs = 'line1\nline2\nline3\nline4\nline5-theirs\n';

    const result = mergeDslFiles({ base, ours, theirs });

    expect(result.hasConflicts).toBe(false);
    expect(result.merged).toBe('line1-ours\nline2\nline3\nline4\nline5-theirs\n');
  });

  it('takes either side cleanly when only one side changed a region', () => {
    const base = '# info\nid: x\nversion: 1.0.0\n';
    const ours = base;
    const theirs = '# info\nid: x\nversion: 1.0.1\n';

    const result = mergeDslFiles({ base, ours, theirs });

    expect(result.hasConflicts).toBe(false);
    expect(result.merged).toBe(theirs);
  });

  it('reports a conflict with standard markers when both sides edit the same region differently', () => {
    const base = 'take coins: give: gold 5, say: You take the coins.\n';
    const ours = 'take coins: give: gold 10, say: You take the coins.\n';
    const theirs = 'take coins: give: gold 5, say: You grab the coins.\n';

    const result = mergeDslFiles({ base, ours, theirs, labelOurs: 'local', labelTheirs: 'incoming' });

    expect(result.hasConflicts).toBe(true);
    expect(result.merged).toContain('<<<<<<< local');
    expect(result.merged).toContain('=======');
    expect(result.merged).toContain('>>>>>>> incoming');
    expect(result.merged).toContain(ours.trim());
    expect(result.merged).toContain(theirs.trim());
  });

  it('merges cleanly when both sides make the identical change', () => {
    const base = 'xp: thieving 4\n';
    const ours = 'xp: thieving 8\n';
    const theirs = 'xp: thieving 8\n';

    const result = mergeDslFiles({ base, ours, theirs });

    expect(result.hasConflicts).toBe(false);
    expect(result.merged).toBe('xp: thieving 8\n');
  });
});
