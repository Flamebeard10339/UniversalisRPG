import { type Registry } from './registry';
import { engineModule } from './engineModules';
import { loadUniverse } from './load';
import type { ModuleSource } from './universe';

export const ENGINE_LOCALE_MODULE = 'engine-en';

let held: ModuleSource | undefined;

export const engineLocale = (): ModuleSource => (held ??= engineModule(ENGINE_LOCALE_MODULE));

export const withEngineLocale = (sources: readonly ModuleSource[]): ModuleSource[] => {
  const engine = engineLocale();
  return sources.some((source) => source.name === engine.name) ? [...sources] : [engine, ...sources];
};

export const loadInEnglish = (source: string): Registry => loadUniverse(withEngineLocale([{ name: 'anonymous', text: source }]));
