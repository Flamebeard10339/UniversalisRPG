import { parseDialogue } from './dialogue';
import { entitySchema } from './entity';
import { itemSchema } from './item';
import { locationSchema } from './location';
import { DslError } from './parser';
import { parseSection } from './section';
import { skillSchema } from './skill';
import { statSchema } from './stat';
import { RawSection, splitSections } from './structure';
import { parseTest } from './test';

// Most kinds are a SectionSchema walked by the generic engine; a few (dialogue)
// have a grammar too far from key/value to fit it and bring their own parser.
const PARSERS: Record<string, (section: RawSection) => object> = {
  item: (section) => parseSection(section, itemSchema),
  stat: (section) => parseSection(section, statSchema),
  skill: (section) => parseSection(section, skillSchema),
  location: (section) => parseSection(section, locationSchema),
  entity: (section) => parseSection(section, entitySchema),
  dialogue: parseDialogue,
  test: parseTest,
};

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
