import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleLoadStage } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { REQUIREMENTS, type RequirementId } from './openUniverse';

// The family every proof about opening is walked over, in one place because two
// of them are about the same cells: what the door reports, and what the shell
// offers to do about it. Held beside the door rather than inside a test, so
// that the test which grades the driver and the test which grades the door
// cannot drift into two families.

// The universe the family is built over: one module that loads, so that a
// second module breaking is a module breaking rather than the whole set going.
export const BASE_ID = 'base';

export const BASE: ModuleSource = {
  name: BASE_ID,
  text: ['# info base', 'version: 1.0.0', 'pack: test', '', '# location hall', 'x: 0, y: 0', 'starting', 'examine: A hall.', '', '# item rope', ''].join('\n'),
};

// One way of being broken, placed in whichever module the cell is about.
// `needs` is here because one of the stages is tripped by a header rather than
// by a body.
interface Breakage {
  needs?: readonly string[];
  body: string;
}

// A fixture per member of the loader's own stage union. `satisfies` is what
// makes the family derived rather than listed: a stage added to
// `ModuleLoadStage` leaves this object missing a key and nothing compiles until
// somebody writes the fixture. Each one is checked against the stage it claims,
// so a key that has drifted onto a different failure fails as well.
const BY_STAGE = {
  parse: { body: '# item' },
  order: { needs: ['nowhere-module'], body: '' },
  resolve: { body: '# entity gull\npeck:\n  give: missing' },
  merge: { body: '# remove item.base.rope\n\n# remove item.base.rope' },
  build: { body: '# locale en\nbase.hall.title: Hall {who}' },
  validate: { body: '# item bread\n\n# recipe bake\nstation: kiln\nout: bread' },
} satisfies Record<ModuleLoadStage, Breakage>;

// And a fixture per entry in the door's own requirements value, on the same
// terms: a requirement added to `REQUIREMENTS` has no fixture and does not
// compile. This one loads clean and leaves the merged universe with nowhere to
// begin, which is the case a label computed from control flow gets wrong.
const BY_REQUIREMENT = {
  'starting-location': { body: '# remove location.base.hall' },
} satisfies Record<RequirementId, Breakage>;

function moduleText(id: string, breakage: Breakage): string {
  const dependencies = [BASE_ID, ...(breakage.needs ?? [])];
  return [`# info ${id}`, 'version: 0.0.0', 'pack: test', 'dependencies:', ...dependencies.map((each) => `  ${each}`), '', breakage.body, ''].join('\n');
}

// What the fixture aimed at, carried by the cell so that the aim can be checked
// to have landed. A fixture keyed `merge` that in fact trips `resolve` is how a
// derived family quietly becomes a smaller one.
export type Aim = { kind: 'stage'; stage: ModuleLoadStage } | { kind: 'requirement'; id: RequirementId };

export interface OpeningCell {
  where: string;
  // The modules a driver is opened over.
  base: readonly ModuleSource[];
  // What the store holds as the local module, and empty where there is none.
  local: string;
  // The module this cell broke, which is what every assertion about attribution
  // is made against. Never read off the door.
  broke: string | null;
  // Every module the door must report a problem against. A disabled module is
  // reported against itself; an unmet requirement is a property of the merged
  // universe and is reported against every module that built it.
  names: readonly string[];
  aim: Aim;
}

// The two places a breakage can sit: in a module beside the base, or in the
// local-changes module laid over it.
const PLACEMENTS = ['base', 'local'] as const;

function cellsFor(aim: Aim, breakage: Breakage): OpeningCell[] {
  return PLACEMENTS.map((at) => {
    const id = at === 'local' ? LOCAL_CHANGES_MODULE_ID : 'broken';
    const text = moduleText(id, breakage);
    return {
      where: `${aim.kind === 'stage' ? aim.stage : aim.id} in the ${at}`,
      base: at === 'local' ? [BASE] : [BASE, { name: id, text }],
      local: at === 'local' ? text : '',
      broke: id,
      // A stage disables the module it names and the rest of the universe
      // stands; an unmet requirement is against everything that loaded, which
      // here is the base and the module the fixture broke, since a module that
      // trips no stage loads.
      names: aim.kind === 'stage' ? [id] : [BASE_ID, id],
      aim,
    };
  });
}

export const OPENING_CELLS: readonly OpeningCell[] = [
  ...Object.entries(BY_STAGE).flatMap(([stage, breakage]) => cellsFor({ kind: 'stage', stage: stage as ModuleLoadStage }, breakage)),
  ...Object.entries(BY_REQUIREMENT).flatMap(([id, breakage]) => cellsFor({ kind: 'requirement', id: id as RequirementId }, breakage)),
  // And the set with nothing in it, which trips no stage and meets no
  // requirement because there is nothing there to meet one.
  { where: 'nothing at all', base: [], local: '', broke: null, names: [], aim: { kind: 'requirement', id: REQUIREMENTS[0].id } },
];

// How many cells the two spines and the two placements come to, stated as the
// arithmetic rather than as a number, so that a spine growing moves it.
export const CELL_COUNT = (Object.keys(BY_STAGE).length + Object.keys(BY_REQUIREMENT).length) * PLACEMENTS.length + 1;

export const sourcesOf = (cell: { base: readonly ModuleSource[]; local: string }): readonly ModuleSource[] =>
  cell.local === '' ? cell.base : [...cell.base, { name: LOCAL_CHANGES_MODULE_ID, text: cell.local }];
