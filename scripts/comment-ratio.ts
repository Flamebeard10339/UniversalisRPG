import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isCommentLine, stripComments } from './lib/stripComments';

const MAX_COMMENT_RATIO = 0.05;
const ALWAYS_ALLOWED_COMMENT_LINES = 2;
const ROOTS = ['src', 'scripts'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'android', '.git']);

interface FileReport {
  path: string;
  commentLines: number;
  totalLines: number;
  ratio: number;
  budget: number;
}

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path));
    else if (SOURCE_EXTENSIONS.some((extension) => entry.endsWith(extension))) found.push(path);
  }
  return found;
}

function report(path: string): FileReport {
  const source = readFileSync(path, 'utf8');
  const stripped = stripComments(source);
  const original = source.split('\n');
  if (original[original.length - 1] === '') original.pop();

  let commentLines = 0;
  for (let index = 0; index < stripped.length; index++) {
    if (isCommentLine(original[index] ?? '', stripped[index])) commentLines++;
  }

  const totalLines = stripped.length;
  return {
    path: relative(process.cwd(), path).replace(/\\/g, '/'),
    commentLines,
    totalLines,
    ratio: totalLines === 0 ? 0 : commentLines / totalLines,
    budget: Math.max(ALWAYS_ALLOWED_COMMENT_LINES, Math.floor(totalLines * MAX_COMMENT_RATIO)),
  };
}

function format(file: FileReport): string {
  const percentage = `${(file.ratio * 100).toFixed(1)}%`.padStart(6);
  return `${percentage} ${String(file.commentLines).padStart(4)}/${String(file.totalLines).padEnd(5)} ${file.path}`;
}

// grep cannot tell a comment from a `//` inside a DSL fixture string, and a strip
// built from grep deletes the fixture. This is the same scanner the budget uses.
const linesFlag = process.argv.indexOf('--lines');
if (linesFlag !== -1) {
  const target = process.argv[linesFlag + 1];
  const source = readFileSync(target, 'utf8');
  const stripped = stripComments(source);
  const original = source.split('\n');
  for (let index = 0; index < stripped.length; index++) {
    if (isCommentLine(original[index] ?? '', stripped[index])) console.log(`${index + 1}:${original[index]}`);
  }
  process.exit(0);
}

const listEverything = process.argv.includes('--all');
const reports = ROOTS.flatMap((root) => sourceFiles(root))
  .map(report)
  .sort((left, right) => right.ratio - left.ratio);

const overBudget = reports.filter((file) => file.commentLines > file.budget);
const commentLines = reports.reduce((sum, file) => sum + file.commentLines, 0);
const totalLines = reports.reduce((sum, file) => sum + file.totalLines, 0);

for (const file of listEverything ? reports : overBudget) console.log(format(file));

console.log(
  `\n${commentLines}/${totalLines} comment lines across ${reports.length} files ` +
    `(${((commentLines / totalLines) * 100).toFixed(1)}%), budget ${(MAX_COMMENT_RATIO * 100).toFixed(0)}% per file.`,
);

if (overBudget.length > 0) {
  const excess = overBudget.reduce((sum, file) => sum + (file.commentLines - file.budget), 0);
  console.error(`${overBudget.length} files over budget by ${excess} comment lines.`);
  process.exit(1);
}

console.log('Every file within budget.');
