import { readFileSync } from 'fs';
import { type Registry } from './registry';
import { loadUniverse } from './load';
import type { ModuleSource } from './universe';

export const ENGINE_LOCALE_FILE = 'content/engine-en.dsl';

let text: string | undefined;

export const engineLocale = (): ModuleSource => ({
  name: 'engine-en',
  text: (text ??= readFileSync(ENGINE_LOCALE_FILE, 'utf8')),
});

export const withEngineLocale = (sources: readonly ModuleSource[]): ModuleSource[] => {
  const engine = engineLocale();
  return sources.some((source) => source.name === engine.name) ? [...sources] : [engine, ...sources];
};

export const loadInEnglish = (source: string): Registry => loadUniverse(withEngineLocale([{ name: 'anonymous', text: source }]));
