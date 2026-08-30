import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// A directory stands for the .dsl files in it, so `content` names the corpus on a shell that expands
// no globs. Every tool that takes a source reads one the same way, or an author who learned `probe`
// finds `notes` refusing the word that just worked.
export function sourceFiles(file: string): string[] {
  if (!statSync(file).isDirectory()) return [file];
  return readdirSync(file).filter((name) => name.endsWith('.dsl')).sort().map((name) => path.join(file, name));
}
