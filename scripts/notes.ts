import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { NOTE_MARK, noteIn, withoutNote } from '../src/grammar/note';
import { everySaid, type Locales } from '../src/content/locale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import type { ModuleSource } from '../src/content/universe';

const usage = [
  'Usage: npm run notes [-- <source>...]',
  '',
  `  <source>   a DSL file; with none, the shipped corpus in content/`,
  '',
  `A ${NOTE_MARK} in any line the game says to a player opens a note that runs to the`,
  'end of it. The engine drops the note and says the rest, so what an author',
  'marked is playable while it waits. A line that is nothing but a mark says',
  'nothing, and the engine refuses it. This prints every note the corpus holds:',
  'a note with words is work someone asked for, and a bare mark is writing that',
  'is standing in for better writing.',
].join('\n');

export interface Note {
  key: string;
  language: string;
  said: string;
  stands: string;
}

export function notesIn(locales: Locales): Note[] {
  const found = everySaid(locales).flatMap(({ key, language, text }) => {
    const said = noteIn(text);
    return said === undefined ? [] : [{ key, language, said: said.trim(), stands: withoutNote(text) }];
  });
  return found.sort((one, other) => one.key.localeCompare(other.key) || one.language.localeCompare(other.language));
}

const shown = (note: Note): string[] => [`  ${note.key}${note.language === 'en' ? '' : ` (${note.language})`}`, `    stands as: ${note.stands}`, ...(note.said === '' ? [] : [`    asked for: ${note.said}`])];

export function noteLines(locales: Locales): string[] {
  const notes = notesIn(locales);
  if (notes.length === 0) return [`no ${NOTE_MARK} anywhere: nothing here is marked unfinished`];
  const asked = notes.filter((note) => note.said !== '');
  const rough = notes.filter((note) => note.said === '');
  return [
    ...(asked.length === 0 ? [] : [`${asked.length} note(s) — what an author asked for and did not get:`, ...asked.flatMap(shown), '']),
    ...(rough.length === 0 ? [] : [`${rough.length} line(s) marked rough — writing standing in for better writing:`, ...rough.flatMap(shown), '']),
  ];
}

const shipped = (): ModuleSource[] =>
  readdirSync('content')
    .filter((name) => name.endsWith('.dsl'))
    .map((name) => ({ name, text: readFileSync(path.join('content', name), 'utf8') }));

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(usage);
    return;
  }
  const sources = args.length > 0 ? args.map((file) => ({ name: path.basename(file), text: readFileSync(file, 'utf8') })) : shipped();
  const { registry, diagnostics } = loadUniverseWithDiagnostics(sources);
  for (const diagnostic of diagnostics) console.error(formatModuleDiagnostic(diagnostic));
  console.log(noteLines(registry.locales).join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
