import { DslError } from './codec';
import { entitySchema } from './entity';
import { itemSchema } from './item';
import { locationSchema } from './location';
import { Authored, SectionSchema, parseSection, printSection } from './section';
import { skillSchema } from './skill';
import { statSchema } from './stat';
import { splitSections } from './structure';

const SCHEMAS = [itemSchema, statSchema, skillSchema, locationSchema, entitySchema] as unknown as SectionSchema<{ id: string }>[];
const byKind = new Map(SCHEMAS.map((schema) => [schema.kind, schema]));

export interface ModuleSection {
  kind: string;
  value: Authored<{ id: string }>;
}

export function parseModule(source: string): ModuleSection[] {
  return splitSections(source).map((section) => {
    const schema = byKind.get(section.kind);
    if (!schema) throw new DslError(`unknown section kind: ${section.kind}`, section.span);
    return { kind: section.kind, value: parseSection(section, schema) };
  });
}

export function printModule(sections: ModuleSection[]): string {
  return sections
    .map(({ kind, value }) => {
      const schema = byKind.get(kind);
      if (!schema) throw new DslError(`unknown section kind: ${kind}`);
      return printSection(value, schema);
    })
    .join('\n\n');
}
