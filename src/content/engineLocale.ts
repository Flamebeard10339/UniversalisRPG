import { readFileSync } from 'fs';
import { type Registry } from './registry';
import { loadUniverse } from './load';
import type { ModuleSource } from './universe';

// The shipped engine locale, read off disk. Node only, and so for tests and
// tools rather than for the app: the browser gets the same file through the
// content glob, and there is no second copy of these patterns anywhere.
export const ENGINE_LOCALE_FILE = 'content/engine-en.dsl';

// Read once: a test that loads a universe per seed reads this thousands of
// times, and the file does not change under a run.
let text: string | undefined;

export const engineLocale = (): ModuleSource => ({
  name: 'engine-en',
  text: (text ??= readFileSync(ENGINE_LOCALE_FILE, 'utf8')),
});

// The engine's own words are not a content file a caller picks: a universe
// assembled without them plays every engine sentence as its bare key, and
// nothing complains. So the requirement is discharged where sources are
// assembled rather than remembered in a default argument. Idempotent, because
// a caller naming the file explicitly is naming what is already here.
export const withEngineLocale = (sources: readonly ModuleSource[]): ModuleSource[] => {
  const engine = engineLocale();
  return sources.some((source) => source.name === engine.name) ? [...sources] : [engine, ...sources];
};

// One module beside the engine's English, which is what a test asserting an
// engine sentence rather than an engine key is playing.
export const loadInEnglish = (source: string): Registry => loadUniverse(withEngineLocale([{ name: 'anonymous', text: source }]));
