import { describe, expect, it } from 'vitest';
import { typed } from './consoleLine';

describe('what the command field hands the shared table', () => {
  it('passes a line on as it was written, whatever the line is', () => {
    for (const line of ['/look', '/wait 30', '3', 'submit-modal: name=Rowan', '/speed 2.5', '/a-command-the-table-does-not-have-yet']) {
      expect(typed(line)).toBe(line);
    }
  });

  it('takes the surrounding space off, since a stray space is not a different command', () => {
    expect(typed('  /look  ')).toBe('/look');
    expect(typed('/wait 30\n')).toBe('/wait 30');
  });

  it('sends nothing when nothing was written, which is the one line it refuses', () => {
    expect(typed('')).toBeNull();
    expect(typed('   ')).toBeNull();
    expect(typed('\t\n')).toBeNull();
  });
});
