import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;

const GUIDE = 'CLAUDE.md';

const tools = Object.entries(scripts)
  .filter(([, line]) => /\btsx scripts\//.test(line))
  .map(([name]) => name);

const guide = readFileSync(GUIDE, 'utf8');

describe(`every tool ${GUIDE} could be read for is written down in it`, () => {
  it('reads the tools off package.json, so nothing below is vacuous', () => {
    expect(tools.length).toBeGreaterThan(15);
  });

  it('names each of them, so a tool added next month is not one an agent never hears of', () => {
    expect(tools.filter((name) => !guide.includes(`npm run ${name}`))).toEqual([]);
  });
});
