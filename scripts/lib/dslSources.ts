import { statSync } from 'node:fs';
import path from 'node:path';
import { worldFileNames } from '../../src/content/worldDir';

export function sourceFiles(file: string): string[] {
  if (!statSync(file).isDirectory()) return [file];
  return worldFileNames(file).map((name) => path.join(file, name));
}

export const sourceName = (file: string): string => path.basename(file).replace(/\.[^.]*$/, '');

export const sourceSlug = (file: string): string => sourceName(file).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
