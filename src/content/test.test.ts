import { describe, expect, it } from 'vitest';
import { parseModule } from './sections';
import { DslError } from '../grammar/parser';
import { parseDirectiveLine, printDirective } from './sections/test';
import { MODAL_SCREENS } from '../grammar/actionResult';

const ref = (...path: string[]) => ({
  kind: 'reference' as const,
  reference: { path },
});

describe('use: has two payloads and no line that is both', () => {
  it('reads a dotted address ending in a slug as the one-sided form', () => {
    expect(parseDirectiveLine('use: entity.mirror.look-in')).toEqual({
      kind: 'use',
      obj: 'entity',
      objId: 'mirror',
      actionId: 'look-in',
    });
    expect(parseDirectiveLine('use: entity.giant-rat.fight')).toEqual({
      kind: 'use',
      obj: 'entity',
      objId: 'giant-rat',
      actionId: 'fight',
    });
  });

  it('reads a spaced payload as the two-sided form, whatever leads it', () => {
    expect(parseDirectiveLine('use: entity.mirror.look-in on shelf')).toEqual({
      kind: 'use-on',
      action: 'entity.mirror.look-in',
      target: 'shelf',
    });
  });

  it('reads anything else before the first dot as the two-sided form', () => {
    expect(parseDirectiveLine('use: melee-combat on giant-rat')).toEqual({
      kind: 'use-on',
      action: 'melee-combat',
      target: 'giant-rat',
    });
    expect(parseDirectiveLine('use: orc-pack.swing on orc-pack.rat')).toEqual({
      kind: 'use-on',
      action: 'orc-pack.swing',
      target: 'orc-pack.rat',
    });
  });

  it('keeps an unknown object kind readable as the dotted form, so the load path can name it', () => {
    expect(parseDirectiveLine('use: creature.dummy.strike')).toEqual({
      kind: 'use',
      obj: 'creature',
      objId: 'dummy',
      actionId: 'strike',
    });
  });

  it('reads a begin: payload by the same two shapes', () => {
    expect(parseDirectiveLine('begin: use entity.mirror.look-in')).toEqual({
      kind: 'begin',
      inner: {
        kind: 'use',
        obj: 'entity',
        objId: 'mirror',
        actionId: 'look-in',
      },
    });
    expect(parseDirectiveLine('begin: use melee-combat on giant-rat')).toEqual({
      kind: 'begin',
      inner: { kind: 'use-on', action: 'melee-combat', target: 'giant-rat' },
    });
  });
});

