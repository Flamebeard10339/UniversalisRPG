import { describe, expect, it } from 'vitest';
import { Action, actionBody, actionLines, actionLinesWritten, assembledActionProblem, ATTEMPTS_BUDGET, isTwoSided } from './action';
import { ActionResult, hookResultList } from './actionResult';
import { Cursor } from './parser';
import { splitSections } from './structure';

function parse(body: string, label = 'swing'): Action {
  const indented = body
    .trim()
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  const [section] = splitSections(`# probe p\n${label}:\n${indented}\n`);
  return {
    label,
    ...actionBody.parseBlock(section.body[0].children, label),
  } as Action;
}

const refusal = (body: string, label = 'swing'): string => {
  try {
    parse(body, label);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the load path to refuse this action');
};

function hook(body: string): ActionResult[] {
  const indented = body
    .trim()
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  const [section] = splitSections(`# probe p\non hit:\n${indented}\n`);
  return hookResultList.parseBlock(section.body[0].children);
}

const hookRefusal = (body: string): string => {
  try {
    hook(body);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the load path to refuse this hook body');
};

const MELEE = `
rate: us.attack-rate
accuracy: us.accuracy vs them.evasion
damage: us.attack vs them.defense
depletes: them.health
`;

describe('side markers', () => {
  it('reads every field of a two-sided action off the side it names', () => {
    expect(parse(MELEE)).toMatchObject({
      rate: { side: 'us', id: 'attack-rate' },
      accuracy: {
        left: { side: 'us', id: 'accuracy' },
        right: { side: 'them', id: 'evasion' },
      },
      damage: {
        left: { side: 'us', id: 'attack' },
        right: { side: 'them', id: 'defense' },
      },
      depletes: { side: 'them', id: 'health' },
    });
  });

  it('refuses a two-sided action whose stat, pool or skill field carries no marker', () => {
    expect(refusal('accuracy: us.accuracy vs evasion\ndepletes: them.health')).toContain('accuracy: evasion names no side');
    expect(refusal('rate: attack-rate\ndepletes: them.health')).toContain('rate: attack-rate names no side');
    expect(refusal('damage: us.attack\ndepletes: health')).toContain('depletes: health names no side');
  });

  it('never defaults a missing marker, so the refusal names both spellings', () => {
    expect(refusal('damage: us.attack vs defense\ndepletes: them.health')).toContain('us.defense or them.defense');
  });

  it('has deleted retaliates, and says what replaced it', () => {
    expect(refusal('retaliates\ndamage: us.attack\ndepletes: them.health')).toContain('"retaliates" was retired');
  });
});

describe('side vocabulary is the whole declaration of kind', () => {
  it('makes an action two-sided when it writes a marker and one-sided when it writes none', () => {
    expect(isTwoSided(parse(MELEE))).toBe(true);
    expect(isTwoSided(parse('rate: cooking-rate\ngive: 1 roasted-chestnut'))).toBe(false);
  });

  it('leaves a one-sided action needing no depletes: and no markers', () => {
    const mirror = parse('instant\nopen modal: choose-name\nset: mirror-done');
    expect(mirror.kind).toBe('instant');
    expect(mirror.depletes).toBeUndefined();
    expect(parse('rate: cooking-rate\ngive: 1 roasted-chestnut').rate).toEqual({
      id: 'cooking-rate',
    });
  });

  it('parses a one-line action to the same shape as a block, so a one-off stays one line', () => {
    const inline = {
      label: 'roast chestnuts',
      ...actionBody.parse(new Cursor('give: 1 roasted-chestnut', 0, 0), 'roast chestnuts'),
    } as Action;
    expect(isTwoSided(inline)).toBe(false);
    expect(inline.results).toEqual([{ kind: 'give', item: 'roasted-chestnut', amount: { min: 1, max: 1 } }]);
  });
});

describe('contests', () => {
  it('takes the right half as optional, absent meaning the neutral default', () => {
    expect(parse('accuracy: us.accuracy\ndepletes: them.health').accuracy).toEqual({ left: { side: 'us', id: 'accuracy' } });
    expect(parse('damage: us.woodcutting\ndepletes: them.wood').damage).toEqual({ left: { side: 'us', id: 'woodcutting' } });
  });

  it('keeps exactly one spelling of each half, with no alias for the retired fields', () => {
    for (const [field, points] of [
      ['evasion: evasion', 'accuracy: us.accuracy vs them.evasion'],
      ['ability: attack', 'damage: us.attack vs them.defense'],
      ['dr: defense', 'damage: us.attack vs them.defense'],
      ['target: health', 'depletes: them.<pool>'],
    ] as const) {
      expect(refusal(field)).toContain(points);
    }
  });

  it('takes a side-naming action with nothing to deplete, which counts down a whole of its own', () => {
    expect(assembledActionProblem(parse('accuracy: us.accuracy vs them.evasion'))).toBeUndefined();
    expect(assembledActionProblem(parse('damage: us.felling vs them.hardness'))).toBeUndefined();
    expect(parse('accuracy: us.accuracy vs them.evasion').depletes).toBeUndefined();
  });
});

describe('how an action ends', () => {
  it('bounds an action at attempts: N and runs on attempts exhausted: when it does not get there', () => {
    const cooking = parse('accuracy: cooking-accuracy\nattempts: 1\non success:\n  give: 1 cooked-shrimp\non attempts exhausted:\n  give: 1 burnt-shrimp');
    expect(cooking.attempts).toBe(1);
    expect(cooking.onAttemptsExhausted).toEqual([{ kind: 'give', item: 'burnt-shrimp', amount: { min: 1, max: 1 } }]);
  });

  it('leaves an action without attempts: unbounded', () => {
    expect(parse(MELEE).attempts).toBeUndefined();
  });

  it('has deleted escape after and on escape:, and says what replaced each', () => {
    expect(refusal('escape after 20')).toContain('write `attempts: N`');
    expect(refusal('on escape: give: 1 bread')).toContain('write `on attempts exhausted:`');
  });

  it('says which of the two things attempts: does, in the same words wherever an author meets it', () => {
    const offered = actionLinesWritten().filter((line) => line.form.startsWith('attempts:'));
    expect(offered.length).toBeGreaterThan(0);
    for (const line of offered) expect(line.note).toBe(ATTEMPTS_BUDGET);
    expect(refusal('escape after 20')).toContain(ATTEMPTS_BUDGET);
    expect(ATTEMPTS_BUDGET).toContain('continuous');
  });

  it('names no event by default, so nothing an action does not ask for ends it', () => {
    expect(parse(MELEE).stopsOn).toBeUndefined();
  });

  it('takes the events that end it as a list, and prints back the line that was written', () => {
    const written = 'stops on: level-up, core.pack-full';
    const trained = parse(`time: 1\n${written}`);
    expect(trained.stopsOn).toEqual(['level-up', 'core.pack-full']);
    expect(actionLines(trained)).toContain(`  ${written}`);
  });

  it('leaves on refused: meaning what it means today, unmoved', () => {
    expect(parse('take: 1 dough\non refused:\n  say: You have nothing to bake.').onRefused).toEqual([{ kind: 'say', text: 'You have nothing to bake.' }]);
  });
});

describe('the table over an assembled action', () => {
  it('applies the marker rules to an action nobody authored a block for', () => {
    const compiled: Action = {
      label: 'Craft Bread',
      results: [],
      damage: { left: { side: 'us', id: 'attack' } },
    };
    expect(assembledActionProblem(compiled)).toBeUndefined();
    expect(assembledActionProblem({ ...compiled, depletes: { id: 'health' } })).toContain('depletes: health names no side');
    expect(
      assembledActionProblem({
        ...compiled,
        depletes: { side: 'them', id: 'health' },
      }),
    ).toBeUndefined();
  });
});

describe('a hook is carried by a character, not by a verb', () => {
  const CARRIER = 'write it on the `# entity` or `# item` that carries it';

  it.each([['on hit'], ['when hit']])('refuses %s: written as a field inside an action body', (written) => {
    expect(refusal(`${written}: drain: 3 health from them`)).toContain(CARRIER);
  });

  it.each([['on hit'], ['when hit']])('refuses %s: written as the label of an action block, as a section that is no carrier writes one', (written) => {
    expect(refusal('drain: 3 health from them', written)).toContain(CARRIER);
    expect(() => actionBody.parse(new Cursor('drain: 3 health from them', 0, 0), written)).toThrow(CARRIER);
  });

  it.each([['on hit self'], ['on hit me'], ['on hit them'], ['when hit self'], ['when hit me'], ['when hit them'], ['on struck self'], ['on struck me'], ['on struck them'], ['on struck']])('refuses the retired spelling %s: by name, on both routes', (written) => {
    expect(refusal(`${written}: drain: 3 health`)).toContain(`${written}: was never implemented`);
    expect(refusal('drain: 3 health', written)).toContain(`${written}: was never implemented`);
  });

  it('answers the retired moment name with the one that replaced it', () => {
    expect(refusal('drain: 3 health', 'on struck')).toContain('the moment a swing lands on the carrier is `when hit:`');
    expect(refusal('drain: 3 health', 'on struck them')).toContain('says so itself, as in `drain: 3 health from them`');
  });
});

describe('which party a drain: or restore: moves its amount between', () => {
  it("reads the phrase where English puts it, and leaves an unmarked result the carrier's", () => {
    expect(hook('drain: 3 health from them\nrestore: 5 rage to me\nrestore: 1 rage')).toEqual([
      {
        kind: 'pool',
        resource: 'health',
        delta: { min: -3, max: -3 },
        party: 'them',
      },
      {
        kind: 'pool',
        resource: 'rage',
        delta: { min: 5, max: 5 },
        party: 'me',
      },
      { kind: 'pool', resource: 'rage', delta: { min: 1, max: 1 } },
    ]);
  });

  it('reads a ranged amount, a wrapper body and a comma list without the phrase swallowing what follows', () => {
    expect(hook('1 in 4: drain: 2-5 health from them, say: It burns.')).toEqual([
      {
        kind: 'chance',
        numerator: 1,
        denominator: 4,
        results: [
          {
            kind: 'pool',
            resource: 'health',
            delta: { min: -5, max: -2 },
            party: 'them',
          },
          { kind: 'say', text: 'It burns.' },
        ],
      },
    ]);
  });

  it('takes the preposition from the verb rather than from the author, and refuses the wrong one naming the right one', () => {
    expect(hookRefusal('drain: 3 health to them')).toContain('written `from them` rather than `to them`');
    expect(hookRefusal('restore: 1 rage from me')).toContain('written `to me` rather than `from me`');
  });

  it('names both parties when the phrase opens and then names neither', () => {
    expect(hookRefusal('drain: 3 health from us')).toContain('`from me` for the character this is read off');
  });

  it('leaves a word that is not a preposition to the end-of-line demand', () => {
    expect(hookRefusal('drain: 3 health twice')).toContain('unexpected content after a result');
  });

  it('refuses the phrase in a result list that is not a hook, at any depth', () => {
    expect(refusal('drain: 3 health from them')).toContain('reads only inside `on hit:` or `when hit:`');
    expect(refusal('on success:\n  1 in 4:\n    restore: 2 rage to me')).toContain('reads only inside `on hit:` or `when hit:`');
    expect(refusal('on success: drain: 3 health from them')).toContain('reads only inside `on hit:` or `when hit:`');
    expect(parse('drain: 3 health').results).toEqual([{ kind: 'pool', resource: 'health', delta: { min: -3, max: -3 } }]);
  });
});

describe('credit:', () => {
  it('reads as an ordinary result wrapper, composing with the chance wrappers', () => {
    expect(parse('credit:\n  xp: melee 4-6\n  1 in 3:\n    roll: trinket').results).toEqual([
      {
        kind: 'credit',
        results: [
          { kind: 'xp', skill: 'melee', amount: { min: 4, max: 6 } },
          {
            kind: 'chance',
            numerator: 1,
            denominator: 3,
            results: [{ kind: 'roll', table: 'trinket' }],
          },
        ],
      },
    ]);
  });
});

describe('an amount written as a stat', () => {
  const wrote = (line: string): ActionResult => parse(line).results![0]!;

  const printsBack = (line: string): string => actionLines(parse(line))[0]!.replace(/^swing: /, '');

  it('reads a side and a stat where xp: takes a number', () => {
    expect(wrote('xp: larceny them.toll')).toEqual({ kind: 'xp', skill: 'larceny', amount: { side: 'them', id: 'toll' } });
    expect(wrote('xp: larceny toll')).toEqual({ kind: 'xp', skill: 'larceny', amount: { id: 'toll' } });
    expect(wrote('xp: larceny 4-7')).toEqual({ kind: 'xp', skill: 'larceny', amount: { min: 4, max: 7 } });
  });

  it('reads one where drain: and restore: take a number, carrying which way the pool moves', () => {
    expect(wrote('drain: them.toll health')).toEqual({ kind: 'pool', resource: 'health', delta: { side: 'them', id: 'toll', falls: true } });
    expect(wrote('restore: them.toll health')).toEqual({ kind: 'pool', resource: 'health', delta: { side: 'them', id: 'toll' } });
  });

  it('leaves restore: <resource> meaning the whole pool, since one word is not an amount and a resource', () => {
    expect(wrote('restore: health')).toEqual({ kind: 'fill', resource: 'health' });
    expect(wrote('restore: health to me')).toEqual({ kind: 'fill', resource: 'health', party: 'me' });
  });

  it('prints back every one of those as it was written', () => {
    for (const line of ['xp: larceny them.toll', 'xp: larceny toll', 'drain: them.toll health', 'restore: us.toll health', 'restore: health', 'drain: 3 health']) {
      expect(printsBack(line)).toBe(line);
    }
  });

  it('says what it wanted where one word stands alone after drain:', () => {
    expect(refusal('drain: health')).toContain('an amount and a resource');
  });
});
