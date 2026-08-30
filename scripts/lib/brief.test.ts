import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBrief } from './brief';

const wrote = (name: string, text: string): string => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'universalis-brief-')), name);
  writeFileSync(file, text);
  return file;
};

describe('a brief is a file', () => {
  it('is read whole, however many lines it runs to', () => {
    expect(readBrief('--brief', wrote('job.md', 'first\nsecond\nthird\n'))).toBe('first\nsecond\nthird\n');
  });

  it('says what to pass when a brief is handed over as its own text', () => {
    const refused = (): unknown => readBrief('--brief', 'Write the rat quest.\nIt starts in the market.\n');

    expect(refused).toThrow(/Pass the path to the brief, not the brief itself/);
    expect(refused).not.toThrow(/It starts in the market/);
  });

  it('refuses a file with nothing in it rather than running on an empty brief', () => {
    expect(() => readBrief('--brief', wrote('job.md', '\n  \n'))).toThrow(/nothing in it/);
  });
});
