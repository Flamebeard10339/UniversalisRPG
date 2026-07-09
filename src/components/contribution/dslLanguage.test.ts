import { StringStream } from '@codemirror/language';
import { describe, expect, it } from 'vitest';
import { dslStartState, dslToken, type DslTokenState } from './dslLanguage';

// Tokenizes one line in isolation, threading `state` across token() calls the
// same way CodeMirror does, and returns the (style, text) pairs produced.
const tokenizeLine = (line: string, state: DslTokenState): Array<{ style: string | null; text: string }> => {
  const stream = new StringStream(line, 2, 4, undefined);
  const tokens: Array<{ style: string | null; text: string }> = [];
  while (!stream.eol()) {
    const style = dslToken(stream, state);
    tokens.push({ style, text: stream.current() });
    stream.start = stream.pos;
  }
  return tokens;
};

describe('dslLanguage tokenizer', () => {
  it('tags a `# info` line as a heading and consumes the whole line', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('# info', state);
    expect(tokens).toEqual([{ style: 'heading', text: '# info' }]);
  });

  it('tags a `## entity <id>` line as heading2 (object header)', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('## entity drawer', state);
    expect(tokens).toEqual([{ style: 'heading2', text: '## entity drawer' }]);
  });

  it('tags a top-level `key: value` line as propertyName up to the colon', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('id: tutorial-island-guide-house', state);
    expect(tokens[0]).toEqual({ style: 'propertyName', text: 'id:' });
  });

  it('tags an indented multi-word key (`  requires:`) as propertyName despite leading whitespace', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('  hidden if: tutorial.miki-cleared', state);
    expect(tokens[0]).toEqual({ style: 'propertyName', text: '  hidden if:' });
  });

  it('does not misfire on a prose line that happens to contain a colon-free sentence', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('Right, the Quests tab.', state);
    expect(tokens.every((token) => token.style !== 'propertyName')).toBe(true);
  });

  it('tags [[dialogue targets]] as links', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('talk: [[dialogue miki]]', state);
    expect(tokens[0]).toEqual({ style: 'propertyName', text: 'talk:' });
    expect(tokens.some((token) => token.style === 'link' && token.text === '[[dialogue miki]]')).toBe(true);
  });

  it('tags a dialogue node header\'s (speaker) parenthetical as variableName', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('start (miki): Oh — hi.', state);
    expect(tokens.some((token) => token.style === 'variableName' && token.text === '(miki)')).toBe(true);
  });

  it('tags -> and goto as keywords', () => {
    const state = dslStartState();
    const optionTokens = tokenizeLine('  -> Anyway — go on. [[offer-quest]]', state);
    expect(optionTokens.some((token) => token.style === 'keyword' && token.text === '->')).toBe(true);

    const gotoTokens = tokenizeLine('  goto [[farewell]]', state);
    expect(gotoTokens.some((token) => token.style === 'keyword' && token.text === 'goto')).toBe(true);
  });

  it('tags an inline {condition: text} fragment as a string', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('examine: junk.{!coins-taken: You see coins.}', state);
    expect(tokens.some((token) => token.style === 'string' && token.text === '{!coins-taken: You see coins.}')).toBe(true);
  });

  it('tags every comma-separated key on one line, not just the first', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('x: 3, y: 0, z: -1', state);
    expect(tokens.filter((token) => token.style === 'propertyName').map((token) => token.text)).toEqual(['x:', 'y:', 'z:']);
  });

  it('tags `game_version:` despite the underscore', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('game_version: 1.0', state);
    expect(tokens[0]).toEqual({ style: 'propertyName', text: 'game_version:' });
  });

  it('does not re-tag a colon inside a `say:` value even after a literal comma in that prose', () => {
    const state = dslStartState();
    const tokens = tokenizeLine('say: It reads: remember, then: go.', state);
    expect(tokens.filter((token) => token.style === 'propertyName').map((token) => token.text)).toEqual(['say:']);
  });

  it('suppresses key/header detection inside a `# advanced` JSON block until the next header', () => {
    const state = dslStartState();
    expect(tokenizeLine('# advanced', state)).toEqual([{ style: 'heading', text: '# advanced' }]);
    expect(state.inAdvancedBlock).toBe(true);

    const jsonLineTokens = tokenizeLine('  "flags": [', state);
    expect(jsonLineTokens.every((token) => token.style === null)).toBe(true);

    const nextHeaderTokens = tokenizeLine('# location tutorial-guide-house', state);
    expect(nextHeaderTokens).toEqual([{ style: 'heading', text: '# location tutorial-guide-house' }]);
    expect(state.inAdvancedBlock).toBe(false);
  });
});
