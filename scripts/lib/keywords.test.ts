import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { grammarLines } from '../../src/content/grammarTree';
import { KEYWORDS } from '../../src/grammar/tagClause';
import { shippedModules } from './layers';
import { stripComments } from './stripComments';

// Where a keyword clause is taken apart. Every other module asks after a word this file declares, so the
// vocabulary the engine can branch on is the vocabulary the page prints, and there is no third place to look.
const OWNER = 'src/grammar/tagClause.ts';

const NAMES_A_KEYWORD_CLAUSE = /(['"`])keyword\1/;

const modules = (): string[] => shippedModules();

describe('the keywords the engine acts on', () => {
  const page = grammarLines();
  const printed = (word: string): string[] => page.filter((line) => line.trim() === word || line.trim().startsWith(`${word}   `));

  // The subjects are read off the declaration, so a keyword added next month is asked this question for having been declared.
  it.each(Object.keys(KEYWORDS))('%s stands on the page an author writes against', (word) => {
    expect(printed(word)).not.toEqual([]);
  });

  it('are read in one place, so no module can branch on a word the page never printed', () => {
    const reading = modules().filter((file) => file !== OWNER && NAMES_A_KEYWORD_CLAUSE.test(stripComments(readFileSync(file, 'utf8'), file).join('\n')));
    expect(reading).toEqual([]);
  });

  it('was asked of enough of the tree for that to mean something', () => {
    expect(modules().length).toBeGreaterThan(100);
  });
});
