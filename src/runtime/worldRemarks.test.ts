import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { sections } from '../content/sections';
import type { ModuleSource } from '../content/universe';
import { remarksOn } from './worldRemarks';

const world = (body: string): readonly string[] => {
  const sources: ModuleSource[] = [
    {
      name: 'till',
      text: `# info till\nversion: 0.0.1\n\n# location doorstep\ntitle: Doorstep\nstarting\n\n# item penny\ntitle: Penny\n\n# item bun\ntitle: Bun\nvalue: 3\n\n# shop till\ncoin: penny\n${body}stocks: bun\n`,
    },
  ];
  const loaded = loadUniverseWithDiagnostics(sources);
  expect(loaded.diagnostics).toEqual([]);
  return remarksOn(sources, loaded.registry).map((remark) => remark.says);
};

const aboutDefaults = (said: readonly string[]): readonly string[] => said.filter((says) => says.includes('reads when it is left out'));

describe('a line that says what leaving it out would say', () => {
  it('is a fact worth checking at all, since some field somewhere declares a default it prints nothing for', () => {
    const declared = sections().flatMap((section) =>
      Object.entries(section.schema?.fields ?? {}).filter(([, spec]) => spec.printed === 'unless-default' && spec.default !== undefined),
    );
    expect(declared.length).toBeGreaterThan(0);
  });

  it('draws a remark naming the keyword, so an author is told which line said nothing', () => {
    expect(aboutDefaults(world('replenish: 1m\n'))).toEqual([expect.stringContaining('writes replenish: 1m')]);
  });

  it('says nothing about the same line written with a value the default is not', () => {
    expect(aboutDefaults(world('replenish: 45s\n'))).toEqual([]);
  });

  it('says nothing about a body that leaves the line out, which is the shape it is asking for', () => {
    expect(aboutDefaults(world(''))).toEqual([]);
  });

  it('reads each field of each kind separately, so one line standing in for two defaults draws two', () => {
    expect(aboutDefaults(world('replenish: 1m\nbuying: 1.2\n'))).toHaveLength(2);
  });
});
