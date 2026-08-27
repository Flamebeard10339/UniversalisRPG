import { describe, expect, it } from 'vitest';
import { loadUniverse, loadUniverseWithDiagnostics } from '../content/load';
import { initialLocalChangesModule, LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleSource } from '../content/universe';
import { newContext, runLine, type AuthoringContext, type CommandContext } from './command';
import { carriedWith, joining, placing, type Editing } from './mapEdit';
import { startSession, view } from './session';
import { shippedSources } from '../content/shipped';

const KEEP: ModuleSource = {
  name: 'keep',
  text: [
    '# info keep',
    'version: 1.0.0',
    '',
    '# location gate',
    'x: 0, y: 0',
    'starting',
    'adjacent:',
    '  yard',
    '',
    '# location yard',
    'x: 2, y: 0',
    '',
    '# location hall',
    'x: 2, y: 2',
    '',
    '# location loft',
    'up of hall',
    '',
    '# location lane',
    'x: 9, y: 9',
    '',
    '# region keep',
    'title: The Keep',
    'holds:',
    '  yard',
    '  hall',
  ].join('\n'),
};

const registryOf = (...extra: ModuleSource[]) => loadUniverse([KEEP, ...extra]);

const patched = (result: Editing): string[] => {
  if ('refused' in result) throw new Error(result.refused);
  return result.patches.map((each) => each.text);
};

const why = (result: Editing): string => {
  if (!('refused' in result)) throw new Error(`expected a refusal, got ${JSON.stringify(result.patches)}`);
  return result.refused;
};

const NOTHING = '# info local-changes\nversion: 0.0.0\npack: local\n';

describe('putting a place on the map', () => {
  it('says only where it is now, and nothing else the place says', () => {
    expect(patched(placing(registryOf(), NOTHING, 'keep.gate', { x: 4, y: -1 }))).toEqual(['# location keep.gate\nx: 4, y: -1']);
  });

  it('carries the region it belongs to, each of them by the same step', () => {
    expect(patched(placing(registryOf(), NOTHING, 'keep.yard', { x: 5, y: 1 }))).toEqual(['# location keep.yard\nx: 5, y: 1', '# location keep.hall\nx: 5, y: 3']);
  });

  it('writes no line for a place that hangs off one being carried, since it arrives on its own', () => {
    expect(patched(placing(registryOf(), NOTHING, 'keep.hall', { x: 6, y: 6 })).join('\n')).not.toContain('loft');
  });

  it('carries nothing but itself for a place no region holds', () => {
    expect(patched(placing(registryOf(), NOTHING, 'keep.lane', { x: 1, y: 1 }))).toEqual(['# location keep.lane\nx: 1, y: 1']);
  });

  it('says which floor only when the move leaves the ground one', () => {
    expect(patched(placing(registryOf(), NOTHING, 'keep.lane', { x: 1, y: 1, z: 2 }))).toEqual(['# location keep.lane\nx: 1, y: 1, z: 2']);
  });

  it('refuses to move a place written off another, and says which one to move instead', () => {
    expect(why(placing(registryOf(), NOTHING, 'keep.loft', { x: 1, y: 1 }))).toContain('keep.hall');
  });

  it('refuses a place nothing declares', () => {
    expect(why(placing(registryOf(), NOTHING, 'keep.nowhere', { x: 0, y: 0 }))).toContain('keep.nowhere');
  });

  it('folds onto the patch already staged there rather than replacing it', () => {
    const staged = `${NOTHING}\n# location keep.gate\nx: 1, y: 1\n+adjacent: lane\n`;

    expect(patched(placing(registryOf(), staged, 'keep.gate', { x: 8, y: 8 }))).toEqual(['# location keep.gate\nx: 8, y: 8\n+adjacent: lane']);
  });
});

describe('drawing a road between two places', () => {
  it('says the one road it adds, and nothing about the roads already there', () => {
    expect(patched(joining(registryOf(), NOTHING, 'keep.gate', 'keep.hall', true))).toEqual(['# location keep.gate\n+adjacent: hall']);
  });

  it('takes one away the same way', () => {
    expect(patched(joining(registryOf(), NOTHING, 'keep.gate', 'keep.yard', false))).toEqual(['# location keep.gate\n-adjacent: yard']);
  });

  it('spells the far end whole when it belongs to another module', () => {
    const other: ModuleSource = { name: 'far', text: '# info far\nversion: 1.0.0\ndependencies:\n  keep\n\n# location shore\nx: 20, y: 0' };

    expect(patched(joining(registryOf(other), NOTHING, 'keep.gate', 'far.shore', true))).toEqual(['# location keep.gate\n+adjacent: far.shore']);
  });

  it('refuses a road from a place to itself, and one to a place nothing declares', () => {
    expect(why(joining(registryOf(), NOTHING, 'keep.gate', 'keep.gate', true))).toContain('itself');
    expect(why(joining(registryOf(), NOTHING, 'keep.gate', 'keep.nowhere', true))).toContain('keep.nowhere');
  });
});

