import { DEFAULT_LANGUAGE } from '../grammar/section';
import { ENGINE_KEYS, type Locales } from './locale';
import type { Registry } from './registry';
import type { ModuleSource } from './universe';

export const TRANSLATED_LANGUAGE = 'zz';

const SHIFT: Readonly<Record<string, number>> = {
  [DEFAULT_LANGUAGE]: 13,
  [TRANSLATED_LANGUAGE]: 7,
};

const FRAGMENT = /\{[^{}]*\}/g;
const TOKEN = new RegExp(`${FRAGMENT.source}|[A-Za-z]`, 'g');

export const hasWords = (text: string): boolean => /[A-Za-z]/.test(text.replace(FRAGMENT, ''));

const rotate = (letter: string, shift: number): string => {
  const base = letter <= 'Z' ? 65 : 97;
  return String.fromCharCode(((letter.charCodeAt(0) - base + shift) % 26) + base);
};

const shifted = (text: string, shift: number): string => text.replace(TOKEN, (token) => (token.startsWith('{') ? token : rotate(token, shift)));

export const englishOf = (locales: Locales, key: string): string => locales.declared.get(DEFAULT_LANGUAGE)?.get(key) ?? locales.base.get(key)?.text ?? key;

export const everyKey = (locales: Locales): string[] => [...new Set([...ENGINE_KEYS, ...locales.addressable])];

export function translationOf(registry: Registry): ModuleSource {
  const keys = everyKey(registry.locales);
  const section = (language: string): string[] => [`# locale ${language}`, ...keys.map((key) => `${key}: ${shifted(englishOf(registry.locales, key), SHIFT[language])}`), ``];
  return {
    name: 'translated',
    text: [`# info translated`, `language: ${TRANSLATED_LANGUAGE}`, ``, ...section(DEFAULT_LANGUAGE), ...section(TRANSLATED_LANGUAGE)].join('\n'),
  };
}
