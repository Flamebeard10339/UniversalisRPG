import { describe, expect, it } from 'vitest';
import { kindTablesIn, report, untotalledKindTables, type KindTable } from './lib/sectionKind';
import { programOverShippedModules, programOverSource, repoRoot, semanticErrors } from './lib/shippedProgram';
import { consumersIn } from './lib/exhaustive';
import { readFileSync } from 'node:fs';
import { SECTION_KIND, SECTION_KINDS } from '../src/content/sectionKind';

// The rule's own subjects are the kinds the spine declares, so the fixtures
// below borrow real ones rather than inventing names the rule would ignore.
const [FIRST, SECOND] = SECTION_KINDS;

const FIXTURE = `${repoRoot}/section-kind-fixture.ts`;

const analysed = (source: string): KindTable[] => kindTablesIn(programOverSource(FIXTURE, source), SECTION_KINDS, (relative) => relative === 'section-kind-fixture.ts').tables;

describe('a question about a section kind is asked of the row', () => {
  it('reads a list of kinds as a fact held beside the row', () => {
    const [found, ...rest] = analysed(`export const KINDS = ['${FIRST}', '${SECOND}'] as const;`);
    expect(rest).toEqual([]);
    expect(found.name).toBe('KINDS');
    expect(found.shape).toBe('list');
    expect(found.kinds).toEqual([FIRST, SECOND]);
  });

  // The shape `CONTENT_SECTION_MAPS` was in. A list of pairs answers about its
  // first column, and reading only the outer elements would have found nothing.
  it('reads a list of pairs led by a kind as the same fact', () => {
    expect(analysed(`export const MAPS = [['${FIRST}', 'firsts'], ['${SECOND}', 'seconds']];`).map((each) => each.kinds)).toEqual([[FIRST, SECOND]]);
  });

  // The shape `BESPOKE` was in. The keys are kinds and the type answers for
  // whichever ones somebody wrote, so a kind added later is missing in silence.
  it('reads a table typed by string as one a kind can be added behind', () => {
    const [found] = analysed(`export const BY_KIND: Record<string, number> = { '${FIRST}': 1, '${SECOND}': 2 };`);
    expect(found.shape).toBe('table');
    expect(found.kinds).toEqual([FIRST, SECOND]);
  });

  it('reads a table keyed by the kinds it answers for as needing nothing', () => {
    const total = SECTION_KINDS.map((kind) => `'${kind}': 1`).join(', ');
    expect(analysed(`type Kind = ${SECTION_KINDS.map((kind) => `'${kind}'`).join(' | ')};\nexport const ROW: Record<Kind, number> = { ${total} };`)).toEqual([]);
  });

  // One kind is a mention of that kind; two is a table about kinds. Without
  // this the rule would report every line that names a section by name.
  it('reads a single kind as a mention rather than a table', () => {
    expect(analysed(`export const ONE = ['${FIRST}'];`)).toEqual([]);
    expect(analysed(`export const OTHER = ['not-a-kind', 'nor-this'];`)).toEqual([]);
  });

  it('names every kind the row declares in what it reports, and how much it read', () => {
    expect(report([], 4).join('\n')).toContain(SECTION_KINDS.join(', '));
    expect(report([], 4).join('\n')).toContain(`${SECTION_KINDS.length} section kinds`);
    expect(report([], 4).join('\n')).toContain('4 declaration(s) read');
  });
});

describe('the tree has no per-kind fact outside the row', () => {
  // c1, as an assertion rather than the report it landed as. `npm run
  // section-kinds` prints the same derivation for a reader; this is the gate.
  const found = untotalledKindTables();

  it('finds no list of kinds and no table a kind can be added behind', () => {
    expect(found.tables.map((table) => `${table.where} ${table.name}: ${table.why}`)).toEqual([]);
  });

  // Absence is worth what the instrument is worth. A walk that stopped reaching
  // the tree reports exactly what a clean tree reports, so the instrument is
  // made to fail for the reason intended: a list of kinds is put into a real
  // file of the layer the row lives in, and the walk has to come back naming it
  // and nothing else.
  it('reports a list of kinds seeded into the tree, and only that one', () => {
    const row = 'src/content/sectionKind.ts';
    const seeded = [readFileSync(row, 'utf8'), `export const A_LIST_BESIDE_THE_ROW = ['${SECTION_KINDS[0]}', '${SECTION_KINDS[1]}'];`, ''].join('\n');
    const walked = kindTablesIn(programOverShippedModules({ [row]: seeded }));
    expect(walked.tables.map((table) => table.name)).toEqual(['A_LIST_BESIDE_THE_ROW']);
    expect(walked.examined).toBeGreaterThan(found.examined);
  });

  it('read the tree it reported nothing about', () => {
    expect(found.examined).toBeGreaterThan(200);
    expect(SECTION_KINDS.length).toBeGreaterThan(15);
    expect(Object.keys(SECTION_KIND).sort()).toEqual([...SECTION_KINDS].sort());
  });
});

// The row's promise, asked of the compiler rather than asserted about it: add a
// kind, and every question a kind has to answer stops compiling until it is
// answered. This is c2, c3 and c4 read as one claim, over the real tree — a
// fixture reproducing the row's shape would prove the shape and say nothing
// about whether this repository is built out of it.
describe('a kind added to the row is answered everywhere or does not compile', () => {
  const ROW = 'src/content/sectionKind.ts';
  const ADDED = 'a-kind-nobody-answered-for';

  // Both halves of the parser table, because the row partitions the kinds into
  // the ones a schema reads and the ones a bespoke parser reads, and each half
  // is checked against its own half of the row. A test that added only one sort
  // of kind would leave the other half's check unable to fail.
  const errorsWith = (schema: boolean): string[] => {
    const source = readFileSync(ROW, 'utf8');
    const anchor = '} as const satisfies Record<string, SectionKindRow>;';
    expect(source).toContain(anchor);
    const added = `  '${ADDED}': { ids: 'owned', map: 'items', schema: ${schema}, nestsActions: false },\n${anchor}`;
    return semanticErrors(programOverShippedModules({ [ROW]: source.replace(anchor, added) }));
  };

  // The subjects are read off the tree rather than named here: every switch the
  // exhaustiveness rule already sees over a parsed section is a pass that has to
  // refuse the new kind, so a fourth pass written next month is one of these
  // with no edit.
  const passesOverSections = [...new Set(consumersIn(programOverShippedModules()).filter((consumer) => consumer.union === 'ModuleSection').map((consumer) => consumer.where.split(':')[0]))];

  it('has the tree compiling before the kind is added', () => {
    expect(semanticErrors(programOverShippedModules())).toEqual([]);
  });

  it.each([true, false])('refuses a kind with schema: %s at the parser table, which has none for it', (schema) => {
    expect(errorsWith(schema).filter((error) => error.startsWith('src/content/module.ts:'))).not.toEqual([]);
  });

  it.each([true, false])('refuses a kind with schema: %s at every pass over a parsed section', (schema) => {
    const errors = errorsWith(schema);
    expect(passesOverSections.length).toBeGreaterThanOrEqual(3);
    expect(passesOverSections.filter((file) => !errors.some((error) => error.startsWith(`${file}:`)))).toEqual([]);
  });
});
