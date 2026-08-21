import { describe, expect, it } from 'vitest';
import { opened, stepIn, stepOut, typed } from './editIndent';

describe('a step in', () => {
  it('opens the two spaces a block is written with', () => {
    expect(stepIn('# location beach\n', 17)).toEqual({ text: '# location beach\n  ', cursor: 19 });
  });

  it('lands mid-line where the cursor stood', () => {
    expect(stepIn('adjacent:', 4)).toEqual({ text: 'adja  cent:', cursor: 6 });
  });
});

describe('a step out', () => {
  it('takes back the two spaces the line opened with', () => {
    expect(stepOut('# location beach\n  give: plank', 22)).toEqual({ text: '# location beach\ngive: plank', cursor: 20 });
  });

  it('takes back the one space a line was written with', () => {
    expect(stepOut('# location beach\n give: plank', 21)).toEqual({ text: '# location beach\ngive: plank', cursor: 20 });
  });

  it('leaves a line that opens at the margin alone', () => {
    expect(stepOut('give: plank', 5)).toEqual({ text: 'give: plank', cursor: 5 });
  });

  it('never pulls the cursor above the line it stood on', () => {
    expect(stepOut('# location beach\n  x', 19)).toEqual({ text: '# location beach\nx', cursor: 17 });
  });
});

describe('a return', () => {
  it('starts the new line where the line it left started', () => {
    expect(opened('# item a\n  on hit:\n    say: hi', 30)).toEqual({ text: '# item a\n  on hit:\n    say: hi\n    ', cursor: 35 });
  });

  it('carries nothing over from a line that had nothing', () => {
    expect(opened('title: A', 8)).toEqual({ text: 'title: A\n', cursor: 9 });
  });

  it('splits a line and leaves the indentation on both halves', () => {
    expect(opened('  give: plank', 8)).toEqual({ text: '  give: \n  plank', cursor: 11 });
  });
});

describe('a return as it is typed', () => {
  it('is finished for the author where it is one return at the cursor', () => {
    expect(typed('  give: plank', '  give: plank\n', 14)).toEqual({ text: '  give: plank\n  ', cursor: 16 });
  });

  it('is left alone where it arrives pasted among other characters', () => {
    expect(typed('  give: plank', '  give: plank\n  take: log', 25)).toEqual({ text: '  give: plank\n  take: log', cursor: 25 });
  });

  it('is left alone where what was typed is not a return', () => {
    expect(typed('  give: plan', '  give: plank', 13)).toEqual({ text: '  give: plank', cursor: 13 });
  });

  it('is left alone where a character was taken away', () => {
    expect(typed('  give: plank', '  give: plan', 12)).toEqual({ text: '  give: plan', cursor: 12 });
  });
});
