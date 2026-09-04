import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../../src/content/engineLocale';
import { FIXTURE_WORLD } from '../../src/content/worldFixture';
import { afterAFailure, moved, tracedRun, traceLines } from './trace';

const LOOPING =
  FIXTURE_WORLD +
  `
# flag tapped

# item nothing-at-all
title: Nothing At All
examine: A thing nobody has.

# location camp
+entities: post

# entity post
title: Post
examine: A post.

tap it:
  time: 1
  set: tapped

# test taps-until-it-gives-up
until 8 times:
  use: entity.post.tap-it

# test taps-and-then-asks-for-what-is-not-there
until 8 times:
  use: entity.post.tap-it
  assert: has nothing-at-all
`;

const registry = loadInEnglish(LOOPING);

describe('what moved between two states', () => {
  it('names a value that arrived, one that changed, and one that went', () => {
    expect(moved({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual(['a gone', 'b 2 → 3', 'c 4']);
  });

  it('reaches inside a nested object rather than reporting the whole of it', () => {
    expect(moved({ xp: { fishing: 1 } }, { xp: { fishing: 9 } })).toEqual(['xp.fishing 1 → 9']);
  });

  it('leaves out what churns on its own, or every step would say the same thing', () => {
    expect(moved({ rng: 1, time: 0 }, { rng: 99, time: 1000 })).toEqual(['time 0 → 1000']);
  });
});

describe('a traced run', () => {
  it('says which pass each step of a loop ran in', () => {
    const run = tracedRun(registry, 'taps-until-it-gives-up');

    expect(run.failure).toBeNull();
    expect(run.moments.filter((moment) => moment.pass !== null).map((moment) => moment.pass)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('stops on the pass that failed, and the steps before it are still there to read', () => {
    const run = tracedRun(registry, 'taps-and-then-asks-for-what-is-not-there');

    expect(run.failure).toContain('pass 1');
    expect(run.moments.map((moment) => moment.wrote)).toEqual(['use: entity.post.tap-it', 'assert: has nothing-at-all', 'until 8 times:']);
    expect(run.moments[1]!.failure).not.toBeNull();
  });

  it('reports what each step moved, so a step that changed nothing says so', () => {
    const run = tracedRun(registry, 'taps-and-then-asks-for-what-is-not-there');

    expect(run.moments[0]!.moved).toContain('flags.tapped true');
    expect(run.moments[1]!.moved).toEqual([]);
  });

  it('says what the world was doing under a failure, since the line naming a failure names the wrong subject often enough to matter', () => {
    const said = afterAFailure(registry, 'taps-and-then-asks-for-what-is-not-there');

    expect(said.some((line) => line.includes('what the world was doing over the last'))).toBe(true);
    expect(said.some((line) => line.includes('use: entity.post.tap-it'))).toBe(true);
    expect(said.some((line) => line.includes('flags.tapped true'))).toBe(true);
  });

  it('says so rather than inventing a tail where the route walks the second time', () => {
    expect(afterAFailure(registry, 'taps-until-it-gives-up').some((line) => line.includes('depends on something this run did not repeat'))).toBe(true);
  });

  it('prints a long run as its two ends and a count of what it left out', () => {
    const many = Array.from({ length: 200 }, (_, at) => ({ at: at + 1, pass: at + 1, wrote: 'use: entity.post.tap-it', moved: [], failure: null }));

    const lines = traceLines('long', { moments: many, failure: null });

    expect(lines.join('\n')).toContain('150 step(s) not printed, between step 31 and step 180');
  });
});
