import { describe, expect, it } from 'vitest';
import type { Task } from '../lib/taskStore';
import { clauseStandingLines, MIN_WRAP_WIDTH, printEvidence, packGreedy, renderTask, summarize, TERMINAL_WIDTH, truncateLine, wrapText, wrapUnder } from './render';

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    seq: null,
    title: overrides.id,
    kind: 'task',
    state: 'open',
    severity: null,
    system: null,
    spec: null,
    departure: null,
    clause: null,
    discharges: [],
    requires: [],
    files: [],
    writes: [],
    grant: null,
    fault: null,
    decider: null,
    produces: [],
    deliverable: null,
    evidence: null,
    source: null,
    reason: null,
    trigger: null,
    closed: null,
    closedCommit: null,
    claimed: null,
    claimedBy: null,
    extra: null,
    ...overrides,
  };
}

// c1: no reader may derive a departure reason from `spec` being null — every
// distinct null-spec shape below prints its own text, read from `departure`,
// never guessed from the absence.
describe('renderTask spec line', () => {
  const line = (t: Task): string | undefined => renderTask(t, new Map(), 'full').find((entry) => entry.startsWith('spec:'));

  it('names the spec for a current member', () => {
    expect(line(task({ id: 'x', spec: 'demo-spec' }))).toBe('spec: demo-spec');
  });

  it('reads "no spec" for a record that never joined one', () => {
    expect(line(task({ id: 'x', spec: null, departure: null }))).toBe('spec: (no spec)');
  });

  it('reads the departure reason for each of the three ways a record can leave one', () => {
    expect(line(task({ id: 'x', spec: null, departure: 'deferred' }))).toBe('spec: (deferred)');
    expect(line(task({ id: 'x', spec: null, departure: 'unmet' }))).toBe('spec: (unmet)');
    expect(line(task({ id: 'x', spec: null, departure: 'retriage' }))).toBe('spec: (retriage)');
  });
});

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

// printEvidence was the one wrap-and-indent loop in this file still written
// out by hand, against a width constant that had to be re-derived whenever
// TERMINAL_WIDTH or the indent moved. It goes through wrapUnder now, so
// there is one wrap in the file rather than two.
describe('printEvidence', () => {
  const captured = (evidence: string | null, maxLines?: number): string[] => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (value: unknown) => void lines.push(String(value));
    try {
      printEvidence(evidence, maxLines);
    } finally {
      console.log = original;
    }
    return lines;
  };

  it('indents and wraps every line inside the report width', () => {
    const lines = captured('word '.repeat(40).trim());
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.startsWith('          ')).toBe(true);
      expect(line.length).toBeLessThanOrEqual(TERMINAL_WIDTH);
    }
  });

  it('keeps its cap, and says how many lines it left out', () => {
    const lines = captured('word '.repeat(200).trim(), 3);
    expect(lines).toHaveLength(4);
    expect(lines[3]).toContain('more line(s), see `tasks show`');
  });

  it('prints nothing at all for no evidence', () => {
    expect(captured(null)).toEqual([]);
  });
});
