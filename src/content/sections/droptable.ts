import { ActionResult, nestedResults, resultBlock, resultGrammar, resultLines } from '../../grammar/actionResult';
import { DslError } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { firstCycle } from '../cycle';
import { results } from '../refs';
import { section, writtenWhole } from './define';

export interface DropTable {
  id: string;
  results: ActionResult[];
}

export function selfRollingDropTable(dropTables: ReadonlyMap<string, DropTable>): DslError | null {
  const rolls = new Map<string, string[]>();
  const collect = (from: readonly ActionResult[], into: string[]): void => {
    for (const result of from) {
      if (result.kind === 'roll') into.push(result.table);
      for (const nested of nestedResults(result)) collect(nested, into);
    }
  };
  for (const [id, table] of dropTables) {
    const targets: string[] = [];
    collect(table.results, targets);
    rolls.set(id, targets);
  }
  const cycle = firstCycle(rolls.keys(), (id) => rolls.get(id) ?? []);
  if (!cycle) return null;
  return new DslError(`# droptable ${cycle[0]} rolls itself: ${cycle.join(' -> ')}`, undefined, { kind: 'droptable', id: cycle[0]! });
}

export const droptable = section<DropTable>()({
  says: (value) => [value.results],
  kind: 'droptable',
  ids: 'owned',
  vocabulary: 'declared',
  merge: writtenWhole,
  map: 'dropTables',
  grammar: resultGrammar(),
  parse: (raw) => {
    if (!raw.id) throw new DslError('# droptable requires an id', raw.span);
    const rows = resultBlock(raw.body);
    if (rows.length === 0) throw new DslError(`# droptable ${raw.id} is empty`, raw.span);
    return { id: raw.id, results: rows };
  },
  print: (table, { moduleId }) => [`# droptable ${moduleLocalId(moduleId, table.id)}`, ...table.results.flatMap(resultLines)],
  visit: (table, where, visit) => results(table.results, where, visit),
});
