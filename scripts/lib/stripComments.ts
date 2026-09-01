import ts from 'typescript';

export interface CommentSpan {
  pos: number;
  end: number;
}

const scriptKindOf = (fileName: string): ts.ScriptKind => (/\.[cm]?[jt]sx$/.test(fileName) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

export function commentSpans(source: string, fileName = 'source.ts'): CommentSpan[] {
  const parsed = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, scriptKindOf(fileName));
  const found = new Map<number, CommentSpan>();
  const visit = (node: ts.Node): void => {
    const children = node.getChildren(parsed);
    if (children.length > 0) {
      for (const child of children) visit(child);
      return;
    }
    if (node.kind === ts.SyntaxKind.JsxText) return;
    for (const range of [...(ts.getTrailingCommentRanges(source, node.pos) ?? []), ...(ts.getLeadingCommentRanges(source, node.pos) ?? [])]) found.set(range.pos, { pos: range.pos, end: range.end });
  };
  visit(parsed);
  return [...found.values()].sort((one, other) => one.pos - other.pos);
}

export function stripComments(source: string, fileName = 'source.ts'): string[] {
  if (source === '') return [];
  let blanked = '';
  let cursor = 0;
  for (const span of commentSpans(source, fileName)) {
    blanked += source.slice(cursor, span.pos) + source.slice(span.pos, span.end).replace(/[^\n]/g, ' ');
    cursor = span.end;
  }
  blanked += source.slice(cursor);
  const lines = blanked.split('\n');
  if (blanked.endsWith('\n')) lines.pop();
  return lines;
}

export function codeOnly(source: string, fileName = 'source.ts'): string[] {
  return stripComments(source, fileName)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
