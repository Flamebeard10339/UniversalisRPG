import { parseActionSection } from './action';
import type { ModuleSection, SchemaKind, SectionKind } from './sectionKind';
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

// Every kind whose grammar is key/value, beside the schema that reads it. Total
// over the kinds the row says have a schema, so a kind answering `schema: true`
// and given none here does not compile, and neither does the reverse.
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

// The runtime lookup, where a kind is whatever a module wrote and may be
// bespoke or nothing at all. The union above is for the exhaustiveness checks
// that read it; this is for asking.
export const schemaFor = (kind: string): AnySchema | undefined => (SCHEMAS as Record<string, AnySchema | undefined>)[kind];

type SectionParser = (section: RawSection) => object;

// A few kinds have a grammar too far from key/value to fit the generic engine
// and bring their own parser. They merge on their own terms too — see mergeSection.
const BESPOKE = {
  action: parseActionSection,
  dialogue: parseDialogue,
  droptable: parseDropTable,
  test: parseTest,
  save: parseSaveSection,
  remove: parseRemoval,
  locale: parseLocaleSection,
} satisfies Record<Exclude<SectionKind, SchemaKind>, SectionParser>;

const SCHEMA_PARSERS = Object.fromEntries(Object.entries(SCHEMAS).map(([kind, schema]) => [kind, sectionParser((section: RawSection) => parseAnySection(section, schema))])) as Record<SchemaKind, SectionParser>;

const PARSERS = { ...SCHEMA_PARSERS, ...BESPOKE } satisfies Record<SectionKind, SectionParser>;

// The table as something to ask questions of. `blocks.test.ts` asks whether
// every kind's parser answers for the blocks it was handed, which is what
// keeps that from being eight hand-written wraps nobody checks.
export const parserFor = (kind: string): SectionParser | undefined => (PARSERS as Record<string, SectionParser | undefined>)[kind];

export type { ModuleSection, SchemaKind, SectionKind };

export function parseModule(source: string): ModuleSection[] {
  return splitSections(source).map((section) => {
    const parse = parserFor(section.kind);
    if (!parse) throw new DslError(`unknown section kind: ${section.kind}`, section.span);
    return { kind: section.kind, value: parse(section) } as ModuleSection;
  });
}
