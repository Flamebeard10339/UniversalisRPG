import ts from 'typescript';
import { relativeTo, repoRoot } from './shippedProgram';

const root = repoRoot;

// A union is discriminated at a property when every constituent declares a
// string literal there. That is the checker's own test for narrowing a switch,
// and it is deliberately weaker than requiring the literals to differ:
// `CommandOutput` spells `kind: 'message'` twice, TypeScript narrows it anyway,
// and a rule that asked for distinctness reported clean over both switches on
// it. Asking the checker rather than reading the source is what makes a union
// declared next month a subject of this rule without an edit.
//
// `named` is the property the switch actually reads, when it reads one. The
// checker narrows on the property switched, so that is the property to ask
// about; searching for some other one can only find a discriminant nobody
// dispatched on.
function discriminantOf(checker: ts.TypeChecker, type: ts.Type, named: string | null): string | null {
  if (!type.isUnion() || type.types.length < 2) return null;
  const candidates = named === null ? checker.getPropertiesOfType(type.types[0]).map((property) => property.name) : [named];
  for (const name of candidates) if (literalsOf(checker, type, name) !== null) return name;
  return null;
}

function literalsOf(checker: ts.TypeChecker, type: ts.Type, name: string): string[] | null {
  if (!type.isUnion()) return null;
  const spellings: string[] = [];
  for (const member of type.types) {
    const property = checker.getPropertyOfType(member, name);
    const declaration = member.symbol?.declarations?.[0] ?? property?.valueDeclaration;
    if (property === undefined || declaration === undefined) return null;
    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
    if (!propertyType.isStringLiteral()) return null;
    spellings.push(propertyType.value);
  }
  return spellings;
}

export interface Consumer {
  where: string;
  union: string;
  discriminant: string;
  handled: number;
  members: number;
  missing: string[];
  guarded: boolean;
  delegating: boolean;
}

// `default:` that assigns the scrutinee to `never`. The assignment is the
// whole mechanism: it is the one form that cannot be written so as to pass
// while being false, which a hand-written assertion can.
const NEVER_GUARD = /:\s*never\b|<\s*never\s*>|satisfies\s+never/;

// A default that hands the scrutinee to another consumer of the same union is
// not absorbing it — it is dispatching, and the consumer it dispatches to is
// held to this same rule, so the chain terminates at a guard. `resultLines`
// prints five wrappers and hands every leaf to `result`, which is total; a
// twenty-first member reaches `result` and fails to compile there. Requiring a
// guard here as well would ask an author to name every leaf in a function
// about wrappers, which is the enumeration this rule exists to remove.
function delegates(checker: ts.TypeChecker, clause: ts.DefaultClause, subject: ts.Expression, union: ts.Type): boolean {
  let found = false;
  const scrutinee = ts.isIdentifier(subject) ? checker.getSymbolAtLocation(subject) : undefined;
  const visit = (node: ts.Node): void => {
    if (!found && ts.isCallExpression(node)) {
      const signature = checker.getResolvedSignature(node);
      node.arguments.forEach((argument, at) => {
        // The scrutinee is narrowed to the unhandled members by the time it
        // reaches the default, so the union is read off the callee's parameter
        // rather than off the argument: what matters is that the thing being
        // handed the value declares it can answer for the whole union.
        const parameter = signature?.parameters[at];
        const declared = parameter?.valueDeclaration === undefined ? undefined : checker.getTypeOfSymbolAtLocation(parameter, parameter.valueDeclaration);
        const passed = ts.isIdentifier(argument) ? checker.getSymbolAtLocation(argument) : undefined;
        if (scrutinee !== undefined && passed === scrutinee && declared === union) found = true;
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(clause);
  return found;
}

export function consumersIn(program: ts.Program, include: (relative: string) => boolean = (relative) => /^(src|scripts)\//.test(relative)): Consumer[] {
  const checker = program.getTypeChecker();
  const found: Consumer[] = [];
  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile) continue;
    const relative = relativeTo(root, file.fileName);
    if (!include(relative)) continue;
    const visit = (node: ts.Node): void => {
      if (ts.isSwitchStatement(node)) {
        const consumer = consumerAt(checker, file, node, relative);
        if (consumer !== null) found.push(consumer);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return found;
}

function consumerAt(checker: ts.TypeChecker, file: ts.SourceFile, node: ts.SwitchStatement, relative: string): Consumer | null {
  const access = ts.isPropertyAccessExpression(node.expression) ? node.expression : null;
  const subject = access === null ? node.expression : access.expression;
  const type = checker.getTypeAtLocation(subject);
  const discriminant = discriminantOf(checker, type, access === null ? null : access.name.text);
  if (discriminant === null) return null;
  const members = [...new Set(literalsOf(checker, type, discriminant) ?? [])];
  const handled: string[] = [];
  let guarded = false;
  let delegating = false;
  for (const clause of node.caseBlock.clauses) {
    if (ts.isDefaultClause(clause)) {
      delegating = delegates(checker, clause, subject, type);
      guarded = NEVER_GUARD.test(clause.getText(file)) || delegating;
    }
    else if (ts.isStringLiteral(clause.expression)) handled.push(clause.expression.text);
  }
  return {
    where: `${relative}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}`,
    union: checker.typeToString(type),
    discriminant,
    handled: handled.length,
    members: members.length,
    missing: members.filter((member) => !handled.includes(member)),
    guarded,
    delegating,
  };
}
