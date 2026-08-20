import {
  ActionResult,
  resultBlock,
  resultLines,
} from "../../grammar/actionResult";
import { DslError } from "../../grammar/parser";
import { moduleLocalId } from "../../grammar/section";
import { results } from "../refs";
import { section } from "./define";

// A named result list, and nothing else. Composition already layers a drop; a
// section is what lets five monsters name the same one.
export interface DropTable {
  id: string;
  results: ActionResult[];
}

export const droptable = section<DropTable>()({
  kind: "droptable",
  ids: "owned",
  map: "dropTables",
  parse: (raw) => {
    if (!raw.id) throw new DslError("# droptable requires an id", raw.span);
    const rows = resultBlock(raw.body);
    if (rows.length === 0)
      throw new DslError(`# droptable ${raw.id} is empty`, raw.span);
    return { id: raw.id, results: rows };
  },
  print: (table, { moduleId }) => [
    `# droptable ${moduleLocalId(moduleId, table.id)}`,
    ...table.results.flatMap(resultLines),
  ],
  visit: (table, where, visit) => results(table.results, where, visit),
});
