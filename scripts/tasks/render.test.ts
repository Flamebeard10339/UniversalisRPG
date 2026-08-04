import { describe, expect, it } from 'vitest';
import { clauseStandingLines, MIN_WRAP_WIDTH, packGreedy, summarize, TERMINAL_WIDTH, truncateLine, wrapText, wrapUnder } from './render';

describe('packGreedy', () => {
  it('fills each line to the width before starting the next', () => {
    expect(packGreedy(['aaaa 1', 'bbbb 2', 'cccc 3'], ' · ', 15)).toEqual(['aaaa 1 · bbbb 2', 'cccc 3']);
  });

  it('keeps a single part too wide for the line rather than losing it', () => {
    expect(packGreedy(['a-very-long-single-entry 9'], ' · ', 5)).toEqual(['a-very-long-single-entry 9']);
  });

  it('emits no line at all for no parts', () => {
    expect(packGreedy([], ' · ', 20)).toEqual([]);
  });
});

describe('wrapText', () => {
  it('breaks on spaces at the width', () => {
    expect(wrapText('one two three four', 9)).toEqual(['one two', 'three', 'four']);
  });

  it('leaves text already inside the width as one line', () => {
    expect(wrapText('short enough', 20)).toEqual(['short enough']);
  });

  it('keeps a blank line blank rather than dropping it, so a paragraph break survives', () => {
    expect(wrapText('', 20)).toEqual(['']);
  });
});

describe('truncateLine', () => {
  it('cuts to exactly the maximum, ellipsis included', () => {
    expect(truncateLine('abcdefgh', 6)).toBe('abcde…');
  });

  it('returns text at the maximum unchanged', () => {
    expect(truncateLine('abcdef', 6)).toBe('abcdef');
  });
});

describe('summarize', () => {
  it('joins the lines a stored field carries without shortening what they say', () => {
    const prose = `${'word '.repeat(60)}\n\n  and a second paragraph  `;
    expect(summarize(prose)).toBe(`${'word '.repeat(60).trim()} and a second paragraph`);
  });
});

describe('wrapUnder', () => {
  it('leaves text that already fits on the one line', () => {
    expect(wrapUnder('short', '  - ')).toEqual(['  - short']);
  });

  it('continues past the width under an indent the caller chooses, not at column zero', () => {
    const lines = wrapUnder('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen', '  ├─ ', '  │  ');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].startsWith('  ├─ ')).toBe(true);
    for (const line of lines.slice(1)) expect(line.startsWith('  │  ')).toBe(true);
    expect(lines.map((line) => line.slice(5)).join(' ')).toBe('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen');
  });

  it('keeps a word wider than the whole report rather than losing its tail', () => {
    const word = 'x'.repeat(TERMINAL_WIDTH + 20);
    expect(wrapUnder(word, '  - ')).toEqual([`  - ${word}`]);
  });

  // Every line but the first carries the hanging indent, so budgeting from
  // the first prefix alone put a 60-character indent on top of a full-width
  // line: [76, 134] against a report of 78. No caller passes a hanging
  // indent wider than its first prefix, so the invariant this function's own
  // shape implies held only by coincidence across five call sites.
  it('budgets against a hanging indent wider than its first prefix', () => {
    const lines = wrapUnder('word '.repeat(30).trim(), '  ', ' '.repeat(40));
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(TERMINAL_WIDTH);
  });

  // The one case that still overflows, and it is the floor doing it on
  // purpose: a prefix leaving less than MIN_WRAP_WIDTH would otherwise wrap
  // every line to a few characters, and nothing here ever cuts.
  it('overflows only by the wrap floor when the indent leaves less than it', () => {
    const lines = wrapUnder('word '.repeat(30).trim(), '  ', ' '.repeat(60));
    for (const line of lines.slice(1)) expect(line.length).toBeLessThanOrEqual(60 + MIN_WRAP_WIDTH);
  });
});

describe('clauseStandingLines', () => {
  it('prints the whole clause, continuing under its own number', () => {
    const text = 'a clause long enough that no terminal of a reasonable width could hold all of it on one single line without help';
    const lines = clauseStandingLines({ clause: 3, status: 'unmet', evidence: null }, [{ id: 3, text }]);
    expect(lines[0].startsWith('  3. [unmet] a clause long enough')).toBe(true);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(TERMINAL_WIDTH);
    for (const line of lines.slice(1)) expect(line.startsWith('             ')).toBe(true);
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toBe(`3. [unmet] ${text}`);
  });
});
