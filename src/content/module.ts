import { parseActionSection } from './action';
import { clusterJewelSchema } from './clusterJewel';
import { parseDialogue } from './dialogue';
import { parseDropTable } from './dropTable';
import { entitySchema } from './entity';
import { eventSchema } from './event';
import { factionSchema } from './faction';
import { flagSchema } from './flag';
import { infoSchema } from './info';
import { itemSchema } from './item';
import { parseLocaleSection } from './locale';
import type { SchemaKind } from './sectionKind';
import { locationSchema } from './location';
import { passiveSchema } from './passive';
import { DslError } from '../grammar/parser';
import { recipeSchema } from './recipe';
import { parseRemoval } from './removal';
import { resourceSchema } from './resource';
import { parseSaveSection } from './saveSection';
import { AnySchema, parseAnySection } from '../grammar/section';
import { skillSchema } from './skill';
import { slotSchema } from './slot';
import { statSchema } from './stat';
import { RawSection, sectionParser, splitSections } from '../grammar/structure';
import { parseTest } from './test';
import { variableSchema } from './variable';

// Every kind whose grammar is key/value, beside the schema that reads it.
// Total over `SCHEMA_KINDS` rather than keyed by `string`, so a kind named
// there and given no schema here does not compile.
export const SCHEMAS = {
  info: infoSchema,
  item: itemSchema,
  stat: statSchema,
  skill: skillSchema,
  slot: slotSchema,
  location: locationSchema,
  entity: entitySchema,
  event: eventSchema,
  faction: factionSchema,
  flag: flagSchema,
  recipe: recipeSchema,
  resource: resourceSchema,
  variable: variableSchema,
  passive: passiveSchema,
  'cluster-jewel': clusterJewelSchema,
} satisfies Record<SchemaKind, AnySchema>;

export type { SchemaKind };

// The runtime lookup, where a kind is whatever a module wrote and may be
// bespoke or nothing at all. The union above is for the exhaustiveness checks
// that read it; this is for asking.
export const schemaFor = (kind: string): AnySchema | undefined => (SCHEMAS as Record<string, AnySchema | undefined>)[kind];

// A few kinds have a grammar too far from key/value to fit the generic engine
// and bring their own parser. They merge on their own terms too — see mergeSection.
const BESPOKE: Record<string, (section: RawSection) => object> = {
  action: parseActionSection,
  dialogue: parseDialogue,
  droptable: parseDropTable,
  test: parseTest,
  save: parseSaveSection,
  remove: parseRemoval,
  locale: parseLocaleSection,
};

const PARSERS: Record<string, (section: RawSection) => object> = {
  ...Object.fromEntries(Object.entries(SCHEMAS).map(([kind, schema]) => [kind, sectionParser((section: RawSection) => parseAnySection(section, schema))])),
  ...BESPOKE,
};

// The table as something to ask questions of. `blocks.test.ts` asks whether
// every kind's parser answers for the blocks it was handed, which is what
// keeps that from being eight hand-written wraps nobody checks.
export const parserFor = (kind: string): ((section: RawSection) => object) | undefined => PARSERS[kind];

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
