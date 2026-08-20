import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { engineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { englishOf, everyKey, hasWords, translationOf, TRANSLATED_LANGUAGE } from '../content/translation';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { createGameState } from './runtime';
import { runTest, type TestResult } from './session';

const sources = [engineLocale(), { name: 'tutorial-island', text: readFileSync('content/tutorial-island.dsl', 'utf8') }];
const shipped = loadUniverse(sources);
const registry = loadUniverse([...sources, translationOf(shipped)]);

const PLAYED = [BASE_LANGUAGE, TRANSLATED_LANGUAGE];

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
    const worded = keys.filter((key) => hasWords(englishOf(shipped.locales, key)));

    expect(worded.length).toBeGreaterThan(keys.length - worded.length);
    for (const language of PLAYED) expect(worded.filter((key) => registry.locales.declared.get(language)?.get(key) === englishOf(shipped.locales, key))).toEqual([]);
  });

  const fragments = (text: string): string[] => [...text.matchAll(/\{[^{}]*\}/g)].map((match) => match[0]);

  it('leaves every braced fragment standing, whatever it does to the words around it', () => {
    const keys = everyKey(shipped.locales);
    const moved = [];
    for (const language of PLAYED) {
      for (const key of keys) {
        const replaced = registry.locales.declared.get(language)?.get(key) ?? '';
        if (fragments(replaced).join() !== fragments(englishOf(shipped.locales, key)).join()) moved.push(`${language} ${key}`);
      }
    }
    expect(moved).toEqual([]);
  });

  it('gives the base language and the played one different words for one key', () => {
    const worded = everyKey(shipped.locales).filter((key) => hasWords(englishOf(shipped.locales, key)));
    expect(worded.filter((key) => registry.locales.declared.get(BASE_LANGUAGE)?.get(key) === registry.locales.declared.get(TRANSLATED_LANGUAGE)?.get(key))).toEqual([]);
  });

  it('says nothing a shipped title says', () => {
    const asShipped = localizerFor(shipped, BASE_LANGUAGE);
    const ids = [...shipped.items.keys()];

    expect(ids.length).toBeGreaterThan(5);
    for (const language of PLAYED) {
      const said = localizerFor(registry, language);
      expect(ids.filter((id) => said.title('item', id) === asShipped.title('item', id))).toEqual([]);
    }
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
