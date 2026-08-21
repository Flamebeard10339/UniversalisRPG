import { describe, expect, it } from 'vitest';
import { stepIn, stepOut } from './editIndent';

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
