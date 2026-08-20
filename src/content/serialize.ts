import {condition, printReference} from '../grammar/condition';
import {dependency, version as versionParser, Version} from '../grammar/dependency';
import {indentLines} from '../grammar/structure';
import {TextSegment} from './sections/dialogue';
import {Registry} from './registry';
import type {ModuleDiagnostic, UniverseLoadResult} from './registry';
import {registryDiff} from './registryDiff';
import {globalSectionKinds, printSectionOf, registryMapOf, sectionKinds, sectionFor, sectionOf, type ModuleSection, type SectionKind} from './sections';
import type {ModuleSource, ParsedModule} from './universe';
import {Directive, usePayload} from './sections/test';
import {hexKey} from './hex';
import {ModuleInfo} from './sections/info';
import {DEFAULT_LANGUAGE} from '../grammar/section';
import {localeKey, moduleLocaleSections} from './locale';
import {mapOf} from './registry';

type Lines = string[];

export interface SerializeModuleOptions {
  info: Pick<ModuleInfo, 'id'> & Partial<Pick<ModuleInfo, 'version' | 'dependencies' | 'pack' | 'language'>>;
  // The ids of the global sections this module declared. A global id belongs to
  // nobody, so `inModule` cannot find one and the caller says which it wrote.
  globals?: readonly string[];
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

const tableOf = (registry: Registry, kind: SectionKind): ReadonlyMap<string, object> => mapOf(registry, registryMapOf(kind)!) as unknown as ReadonlyMap<string, object>;

// What a module prints, in the order it prints it, walked off the row rather
// than written out as one loop per kind. A kind added to the row is carried by
// this walk with no edit, which is the whole repair: `# passive` was parsed for
// a day and a half while a loop nobody remembered to add discarded it.
function printedSections(registry: Registry, options: SerializeModuleOptions): Printed[] {
  const moduleId = options.info.id;
  const printed: Printed[] = [];
  let globalsDone = false;
  for (const kind of sectionKinds()) {
    const owner = sectionFor(kind)!;
    // A global id belongs to nobody, so the module says which it declared and
    // the whole group prints in that one order — by id, across the kinds,
    // rather than kind by kind. Emitted where the row first reaches a global
    // kind, which is what keeps the group's place in the order the row's.
    if (owner.ids === 'global') {
      if (globalsDone) continue;
      globalsDone = true;
      for (const id of options.globals ?? []) {
        for (const global of globalSectionKinds()) {
          const value = tableOf(registry, global).get(id);
          if (value !== undefined) printed.push({ id, section: sectionOf(global, value) });
        }
      }
      continue;
    }
    // A locale belongs to the module that wrote it rather than to any id, so it
    // is printed by attribution and never by `inModule`.
    if (kind === 'locale') {
      for (const declared of moduleLocaleSections(registry.locales, moduleId))
        printed.push({
          id: declared.language,
          section: sectionOf('locale', declared),
        });
      continue;
    }
    if (owner.map === null) continue;
    for (const [id, value] of tableOf(registry, kind)) if (inModule(moduleId, id)) printed.push({ id, section: sectionOf(kind, value) });
  }
  return printed;
}

// One section's text. Total over the kinds by a `never` guard, so a kind the
// row declares and this cannot print is a compile error rather than a section
// that disappears on republish.
// One section's text, asked of the kind that owns it. There is no switch here
// and no table of exceptions: a kind with fields is printed by the walk over
// them, and a kind with its own grammar brought its own printer.
function sectionText(registry: Registry, moduleId: string, { id, section }: Printed): string {
  const namespace = sectionFor(section.kind)!.ids === 'global' ? null : moduleId;
  return printSectionOf(section, {
    moduleId,
    id,
    authored: (field) => {
      const entry = registry.locales.base.get(localeKey(namespace, section.kind, id, field));
      return entry !== undefined && !entry.generated;
    },
  });
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
    .filter((section) => globalSectionKinds().includes(section.kind))
    .map((section) => (section.value as { id: string }).id)
    .sort();
}

function compare(loaded: Registry, printed: string, checked: UniverseLoadResult): RoundTrip {
  if (checked.diagnostics.length > 0) return { printed, diagnostics: checked.diagnostics, differences: [] };
  return {
    printed,
    diagnostics: [],
    differences: registryDiff(loaded, checked.registry),
  };
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
export function republishModule(loaded: Registry, options: SerializeModuleOptions, reload: (printed: string) => UniverseLoadResult, as: { registry: Registry; options: SerializeModuleOptions }): Republished {
  const trip = roundTripModule(loaded, options, reload);
  if (trip.diagnostics.length > 0 || trip.differences.length > 0)
    return {
      printed: null,
      diagnostics: trip.diagnostics,
      differences: trip.differences,
    };
  return {
    printed: serializeRegistryModule(as.registry, as.options),
    diagnostics: [],
    differences: [],
  };
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
  const sources = modules.map((module) => ({
    ...module.source,
    text: serializeRegistryModule(loaded, {
      info: module.info,
      globals: declaredGlobalIds(module),
    }),
  }));
  const { diagnostics, differences } = compare(loaded, '', reload(sources));
  return { sources, diagnostics, differences };
}

export const canSerialize = (module: ParsedModule): boolean => module.namespace !== null;
