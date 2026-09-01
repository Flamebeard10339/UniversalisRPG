import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NOTE_MARK, noteIn, withoutNote } from '../src/grammar/note';
import { localeKey, moduleLocaleSections } from '../src/content/locale';
import { loadUniverseWithDiagnostics } from '../src/content/load';
import { formatModuleDiagnostic } from '../src/content/registry';
import type { Registry } from '../src/content/registry';
import { contentSectionMaps, globalSectionKinds, textFieldsOf } from '../src/content/sections';
import { shippedSources } from '../src/content/shipped';
import type { ModuleSource } from '../src/content/universe';

export interface Said {
  key: string;
  field: string;
  text: string;
  hash: string;
  asked?: string;
  generated: boolean;
  standing?: Standing;
}

export type Standing = 'reviewed' | 'changed';

export const LEDGER = 'content/reviewed.tsv';

export const STINT = 20;

export const stamp = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 12);

export const parseLedger = (text: string): Map<string, string> => new Map(text.split(/\r?\n/).flatMap((line) => (line.trim() === '' || line.startsWith('#') ? [] : [line.split('\t') as [string, string]])));

export const printLedger = (held: ReadonlyMap<string, string>): string =>
  ['# What a person has read, and what it said when they read it. Written by `npm run review`.', ...[...held].sort(([one], [other]) => one.localeCompare(other)).map(([key, hash]) => `${key}\t${hash}`), ''].join('\n');

export const readLedger = (): Map<string, string> => (existsSync(LEDGER) ? parseLedger(readFileSync(LEDGER, 'utf8')) : new Map());

function standingOf(held: ReadonlyMap<string, string>, key: string, text: string): Standing | undefined {
  const signed = held.get(key);
  if (signed === undefined) return undefined;
  return signed === stamp(text) ? 'reviewed' : 'changed';
}

const usage = [
  'Usage: npm run review [-- <module>...] [--next <n>] [--read-next [<n>]] [--sheet]',
  '                      [--all] [--read-through <section>] [--read <section>...]',
  '',
  '  <module>              a module id; with none, every module the corpus holds',
  `  --next <n>            take <n> sections rather than the ${STINT} a sitting takes by default`,
  '  --read-next [<n>]     mark the sections that stint covers as read, without',
  '                        naming one of them: the batch is worked out again rather',
  '                        than typed back in',
  '  --sheet               every section at once, module by module, rather than a stint',
  '  --all                 show the lines already read as well as the ones left',
  '  --read-through <id>   mark every line from the top of the module down to and',
  '                        including this section as read',
  '  --read <id>...        mark just these sections as read',
  '',
  `A sitting is the ${STINT} sections nearest the front that still hold a line nobody has`,
  'read, in the order the corpus writes them, and that is what a bare run prints.',
  'Reading it and then `--read-next` signs off exactly that batch.',
  '',
  'Every line the game can say, in the order its module writes them, under the',
  'section that says it. The set derives itself from the locale tables the engine',
  `builds off each kind's own prose fields, so a kind or a field added next month`,
  'is swept with no edit here — nothing has to be marked to be reviewed.',
  '',
  `A ${NOTE_MARK} is shown beneath the line it was left in, so one read covers both`,
  'the writing and what an author asked for and did not get.',
  '',
  `What has been read is kept in ${LEDGER}, against a hash of the words that were`,
  'read. Rewrite a line someone signed off and it comes back marked CHANGED, so no',
  'line stays approved against writing nobody saw. Edit first, then mark: a mark is',
  'taken from what the file says at the moment it is written.',
  '',
  'A row whose key the corpus no longer says is named at the foot of the run, and',
  'left alone: a locale key that moves takes its answer with it, and deciding what',
  'becomes of that answer is the reader\'s, not this tool\'s.',
].join('\n');

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
  loose: Said[];
}

const HEADER = /^#[ \t]+(?<kind>[a-z][a-z0-9-]*)(?:[ \t]+(?<id>[^\s]+))?[ \t]*$/;

