import { ActionResult, resultBlock, resultGrammar, resultLines } from '../../grammar/actionResult';
import { DslError } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { results } from '../refs';
import { section, writtenWhole } from './define';

export interface DropTable {
  id: string;
  results: ActionResult[];
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