describe('test: composable in-game scripts', () => {
  it('parses a run composition alongside the other directives and an assert', () => {
    const source = ['# test tutorial-quest-given', 'run: enter-guide-house', 'talk: miki', 'choose: Sounds good.', 'use: entity.front-door.pick-lock', 'travel: beach', 'assert: tutorial.quest-given'].join('\n');

    const [section] = parseModule(source);
    expect(section.value).toEqual({
      id: 'tutorial-quest-given',
      directives: [
        { kind: 'run', test: 'enter-guide-house' },
        { kind: 'talk', entity: 'miki' },
        { kind: 'choose', text: 'Sounds good.' },
        {
          kind: 'use',
          obj: 'entity',
          objId: 'front-door',
          actionId: 'pick-lock',
        },
        { kind: 'travel', location: 'beach' },
        { kind: 'assert', condition: ref('tutorial', 'quest-given') },
      ],
    });
  });

  it('parses an assert with a comparison and a negated condition', () => {
    const source = ['# test rat-hunt', 'assert: skills.combat.visits >= 3', 'assert: not tutorial.snubbed'].join('\n');
    const [section] = parseModule(source) as {
      value: { directives: unknown[] };
    }[];
    expect(section.value.directives).toEqual([
      {
        kind: 'assert',
        condition: {
          kind: 'comparison',
          left: { path: ['skills', 'combat', 'visits'] },
          operator: '>=',
          right: 3,
        },
      },
      {
        kind: 'assert',
        condition: { kind: 'not', condition: ref('tutorial', 'snubbed') },
      },
    ]);
  });

  it('accepts fully-qualified names emitted by CLI authoring and recording', () => {
    const source = [
      '# test replay',
      'run: core.intro',
      'talk: tulsa.miki',
      'use: entity.tulsa.front-door.pick-lock',
      'travel: tulsa.beach',
      'craft: core.bread',
      'load: core.start',
      'expect: core.end',
      'begin: use entity.tulsa.oven.roast-chestnuts',
      'begin: travel tulsa.basement',
      'begin: craft core.dough',
    ].join('\n');

    const [section] = parseModule(source) as {
      value: { directives: unknown[] };
    }[];
    expect(section.value.directives).toEqual([
      { kind: 'run', test: 'core.intro' },
      { kind: 'talk', entity: 'tulsa.miki' },
      {
        kind: 'use',
        obj: 'entity',
        objId: 'tulsa.front-door',
        actionId: 'pick-lock',
      },
      { kind: 'travel', location: 'tulsa.beach' },
      { kind: 'craft', recipe: 'core.bread' },
      { kind: 'load', save: 'core.start' },
      { kind: 'expect', save: 'core.end' },
      {
        kind: 'begin',
        inner: {
          kind: 'use',
          obj: 'entity',
          objId: 'tulsa.oven',
          actionId: 'roast-chestnuts',
        },
      },
      {
        kind: 'begin',
        inner: { kind: 'travel', location: 'tulsa.basement' },
      },
      {
        kind: 'begin',
        inner: { kind: 'craft', recipe: 'core.dough' },
      },
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

describe('expect only: compares just what the save names', () => {
  it('parses the save id, distinct from a plain expect:', () => {
    expect(parseDirectiveLine('expect only: after-intro')).toEqual({ kind: 'expect-only', save: 'after-intro' });
    expect(parseDirectiveLine('expect: after-intro')).toEqual({ kind: 'expect', save: 'after-intro' });
  });

  it('rejects a save id that is not a valid path', () => {
    expect(() => parseModule('# test bad\nexpect only: Not Valid')).toThrow(/unexpected line in # test/);
    expect(() => parseModule('# test bad\nexpect only:')).toThrow(/unexpected line in # test/);
  });
});

describe('open-modal: raises a screen by name', () => {
  it('takes the name of the screen and nothing else, so the route onto one is a recorded line', () => {
    const source = ['# test opening', 'open-modal: name-yourself', 'open-modal: carried-items'].join('\n');
    const [section] = parseModule(source) as {
      value: { directives: unknown[] };
    }[];

    expect(section.value.directives).toEqual([
      { kind: 'open-modal', modal: 'name-yourself' },
      { kind: 'open-modal', modal: 'carried-items' },
    ]);
  });

  it('reads a payload that is no name at all as no directive', () => {
    const bad = (line: string) => () => parseModule(['# test bad', line].join('\n'));
    expect(bad('open-modal: Carried Items')).toThrow(/unexpected line in # test/);
    expect(bad('open-modal:')).toThrow(/unexpected line in # test/);
  });

  // The set is the language's, so the words the refusal names are read off it rather than written out here.
  it('refuses a name that is no screen the engine runs, and names the ones it does', () => {
    for (const screen of MODAL_SCREENS) expect(() => parseModule(['# test opening', `open-modal: ${screen}`].join('\n')), screen).not.toThrow();
    try {
      parseModule(['# test bad', 'open-modal: haggling'].join('\n'));
      expect.unreachable('a screen the engine does not run must not parse');
    } catch (raw) {
      for (const screen of MODAL_SCREENS) expect((raw as Error).message, screen).toContain(screen);
    }
  });
});

describe('submit-modal: answers one option of the open modal', () => {
  it('takes one key=value pair, with the value running to the end of the line', () => {
    const source = ['# test creation', 'submit-modal: name=Rowan of the Vale', 'submit-modal: race=Elf', 'submit-modal: choice=Sounds good. Teach me.'].join('\n');

    const [section] = parseModule(source) as {
      value: { directives: unknown[] };
    }[];
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
    const source = ['# test arming', 'begin: use entity.giant-rats.fight', 'begin: travel beach', 'begin: craft dough'].join('\n');

    const [section] = parseModule(source);
    expect(section.value).toEqual({
      id: 'arming',
      directives: [
        {
          kind: 'begin',
          inner: {
            kind: 'use',
            obj: 'entity',
            objId: 'giant-rats',
            actionId: 'fight',
          },
        },
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

describe('the three growth verbs', () => {
  const parsed = (line: string) => parseDirectiveLine(line);

  it('parses one verb per way an item grows, addressing a hex the way a plane keys one', () => {
    expect(parsed('slot: 1 at 0,0 e with node-jewel')).toEqual({
      kind: 'slot',
      target: '1',
      hex: { q: 0, r: 0 },
      direction: 'e',
      jewel: 'node-jewel',
    });
    expect(parsed('allocate: 1 at 1,-1 position 4')).toEqual({
      kind: 'allocate',
      target: '1',
      node: { hex: { q: 1, r: -1 }, kind: 'position', position: 4 },
    });
    expect(parsed('allocate: 1 at -2,3 slot ne')).toEqual({
      kind: 'allocate',
      target: '1',
      node: { hex: { q: -2, r: 3 }, kind: 'slot', direction: 'ne' },
    });
    expect(parsed('apply: 1 at 0,1 with lesser-orb')).toEqual({
      kind: 'apply',
      target: '1',
      hex: { q: 0, r: 1 },
      effect: 'lesser-orb',
    });
  });

  it('takes a target spelled as an item id or as a minted instance id, and nothing else', () => {
    expect(parsed('apply: mod.heartwood-blade at 0,0 with lesser-orb')).toMatchObject({
      target: 'mod.heartwood-blade',
    });
    expect(parsed('apply: 12 at 0,0 with lesser-orb')).toMatchObject({ target: '12' });
    expect(() => parsed('apply: 1a at 0,0 with lesser-orb')).toThrow(/malformed apply: payload/);
  });

  it('names the offending line for a malformed payload rather than reading as an unknown directive', () => {
    expect(() => parsed('slot: 1 at 0,0 with node-jewel')).toThrow(/malformed slot: payload \(expected <target> at <q>,<r> <direction> with <jewel item>\)/);
    expect(() => parsed('allocate: 1 at 0,0 position e')).toThrow(/malformed allocate: payload/);
    expect(() => parsed('allocate: 1 at 0,0 slot up')).toThrow(/malformed allocate: payload/);
    expect(() => parsed('apply: 1 with lesser-orb')).toThrow(/malformed apply: payload/);
  });

  it('refuses a hex address the plane would not have written', () => {
    expect(() => parsed('apply: 1 at 01,0 with lesser-orb')).toThrow(/malformed hex address/);
    expect(() => parsed('apply: 1 at -0,0 with lesser-orb')).toThrow(/malformed hex address/);
  });
});

describe('refuse: the outcome under test', () => {
  it('wraps each growth verb with its payload inline', () => {
    expect(parseDirectiveLine('refuse: apply 1 at 0,0 with lesser-orb')).toEqual({
      kind: 'refuse',
      inner: { kind: 'apply', target: '1', hex: { q: 0, r: 0 }, effect: 'lesser-orb' },
    });
    expect(parseDirectiveLine('refuse: allocate 1 at 0,0 position 2')).toEqual({
      kind: 'refuse',
      inner: {
        kind: 'allocate',
        target: '1',
        node: { hex: { q: 0, r: 0 }, kind: 'position', position: 2 },
      },
    });
  });

  it('rejects a verb whose refusal is not a value the plane returns', () => {
    expect(() => parseDirectiveLine('refuse: travel beach')).toThrow(/unknown refuse: verb \(expected one of slot, allocate, apply\)/);
    expect(() => parseDirectiveLine('refuse: apply 1')).toThrow(/malformed apply: payload/);
  });
});

describe('journal: pins the line a quest is standing on', () => {
  it('reads the quest id up to the first "says" and the rest of the line as the words', () => {
    expect(parseDirectiveLine('journal: finding-your-feet says Talk to Miki in the guide house.')).toEqual({
      kind: 'journal',
      quest: 'finding-your-feet',
      text: 'Talk to Miki in the guide house.',
    });
  });

  it('takes a fully-qualified quest id the same way every other directive does', () => {
    expect(parseDirectiveLine('journal: tulsa.finding-your-feet says Talk to Miki.')).toEqual({
      kind: 'journal',
      quest: 'tulsa.finding-your-feet',
      text: 'Talk to Miki.',
    });
  });

  it('prints back what it parsed', () => {
    const line = 'journal: finding-your-feet says Talk to Miki in the guide house.';
    expect(printDirective(parseDirectiveLine(line)!)).toBe(line);
  });
});

describe('a terminator follows a payload, not free text', () => {
  const roundTrip = (line: string) => printDirective(parseDirectiveLine(line)!);

  it('leaves a choice alone, because what a player is shown may say anything', () => {
    expect(parseDirectiveLine('choose: I will wait until morning')).toEqual({ kind: 'choose', text: 'I will wait until morning' });
    expect(roundTrip('choose: I will wait until morning')).toBe('choose: I will wait until morning');
  });

  it('still reads a terminator after a payload that spells itself out', () => {
    expect(parseDirectiveLine('use: melee-combat on giant-rat until done')).toEqual({ kind: 'until', inner: { kind: 'use-on', action: 'melee-combat', target: 'giant-rat' }, until: 'done' });
    expect(roundTrip('travel: beach until has rope')).toBe('travel: beach until has rope');
  });
});
