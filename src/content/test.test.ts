import { describe, expect, it } from 'vitest';
import { parseModule } from './module';
import { DslError } from '../grammar/parser';
import { parseDirectiveLine } from './test';

const ref = (...path: string[]) => ({ kind: 'reference' as const, reference: { path } });

// Both readings can match one line, and which it is has to be decided rather
// than fall out of the order the two regexes are tried in.
describe('use: has two payloads and one rule for telling them apart', () => {
  it('reads a leading object kind as the dotted form, however the label ends', () => {
    expect(parseDirectiveLine('use: entity.mirror.look on shelf')).toEqual({ kind: 'use', obj: 'entity', objId: 'mirror', actionId: 'look on shelf' });
    expect(parseDirectiveLine('use: entity.giant-rat.fight')).toEqual({ kind: 'use', obj: 'entity', objId: 'giant-rat', actionId: 'fight' });
  });

  it('reads anything else before the first dot as the two-sided form', () => {
    expect(parseDirectiveLine('use: melee-combat on giant-rat')).toEqual({ kind: 'use-on', action: 'melee-combat', target: 'giant-rat' });
    expect(parseDirectiveLine('use: orc-pack.swing on orc-pack.rat')).toEqual({ kind: 'use-on', action: 'orc-pack.swing', target: 'orc-pack.rat' });
  });

  it('keeps an unknown object kind readable as the dotted form, so the load path can name it', () => {
    expect(parseDirectiveLine('use: creature.dummy.strike')).toEqual({ kind: 'use', obj: 'creature', objId: 'dummy', actionId: 'strike' });
  });

  it('decides a begin: payload by the same rule', () => {
    expect(parseDirectiveLine('begin: use entity.mirror.look on shelf')).toEqual({ kind: 'begin', inner: { kind: 'use', obj: 'entity', objId: 'mirror', actionId: 'look on shelf' } });
    expect(parseDirectiveLine('begin: use melee-combat on giant-rat')).toEqual({ kind: 'begin', inner: { kind: 'use-on', action: 'melee-combat', target: 'giant-rat' } });
  });
});

describe('test: composable in-game scripts', () => {
  it('parses a run composition alongside the other directives and an assert', () => {
    const source = [
      '# test tutorial-quest-given',
      'run: enter-guide-house',
      'talk: miki',
      'choose: Sounds good.',
      'use: entity.front-door.pick lock',
      'travel: beach',
      'assert: tutorial.quest-given',
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
        { kind: 'assert', condition: ref('tutorial', 'quest-given') },
      ],
    });
  });

  it('parses an assert with a comparison and a negated condition', () => {
    const source = ['# test rat-hunt', 'assert: skills.combat.visits >= 3', 'assert: not tutorial.snubbed'].join('\n');
    const [section] = parseModule(source) as { value: { directives: unknown[] } }[];
    expect(section.value.directives).toEqual([
      { kind: 'assert', condition: { kind: 'comparison', left: { path: ['skills', 'combat', 'visits'] }, operator: '>=', right: 3 } },
      { kind: 'assert', condition: { kind: 'not', condition: ref('tutorial', 'snubbed') } },
    ]);
  });

  it('accepts fully-qualified names emitted by CLI authoring and recording', () => {
    const source = [
      '# test replay',
      'run: tutorial-island.intro',
      'talk: tutorial-island.miki',
      'use: entity.tutorial-island.front-door.pick lock',
      'travel: tutorial-island.beach',
      'craft: tutorial-island.bread',
      'load: tutorial-island.start',
      'expect: tutorial-island.end',
      'begin: use entity.tutorial-island.oven.roast chestnuts',
      'begin: travel tutorial-island.basement',
      'begin: craft tutorial-island.dough',
    ].join('\n');

    const [section] = parseModule(source) as { value: { directives: unknown[] } }[];
    expect(section.value.directives).toEqual([
      { kind: 'run', test: 'tutorial-island.intro' },
      { kind: 'talk', entity: 'tutorial-island.miki' },
      { kind: 'use', obj: 'entity', objId: 'tutorial-island.front-door', actionId: 'pick lock' },
      { kind: 'travel', location: 'tutorial-island.beach' },
      { kind: 'craft', recipe: 'tutorial-island.bread' },
      { kind: 'load', save: 'tutorial-island.start' },
      { kind: 'expect', save: 'tutorial-island.end' },
      { kind: 'begin', inner: { kind: 'use', obj: 'entity', objId: 'tutorial-island.oven', actionId: 'roast chestnuts' } },
      { kind: 'begin', inner: { kind: 'travel', location: 'tutorial-island.basement' } },
      { kind: 'begin', inner: { kind: 'craft', recipe: 'tutorial-island.dough' } },
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

describe('submit-modal: answers one option of the open modal', () => {
  it('takes one key=value pair, with the value running to the end of the line', () => {
    const source = [
      '# test creation',
      'submit-modal: name=Rowan of the Vale',
      'submit-modal: race=Elf',
      'submit-modal: choice=Sounds good. Teach me.',
    ].join('\n');

    const [section] = parseModule(source) as { value: { directives: unknown[] } }[];
    expect(section.value.directives).toEqual([
      { kind: 'submit-modal', key: 'name', value: 'Rowan of the Vale' },
      { kind: 'submit-modal', key: 'race', value: 'Elf' },
      { kind: 'submit-modal', key: 'choice', value: 'Sounds good. Teach me.' },
    ]);
  });

  it('names the offending line for a payload that is not key=value, rather than reading as an unknown directive', () => {
    expect(() => parseModule('# test bad\nsubmit-modal: Rowan')).toThrow(/malformed submit-modal: payload \(expected <key>=<value>\): submit-modal: Rowan/);
    expect(() => parseModule('# test bad\nsubmit-modal:')).toThrow(DslError);
    expect(() => parseModule('# test bad\nsubmit-modal: Name=Rowan')).toThrow(/malformed submit-modal:/);
  });
});

describe('begin: arm-only directive', () => {
  it('parses begin: use/travel/craft into a begin directive wrapping the matching inner one', () => {
    const source = [
      '# test arming',
      'begin: use entity.giant-rats.fight',
      'begin: travel beach',
      'begin: craft dough',
    ].join('\n');

    const [section] = parseModule(source);
    expect(section.value).toEqual({
      id: 'arming',
      directives: [
        { kind: 'begin', inner: { kind: 'use', obj: 'entity', objId: 'giant-rats', actionId: 'fight' } },
        { kind: 'begin', inner: { kind: 'travel', location: 'beach' } },
        { kind: 'begin', inner: { kind: 'craft', recipe: 'dough' } },
      ],
    });
  });

  it('rejects an unknown begin: verb', () => {
    expect(() => parseModule('# test bad\nbegin: talk miki')).toThrow(DslError);
  });

  it('rejects a malformed begin: payload', () => {
    expect(() => parseModule('# test bad\nbegin: use entity.giant-rats')).toThrow(DslError);
  });
});
