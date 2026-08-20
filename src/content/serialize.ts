import { Action, actionLines } from '../grammar/action';
import { resultLines } from '../grammar/actionResult';
import { condition, printReference } from '../grammar/condition';
import { dependency, version as versionParser, Version } from '../grammar/dependency';
import { indentLines } from '../grammar/structure';
import { Dialogue, TextSegment } from './dialogue';
import { DropTable } from './dropTable';
import { ActionDeclaration } from './action';
import { edgeValue, Location, populationValue, relativeValue } from './location';
import { Registry, registryMapOf } from './registry';
import type { ModuleDiagnostic, UniverseLoadResult } from './registry';
import { registryDiff } from './registryDiff';
import { GLOBAL_SECTION_KINDS, SECTION_KIND, SECTION_KINDS, sectionOf, type ModuleSection, type SectionKind } from './sectionKind';
import { schemaFor } from './module';
import { ListParser } from '../grammar/list';
import { Parser } from '../grammar/parser';
import type { ModuleSource, ParsedModule } from './universe';
import { ParsedSave } from './saveSection';
import { Test, Directive, usePayload } from './test';
import { hexKey } from './hex';
import { ModuleInfo } from './info';
import { AnyField, AnySchema, DEFAULT_CONTEXT, DEFAULT_LANGUAGE, isPositionalField } from '../grammar/section';
import { localeKey, moduleLocaleSections, type LocaleDeclaration } from './locale';

type Lines = string[];

export interface SerializeModuleOptions {
  info: Pick<ModuleInfo, 'id'> & Partial<Pick<ModuleInfo, 'version' | 'dependencies' | 'pack' | 'language'>>;
  // The ids of the global sections this module declared. A global id belongs to
  // nobody, so `inModule` cannot find one and the caller says which it wrote.
  globals?: readonly string[];
}

function block(lines: Lines, label: string, values: readonly string[]): void {
  if (values.length === 0) return;
  lines.push(`${label}:`, ...indentLines(values));
}

// Exported because the load path records a spoken line's authored words as the
// entry a `# locale` translates, and what it records has to be the same
// spelling a translator will read back and write beside.
export function printSegments(values: readonly TextSegment[] | undefined): string {
  return (values ?? [])
    .map((segment) => {
      if (segment.kind === 'literal') return segment.text;
      if (segment.kind === 'interpolate') return `{${printReference(segment.reference)}}`;
      return `{${condition.print(segment.condition)}: ${segment.text}}`;
    })
    .join('');
}

// The verb, then whatever that verb's own line carries after its colon — the
// shape `begin:` and `refuse:` both take their inner directive in.
function inlined(inner: Directive, verb = inner.kind): string {
  return `${verb} ${printDirective(inner).replace(/^[a-z-]+:[ \t]*/, '')}`;
}

export function printDirective(value: Directive): string {
  switch (value.kind) {
    case 'run':
      return `run: ${value.test}`;
    case 'talk':
      return `talk: ${value.entity}`;
    case 'choose':
      return `choose: ${value.text}`;
    case 'use':
      return `use: ${usePayload(value)}`;
    case 'use-on':
      return `use: ${value.action} on ${value.target}`;
    case 'travel':
      return `travel: ${value.location}`;
    case 'goto':
      return `goto: ${value.location}`;
    case 'craft':
      return `craft: ${value.recipe}`;
    case 'begin':
      return `begin: ${inlined(value.inner, value.inner.kind === 'use-on' ? 'use' : value.inner.kind)}`;
    case 'refuse':
      return `refuse: ${inlined(value.inner)}`;
    case 'assert':
      return `assert: ${condition.print(value.condition)}`;
    case 'expect':
      return `expect: ${value.save}`;
    case 'load':
      return `load: ${value.save}`;
    case 'cancel':
      return 'cancel';
    case 'wait':
      return `wait: ${value.seconds}`;
    case 'equip':
      return `equip: ${value.item}`;
    case 'unequip':
      return `unequip: ${value.slot}`;
    case 'feed':
      return `feed: ${value.target} with ${value.food}`;
    case 'slot':
      return `slot: ${value.target} at ${hexKey(value.hex)} ${value.direction} with ${value.jewel}`;
    case 'allocate':
      return `allocate: ${value.target} at ${hexKey(value.node.hex)} ${value.node.kind === 'position' ? `position ${value.node.position}` : `slot ${value.node.direction}`}`;
    case 'apply':
      return `apply: ${value.target} at ${hexKey(value.hex)} with ${value.effect}`;
    case 'open-modal':
      return `open-modal: ${value.modal}`;
    case 'submit-modal':
      return `submit-modal: ${value.key}=${value.value}`;
    default: {
      const unreached: never = value;
      return unreached;
    }
  }
}

