import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/registry';
import { englishOf, everyKey, hasWords, translationOf, TRANSLATED_LANGUAGE } from '../content/translation';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { createGameState } from './runtime';
import { runTest, type TestResult } from './session';

// c5: what a recording replays is what the engine stores, so no edit to a
// translation and no rename of an English title may change the outcome of one.
// The universe is the shipped one with every word it can address replaced —
// in the base language, which is the editor's side, and in one nothing ships,
// which is the translator's — and the shipped `# test` sections are replayed
// against it in both.
const sources = [engineLocale(), { name: 'tutorial-island', text: readFileSync('content/tutorial-island.dsl', 'utf8') }];
const shipped = loadUniverse(sources);
const registry = loadUniverse([...sources, translationOf(shipped)]);

const PLAYED = [BASE_LANGUAGE, TRANSLATED_LANGUAGE];

// A throw is a route that did not replay, which is the same outcome as a
// refused assertion and is reported beside it rather than taking the run down.
function replay(id: string, language: string): TestResult {
  try {
    return runTest(id, registry, createGameState('', language));
  } catch (error) {
    return { passed: false, failure: error instanceof Error ? error.message : String(error) };
  }
}

describe('a universe with every word replaced', () => {
  it('addresses every key the shipped universe does, in both languages', () => {
    const keys = everyKey(shipped.locales);
    expect(keys.length).toBe(everyKey(registry.locales).length);
    for (const language of PLAYED) expect(keys.filter((key) => registry.locales.declared.get(language)?.has(key) !== true)).toEqual([]);
  });

  it('leaves no key reading the English it was authored in', () => {
    const keys = everyKey(shipped.locales);
    expect(keys.filter((key) => !hasWords(englishOf(shipped.locales, key)))).toEqual(['engine.carried.worn']);
    const worded = keys.filter((key) => hasWords(englishOf(shipped.locales, key)));
    for (const language of PLAYED) expect(worded.filter((key) => registry.locales.declared.get(language)?.get(key) === englishOf(shipped.locales, key))).toEqual([]);
  });

  it('gives the base language and the played one different words for one key', () => {
    const worded = everyKey(shipped.locales).filter((key) => hasWords(englishOf(shipped.locales, key)));
    expect(worded.filter((key) => registry.locales.declared.get(BASE_LANGUAGE)?.get(key) === registry.locales.declared.get(TRANSLATED_LANGUAGE)?.get(key))).toEqual([]);
  });

  it('says nothing a shipped title says', () => {
    expect(localizerFor(shipped, BASE_LANGUAGE).title('item', 'tutorial-island.iron-sword')).toBe('Iron Sword');
    for (const language of PLAYED) expect(localizerFor(registry, language).title('item', 'tutorial-island.iron-sword')).not.toBe('Iron Sword');
  });
});

describe('a recording survives translation', () => {
  for (const id of registry.tests.keys()) {
    for (const language of PLAYED) {
      it(`test "${id}" passes in ${language}`, () => {
        expect(replay(id, language)).toEqual({ passed: true });
      });
    }
  }
});
