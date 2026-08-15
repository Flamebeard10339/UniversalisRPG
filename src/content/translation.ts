import { DEFAULT_LANGUAGE } from '../grammar/section';
import { ENGINE_KEYS, type Locales } from './locale';
import type { Registry } from './registry';
import type { ModuleSource } from './universe';

// A tag no module ships, so a universe carrying this translation reads in words
// no `# test` was ever written beside.
export const TRANSLATED_LANGUAGE = 'zz';

// Two shifts rather than one, so the base language and the played one are not
// only different from the English but different from each other: a surface that
// reaches for the wrong one of the two cannot land on the right words by
// accident.
const SHIFT: Readonly<Record<string, number>> = { [DEFAULT_LANGUAGE]: 13, [TRANSLATED_LANGUAGE]: 7 };

// A braced fragment, or a letter. Punctuation, digits and spacing stand where
// they are, and a fragment is carried through whole: an engine pattern's
// parameter keeps the spelling its English gave it, because a translation may
// name no parameter its English does not, and a spoken line's `{player.name}`
// or `{quest-given: text}` is the segment grammar's machinery rather than words
// — shifting its letters would leave a path naming nothing and a condition the
// grammar cannot read.
const FRAGMENT = /\{[^{}]*\}/g;
const TOKEN = new RegExp(`${FRAGMENT.source}|[A-Za-z]`, 'g');

// Whether a pattern has any word of its own for a replacement to reach. One
// that is only fragments and punctuation has none, and is the one thing no
// replacement can make different.
export const hasWords = (text: string): boolean => /[A-Za-z]/.test(text.replace(FRAGMENT, ''));

const rotate = (letter: string, shift: number): string => {
  const base = letter <= 'Z' ? 65 : 97;
  return String.fromCharCode(((letter.charCodeAt(0) - base + shift) % 26) + base);
};

const shifted = (text: string, shift: number): string => text.replace(TOKEN, (token) => (token.startsWith('{') ? token : rotate(token, shift)));

// The words a key is shown in today: what a `# locale en` declared, else the
// text its own section authored, else the key itself — which is what a player
// already reads for a key nothing has words for, and so what a replacement of
// it has to differ from.
export const englishOf = (locales: Locales, key: string): string => locales.declared.get(DEFAULT_LANGUAGE)?.get(key) ?? locales.base.get(key)?.text ?? key;

export const everyKey = (locales: Locales): string[] => [...new Set([...ENGINE_KEYS, ...locales.addressable])];

// A module that replaces every word the universe it was built from can address
// — every engine pattern, every title, examine and action label — in the base
// language and in one nothing ships. Load it after those same sources and the
// English the shipped `# test` sections were authored beside is on no surface,
// whichever of the two is played.
export function translationOf(registry: Registry): ModuleSource {
  const keys = everyKey(registry.locales);
  const section = (language: string): string[] => [`# locale ${language}`, ...keys.map((key) => `${key}: ${shifted(englishOf(registry.locales, key), SHIFT[language])}`), ``];
  return {
    name: 'translated',
    text: [`# info translated`, `language: ${TRANSLATED_LANGUAGE}`, ``, ...section(DEFAULT_LANGUAGE), ...section(TRANSLATED_LANGUAGE)].join('\n'),
  };
}
