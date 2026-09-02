import { describe, expect, it } from 'vitest';
import { loadInEnglish } from '../content/engineLocale';
import { startSession, view } from './session';

const SHEET = `
# info sheet
version: 1.0.0

# location yard
title: The Yard
starting

# stat kept
title: Kept

# stat never-shown
title: Never Shown
hidden if: always

# stat max-rage
title: Max Rage
hidden if: not changed.max-rage

# stat rage-drain
title: Rage Drain
hidden if: stat.max-rage <= 0

# passive berserker
title: Berserker
+20 max-rage

# entity player
title: You
`;

const ROUSED = SHEET.replace('title: You\n', 'title: You\npassives: berserker\n');

const shown = (source: string): string[] => view(startSession(loadInEnglish(source))).stats.map((row) => row.id);

describe('the stats a player is shown', () => {
  it('keeps one that says nothing about hiding', () => {
    expect(shown(SHEET)).toContain('sheet.kept');
  });

  it('never shows one hidden while always holds', () => {
    expect(shown(SHEET)).not.toContain('sheet.never-shown');
    expect(shown(ROUSED)).not.toContain('sheet.never-shown');
  });

  it('keeps one off the sheet until something moves it off the base it was declared with', () => {
    expect(shown(SHEET)).not.toContain('sheet.max-rage');
    expect(shown(ROUSED)).toContain('sheet.max-rage');
  });

  it('keeps one off the sheet while the stat it reads stands where it was', () => {
    expect(shown(SHEET)).not.toContain('sheet.rage-drain');
    expect(shown(ROUSED)).toContain('sheet.rage-drain');
  });
});
