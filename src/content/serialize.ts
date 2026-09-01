import {dependency, version as versionParser, Version} from '../grammar/dependency';
import {indentLines} from '../grammar/structure';
import {Registry} from './registry';
import type {ModuleDiagnostic, UniverseLoadResult} from './registry';
import {registryDiff} from './registryDiff';
import {globalSectionKinds, mergeSection, printSectionOf, registryMapOf, sectionKinds, sectionFor, sectionOf, type ModuleSection, type SectionKind} from './sections';
import type {ModuleSource, ParsedModule} from './universe';
import {ModuleInfo} from './sections/info';
import {DEFAULT_LANGUAGE} from '../grammar/section';
import {localeKey, moduleLocaleSections} from './locale';
import {moduleNamed} from './resolve';
import {mapOf, type Contribution} from './registry';

type Lines = string[];

export interface SerializeModuleOptions {
  info: Pick<ModuleInfo, 'id'> & Partial<Pick<ModuleInfo, 'version' | 'dependencies' | 'pack' | 'language'>>;
  globals?: readonly string[];
  absorbing?: string;
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

interface Printed {
  id: string;
  section: ModuleSection;
}

const tableOf = (registry: Registry, kind: SectionKind): ReadonlyMap<string, object> => mapOf(registry, registryMapOf(kind)!) as unknown as ReadonlyMap<string, object>;

function writingOf(registry: Registry, options: SerializeModuleOptions): Contribution[] {
  const written = [...(registry.contributions.get(options.info.id) ?? [])];
  if (options.absorbing === undefined) return written;
  for (const staged of registry.contributions.get(options.absorbing) ?? []) {
    if (moduleNamed(staged.id) !== options.info.id) continue;
    const at = written.findIndex((each) => each.kind === staged.kind && each.id === staged.id);
    if (at === -1) written.push(staged);
    else written[at] = { ...staged, value: mergeSection(staged.kind, written[at]!.value, staged.value) };
  }
  return written;
}

function printedSections(registry: Registry, options: SerializeModuleOptions): Printed[] {
  const moduleId = options.info.id;
  const written = writingOf(registry, options);
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
    for (const each of written) if (each.kind === kind) printed.push({ id: each.id, section: sectionOf(kind, each.value) });
  }
  return printed;
}

function sectionText(registry: Registry, moduleId: string, { id, section }: Printed): string {
  const namespace = sectionFor(section.kind)!.ids === 'global' ? null : (registry.namespace.ownerOf(section.kind, id) ?? moduleId);
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
