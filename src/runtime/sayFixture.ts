import type { Registry } from '../content/registry';
import { BASE_LANGUAGE, localizerFor } from './localized';
import { say, type Said } from './said';

export const inEnglish = (registry: Registry, said: Said): string => say(localizerFor(registry, BASE_LANGUAGE), said);
