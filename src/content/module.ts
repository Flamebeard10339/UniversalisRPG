import { parseActionSection } from './action';
import { parseDialogue } from './dialogue';
import { parseDropTable } from './dropTable';
import { entitySchema } from './entity';
import { eventSchema } from './event';
import { factionSchema } from './faction';
import { flagSchema } from './flag';
import { infoSchema } from './info';
import { itemSchema } from './item';
import { locationSchema } from './location';
import { DslError } from '../grammar/parser';
import { recipeSchema } from './recipe';
import { parseRemoval } from './removal';
import { resourceSchema } from './resource';
import { parseSaveSection } from './saveSection';
import { AnySchema, parseAnySection } from '../grammar/section';
import { skillSchema } from './skill';
import { statSchema } from './stat';
import { RawSection, splitSections } from '../grammar/structure';
import { parseTest } from './test';
import { variableSchema } from './variable';

export const SCHEMAS: Record<string, AnySchema> = {
  info: infoSchema,
  item: itemSchema,
  stat: statSchema,
  skill: skillSchema,
  location: locationSchema,
  entity: entitySchema,
  event: eventSchema,
  faction: factionSchema,
  flag: flagSchema,
  recipe: recipeSchema,
  resource: resourceSchema,
  variable: variableSchema,
};

// A few kinds have a grammar too far from key/value to fit the generic engine
// and bring their own parser. They merge on their own terms too — see mergeSection.
const BESPOKE: Record<string, (section: RawSection) => object> = {
  action: parseActionSection,
  dialogue: parseDialogue,
  droptable: parseDropTable,
  test: parseTest,
  save: parseSaveSection,
  remove: parseRemoval,
};

const PARSERS: Record<string, (section: RawSection) => object> = {
  ...Object.fromEntries(Object.entries(SCHEMAS).map(([kind, schema]) => [kind, (section: RawSection) => parseAnySection(section, schema)])),
  ...BESPOKE,
};

export const SECTION_KINDS: readonly string[] = Object.keys(PARSERS);

export interface ModuleSection {
  kind: string;
  value: object;
}

export function parseModule(source: string): ModuleSection[] {
  return splitSections(source).map((section) => {
    const parse = PARSERS[section.kind];
    if (!parse) throw new DslError(`unknown section kind: ${section.kind}`, section.span);
    return { kind: section.kind, value: parse(section) };
  });
}
