import { describe, expect, it } from 'vitest';
import { Action, actionBody, actionTableProblem, isTwoSided } from './action';
import { Cursor } from './parser';
import { splitSections } from './structure';

// An action is authored as one labelled entry inside some section's body, and
// `actionBody` is what every section that owns actions reads it with. Driving it
// through the real splitter is what keeps these tests about the grammar rather
// than about a hand-built line tree.
function parse(body: string, label = 'swing'): Action {
  const indented = body
    .trim()
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
  const [section] = splitSections(`# probe p\n${label}:\n${indented}\n`);
  return { label, ...actionBody.parseBlock(section.body[0].children, label) } as Action;
}

const refusal = (body: string, label = 'swing'): string => {
  try {
    parse(body, label);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('expected the load path to refuse this action');
};

const MELEE = `
rate: my attack-rate
accuracy: my accuracy vs their evasion
damage: my attack vs their defense
depletes: their health
`;

describe('side markers', () => {
  it('reads every field of a two-sided action off the side it names', () => {
    expect(parse(MELEE)).toMatchObject({
      rate: { side: 'my', id: 'attack-rate' },
      accuracy: { left: { side: 'my', id: 'accuracy' }, right: { side: 'their', id: 'evasion' } },
      damage: { left: { side: 'my', id: 'attack' }, right: { side: 'their', id: 'defense' } },
      depletes: { side: 'their', id: 'health' },
    });
  });

  it('refuses a two-sided action whose stat, pool or skill field carries no marker', () => {
    expect(refusal('accuracy: my accuracy vs evasion\ndepletes: their health')).toContain('accuracy: evasion names no side');
    expect(refusal('rate: attack-rate\ndepletes: their health')).toContain('rate: attack-rate names no side');
    expect(refusal('damage: my attack\ndepletes: health')).toContain('depletes: health names no side');
  });

  it('never defaults a missing marker, so the refusal names both spellings', () => {
    expect(refusal('damage: my attack vs defense\ndepletes: their health')).toContain('my defense or their defense');
  });

  it('has deleted retaliates, and says what replaced it', () => {
    expect(refusal('retaliates\ndamage: my attack\ndepletes: their health')).toContain('"retaliates" was retired');
  });
});

describe('side vocabulary is the whole declaration of kind', () => {
  it('makes an action two-sided when it writes a marker and one-sided when it writes none', () => {
    expect(isTwoSided(parse(MELEE))).toBe(true);
    expect(isTwoSided(parse('rate: cooking-rate\ngive: 1 roasted-chestnut'))).toBe(false);
  });

  it('leaves a one-sided action needing no depletes: and no markers', () => {
    const mirror = parse('instant\nopen modal: character-creation\nset: mirror-done');
    expect(mirror.kind).toBe('instant');
    expect(mirror.depletes).toBeUndefined();
    expect(parse('rate: cooking-rate\ngive: 1 roasted-chestnut').rate).toEqual({ id: 'cooking-rate' });
  });

  it('parses a one-line action to the same shape as a block, so a one-off stays one line', () => {
    const inline = { label: 'roast chestnuts', ...actionBody.parse(new Cursor('give: 1 roasted-chestnut', 0, 0), 'roast chestnuts') } as Action;
    expect(isTwoSided(inline)).toBe(false);
    expect(inline.results).toEqual([{ kind: 'give', item: 'roasted-chestnut', amount: { min: 1, max: 1 } }]);
  });
});

describe('contests', () => {
  it('takes the right half as optional, absent meaning the neutral default', () => {
    expect(parse('accuracy: my accuracy\ndepletes: their health').accuracy).toEqual({ left: { side: 'my', id: 'accuracy' } });
    expect(parse('damage: my woodcutting\ndepletes: their wood').damage).toEqual({ left: { side: 'my', id: 'woodcutting' } });
  });

  it('keeps exactly one spelling of each half, with no alias for the retired fields', () => {
    for (const [field, points] of [
      ['evasion: evasion', 'accuracy: my accuracy vs their evasion'],
      ['ability: attack', 'damage: my attack vs their defense'],
      ['dr: defense', 'damage: my attack vs their defense'],
      ['target: health', 'depletes: their <pool>'],
    ] as const) {
      expect(refusal(field)).toContain(points);
    }
  });

  it('refuses a side-naming action with nothing to deplete', () => {
    expect(refusal('accuracy: my accuracy vs their evasion')).toContain('nothing to deplete is not a contest');
  });
});

describe('how an action ends', () => {
  it('bounds an action at attempts: N and runs on unfinished: when it does not get there', () => {
    const cooking = parse('accuracy: cooking-accuracy\nattempts: 1\non success:\n  give: 1 cooked-shrimp\non unfinished:\n  give: 1 burnt-shrimp');
    expect(cooking.attempts).toBe(1);
    expect(cooking.onUnfinished).toEqual([{ kind: 'give', item: 'burnt-shrimp', amount: { min: 1, max: 1 } }]);
  });

  it('leaves an action without attempts: unbounded', () => {
    expect(parse(MELEE).attempts).toBeUndefined();
  });

  it('has deleted escape after and on escape:, and says what replaced each', () => {
    expect(refusal('escape after 20')).toContain('write `attempts: N`');
    expect(refusal('on escape: give: 1 bread')).toContain('write `on unfinished:`');
  });

  it('leaves on failure: meaning what it means today, unmoved', () => {
    expect(parse('take: 1 dough\non failure:\n  say: You have nothing to bake.').onFailure).toEqual([{ kind: 'say', text: 'You have nothing to bake.' }]);
  });
});

describe('the table over an assembled action', () => {
  it('applies the marker and depletes: rules to an action nobody authored a block for', () => {
    const compiled: Action = { label: 'Craft Bread', results: [], damage: { left: { side: 'my', id: 'attack' } } };
    expect(actionTableProblem(compiled)).toContain('nothing to deplete is not a contest');
    expect(actionTableProblem({ ...compiled, depletes: { id: 'health' } })).toContain('depletes: health names no side');
    expect(actionTableProblem({ ...compiled, depletes: { side: 'their', id: 'health' } })).toBeUndefined();
  });
});

describe('credit:', () => {
  it('reads as an ordinary result wrapper, composing with the chance wrappers', () => {
    expect(parse('credit:\n  xp: melee 4-6\n  1 in 3:\n    roll: trinket').results).toEqual([
      {
        kind: 'credit',
        results: [
          { kind: 'xp', skill: 'melee', amount: { min: 4, max: 6 } },
          { kind: 'chance', numerator: 1, denominator: 3, results: [{ kind: 'roll', table: 'trinket' }] },
        ],
      },
    ]);
  });
});