function saidBy(key: string, module: string): boolean {
  const segments = key.split('.');
  return segments[0] === module || segments[1] === module;
}

interface Header {
  kind: string;
  id: string;
  line: number;
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

function ordered(kind: string, said: Said[]): Said[] {
  const declared = textFieldsOf(kind) ?? [];
  const rank = (field: string): number => (declared.includes(field) ? declared.indexOf(field) : declared.length);
  return [...said].sort((one, other) => rank(one.field) - rank(other.field) || naturally(one.field, other.field));
}

export function sheetFor(registry: Registry, module: string, source: string, text: string, held: ReadonlyMap<string, string> = new Map()): Sheet {
  const headers = headersIn(module, text);
  const claims = headers.flatMap((header) => header.prefixes.map((prefix) => ({ header, prefix }))).sort((one, other) => other.prefix.length - one.prefix.length);
  const said = new Map<Header, Said[]>(headers.map((header) => [header, []]));
  const loose: Sheet['loose'] = [];

  for (const [key, entry] of registry.locales.base) {
    if (entry.language !== 'en') continue;
    const claim = claims.find((each) => key.startsWith(each.prefix));
    const asked = noteIn(entry.text);
    const standing = standingOf(held, key, entry.text);
    const one: Said = {
      key,
      field: claim ? key.slice(claim.prefix.length) : key,
      text: withoutNote(entry.text),
      hash: stamp(entry.text),
      ...(asked === undefined ? {} : { asked: asked.trim() }),
      generated: entry.generated === true,
      ...(standing === undefined ? {} : { standing }),
    };
    if (claim) said.get(claim.header)!.push(one);
    else if (saidBy(key, module)) loose.push(one);
  }

  for (const declared of moduleLocaleSections(registry.locales, module)) {
    const header = headers.find((each) => each.kind === 'locale' && each.id === declared.language);
    if (header === undefined) continue;
    for (const { key, value } of declared.entries) {
      const asked = noteIn(value);
      const standing = standingOf(held, key, value);
      said.get(header)!.push({ key, field: key, text: withoutNote(value), hash: stamp(value), ...(asked === undefined ? {} : { asked: asked.trim() }), generated: false, ...(standing === undefined ? {} : { standing }) });
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
  const field = `${said.field}${said.generated ? ' (auto)' : ''}${said.standing === 'changed' ? ' CHANGED' : said.standing === 'reviewed' ? ' ok' : ''}`;
  const text = said.text === '' ? '(nothing at all)' : said.text;
  const opening = field.length < FIELD_WIDTH ? [`  ${field.padEnd(FIELD_WIDTH)}${text}`] : [`  ${field}`, `  ${gutter}${text}`];
  return [...opening, ...(said.asked === undefined ? [] : [`  ${gutter}${NOTE_MARK} ${said.asked === '' ? 'rough' : said.asked}`])];
}

export const isLeft = (said: Said): boolean => said.standing !== 'reviewed';

const keysOf = (sheet: Sheet): string[] => [...sheet.sections.flatMap((section) => section.said), ...sheet.loose].map((said) => said.key);

export const orphansIn = (everySheet: readonly Sheet[], held: ReadonlyMap<string, string>): string[] => {
  const said = new Set(everySheet.flatMap(keysOf));
  return [...held.keys()].filter((key) => !said.has(key)).sort();
};

export const orphanLines = (orphans: readonly string[]): string[] =>
  orphans.length === 0
    ? []
    : [
        `${orphans.length} row(s) in ${LEDGER} are against lines the corpus no longer says, so the answer each carries has stopped being about anything:`,
        ...orphans.map((key) => `  ${key}`),
        'A key that moved wants its row moved with it; a line that is gone wants its row gone. Neither is done for you, because the answer a row carries belongs to whoever read the line.',
        '',
      ];

export function sheetLines(sheet: Sheet, all = false): string[] {
  const every = sheet.sections.flatMap((section) => section.said);
  const left = every.filter(isLeft);
  const shown = sheet.sections.map((section) => ({ ...section, said: all ? section.said : section.said.filter(isLeft) })).filter((section) => section.said.length > 0);
  const counted = [
    `${left.length} line(s) left to read, of ${every.length} the game says across ${sheet.sections.length} section(s)`,
    `${left.filter((said) => said.standing === 'changed').length} of those were read once and have been rewritten since`,
    `${left.filter((said) => said.generated).length} written by nobody: a title the engine made out of an id`,
    `${left.filter((said) => said.asked !== undefined).length} carry a ${NOTE_MARK}`,
  ];
  return [
    `${sheet.source} — ${sheet.module}`,
    ...counted.map((line) => `  ${line}`),
    '',
    ...(left.length === 0 ? ['every line this module says has been read.', ''] : []),
    ...shown.flatMap((section) => [`# ${section.kind} ${section.id}`.padEnd(52) + `${sheet.source}:${section.line}`, ...section.said.flatMap(saidLines), '']),
    ...(sheet.loose.length === 0 ? [] : [`${sheet.loose.length} line(s) under no section of this module, so nothing above reviews them:`, ...sheet.loose.flatMap((said) => saidLines({ ...said, field: said.key })), '']),
  ];
}

export interface Stint {
  sheet: Sheet;
  section: Spoken;
}

export const stintsLeft = (sheets: readonly Sheet[]): Stint[] => sheets.flatMap((sheet) => sheet.sections.filter((section) => section.said.some(isLeft)).map((section) => ({ sheet, section })));

export const nextUp = (sheets: readonly Sheet[], size: number = STINT): Stint[] => stintsLeft(sheets).slice(0, size);

export function stintLines(taken: readonly Stint[], waiting: number, size: number, all = false): string[] {
  if (taken.length === 0) return ['every line the corpus says has been read.', ''];
  const lines = [`${taken.length} section(s) to read now, of ${waiting} still waiting`, ''];
  let source: string | null = null;
  for (const { sheet, section } of taken) {
    if (sheet.source !== source) lines.push(`${sheet.source} — ${sheet.module}`, '');
    source = sheet.source;
    const said = all ? section.said : section.said.filter(isLeft);
    lines.push(`# ${section.kind} ${section.id}`.padEnd(52) + `${sheet.source}:${section.line}`, ...said.flatMap(saidLines), '');
  }
  return [...lines, `Read these, then sign the batch off with: npm run review -- --read-next${size === STINT ? '' : ` ${size}`}`, ''];
}

export const markedLines = (taken: readonly Stint[], marked: number, waiting: number): string[] => [
  `${marked} line(s) across ${taken.length} section(s) marked read, in ${LEDGER}:`,
  ...taken.map(({ sheet, section }) => `  ${sheet.module.padEnd(24)}# ${section.kind} ${section.id}`),
  `${waiting} section(s) still waiting.`,
  '',
];

export function through(sheet: Sheet, id: string): Spoken[] {
  const at = sheet.sections.findIndex((section) => section.id === id);
  if (at === -1) throw new Error(`${sheet.module} writes no section called ${id}. Its ids are the ones printed after the kind on each header line.`);
  return sheet.sections.slice(0, at + 1);
}

const shipped = (): ModuleSource[] => [...shippedSources()];

export interface Asked {
  modules: string[];
  all: boolean;
  sheet: boolean;
  size: number;
  readNext: boolean;
  through?: string;
  read: string[];
}

export function parseArgs(argv: readonly string[]): Asked {
  const asked: Asked = { modules: [], all: false, sheet: false, size: STINT, readNext: false, read: [] };
  const sizeAfter = (at: number): number | undefined => (/^\d+$/.test(argv[at + 1] ?? '') ? Number(argv[at + 1]) : undefined);
  for (let at = 0; at < argv.length; at++) {
    if (argv[at] === '--all') asked.all = true;
    else if (argv[at] === '--sheet') asked.sheet = true;
    else if (argv[at] === '--next' || argv[at] === '--read-next') {
      asked.readNext ||= argv[at] === '--read-next';
      const size = sizeAfter(at);
      if (size !== undefined) {
        asked.size = size;
        at++;
      } else if (argv[at] === '--next') throw new Error('--next wants how many sections after it');
    } else if (argv[at] === '--read-through') asked.through = argv[++at];
    else if (argv[at] === '--read') while (at + 1 < argv.length && !argv[at + 1].startsWith('--')) asked.read.push(argv[++at]);
    else asked.modules.push(argv[at]);
  }
  if (asked.through !== undefined && asked.read.length > 0) throw new Error('--read-through and --read say the same thing two ways; use one');
  if (asked.readNext && (asked.through !== undefined || asked.read.length > 0)) throw new Error('--read-next signs off the stint it works out for itself; --read-through and --read name sections instead. Use one');
  if (asked.readNext && asked.sheet) throw new Error('--sheet prints every section and --read-next signs off one stint; use one');
  if (asked.size < 1) throw new Error('a stint of no sections is nothing to read');
  return asked;
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help')) {
    console.log(usage);
    return;
  }
  const asked = parseArgs(argv);
  const { registry, diagnostics, parsed } = loadUniverseWithDiagnostics(shipped());
  for (const diagnostic of diagnostics) console.error(formatModuleDiagnostic(diagnostic));

  const wanted = asked.modules.length > 0 ? asked.modules : parsed.map((module) => module.info.id);
  const unknown = wanted.filter((id) => !parsed.some((module) => module.info.id === id));
  if (unknown.length > 0) {
    console.error(`no such module: ${unknown.join(', ')}. The corpus holds ${parsed.map((module) => module.info.id).join(', ')}.`);
    process.exitCode = 1;
    return;
  }
  const named = asked.through !== undefined || asked.read.length > 0;
  if (named && wanted.length > 1) {
    console.error('name the one module being marked, so a section id can only mean one thing');
    process.exitCode = 1;
    return;
  }

  const held = readLedger();
  const everySheet = parsed.map((module) => sheetFor(registry, module.info.id, `content/${module.source.name}`, module.source.text, held));
  const sheets = wanted.map((id) => everySheet.find((sheet) => sheet.module === id)!);
  const orphans = orphanLines(orphansIn(everySheet, held));

  if (!named && !asked.sheet) {
    const waiting = stintsLeft(sheets);
    const taken = waiting.slice(0, asked.size);
    if (asked.readNext) {
      const marked = taken.flatMap(({ section }) => section.said).filter(isLeft).length;
      for (const { section } of taken) for (const said of section.said) held.set(said.key, said.hash);
      writeFileSync(LEDGER, printLedger(held));
      console.log(markedLines(taken, marked, waiting.length - taken.length).join('\n'));
    } else {
      console.log(stintLines(taken, waiting.length, asked.size, asked.all).join('\n'));
    }
    if (orphans.length > 0) console.log(orphans.join('\n'));
    return;
  }

  if (named) {
    const sheet = sheets[0];
    const covered = asked.through === undefined ? sheet.sections.filter((section) => asked.read.includes(section.id)) : through(sheet, asked.through);
    const missing = asked.read.filter((id) => !covered.some((section) => section.id === id));
    if (missing.length > 0) {
      console.error(`${sheet.module} writes no section called ${missing.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    const marked = covered.flatMap((section) => section.said).filter(isLeft);
    for (const section of covered) for (const said of section.said) held.set(said.key, said.hash);
    writeFileSync(LEDGER, printLedger(held));
    console.log(`read through ${covered[covered.length - 1]?.id ?? '(nothing)'}: ${marked.length} line(s) across ${covered.length} section(s) marked, in ${LEDGER}.`);
    if (orphans.length > 0) console.log(orphans.join('\n'));
    return;
  }

  for (const sheet of sheets) console.log(sheetLines(sheet, asked.all).join('\n'));
  if (orphans.length > 0) console.log(orphans.join('\n'));
}

if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