function moduleLocalId(moduleId: string, id: string): string {
  return id.startsWith(`${moduleId}.`) ? id.slice(moduleId.length + 1) : id;
}

// A title the loader would fill in for itself is not printed, and the load
// recorded which those were rather than leaving this to guess: comparing the
// title against `defaultTitle` drops one an author wrote that happens to equal
// the id, which is a whole entry lost on the round trip a contribution makes.
function titleLine(registry: Registry, moduleId: string, kind: string, value: { id: string; title?: string }): Lines {
  const entry = registry.locales.base.get(localeKey(moduleId, kind, value.id, 'title'));
  return value.title === undefined || entry === undefined || entry.generated ? [] : [`title: ${value.title}`];
}

function titled(lines: Lines, registry: Registry, moduleId: string, kind: string, value: { id: string; title?: string; examine?: string }): void {
  lines.push(...titleLine(registry, moduleId, kind, value));
  if (value.examine !== undefined) lines.push(`examine: ${value.examine}`);
}

// Whether the author wrote a field the engine could have minted, which the
// value cannot say: `title: Gold` on `# item gold` is exactly what the loader
// would have filled in. The load recorded which it filled in, so the answer is
// looked up rather than guessed — comparing against the default drops a title
// an author wrote that happens to match, and that is a whole entry lost.
function authoredField(registry: Registry, namespace: string | null, kind: string, id: string, field: string): boolean {
  const entry = registry.locales.base.get(localeKey(namespace, kind, id, field));
  return entry !== undefined && !entry.generated;
}

const keywordOf = (name: string, spec: AnyField): string => spec.keyword ?? name;

// One field, printed from what it declares. Every branch here was a decision a
// hand-written printer made at its call site, where nothing could check it
// against the field it was printing — and where a field added to a schema was
// simply not printed, with nothing failing to say so.
function fieldLines(registry: Registry, namespace: string | null, kind: string, id: string, schema: AnySchema, name: string, spec: AnyField, held: Record<string, unknown>): Lines {
  const value = held[name];
  if (value === undefined) return [];
  if (spec.generated && !authoredField(registry, namespace, kind, id, name)) return [];

  const parser = spec.parser as Parser<unknown> & Partial<ListParser<unknown>>;
  const positional = isPositionalField(schema, name);
  const label = (text: string): Lines => (positional ? [text] : [`${keywordOf(name, spec)}: ${text}`]);

  // A collection, either as it is held or as the field says to lay it out.
  const members = Array.isArray(value) ? value : (spec.dehydrate as ((held: unknown) => unknown[]) | undefined)?.(value);
  if (members !== undefined) {
    if (members.length === 0 && spec.printed !== 'always') return [];
    const lines = parser.printBlock!(members);
    // A positional field has no label to hang a block off, so its block form is
    // simply one member to a line — which is how `# skill` writes what trains it.
    if (spec.block) return positional ? lines : [`${keywordOf(name, spec)}:`, ...indentLines(lines)];
    return label(lines.join(', '));
  }

  const printed = parser.print(value);
  if (spec.printed === 'unless-default' && spec.default !== undefined && parser.print(spec.default(held as never, DEFAULT_CONTEXT)) === printed) return [];
  return label(printed);
}

