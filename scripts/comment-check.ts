import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { NOTE_MARK } from '../src/grammar/note';
import { isCommentLine, WORLD_EXTENSION } from '../src/grammar/structure';
import { sweptFiles } from './lib/layers';
import { posix, trackedFiles } from './lib/sourceFiles';
import { commentSpans } from './lib/stripComments';

export const CODE_EXTENSIONS: readonly string[] = ['.ts', '.tsx'];

export interface Found {
  file: string;
  line: number;
}

export const codeFiles = (tracked: readonly string[] = trackedFiles(), exists: (file: string) => boolean = existsSync): string[] => sweptFiles(tracked, exists).filter((file) => CODE_EXTENSIONS.some((extension) => file.endsWith(extension)));

export const worldFiles = (tracked: readonly string[] = trackedFiles(), exists: (file: string) => boolean = existsSync): string[] => tracked.map(posix).filter((file) => file.endsWith(WORLD_EXTENSION) && exists(file));

const lineOf = (source: string, position: number): number => source.slice(0, position).split('\n').length;

export function commentsInCode(file: string, source: string): Found[] {
  return commentSpans(source, file).map((span) => ({ file, line: lineOf(source, span.pos) }));
}

export function commentsInWorld(file: string, source: string): Found[] {
  return source
    .split('\n')
    .flatMap((text, index) => (isCommentLine(text) && !text.includes(NOTE_MARK) ? [{ file, line: index + 1 }] : []));
}

export interface CommentReport {
  codeRead: number;
  worldRead: number;
  found: Found[];
}

export function checkComments(code: readonly string[], world: readonly string[], read: (file: string) => string): CommentReport {
  return {
    codeRead: code.length,
    worldRead: world.length,
    found: [...code.flatMap((file) => commentsInCode(file, read(file))), ...world.flatMap((file) => commentsInWorld(file, read(file)))],
  };
}

export interface CommentCheckOutput {
  out: string[];
  err: string[];
  exitCode: number;
}

export const REDIRECT = 'A fact you were about to comment has a destination — rename it, type it, test it, or put it in the commit message. Deleting it loses nothing; git holds every word.';

export const MARK_STANDS = `A ${NOTE_MARK} in a ${WORLD_EXTENSION} body is the one mark that stands: it is a note to the author, and \`npm run notes\` reads it.`;

export function commentCheckOutput(report: CommentReport): CommentCheckOutput {
  const out = [`${report.codeRead} module(s) under src and scripts and ${report.worldRead} ${WORLD_EXTENSION} file(s) read for comments.`];
  const err: string[] = [];

  if (report.codeRead === 0 || report.worldRead === 0) err.push(`\nThe sweep found nothing to read. That is a broken enumeration, not a clean tree: this repository has TypeScript under src and scripts and a world written in ${WORLD_EXTENSION}.`);

  if (report.found.length > 0) {
    err.push(`\n${report.found.length} comment(s). This repository writes none:`);
    for (const found of report.found) err.push(`  ${found.file}:${found.line}`);
    err.push(REDIRECT);
    err.push(MARK_STANDS);
  }

  if (err.length > 0) return { out, err, exitCode: 1 };
  return { out: [...out, 'No comment stands anywhere the check reads.'], err, exitCode: 0 };
}

export interface CommentCheckEffects {
  tracked: () => string[];
  exists: (file: string) => boolean;
  read: (file: string) => string;
}

export function runCommentCheck(effects: CommentCheckEffects = { tracked: trackedFiles, exists: existsSync, read: (file) => readFileSync(file, 'utf8') }): CommentCheckOutput {
  const tracked = effects.tracked();
  return commentCheckOutput(checkComments(codeFiles(tracked, effects.exists), worldFiles(tracked, effects.exists), effects.read));
}

function main(): void {
  const { out, err, exitCode } = runCommentCheck();
  for (const line of out) console.log(line);
  for (const line of err) console.error(line);
  process.exit(exitCode);
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
