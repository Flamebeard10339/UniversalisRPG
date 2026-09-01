import { describe, expect, it } from 'vitest';
import { withEngineLocale } from '../content/engineLocale';
import { loadUniverse } from '../content/load';
import { isDebug } from '../content/sections';
import { englishOf, everyKey, hasWords, translationOf, TRANSLATED_LANGUAGE } from '../content/translation';
import { choose, openerShown, openersNow, talk } from './dialogue-runtime';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { createGameState } from './runtime';
import { runTest, type TestResult } from './session';
import { fixtureSources } from '../content/worldFixture';

const sources = withEngineLocale(fixtureSources());
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
    // A title that moves is one somebody is shown, so the subjects are the items the locale carries words for rather than every item declared: a DEBUG section says nothing in any language, and asking its untranslatable fallback to move would be asking for the opposite of that.
    const ids = [...shipped.items.keys()].filter((id) => asShipped.words('item', id, 'title') !== undefined);

    expect(ids.length).toBeGreaterThan(5);
    for (const language of PLAYED) {
      const said = localizerFor(registry, language);
      expect(ids.filter((id) => said.title('item', id) === asShipped.title('item', id))).toEqual([]);
    }
  });
});

// What this asks is whether replacing every word changes the answer — not whether the route passes,
// which is `integration.test.ts`'s question and is answered there once. A route broken by a balance
// pass reddens that file alone; if it reddened here too, a content bug would read as a translation
// bug in three files at once and send its reader into the engine.
describe('a recording survives translation', () => {
  for (const id of registry.tests.keys()) {
    for (const language of PLAYED) {
      it(`test "${id}" reaches the same verdict in ${language}`, () => {
        expect(replay(id, language)).toEqual(replay(id, BASE_LANGUAGE));
      });
    }
  }
});

const talkedTo = (holds: (dialogue: object) => boolean): ReadonlySet<string> =>
  new Set([...registry.dialogues.values()].filter(holds).flatMap((dialogue) => (dialogue.owner === undefined ? [] : [dialogue.owner])));

// Every entity anybody has written a word for, which is where a list of threads comes from. An
// entity holding a DEBUG dialogue is not one of them: that dialogue says nothing in any language,
// so its threads read the same in both and the claim below is about words it has not got. The mark
// is read off the section rather than off whether the locale carries the words, so a node whose
// words really are missing still fails here rather than quietly leaving the sweep.
const silenced = talkedTo(isDebug);
const owners = [...talkedTo((dialogue) => !isDebug(dialogue))].filter((owner) => !silenced.has(owner));

const threadsOf = (entityId: string, language: string): string[] => openersNow(registry, createGameState('', language), entityId).map((opener) => `${opener.dialogue.id}.${opener.node.name}`);

const readsAs = (entityId: string, language: string): string[] => {
  const state = createGameState('', language);
  return openersNow(registry, state, entityId).map((opener) => openerShown(registry, state, opener.node) as string);
};

describe('a list of threads', () => {
  // The lists the corpus actually puts up, rather than the entity that says one thing and is entered outright.
  const listing = owners.filter((owner) => threadsOf(owner, BASE_LANGUAGE).length > 1);

  it('is something the corpus puts up, so there is a list here to pick out of at all', () => {
    expect(listing.length).toBeGreaterThan(0);
  });

  it('reads as different words in each language, and still gives whoever names a thread that same thread', () => {
    for (const owner of listing) {
      expect(readsAs(owner, BASE_LANGUAGE)).not.toEqual(readsAs(owner, TRANSLATED_LANGUAGE));
      for (const thread of threadsOf(owner, BASE_LANGUAGE)) {
        for (const language of PLAYED) {
          const state = createGameState('', language);
          choose(thread, talk(owner, registry, state)!, registry, state);
          expect([owner, language, Object.keys(state.visits)[0]]).toEqual([owner, language, thread]);
        }
      }
    }
  });
});

// The claim above is about the engine; this one is about whether the corpus uses it. A recording that counts to its choice takes a different one in another language, so the shipped ones name theirs, and both routes that pick from a list are replayed in both languages by the recording sweep above. The subjects derive from the recordings themselves, so one converted next month needs no edit here and one converted back is caught.
describe('a recording the corpus ships', () => {
  it('names the choice it takes rather than counting to it', () => {
    const counting = [...registry.tests.values()].filter((test) => test.directives.some((directive) => directive.kind === 'choose' && /^\d+$/.test(directive.text)));

    expect(counting.map((test) => test.id)).toEqual([]);
  });
});