// Every kind the generic engine reads, printed by walking what its schema
// declares. The kinds that bring their own parser bring their own printer, and
// that is the whole of the split: `module.ts` partitions the kinds into schema
// and bespoke, and this file answers for the same two halves.
function schemaSection(registry: Registry, moduleId: string, kind: SectionKind, value: object): string {
  const schema = schemaFor(kind)!;
  const held = value as Record<string, unknown>;
  const id = held.id as string;
  // A global id belongs to nobody, so it is neither shortened against the
  // module nor keyed under it — the row already says which kinds those are.
  const global = SECTION_KIND[kind].ids === 'global';
  const namespace = global ? null : moduleId;
  const lines: Lines = [`# ${kind} ${global ? id : moduleLocalId(moduleId, id)}`];

  for (const [name, spec] of Object.entries(schema.fields)) {
    lines.push(...fieldLines(registry, namespace, kind, id, schema, name, spec, held));
    if (name === schema.keywordsAfter) lines.push(...(schema.keywords ?? []).filter((word) => held[word] === true));
  }
  const entries = schema.entries === undefined ? [] : ((held[schema.entries.into] as Action[] | undefined) ?? []);
  for (const entry of entries) lines.push(...actionLines(entry));
  return lines.join('\n');
}

function actionSection(moduleId: string, action: ActionDeclaration): string {
  const [, ...body] = actionLines({ ...action, label: action.label });
  // A generated label is `humanizeEn` of the id, which the loader makes again;
  // printing it would make the placeholder authored on the next load.
  const title = action.generatedLabel ? [] : [`title: ${action.label}`];
  return [`# action ${moduleLocalId(moduleId, action.id)}`, ...title, ...body.map((line) => line.replace(/^ {2}/, ''))].join('\n');
}

function locationSection(registry: Registry, moduleId: string, location: Location): string {
  const lines = [`# location ${moduleLocalId(moduleId, location.id)}`];
  if (location.relative) lines.push(relativeValue.print(location.relative));
  else lines.push(`x: ${location.x}, y: ${location.y}, z: ${location.z}`);
  titled(lines, registry, moduleId, 'location', location);
  if (location.starting) lines.push('starting');
  block(lines, 'entities', location.entities.map((each) => populationValue.print(each)));
  block(
    lines,
    'adjacent',
    location.adjacent.map((each) => edgeValue.print(each)),
  );
  block(lines, 'flags', location.flags);
  for (const action of location.actions) lines.push(...actionLines(action));
  return lines.join('\n');
}

function dropTableSection(moduleId: string, table: DropTable): string {
  return [`# droptable ${moduleLocalId(moduleId, table.id)}`, ...table.results.flatMap(resultLines)].join('\n');
}

function dialogueSection(moduleId: string, dialogue: Dialogue): string {
  const lines = [`# dialogue ${moduleLocalId(moduleId, dialogue.id)}`];
  if (dialogue.owner) lines.push(`owner = ${dialogue.owner}`);
  for (const node of dialogue.nodes) {
    if (lines.length > 1) lines.push('');
    lines.push(`node ${node.name}:`);
    if (node.when) lines.push(`  when: ${condition.print(node.when)}`);
    if (node.once) lines.push('  once');
    if (node.sticky) lines.push('  sticky');
    if (node.again) lines.push(`  again: ${printSegments(node.again.segments)}`);
    for (const step of node.steps) {
      if (step.kind === 'say') lines.push(`  ${printSegments(step.segments)}`);
      else if (step.kind === 'effect') lines.push(...indentLines(resultLines(step.result)));
      else if (step.kind === 'goto') lines.push(`  goto ${step.target}`);
      else {
        for (const choice of step.choices) {
          lines.push(`  -> ${printSegments(choice.segments)}${choice.when ? ` (when ${condition.print(choice.when)})` : ''}`);
          if (choice.goto) lines.push(`    goto ${choice.goto}`);
          for (const effect of choice.effects) lines.push(...indentLines(resultLines(effect), 4));
        }
      }
    }
  }
  return lines.join('\n');
}

function saveSection(moduleId: string, id: string, save: ParsedSave): string {
  return [`# save ${moduleLocalId(moduleId, id)}`, JSON.stringify({ version: save.version, ...save.diff })].join('\n');
}

