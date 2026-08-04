import { ActionResult, resultBlock } from '../grammar/actionResult';
import { DslError } from '../grammar/parser';
import { RawSection } from '../grammar/structure';

// A named result list, and nothing else. Composition already layers a drop; a
// section is what lets five monsters name the same one.
export interface DropTable {
  id: string;
  results: ActionResult[];
}

export function parseDropTable(section: RawSection): DropTable {
  if (!section.id) throw new DslError('# droptable requires an id', section.span);
  const results = resultBlock(section.body);
  if (results.length === 0) throw new DslError(`# droptable ${section.id} is empty`, section.span);
  return { id: section.id, results };
}