describe('everything one move carries', () => {
  const regions = () => [...registryOf().regions.values()];
  const places = () => [...registryOf().locations.values()];

  it('is the place alone where nothing is pinned to it', () => {
    expect(carriedWith(regions(), places(), 'keep.lane')).toEqual(['keep.lane']);
  });

  it('is every place of the region it belongs to', () => {
    expect(carriedWith(regions(), places(), 'keep.yard').sort()).toEqual(['keep.hall', 'keep.loft', 'keep.yard']);
  });

  it('follows the chain of places written off one another, however long', () => {
    const tower: ModuleSource = { name: 'tower', text: '# info tower\nversion: 1.0.0\ndependencies:\n  keep\n\n# location spire\nup of keep.loft' };

    expect(carriedWith([], [...loadUniverse([KEEP, tower]).locations.values()], 'keep.hall').sort()).toEqual(['keep.hall', 'keep.loft', 'tower.spire']);
  });
});

// The claim the commands answer: a line typed at the command line is the same edit the map pane
// makes with a finger, and it lands in local changes as a patch and nowhere else.
describe('the map edited from the command line', () => {
  const opened = (): { ctx: () => CommandContext; local: () => string } => {
    const baseSources = [...shippedSources()];
    const loaded = loadUniverseWithDiagnostics(baseSources);
    const session = startSession(loaded.registry);
    const authoring: AuthoringContext = {
      baseSources,
      dependencies: loaded.loadedModules,
      localSource: { name: LOCAL_CHANGES_MODULE_ID, text: initialLocalChangesModule(loaded.loadedModules) },
    };
    return { ctx: () => newContext(session, view(session), { authoring }), local: () => authoring.localSource.text };
  };

  const errors = (result: ReturnType<typeof runLine>): string[] => result.output.flatMap((out) => (out.kind === 'message' && out.tone === 'error' ? [String(out.text)] : []));

  it('takes a place named the short way, the way somebody types one', () => {
    const game = opened();

    expect(errors(runLine(game.ctx(), '/place market-square 20 20'))).toEqual([]);
    expect(game.local()).toContain('# location tulsa.market-square\nx: 20, y: 20');
  });

  it('moves the castle and every room of it, and writes nothing for the rooms above and below', () => {
    const game = opened();

    expect(errors(runLine(game.ctx(), '/place castle-hall 20 20'))).toEqual([]);
    const staged = game.local();
    for (const room of ['castle-gate', 'castle-yard', 'castle-hall', 'castle-kitchen', 'guard-barracks']) expect(staged, room).toContain(`# location tulsa.${room}`);
    for (const hung of ['castle-quarters', 'castle-solar', 'castle-cellar']) expect(staged, hung).not.toContain(`# location tulsa.${hung}`);
  });

  it('leaves the world where it was when it refuses', () => {
    const game = opened();

    expect(errors(runLine(game.ctx(), '/place castle-solar 1 1'))[0]).toContain('castle-quarters');
    expect(errors(runLine(game.ctx(), '/place nowhere-at-all 1 1'))[0]).toContain('nowhere-at-all');
    expect(game.local()).not.toContain('# location');
  });

  it('draws a road and rubs it out again, leaving the world as it started', () => {
    const game = opened();
    const roads = (): string[] => [...startSession(loadUniverseWithDiagnostics([...shippedSources(), { name: LOCAL_CHANGES_MODULE_ID, text: game.local() }]).registry).registry.roads.get('tulsa.market-square')!].map((edge) => edge.target).sort();
    const before = roads();

    expect(errors(runLine(game.ctx(), '/link market-square aggies-house'))).toEqual([]);
    expect(roads()).toContain('tulsa.aggies-house');

    expect(errors(runLine(game.ctx(), '/unlink market-square aggies-house'))).toEqual([]);
    expect(roads()).toEqual(before);
  });
});
