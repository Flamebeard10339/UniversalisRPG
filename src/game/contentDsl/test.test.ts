import { describe, expect, it } from 'vitest';
import { parseModule } from './module';
import { DslError } from './parser';

const ref = (...path: string[]) => ({ kind: 'reference' as const, reference: { path } });

describe('test: composable in-game scripts', () => {
  it('parses a run composition alongside the other directives and an expect', () => {
    const source = [
      '# test tutorial-quest-given',
      'run: enter-guide-house',
      'talk: miki',
      'choose: Sounds good.',
      'use: entity.front-door.pick lock',
      'travel: beach',
      'expect: tutorial.quest-given',
    ].join('\n');

    const [section] = parseModule(source);
    expect(section.value).toEqual({
      id: 'tutorial-quest-given',
      directives: [
        { kind: 'run', test: 'enter-guide-house' },
        { kind: 'talk', entity: 'miki' },
        { kind: 'choose', text: 'Sounds good.' },
        { kind: 'use', obj: 'entity', objId: 'front-door', actionId: 'pick lock' },
        { kind: 'travel', location: 'beach' },
        { kind: 'expect', condition: ref('tutorial', 'quest-given') },
      ],
    });
  });

  it('parses an expect with a comparison and a negated condition', () => {
    const source = ['# test rat-hunt', 'expect: skills.combat.visits >= 3', 'expect: not tutorial.snubbed'].join('\n');
    const [section] = parseModule(source) as { value: { directives: unknown[] } }[];
    expect(section.value.directives).toEqual([
      { kind: 'expect', condition: { kind: 'comparison', left: { path: ['skills', 'combat', 'visits'] }, operator: '>=', right: 3 } },
      { kind: 'expect', condition: { kind: 'not', condition: ref('tutorial', 'snubbed') } },
    ]);
  });

  it('requires an id', () => {
    expect(() => parseModule('# test\nrun: other')).toThrow(/# test requires an id/);
  });

  it('rejects an indented directive, since directives are single-line', () => {
    expect(() => parseModule('# test bad\ntravel: beach\n  expect: bridge-open')).toThrow(DslError);
  });

  it('rejects an unrecognized directive', () => {
    expect(() => parseModule('# test bad\nsing: a song')).toThrow(/unexpected line in # test/);
  });
});
