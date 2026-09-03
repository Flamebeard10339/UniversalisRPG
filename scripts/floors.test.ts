import { describe, expect, it } from 'vitest';
import { fixtureSources } from '../src/content/worldFixture';
import { loadUniverse } from '../src/content/load';
import { withEngineLocale } from '../src/content/engineLocale';
import { minutesToReach } from './lib/pace';
import { floorLines, goalOf } from './floors';

const floor = (tests: string): { name: string; text: string } => ({ name: 'town-floor', text: `# info town-floor\nversion: 1\ndependencies:\n  core\n  fixture-town\n\n${tests}` });

const DIGS_TO_TWO = ['# test dig-to-2', 'goto: green', 'until level.digging >= 2:', '  use: location.green.dig until done', 'assert: level.digging >= 2'].join('\n');

describe('the floors sheet', () => {
  it('reads a route\'s goal off its own closing assert, qualified the way the world names the skill', () => {
    const registry = loadUniverse(withEngineLocale([...fixtureSources(), floor(DIGS_TO_TWO)]));
    expect(goalOf(registry, 'town-floor.dig-to-2')).toEqual({ skill: 'core.digging', level: 2 });
  });

  it('walks a floor and stands its minutes beside what the curve asks for the level it reached', () => {
    const { lines, ok } = floorLines([...fixtureSources(), floor(DIGS_TO_TWO)], ['town-floor']);
    expect(ok).toBe(true);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^town-floor\.dig-to-2: core\.digging 2 in [0-9.]+ game-minutes; the curve asks /);
    expect(lines[0]).toContain(minutesToReach(2).toFixed(1));
  });

  it('goes red on a route that no longer walks, and says why in the engine\'s words', () => {
    const { lines, ok } = floorLines([...fixtureSources(), floor(['# test never', 'assert: level.digging >= 2'].join('\n'))], ['town-floor']);
    expect(ok).toBe(false);
    expect(lines[0]).toMatch(/^town-floor\.never: FAILED — /);
  });

  it('walks a route that names no goal and says it stands beside no curve', () => {
    const { lines, ok } = floorLines([...fixtureSources(), floor(['# test just-dig', 'goto: green', 'use: location.green.dig until done'].join('\n'))], ['town-floor']);
    expect(ok).toBe(true);
    expect(lines[0]).toMatch(/^town-floor\.just-dig: walked in [0-9.]+ game-minutes, and closes on no assert/);
  });

  it('reads only the modules named as floors, so a corpus test is never a floor by standing in the same world', () => {
    const { lines } = floorLines([...fixtureSources(), floor(DIGS_TO_TWO)], []);
    expect(lines).toEqual(['no # test stands under any floor module']);
  });
});
