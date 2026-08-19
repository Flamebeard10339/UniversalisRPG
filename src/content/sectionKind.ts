// The names of the section kinds the generic engine parses, and nothing else.
// It imports nothing, which is the point: `module.ts` holds the table from a
// kind to its schema and `locale.ts` holds the table from a kind to its text
// fields, and both have to be total over the same set. A set declared inside
// either table is a set the other has to reach up for, which is the cycle this
// file removes.
//
// `SCHEMAS` and `TEXT_FIELDS` are each checked against this rather than against
// each other, so a kind added here and nowhere else fails to compile twice, and
// a kind added to one table without being named here fails at the table.
export const SCHEMA_KINDS = ['info', 'item', 'stat', 'skill', 'slot', 'location', 'entity', 'event', 'faction', 'flag', 'recipe', 'resource', 'variable', 'passive', 'cluster-jewel'] as const;

export type SchemaKind = (typeof SCHEMA_KINDS)[number];
