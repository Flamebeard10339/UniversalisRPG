import ts from 'typescript';
import { SECTION_KINDS } from '../../src/content/module';
import { programOverShippedModules, relativeTo, repoRoot } from './shippedProgram';

// A declaration that answers a question about section kinds. Its subjects are
// derived from the spine rather than named here, so a per-kind list written
// next month is one of these without an edit.
export interface KindTable {
  where: string;
  name: string;
  shape: 'list' | 'table';
  kinds: string[];
  why: string;
}

// More than one kind is what makes a declaration a table rather than a mention
// of one: `['entity', 'location', 'item']` answers a question about kinds and
// `['location']` names a location.
const TABLE = 2;

function stringsUnder(node: ts.ArrayLiteralExpression): string[] {
  const found: string[] = [];
  for (const element of node.elements) {
    if (ts.isStringLiteral(element)) found.push(element.text);
    // A list of pairs answers a question about its first column, which is
    // where `CONTENT_SECTION_MAPS` keeps its kinds.
    else if (ts.isArrayLiteralExpression(element)) for (const inner of element.elements) if (ts.isStringLiteral(inner)) found.push(inner.text);
  }
  return found;
}

function keysOf(node: ts.ObjectLiteralExpression): string[] {
  return node.properties.flatMap((property) => {
    const name = property.name;
    if (name === undefined) return [];
    return ts.isIdentifier(name) || ts.isStringLiteral(name) ? [name.text] : [];
  });
}

// A table whose type carries a string index signature answers for whichever
// keys somebody wrote, which is the shape a kind can be added behind. One keyed
// by a union of kinds stops compiling until the new kind has an answer, and
// that is the whole difference the rule is about.
const keyedByAnyString = (checker: ts.TypeChecker, node: ts.Node): boolean => checker.getIndexInfoOfType(checker.getTypeAtLocation(node), ts.IndexKind.String) !== undefined;

// `as const` and `satisfies` wrap the literal without changing what it holds,
// and a rule that read only the bare form would miss whichever declarations
// happen to carry one.
const literal = (node: ts.Expression): ts.Expression => (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) ? literal(node.expression) : node);

export function kindTablesIn(
  program: ts.Program,
  kinds: readonly string[] = SECTION_KINDS,
  include: (relative: string) => boolean = (relative) => /^(src|scripts)\//.test(relative),
  root: string = repoRoot,
): KindTable[] {
  const checker = program.getTypeChecker();
  const set = new Set<string>(kinds);
  const found: KindTable[] = [];
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    const relative = relativeTo(root, file.fileName);
    if (!include(relative)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined && ts.isIdentifier(node.name)) {
        const at = { where: `${relative}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`, name: node.name.text };
        const initializer = literal(node.initializer);
        if (ts.isArrayLiteralExpression(initializer)) {
          const named = stringsUnder(initializer).filter((each) => set.has(each));
          if (named.length >= TABLE) found.push({ ...at, shape: 'list', kinds: named, why: 'a per-kind fact held as a list, which no kind added later has to appear in' });
        }
        else if (ts.isObjectLiteralExpression(initializer)) {
          const named = keysOf(initializer).filter((each) => set.has(each));
          if (named.length >= TABLE && keyedByAnyString(checker, node.name)) {
            found.push({ ...at, shape: 'table', kinds: named, why: 'a per-kind table typed by `string`, which a kind added later can be missing from' });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return found;
}

export const untotalledKindTables = (): KindTable[] => kindTablesIn(programOverShippedModules());

export function report(tables: readonly KindTable[], kinds: readonly string[] = SECTION_KINDS): string[] {
  const lines = [`${kinds.length} section kinds, derived from the parser table: ${[...kinds].join(', ')}`, ''];
  if (tables.length === 0) return [...lines, 'Every question about a kind is a field of the row.'];
  lines.push(`${tables.length} declaration(s) answer a question about a section kind from somewhere other than the row:`, '');
  for (const table of tables) lines.push(`  ${table.where}  ${table.name} (${table.kinds.length} of ${kinds.length})`, `    ${table.why}`);
  return lines;
}
