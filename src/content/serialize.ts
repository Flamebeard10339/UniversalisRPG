import {condition} from '../grammar/condition';
import {dependency, version as versionParser, Version} from '../grammar/dependency';
import {indentLines} from '../grammar/structure';
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
  globals?: readonly string[];
}

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

interface Printed {
  id: string;
  section: ModuleSection;
}

const tableOf = (registry: Registry, kind: SectionKind): ReadonlyMap<string, object> => mapOf(registry, registryMapOf(kind)!) as unknown as ReadonlyMap<string, object>;

function printedSections(registry: Registry, options: SerializeModuleOptions): Printed[] {
  const moduleId = options.info.id;
  const printed: Printed[] = [];
  let globalsDone = false;
  for (const kind of sectionKinds()) {
    const owner = sectionFor(kind)!;
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
    if (kind === 'locale') {
      for (const declared of moduleLocaleSections(registry.locales, moduleId))
        printed.push({
          id: declared.language,
          section: sectionOf('locale', declared),
        });
      continue;
    }
    if (owner.map === null) continue;
    // What a module wrote of this kind, which is not everything standing in this kind's map: a kind may land entries in another's — a quest gives dialogues away — and those are that kind's to write, not this one's. The namespace declared the written ones and not the given ones, and it is asked rather than guessed at.
    for (const [id, value] of tableOf(registry, kind)) if (inModule(moduleId, id) && registry.namespace.has(kind, id)) printed.push({ id, section: sectionOf(kind, value) });
  }
  return printed;
}

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

export function roundTripModule(loaded: Registry, options: SerializeModuleOptions, reload: (printed: string) => UniverseLoadResult): RoundTrip {
  const printed = serializeRegistryModule(loaded, options);
  return compare(loaded, printed, reload(printed));
}

export interface Republished {
  printed: string | null;
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

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

export interface UniverseRoundTrip {
  sources: ModuleSource[];
  diagnostics: ModuleDiagnostic[];
  differences: string[];
}

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
