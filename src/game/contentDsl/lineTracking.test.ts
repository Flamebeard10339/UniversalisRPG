// DslParseError.line drives red-line highlighting in the editor — this
// specifically guards the off-by-one case: some sub-parses (an action
// header's inline tags) run after `cursor.index` has already advanced past
// the line whose text is being parsed, so naively using `cursor.index` at
// throw time would highlight the wrong line.
import { describe, expect, it } from 'vitest';
import { DslParseError } from './shared';
import { parseDsl } from './parser';

const expectLine = (source: string, expectedLine: number) => {
  try {
    parseDsl(source);
    throw new Error('expected parseDsl to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(DslParseError);
    expect((error as DslParseError).line).toBe(expectedLine);
  }
};

describe('DslParseError line tracking', () => {
  it('attributes a bad top-level header to its own line', () => {
    expectLine('# info\nid: x\nversion: 1.0.0\nuniverse: base\nauthor: a\ngame_version: 1.0\n\nnot a header', 7);
  });

  it('attributes a bad action-header inline tag-line to the header line itself, not the line after it', () => {
    const source = [
      '# info',
      'id: x',
      'version: 1.0.0',
      'universe: base',
      'author: a',
      'game_version: 1.0',
      '',
      '# location loc',
      'x: 0, y: 0',
      '',
      '## entity e',
      'talk: nonsense tag here', // line index 11 (0-indexed) — the bad inline tag
    ].join('\n');
    expectLine(source, 11);
  });

  it('attributes a bad `wall ... while` condition to the wall line', () => {
    const source = [
      '# info',
      'id: x',
      'version: 1.0.0',
      'universe: base',
      'author: a',
      'game_version: 1.0',
      '',
      '# location loc',
      'x: 0, y: 0',
      'wall -> other while', // line index 9 — empty condition after "while"
    ].join('\n');
    expectLine(source, 9);
  });

  it('attributes a bad `on success:` continuation line to that specific continuation line', () => {
    const source = [
      '# info',
      'id: x',
      'version: 1.0.0',
      'universe: base',
      'author: a',
      'game_version: 1.0',
      '',
      '# location loc',
      'x: 0, y: 0',
      '',
      '## entity e',
      'fight:',
      '  enemy: melee, health 5',
      '  on success:',
      '    not a real tag', // line index 14
    ].join('\n');
    expectLine(source, 14);
  });
});
