import { type Registry } from './registry';
import { engineModule } from './engineModules';
import { loadUniverse } from './load';
import type { ModuleSource } from './universe';

// The module holding English for every string the engine says on its own behalf. It is the engine's
// and not an author's, so it lives with the other engine modules — see `engineModules.ts`.
export const ENGINE_LOCALE_MODULE = 'engine-en';

let held: ModuleSource | undefined;

export const engineLocale = (): ModuleSource => (held ??= engineModule(ENGINE_LOCALE_MODULE));

export const withEngineLocale = (sources: readonly ModuleSource[]): ModuleSource[] => {
  const engine = engineLocale();
  return sources.some((source) => source.name === engine.name) ? [...sources] : [engine, ...sources];
};

export const loadInEnglish = (source: string): Registry => loadUniverse(withEngineLocale([{ name: 'anonymous', text: source }]));
