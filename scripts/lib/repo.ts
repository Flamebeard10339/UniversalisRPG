import path from 'node:path';

export const repoRoot = path.join(import.meta.dirname, '..', '..');

export const repoPath = (file: string): string => path.resolve(repoRoot, file);

export const splitFiles = (value: string): string[] =>
  value
    .split(',')
    .map((file) => file.trim())
    .filter(Boolean);