function testSection(moduleId: string, test: Test): string {
  return [`# test ${moduleLocalId(moduleId, test.id)}`, ...test.directives.map(printDirective)].join('\n');
}

function infoLines(info: SerializeModuleOptions['info']): Lines {
  const lines = [`# info ${info.id}`];
  const version: Version = info.version ?? [0, 0, 0];
  lines.push(`version: ${versionParser.print(version)}`);
  if (info.pack) lines.push(`pack: ${info.pack}`);
  if (info.language !== undefined && info.language !== DEFAULT_LANGUAGE) lines.push(`language: ${info.language}`);
  if (info.dependencies && info.dependencies.length > 0) lines.push('dependencies:', ...indentLines(info.dependencies.map((each) => dependency.print(each))));
  return lines;
}

function inModule(moduleId: string, id: string): boolean {
  return id.startsWith(`${moduleId}.`);
}

// A section this module prints, beside the key it hangs under. Every registry
// map is keyed by the id its value declares, except `saves`, whose value has no
// id of its own — so the key is what both the own-module filter and the printer
// read, and neither has to know which kind is the exception.
interface Printed {
  id: string;
  section: ModuleSection;
}

const mapOf = (registry: Registry, kind: SectionKind): ReadonlyMap<string, object> => registry[registryMapOf(kind)!] as ReadonlyMap<string, object>;

// What a module prints, in the order it prints it, walked off the row rather
// than written out as one loop per kind. A kind added to the row is carried by
// this walk with no edit, which is the whole repair: `# passive` was parsed for
// a day and a half while a loop nobody remembered to add discarded it.
function printedSections(registry: Registry, options: SerializeModuleOptions): Printed[] {
  const moduleId = options.info.id;
  const printed: Printed[] = [];
  let globalsDone = false;
  for (const kind of SECTION_KINDS) {
    const row = SECTION_KIND[kind];
    // A global id belongs to nobody, so the module says which it declared and
    // the whole group prints in that one order — by id, across the kinds,
    // rather than kind by kind. Emitted where the row first reaches a global
    // kind, which is what keeps the group's place in the order the row's.
    if (row.ids === 'global') {
      if (globalsDone) continue;
      globalsDone = true;
      for (const id of options.globals ?? []) {
        for (const global of GLOBAL_SECTION_KINDS) {
          const value = mapOf(registry, global).get(id);
          if (value !== undefined) printed.push({ id, section: sectionOf(global, value) });
        }
      }
      continue;
    }
    // A locale belongs to the module that wrote it rather than to any id, so it
    // is printed by attribution and never by `inModule`.
    if (kind === 'locale') {
      for (const declared of moduleLocaleSections(registry.locales, moduleId)) printed.push({ id: declared.language, section: sectionOf('locale', declared) });
      continue;
    }
    if (row.map === null) continue;
    for (const [id, value] of mapOf(registry, kind)) if (inModule(moduleId, id)) printed.push({ id, section: sectionOf(kind, value) });
  }
  return printed;
}

// One section's text. Total over the kinds by a `never` guard, so a kind the
// row declares and this cannot print is a compile error rather than a section
// that disappears on republish.
function sectionText(registry: Registry, moduleId: string, { id, section }: Printed): string {
  const value = section.value;
  switch (section.kind) {
    case 'stat':
    case 'skill':
    case 'item':
    case 'passive':
    case 'cluster-jewel':
    case 'faction':
    case 'event':
      return schemaSection(registry, moduleId, section.kind, value);
    case 'action':
      return actionSection(moduleId, value as ActionDeclaration);
    case 'entity':
      return schemaSection(registry, moduleId, section.kind, value);
    case 'location':
      return locationSection(registry, moduleId, value as Location);
    case 'recipe':
    case 'resource':
      return schemaSection(registry, moduleId, section.kind, value);
    case 'droptable':
      return dropTableSection(moduleId, value as DropTable);
    case 'dialogue':
      return dialogueSection(moduleId, value as Dialogue);
    case 'flag':
    case 'slot':
    case 'variable':
      return schemaSection(registry, moduleId, section.kind, value);
    case 'locale': {
      const declared = value as LocaleDeclaration;
      return [`# locale ${declared.language}`, ...declared.entries.map((entry) => `${entry.key}: ${entry.value}`)].join('\n');
    }
    case 'save':
      return saveSection(moduleId, id, value as ParsedSave);
    case 'test':
      return testSection(moduleId, value as Test);
    // Neither is a section a module prints back: the header is `infoLines`
    // above, written from the options rather than from the registry, and a
    // `# remove` is spent at merge and leaves nothing behind to print.
    case 'info':
    case 'remove':
      throw new Error(`# ${section.kind} is not a section a printed module carries`);
    default: {
      const unreached: never = section;
      void unreached;
      return '';
    }
  }
}

