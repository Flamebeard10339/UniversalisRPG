import { describe, expect, it } from 'vitest';
import { kindTablesIn, report, type KindTable } from './lib/sectionKind';
import { programOverSource, repoRoot } from './lib/shippedProgram';
import { SECTION_KINDS } from '../src/content/module';

// The rule's own subjects are the kinds the spine declares, so the fixtures
// below borrow real ones rather than inventing names the rule would ignore.
const [FIRST, SECOND] = SECTION_KINDS;

const FIXTURE = `${repoRoot}/section-kind-fixture.ts`;

const analysed = (source: string): KindTable[] => kindTablesIn(programOverSource(FIXTURE, source), SECTION_KINDS, (relative) => relative === 'section-kind-fixture.ts');

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

  it('names every kind the spine declares in what it reports', () => {
    expect(report([]).join('\n')).toContain(SECTION_KINDS.join(', '));
    expect(report([]).join('\n')).toContain(`${SECTION_KINDS.length} section kinds`);
  });
});
