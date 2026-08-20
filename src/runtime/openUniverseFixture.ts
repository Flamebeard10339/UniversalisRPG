import { LOCAL_CHANGES_MODULE_ID } from '../content/localChanges';
import type { ModuleLoadStage } from '../content/registry';
import type { ModuleSource } from '../content/universe';
import { REQUIREMENTS, type RequirementId } from './openUniverse';

export const BASE_ID = 'base';

export const BASE: ModuleSource = {
  name: BASE_ID,
  text: ['# info base', 'version: 1.0.0', 'pack: test', '', '# location hall', 'x: 0, y: 0', 'starting', 'examine: A hall.', '', '# item rope', ''].join('\n'),
};

interface Breakage {
  needs?: readonly string[];
  body: string;
}

const BY_STAGE = {
  parse: { body: '# item' },
  order: { needs: ['nowhere-module'], body: '' },
  resolve: { body: '# entity gull\npeck:\n  give: missing' },
  merge: { body: '# remove item.base.rope\n\n# remove item.base.rope' },
  build: { body: '# locale en\nbase.hall.title: Hall {who}' },
  validate: { body: '# item bread\n\n# recipe bake\nstation: kiln\nout: bread' },
} satisfies Record<ModuleLoadStage, Breakage>;

const BY_REQUIREMENT = {
  'starting-location': { body: '# remove location.base.hall' },
} satisfies Record<RequirementId, Breakage>;

function moduleText(id: string, breakage: Breakage): string {
  const dependencies = [BASE_ID, ...(breakage.needs ?? [])];
  return [`# info ${id}`, 'version: 0.0.0', 'pack: test', 'dependencies:', ...dependencies.map((each) => `  ${each}`), '', breakage.body, ''].join('\n');
}

export type Aim = { kind: 'stage'; stage: ModuleLoadStage } | { kind: 'requirement'; id: RequirementId };

const HEALTHY_LOCAL = moduleText(LOCAL_CHANGES_MODULE_ID, { body: '# item lamp' });

export interface OpeningCell {
  where: string;
  base: readonly ModuleSource[];
  local: string;
  broke: string | null;
  names: readonly string[];
  aim: Aim;
}

const PLACEMENTS = ['base', 'local'] as const;

function cellsFor(aim: Aim, breakage: Breakage): OpeningCell[] {
  return PLACEMENTS.map((at) => {
    const id = at === 'local' ? LOCAL_CHANGES_MODULE_ID : 'broken';
    const text = moduleText(id, breakage);
    return {
      where: `${aim.kind === 'stage' ? aim.stage : aim.id} in the ${at}`,
      base: at === 'local' ? [BASE] : [BASE, { name: id, text }],
      local: at === 'local' ? text : HEALTHY_LOCAL,
      broke: id,
      names: aim.kind === 'stage' ? [id] : [],
      aim,
    };
  });
}

export const OPENING_CELLS: readonly OpeningCell[] = [
  ...Object.entries(BY_STAGE).flatMap(([stage, breakage]) => cellsFor({ kind: 'stage', stage: stage as ModuleLoadStage }, breakage)),
  ...Object.entries(BY_REQUIREMENT).flatMap(([id, breakage]) => cellsFor({ kind: 'requirement', id: id as RequirementId }, breakage)),
  { where: 'nothing at all', base: [], local: '', broke: null, names: [], aim: { kind: 'requirement', id: REQUIREMENTS[0].id } },
];

export const CELL_COUNT = (Object.keys(BY_STAGE).length + Object.keys(BY_REQUIREMENT).length) * PLACEMENTS.length + 1;

export const clearingReaches = (cell: OpeningCell): boolean => cell.broke === LOCAL_CHANGES_MODULE_ID;

export const sourcesOf = (cell: { base: readonly ModuleSource[]; local: string }): readonly ModuleSource[] =>
  cell.local === '' ? cell.base : [...cell.base, { name: LOCAL_CHANGES_MODULE_ID, text: cell.local }];
