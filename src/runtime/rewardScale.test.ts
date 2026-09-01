import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { FIXTURE_WORLD } from '../content/worldFixture';
import { beginAction, startSession, view } from './session';

const world = (luck: number, ...lines: string[]): string =>
  [
    FIXTURE_WORLD,
    '# stat luck',
    `base: ${luck}`,
    '',
    '# skill scavenging',
    'title: Scavenging',
    'stat: luck',
    '',
    '# item coin',
    'examine: Small and worn.',
    '',
    '# item gem',
    'examine: It catches the light.',
    '',
    '# location camp',
    'entities:',
    '  heap',
    '',
    '# entity heap',
    'examine: Somebody threw this out.',
    ...lines,
  ].join('\n');

const sifted = (luck: number, ...body: string[]) => {
  const session = startSession(loadInEnglish(world(luck, ...body)));
  beginAction(session, 'use:entity.heap.examine');
  beginAction(session, 'use:entity.heap.sift');
  return view(session);
};

describe('# action rewards scaled by:', () => {
  it('pays what the lines say while the stat it names reads nothing', () => {
    expect(sifted(0, 'sift:', '  instant', '  give: 4 coin', '  rewards scaled by: luck').inventory.coin).toBe(4);
  });

  it('pays twice over at 100, which is the percentage the stat is read as', () => {
    expect(sifted(100, 'sift:', '  instant', '  give: 4 coin', '  rewards scaled by: luck').inventory.coin).toBe(8);
  });

  it('rounds down rather than handing over a fraction of a thing', () => {
    expect(sifted(50, 'sift:', '  instant', '  give: 3 coin', '  rewards scaled by: luck').inventory.coin).toBe(4);
  });

  it('leaves an action naming no stat paying what it says, however high that stat stands', () => {
    expect(sifted(100, 'sift:', '  instant', '  give: 4 coin').inventory.coin).toBe(4);
  });

  it('reaches an amount written inside a table it rolls, which the table never names the stat to get', () => {
    const table = ['sift:', '  instant', '  roll: pickings', '  rewards scaled by: luck', '', '# droptable pickings', 'give: 5 coin'];

    expect(sifted(0, ...table).inventory.coin).toBe(5);
    expect(sifted(100, ...table).inventory.coin).toBe(10);
  });

  it('reaches the xp a skill is given, so a world weighing that instead names the stat that does and writes nothing else', () => {
    expect(sifted(100, 'sift:', '  instant', '  xp: scavenging 10', '  rewards scaled by: luck').xp.find((row) => row.id === 'scavenging')!.earned).toBe(20);
  });

  it('leaves what an action takes alone, because a cost is not a reward', () => {
    const session = startSession(loadInEnglish(world(100, 'stock:', '  instant', '  give: 4 gem', 'sift:', '  instant', '  take: 1 gem', '  give: 4 coin', '  rewards scaled by: luck')));
    beginAction(session, 'use:entity.heap.examine');
    beginAction(session, 'use:entity.heap.stock');
    beginAction(session, 'use:entity.heap.sift');
    const held = view(session).inventory;

    expect(held.coin).toBe(8);
    expect(held.gem).toBe(3);
  });
});
