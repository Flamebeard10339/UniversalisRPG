import type { Registry } from '../content/registry';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { say, type Said } from './said';

// What a `Said` reads as in the engine's own English, for a test that is about
// the sentence rather than about the language. Every other reader of one plays
// a language; this is the one that already knows which words it wants.
export const inEnglish = (registry: Registry, said: Said): string => say(localizerFor(registry, BASE_LANGUAGE), said);
