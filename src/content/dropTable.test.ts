import { describe, expect, it } from 'vitest';
import { ActionResult } from '../grammar/actionResult';
import { loadModule, loadUniverse } from './registry';
import { registryDiff } from './registryDiff';
import { serializeRegistryModule } from './serialize';

const load = (...lines: string[]) => () => loadModule(lines.join('\n'));

const ITEMS = ['# item bones', '# item coins', '# item gem'];

const rat = (...body: string[]) => [...ITEMS, '# entity giant-rat', 'fight:', ...body.map((line) => `  ${line}`)].join('\n');

const fightResults = (source: string): ActionResult[] => loadModule(source).entities.get('giant-rat')!.actions[0].results;

describe('the four selectors', () => {
  it('reads authored odds, and refuses the three that are not odds', () => {
    expect(fightResults(rat('1 in 5:', '  give: 1 bones'))).toEqual([{ kind: 'chance', numerator: 1, denominator: 5, results: [{ kind: 'give', item: 'bones', amount: { min: 1, max: 1 } }] }]);
    expect(load(rat('0 in 5: give: 1 bones'))).toThrow(/0 in 5 never happens/);
    expect(load(rat('6 in 5: give: 1 bones'))).toThrow(/6 in 5 is more than certain/);
    expect(load(rat('1 in 0: give: 1 bones'))).toThrow(/1 in 0 is not a chance/);
  });

  it('reads a body inline or as a block, and refuses both at once or neither', () => {
    const inline = fightResults(rat('1 in 5: give: 1 bones, say: Ha'));
    const block = fightResults(rat('1 in 5:', '  give: 1 bones', '  say: Ha'));
    expect(inline).toEqual(block);
    expect(load(rat('1 in 5: give: 1 bones', '  give: 1 coins'))).toThrow(/written inline and as a block/);
    expect(load(rat('1 in 5:', 'say: after'))).toThrow(/has an empty body/);
  });

  it('nests a wrapper inside a wrapper, which is what layering a drop is', () => {
    const results = fightResults(rat('1 in 5:', '  1 in 3:', '    give: 1 gem'));
    expect(results[0]).toMatchObject({ kind: 'chance', numerator: 1, denominator: 5, results: [{ kind: 'chance', numerator: 1, denominator: 3 }] });
  });

  it('reads a weighted pick-one, with nothing as the empty row', () => {
    const results = fightResults(rat('one of:', '  12x: nothing', '  5x: give: 20 coins', '  1x:', '    give: 1 gem', '    say: It glitters.'));
    expect(results).toEqual([
      {
        kind: 'one-of',
        rows: [
          { weight: 12, results: [] },
          { weight: 5, results: [{ kind: 'give', item: 'coins', amount: { min: 20, max: 20 } }] },
          { weight: 1, results: [{ kind: 'give', item: 'gem', amount: { min: 1, max: 1 } }, { kind: 'say', text: 'It glitters.' }] },
        ],
      },
    ]);
  });

  it('refuses a one of: that can select nothing, and a vs read as a weight', () => {
    expect(load(rat('one of:'))).toThrow(/one of: needs indented rows/);
    expect(load(rat('one of:', '  0x: give: 1 bones', '  1x: give: 1 coins'))).toThrow(/row "0x" can never be selected/);
    expect(load(rat('one of:', '  1x:'))).toThrow(/has an empty body/);
    expect(load('# stat luck\n' + rat('one of:', '  luck vs 60: give: 1 bones', '  1x: give: 1 coins'))).toThrow(/a vs contest is an independent chance, not a weight/);
  });

  it('reads a weight from a stat, so a luck stat shifts the distribution', () => {
    const results = fightResults('# stat luck\nbase: 3\n' + rat('one of:', '  12x: nothing', '  luck: give: 1 gem'));
    expect(results[0]).toMatchObject({ kind: 'one-of', rows: [{ weight: 12 }, { weight: 'luck' }] });
  });

  it('reads a contest from stats or literals on either side', () => {
    const results = fightResults('# stat luck\n# stat ward\n' + rat('luck vs ward:', '  give: 1 gem'));
    expect(results[0]).toMatchObject({ kind: 'contest', left: 'luck', right: 'ward' });
    expect(fightResults('# stat luck\n' + rat('luck vs 60: give: 1 gem'))[0]).toMatchObject({ kind: 'contest', left: 'luck', right: 60 });
  });

  it('reads a gate, and a row spells its own gate in its selector', () => {
    expect(fightResults('# flag lit\n' + rat('if lit and has bones:', '  give: 1 gem'))[0]).toMatchObject({ kind: 'gate' });
    const rows = fightResults('# flag lit\n' + rat('one of:', '  12x: nothing', '  1x if lit: give: 1 gem'));
    expect(rows[0]).toMatchObject({ kind: 'one-of', rows: [{ weight: 12 }, { weight: 1, requires: { kind: 'reference' } }] });
    expect((rows[0] as { rows: { requires?: unknown }[] }).rows[0].requires).toBeUndefined();
  });

  it('refuses a range on either side of the odds, not just the numerator', () => {
    const odds = /is odds, not a quantity, so it takes one number rather than a range/;
    expect(load(rat('1 in 5-10: give: 1 bones'))).toThrow(odds);
    expect(load(rat('1-2 in 5: give: 1 bones'))).toThrow(odds);
  });

  it('leaves prose that merely begins with a selector word alone', () => {
    // A colon is not enough to claim a line: `you must` is not a condition, and
    // a selector is only matched in its whole shape. Every line here was prose
    // before this branch and has to stay prose after it.
    const prose = ['  if only it were so simple', '  if you must: leave now', '  one of us is lying:', '  3-4 in every ten make it back.', '  1 in 5 never do.'];
    const dialogue = loadModule(['# entity miki', '# dialogue chat', 'owner = miki', 'node a:', ...prose].join('\n'));
    expect(dialogue.dialogues.get('chat')!.nodes[0].steps.map((step) => step.kind)).toEqual(prose.map(() => 'say'));
  });

  // The one collision left, kept as a load error rather than guessed at. `luck
  // vs fighting:` is a grammatically complete contest — both sides are ids, and
  // whether `fighting` is a stat is not knowable while parsing — so narrowing it
  // would mean reading the body and falling back to prose when it fails, which
  // turns a typo inside a real drop into a spoken line. Loud beats silent.
  it('reads a complete vs contest as one, even where a narrator meant prose', () => {
    expect(load('# stat luck', '# entity miki', '# dialogue chat', 'owner = miki', 'node a:', '  luck vs fighting: the old question.')).toThrow(/unrecognized action result/);
    // Without the colon it is prose again, which is the escape.
    expect(load('# stat luck', '# entity miki', '# dialogue chat', 'owner = miki', 'node a:', '  luck vs fighting is the old question.')).not.toThrow();
  });
});

