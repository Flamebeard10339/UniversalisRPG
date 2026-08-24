import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { NOTE_FIELDS, parseDirectiveLine } from '../content/sections/test';
import { createGameState } from './runtime';
import { runTest } from './session';

// A recorded playtest is a `# test` and a `# test` is a recorded playtest — the difference is only
// whether the replay is expected to match the record. These are the lines a recording writes that
// an authored proof never did, and what running one over them means.

const WORLD = ['# location shore', 'x: 0, y: 0', 'starting', '', '# location cove', 'x: 1, y: 0', '', '# entity miki', 'title: Miki'].join('\n');

const ran = (...lines: string[]) => runTest('recorded', loadInEnglish([WORLD, '', '# test recorded', ...lines].join('\n')), createGameState());

describe('a body line the engine has no opinion about', () => {
  for (const field of NOTE_FIELDS) {
    it(`carries what the player said in ${field.name}: without changing the run`, () => {
      expect(ran(`${field.name}: the cove is over there but nothing says how far`)).toEqual({ passed: true });
    });
  }

  it('takes a note holding the word a terminator is spelled with as a note, not as a loop', () => {
    expect(parseDirectiveLine('note: I kept swinging until resource.health < 10')).toEqual({ kind: 'note', field: 'note', text: 'I kept swinging until resource.health < 10' });
  });

  it('passes over a page the app moved to, having no pages of its own', () => {
    expect(ran('page: character/inventory', 'goto: cove')).toEqual({ passed: true });
  });
});

describe('refused', () => {
  it('claims the refusal the line above it got, and the run carries on', () => {
    expect(ran('choose: 0', 'refused', 'goto: cove')).toEqual({ passed: true });
  });

  it('fails where the line above it took, which is how a fix is seen to have landed', () => {
    expect(ran('goto: cove', 'refused').failure).toContain('goto: cove was not refused');
  });

  it('fails standing first, with nothing above it to be about', () => {
    expect(ran('refused').failure).toContain('nothing was not refused');
  });

  it('leaves a refusal no line claims failing the run', () => {
    expect(ran('choose: 0', 'goto: cove').passed).toBe(false);
  });

  it('fails a run whose last line was refused and never claimed', () => {
    expect(ran('choose: 0').passed).toBe(false);
  });
});