// Not exported, so that printed content cannot leave this file without the
// comparison the three round trips below make of it.
function serializeRegistryModule(registry: Registry, options: SerializeModuleOptions): string {
  const sections = printedSections(registry, options).map((each) => sectionText(registry, options.info.id, each));
  return [infoLines(options.info).join('\n'), ...sections].join('\n\n').trimEnd() + '\n';
}

export interface RoundTrip {
  printed: string;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

export function declaredGlobalIds(module: ParsedModule): string[] {
  return module.sections
    .filter((section) => GLOBAL_SECTION_KINDS.includes(section.kind))
    .map((section) => (section.value as { id: string }).id)
    .sort();
}

function compare(loaded: Registry, printed: string, checked: UniverseLoadResult): RoundTrip {
  if (checked.diagnostics.length > 0) return { printed, diagnostics: checked.diagnostics, differences: [] };
  return { printed, diagnostics: [], differences: registryDiff(loaded, checked.registry) };
}

// The reload is supplied rather than performed: a caller decides which other
// sources the printed module is reloaded beside, and squashing reloads against
// a different set than probing does.
export function roundTripModule(loaded: Registry, options: SerializeModuleOptions, reload: (printed: string) => UniverseLoadResult): RoundTrip {
  const printed = serializeRegistryModule(loaded, options);
  return compare(loaded, printed, reload(printed));
}

export interface Republished {
  // Null when the round trip refused, which is a caller's cue to publish the
  // author's own bytes rather than a print that would lose something.
  printed: string | null;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

// A module serialized under an id other than the one it loaded under. The round
// trip is taken first and under the loaded id, because that is the only
// comparison whose two sides hold the same keys: renaming a module moves the
// compiled locale keys and inline action ids with it, and a diff against a
// hand-renamed registry reports every one of those as a loss. What the trip
// proves is the thing the rename does not touch — that the serializer carries
// this module whole, which is what an edit to another module's content is not.
export function republishModule(
  loaded: Registry,
  options: SerializeModuleOptions,
  reload: (printed: string) => UniverseLoadResult,
  as: { registry: Registry; options: SerializeModuleOptions },
): Republished {
  const trip = roundTripModule(loaded, options, reload);
  if (trip.diagnostics.length > 0 || trip.differences.length > 0) return { printed: null, diagnostics: trip.diagnostics, differences: trip.differences };
  return { printed: serializeRegistryModule(as.registry, as.options), diagnostics: [], differences: [] };
}

// Deliberately not a RoundTrip. A universe has no single reloadable text — the
// concatenation of several modules declares `# info` more than once and will not
// load — so `printed` would carry a second meaning on an inherited field.
export interface UniverseRoundTrip {
  sources: ModuleSource[];
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

// Every source is replaced at once. A module is serialized from the merged
// registry, so it already carries what other modules did to its ids; leaving any
// original source in the reload would apply those edits a second time.
export function roundTripUniverse(loaded: Registry, modules: readonly ParsedModule[], reload: (printed: readonly ModuleSource[]) => UniverseLoadResult): UniverseRoundTrip {
  const sources = modules.map((module) => ({ ...module.source, text: serializeRegistryModule(loaded, { info: module.info, globals: declaredGlobalIds(module) }) }));
  const { diagnostics, differences } = compare(loaded, '', reload(sources));
  return { sources, diagnostics, differences };
}

export const canSerialize = (module: ParsedModule): boolean => module.namespace !== null;
