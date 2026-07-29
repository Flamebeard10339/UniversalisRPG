import { parseDialogue } from './dialogue';
import { entitySchema } from './entity';
import { infoSchema } from './info';
import { itemSchema } from './item';
import { locationSchema } from './location';
import { DslError } from '../grammar/parser';
import { recipeSchema } from './recipe';
import { resourceSchema } from './resource';
import { parseSaveSection } from './saveSection';
import { parseSection } from '../grammar/section';
import { skillSchema } from './skill';
import { statSchema } from './stat';
import { RawSection, splitSections } from '../grammar/structure';
import { parseTest } from './test';
import { variableSchema } from './variable';

// Most kinds are a SectionSchema walked by the generic engine; a few (dialogue)
// have a grammar too far from key/value to fit it and bring their own parser.
const PARSERS: Record<string, (section: RawSection) => object> = {
  info: (section) => parseSection(section, infoSchema),
  item: (section) => parseSection(section, itemSchema),
  stat: (section) => parseSection(section, statSchema),
  skill: (section) => parseSection(section, skillSchema),
  location: (section) => parseSection(section, locationSchema),
  entity: (section) => parseSection(section, entitySchema),
  recipe: (section) => parseSection(section, recipeSchema),
  resource: (section) => parseSection(section, resourceSchema),
  variable: (section) => parseSection(section, variableSchema),
  dialogue: parseDialogue,
  test: parseTest,
  save: parseSaveSection,
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
