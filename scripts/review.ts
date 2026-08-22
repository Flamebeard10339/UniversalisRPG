import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { NOTE_MARK, noteIn, withoutNote } from '../src/grammar/note';
import { localeKey, moduleLocaleSections } from '../src/content/locale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import type { Registry } from '../src/content/registry';
import { contentSectionMaps, globalSectionKinds, textFieldsOf } from '../src/content/sections';
import type { ModuleSource } from '../src/content/universe';

const usage = [
  'Usage: npm run review [-- <module>...]',
  '',
  '  <module>   a module id; with none, every module the corpus holds',
  '',
  'Every line the game can say, in the order its module writes them, under the',
  'section that says it. The set derives itself from the locale tables the engine',
  `builds off each kind's own prose fields, so a kind or a field added next month`,
  'is swept with no edit here — nothing has to be marked to be reviewed.',
  '',
  `A ${NOTE_MARK} is shown beneath the line it was left in, so one read covers both`,
  'the writing and what an author asked for and did not get.',
].join('\n');

export interface Said {
  field: string;
  text: string;
  asked?: string;
  generated: boolean;
}

export interface Spoken {
  kind: string;
  id: string;
  line: number;
  said: Said[];
}

export interface Sheet {
  module: string;
  source: string;
  sections: Spoken[];
  // Lines the module says that no section header claims. Empty is the proof that the walk above reached everything; anything here is a line that would otherwise be reviewed by nobody.
  loose: Array<Said & { key: string }>;
}

const HEADER = /^#[ \t]+(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[^\s]+))?[ \t]*$/;

interface Header {
  kind: string;
  id: string;
  line: number;
  // What this section says is not only what it declares: a section may give another kind an entry of its own, qualified under this id — a quest hands a dialogue to the entity it speaks through — and those lines are this section's to review. Asked of the kinds that hold maps rather than named, so a kind that starts giving next month is swept with no edit.
  prefixes: string[];
}

function headersIn(module: string, text: string): Header[] {
  const global = new Set(globalSectionKinds());
  const given = contentSectionMaps().map(([kind]) => kind);
  const found: Header[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const header = HEADER.exec(raw)?.groups;
    if (!header?.id || header.kind === 'info') return;
    found.push({
      kind: header.kind,
      id: header.id,
      line: index + 1,
      prefixes: [localeKey(global.has(header.kind) ? null : module, header.kind, header.id, ''), ...given.map((kind) => `${kind}.${module}.${header.id}.`)],
    });
  });
  return found;
}

const runs = (value: string): string[] => value.match(/\d+|\D+/g) ?? [];

function naturally(one: string, other: string): number {
  const left = runs(one);
  const right = runs(other);
  for (let at = 0; at < Math.min(left.length, right.length); at++) {
    const both = /^\d/.test(left[at]) && /^\d/.test(right[at]);
    const order = both ? Number(left[at]) - Number(right[at]) : left[at].localeCompare(right[at]);
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

// A kind's own declared prose fields lead, in the order it declares them; everything a section grew for itself — a say, a choice, an action's label — follows in an order a reader can follow.
function ordered(kind: string, said: Said[]): Said[] {
  const declared = textFieldsOf(kind) ?? [];
  const rank = (field: string): number => (declared.includes(field) ? declared.indexOf(field) : declared.length);
  return [...said].sort((one, other) => rank(one.field) - rank(other.field) || naturally(one.field, other.field));
}

export function sheetFor(registry: Registry, module: string, source: string, text: string): Sheet {
  const headers = headersIn(module, text);
  const claims = headers.flatMap((header) => header.prefixes.map((prefix) => ({ header, prefix }))).sort((one, other) => other.prefix.length - one.prefix.length);
  const said = new Map<Header, Said[]>(headers.map((header) => [header, []]));
  const loose: Sheet['loose'] = [];

  for (const [key, entry] of registry.locales.base) {
    if (entry.language !== 'en') continue;
    const claim = claims.find((each) => key.startsWith(each.prefix));
    const asked = noteIn(entry.text);
    const one: Said = {
      field: claim ? key.slice(claim.prefix.length) : key,
      text: withoutNote(entry.text),
      ...(asked === undefined ? {} : { asked: asked.trim() }),
      generated: entry.generated === true,
    };
    if (claim) said.get(claim.header)!.push(one);
    else if (key.startsWith(`${module}.`) || key.includes(`.${module}.`)) loose.push({ ...one, key });
  }

  // What a module declares outright, which is how the engine's own English arrives: a `# locale` section names its keys rather than growing them off a section's fields, so nothing above would ever reach them.
  for (const declared of moduleLocaleSections(registry.locales, module)) {
    const header = headers.find((each) => each.kind === 'locale' && each.id === declared.language);
    if (header === undefined) continue;
    for (const { key, value } of declared.entries) {
      const asked = noteIn(value);
      said.get(header)!.push({ field: key, text: withoutNote(value), ...(asked === undefined ? {} : { asked: asked.trim() }), generated: false });
    }
  }

  const sections = headers
    .filter((header) => said.get(header)!.length > 0)
    .map((header) => ({ kind: header.kind, id: header.id, line: header.line, said: ordered(header.kind, said.get(header)!) }))
    .sort((one, other) => one.line - other.line);
  return { module, source, sections, loose };
}

const FIELD_WIDTH = 24;

function saidLines(said: Said): string[] {
  const gutter = ' '.repeat(FIELD_WIDTH);
  const field = `${said.field}${said.generated ? ' (auto)' : ''}`;
  const text = said.text === '' ? '(nothing at all)' : said.text;
  const opening = field.length < FIELD_WIDTH ? [`  ${field.padEnd(FIELD_WIDTH)}${text}`] : [`  ${field}`, `  ${gutter}${text}`];
  return [...opening, ...(said.asked === undefined ? [] : [`  ${gutter}${NOTE_MARK} ${said.asked === '' ? 'rough' : said.asked}`])];
}

export function sheetLines(sheet: Sheet): string[] {
  const every = sheet.sections.flatMap((section) => section.said);
  const counted = [`${every.length} line(s) the game says, across ${sheet.sections.length} section(s)`, `${every.filter((said) => said.generated).length} of them written by nobody: a title the engine made out of an id`, `${every.filter((said) => said.asked !== undefined).length} carry a ${NOTE_MARK}`];
  return [
    `${sheet.source} — ${sheet.module}`,
    ...counted.map((line) => `  ${line}`),
    '',
    ...sheet.sections.flatMap((section) => [`# ${section.kind} ${section.id}`.padEnd(52) + `${sheet.source}:${section.line}`, ...section.said.flatMap(saidLines), '']),
    ...(sheet.loose.length === 0 ? [] : [`${sheet.loose.length} line(s) under no section of this module, so nothing above reviews them:`, ...sheet.loose.flatMap((said) => saidLines({ ...said, field: said.key })), '']),
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
  const sources = shipped();
  const { registry, diagnostics, parsed } = loadUniverseWithDiagnostics(sources);
  for (const diagnostic of diagnostics) console.error(formatModuleDiagnostic(diagnostic));

  const wanted = args.length > 0 ? args : parsed.map((module) => module.info.id);
  const unknown = wanted.filter((id) => !parsed.some((module) => module.info.id === id));
  if (unknown.length > 0) {
    console.error(`no such module: ${unknown.join(', ')}. The corpus holds ${parsed.map((module) => module.info.id).join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  for (const id of wanted) {
    const module = parsed.find((each) => each.info.id === id)!;
    console.log(sheetLines(sheetFor(registry, id, `content/${module.source.name}`, module.source.text)).join('\n'));
  }
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
