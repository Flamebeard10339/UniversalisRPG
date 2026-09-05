import { describe, expect, it } from 'vitest';
import { loadUniverseWithDiagnostics } from '../content/load';
import { actionOwnerKinds, sections } from '../content/sections';
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

const standing = (body: string): readonly string[] => {
  const sources: ModuleSource[] = [
    {
      name: 'yard',
      text: `# info yard\nversion: 0.0.1\n\n# faction world\n\n# action sweep\ntitle: Sweep the Yard\ntime: 4\non success:\n  say: The yard is clear.\n\n# location doorstep\ntitle: Doorstep\nstarting\n${body}`,
    },
  ];
  const loaded = loadUniverseWithDiagnostics(sources);
  expect(loaded.diagnostics).toEqual([]);
  return remarksOn(sources, loaded.registry).map((remark) => remark.says);
};

const aboutShadowing = (said: readonly string[]): readonly string[] => said.filter((says) => says.includes('does not reach it'));

describe('an inline action block standing under the name of a declared # action', () => {
  it('is remarked on, because the block declares a separate action rather than laying over the declaration', () => {
    expect(aboutShadowing(standing('sweep:\n  instant\n'))).toEqual([expect.stringContaining('# action yard.sweep is already declared')]);
  });

  it('says nothing about an inline block whose name no # action has taken', () => {
    expect(aboutShadowing(standing('sweep the step:\n  instant\n'))).toEqual([]);
  });

  it('says nothing where the owner reaches the declaration, which is what an # entity with uses: does', () => {
    const said = standing(
      'entities: sweeper\n\n# entity sweeper\ntitle: The Sweeper\nfaction: world\nuses: sweep\nsweep:\n  time: 2\n',
    );
    expect(aboutShadowing(said)).toEqual([]);
  });

  it('picks the owner kinds it reads off the section list, so a kind that grows action blocks next month is covered', () => {
    expect(actionOwnerKinds().length).toBeGreaterThan(1);
    expect(actionOwnerKinds()).toContain('location');
  });
});

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