describe('# droptable', () => {
  const TABLES = [
    '# droptable rare-drop',
    'one of:',
    '  128x: nothing',
    '  1x: give: 1 gem',
    '# droptable rat-common',
    'give: 1 bones',
    '1 in 3: give: 12 coins',
  ];

  const universe = (...lines: string[]) => loadModule([...ITEMS, ...TABLES, ...lines].join('\n'));

  it('is a named result list reached by roll:', () => {
    const registry = universe('# entity giant-rat', 'fight:', '  roll: rat-common', '  1 in 128:', '    roll: rare-drop');
    expect([...registry.dropTables.keys()]).toEqual(['rare-drop', 'rat-common']);
    expect(registry.dropTables.get('rat-common')!.results[0]).toEqual({ kind: 'give', item: 'bones', amount: { min: 1, max: 1 } });
    expect(registry.entities.get('giant-rat')!.actions[0].results[0]).toEqual({ kind: 'roll', table: 'rat-common' });
  });

  it('refuses an empty table, an unknown roll, and a table that reaches itself', () => {
    expect(load('# droptable empty')).toThrow(/# droptable empty is empty/);
    expect(load(...ITEMS, '# entity g', 'p:', '  roll: nowhere')).toThrow(/roll: names an unknown droptable: nowhere/);
    expect(load('# droptable a', 'roll: b', '# droptable b', 'roll: a')).toThrow(/# droptable a rolls itself: a -> b -> a/);
    expect(load(...ITEMS, '# droptable self', 'give: 1 bones', 'roll: self')).toThrow(/rolls itself/);
  });

  it('takes a removal, and goes with a member it can no longer name', () => {
    const removed = loadModule([...ITEMS, ...TABLES, '# remove droptable.rare-drop'].join('\n'));
    expect([...removed.dropTables.keys()]).toEqual(['rat-common']);
  });

  it('goes with a missing optional dependency, like every other kind', () => {
    const base = { name: 'base', text: ['# info base', 'version: 1.0.0', '# item gem'].join('\n') };
    // `?extra` never loads, so the table naming it is dropped rather than failing
    // the module — and the entity rolling that table goes with it.
    const pack = {
      name: 'pack',
      text: ['# info pack', 'version: 1.0.0', 'dependencies:', '  base', '  ?extra', '# droptable loot', 'give: 1 extra.relic', '# entity g', 'p:', '  roll: self.loot'].join('\n'),
    };
    const registry = loadUniverse([base, pack]);
    expect([...registry.dropTables.keys()]).toEqual([]);
    expect(registry.entities.get('pack.g')!.actions).toEqual([]);
  });

  it('prints an action whose only result is a wrapper as a block, not as one line', () => {
    const source = ['# info pack', 'version: 1.0.0', '# item gem', '# entity g', 'p:', '  1 in 5: give: 1 gem'].join('\n');
    const registry = loadUniverse([{ name: 'pack', text: source }]);
    const printed = serializeRegistryModule(registry, { info: { id: 'pack', version: [1, 0, 0] } });
    expect(printed).toContain('1 in 5:');
    expect(registryDiff(registry, loadUniverse([{ name: 'again', text: printed }]))).toEqual([]);
  });

  it('round-trips through serialize, wrappers and all', () => {
    const source = [
      '# info pack',
      'version: 1.0.0',
      ...ITEMS,
      '# stat luck',
      '# stat cap',
      '# skill prospecting',
      '# flag lit',
      '# resource health',
      'max: cap',
      '# droptable hoard',
      'one of:',
      '  12x: nothing',
      '  5x if lit: give: 20-30 coins',
      '  luck: give: 1 gem',
      '# droptable layered',
      'give: 1 bones',
      'xp: prospecting 4-6',
      // Both signs of a ranged pool write. A drain and a restore print through
      // one line of code, and only the restore's bounds come back out of order.
      'drain: 2-4 health',
      'restore: 3-5 health',
      '1 in 3:',
      '  luck vs 60:',
      '    roll: hoard',
      'if has bones:',
      '  say: Already.',
    ].join('\n');
    const registry = loadUniverse([{ name: 'pack', text: source }]);
    const printed = serializeRegistryModule(registry, { info: { id: 'pack', version: [1, 0, 0] } });
    expect(registryDiff(registry, loadUniverse([{ name: 'again', text: printed }]))).toEqual([]);
  });
});

describe('produced quantities carry the range they were written as', () => {
  it('takes a range where a quantity is produced', () => {
    const registry = loadModule(['# item arrow', '# skill fletching', '# stat x', '# resource health', 'max: x', '# entity bench', 'work:', '  give: 5-10 arrow', '  xp: fletching 4-6', '  drain: 2-4 health', '  restore: 3-5 health'].join('\n'));
    expect(registry.entities.get('bench')!.actions[0].results).toEqual([
      { kind: 'give', item: 'arrow', amount: { min: 5, max: 10 } },
      { kind: 'xp', skill: 'fletching', amount: { min: 4, max: 6 } },
      { kind: 'pool', resource: 'health', delta: { min: -4, max: -2 } },
      { kind: 'pool', resource: 'health', delta: { min: 3, max: 5 } },
    ]);
  });

  it('takes a range on a recipe out: and burnt:, which is the fletching case', () => {
    const recipe = loadModule(['# item log', '# item arrow', '# item ash', '# stat aim', '# recipe fletch', 'in: 1 log', 'out: 5-10 arrow', 'accuracy: aim', 'burnt: 1-2 ash'].join('\n')).recipes.get('fletch')!;
    expect(recipe.out).toEqual([{ item: 'arrow', amount: { min: 5, max: 10 } }]);
    expect(recipe.burnt).toEqual([{ item: 'ash', amount: { min: 1, max: 2 } }]);
    expect(recipe.in).toEqual([{ item: 'log', amount: 1 }]);
  });

  it('refuses a range where the number is consumed, and says which it is', () => {
    expect(load('# item x', '# entity g', 'p:', '  take: 5-10 x')).toThrow(/consumed, so it takes one number rather than a range/);
    expect(load('# item x', '# item y', '# recipe r', 'in: 2-4 x', 'out: 1 y')).toThrow(/consumed, so it takes one number rather than a range/);
    expect(load('# flag c', '# entity g', 'p:', '  add: c 1-3')).toThrow(/add: takes one signed count rather than a range/);
  });

  it('refuses a range at every threshold, and says which it is', () => {
    const threshold = /this number is a threshold, not a quantity/;
    expect(load('# item potion', '# entity g', 'p:', '  requires: has 5-10 potion', '  say: hi')).toThrow(threshold);
    expect(load('# flag c', '# entity g', 'p:', '  requires: c >= 1-3', '  say: hi')).toThrow(threshold);
    expect(load('# item x', '# item y', '# skill c', '# recipe r', 'in: 1 x', 'out: 1 y', 'skill: c 15-20')).toThrow(threshold);
    expect(load('# item x', '# entity g', 'p:', '  attempts: 3-5', '  give: 1 x')).toThrow(threshold);
  });

  it('refuses a range in a selector, where odds are not a quantity at all', () => {
    const odds = /is odds, not a quantity, so it takes one number rather than a range/;
    expect(load('# item x', '# entity g', 'p:', '  1-2 in 5: give: 1 x')).toThrow(odds);
    expect(load('# item x', '# entity g', 'p:', '  one of:', '    1-2x: give: 1 x', '    1x: give: 1 x')).toThrow(odds);
  });

  it('inverts the zero rule: a floor of zero is the point, a ceiling of zero is not', () => {
    expect(loadModule('# item straw\n# entity gull\npeck:\n  give: 0-3 straw').entities.get('gull')!.actions[0].results[0]).toEqual({ kind: 'give', item: 'straw', amount: { min: 0, max: 3 } });
    expect(load('# item straw', '# entity gull', 'peck:', '  give: 0 straw')).toThrow(/a count of 0 does nothing: straw/);
    expect(load('# item straw', '# entity gull', 'peck:', '  give: 0-0 straw')).toThrow(/a count of 0 does nothing: straw/);
    expect(load('# stat x', '# resource health', 'max: x', '# entity gull', 'peck:', '  drain: 0 health')).toThrow(/of 0 does nothing/);
  });
});
