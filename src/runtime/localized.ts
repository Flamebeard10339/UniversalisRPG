import { RuntimeError } from './error';
import { Action } from '../grammar/action';
import { actionTextKey, actionTextOwner } from '../content/sections/action';
import { EngineKey, isEngineKey, localeKey, Locales } from '../content/locale';
import { parseSegments, TextSegment } from '../grammar/segment';
import { Registry } from '../content/registry';
import { withoutNote } from '../grammar/note';
import { mintedName } from '../grammar/values';
import { weighInFrame } from '../grammar/frame';
import { DslError } from '../grammar/parser';

declare const LOCALIZED: unique symbol;

export type Localized = string & { readonly [LOCALIZED]: true };

export type Answer = string;

export type AnswerTable<V extends Answer | number | boolean> = Readonly<Record<Answer, V>>;

export type Params = Readonly<Record<string, Localized | number>>;


const TOKENIZED = new Map<string, readonly TextSegment[]>();

const segmentsOf = (words: string): readonly TextSegment[] => {
  const held = TOKENIZED.get(words);
  if (held !== undefined) return held;
  const parsed = parseSegments(words, 0);
  TOKENIZED.set(words, parsed);
  return parsed;
};

function substitute(pattern: string, key: string, params: Params): string {
  try {
    return weighInFrame(segmentsOf(pattern), params, key);
  } catch (error) {
    throw error instanceof DslError ? new RuntimeError(error.message) : error;
  }
}

const READ_AS = new Map<string, string>();

const plainly = (words: string): string => {
  const held = READ_AS.get(words);
  if (held !== undefined) return held;
  const said = segmentsOf(words)
    .map((segment) => (segment.kind === 'literal' ? segment.text : ''))
    .join('');
  READ_AS.set(words, said);
  return said;
};

function pattern(locales: Locales, language: string, key: string): string | undefined {
  const declared = locales.declared.get(language)?.get(key);
  if (declared !== undefined) return withoutNote(declared);
  const base = locales.base.get(key);
  if (base?.language === language) return withoutNote(base.text);
  const said = locales.carried.get(key);
  return said === undefined ? undefined : pattern(locales, language, said);
}

export interface Localizer {
  readonly language: Answer;
  engine(key: EngineKey, params?: Params): Localized;
  content(kind: string, id: string, field: string, params?: Params): Localized;
  words(kind: string, id: string, field: string, params?: Params): Localized | undefined;
  title(kind: string, id: string): Localized;
  actionLabel(kind: string, ownerId: string, action: Action): Localized;
  line(key: string, weigh: Weighing): Localized;
  prose(kind: string, id: string, field: string, weigh: Weighing): Localized | undefined;
  identifier(id: string): Localized;
  minted(id: string): Localized;
}

export type Weighing = (segments: TextSegment[]) => string;

export const BASE_LANGUAGE = 'en';

const contentKey = (registry: Registry, kind: string, id: string, field: string): string => localeKey(registry.namespace.ownerOf(kind, id) ?? null, kind, id, field);

export function localizerFor(registry: Registry, language: string): Localizer {
  const { locales } = registry;
  const keyed = (key: string, params: Params): Localized => {
    const found = pattern(locales, language, key);
    if (found === undefined) return key as Localized;
    return (isEngineKey(key) ? substitute(found, key, params) : plainly(found)) as Localized;
  };
  const self: Localizer = {
    language,
    engine: (key, params = {}) => keyed(key, params),
    content: (kind, id, field, params = {}) => keyed(contentKey(registry, kind, id, field), params),
    words: (kind, id, field, params = {}) => {
      const key = contentKey(registry, kind, id, field);
      const found = pattern(locales, language, key);
      if (found === undefined) return undefined;
      return (isEngineKey(key) ? substitute(found, key, params) : plainly(found)) as Localized;
    },
    title: (kind, id) => self.content(kind, id, 'title'),
    actionLabel: (kind, ownerId, action) => keyed(actionTextKey(actionTextOwner(registry.namespace, kind, ownerId, action)), {}),
    line: (key, weigh) => weigh(parseSegments(pattern(locales, language, key) ?? key, 0)) as Localized,
    prose: (kind, id, field, weigh) => {
      const found = pattern(locales, language, contentKey(registry, kind, id, field));
      return found === undefined ? undefined : (weigh(parseSegments(found, 0)) as Localized);
    },
    identifier: (id) => id as Localized,
    minted: (id) => mintedName(id, language) as Localized,
  };
  return self;
}

export interface LanguageChoice {
  readonly language: string;
}

export const localizerOf = (registry: Registry, playing: LanguageChoice): Localizer => localizerFor(registry, playing.language);

export const itemExamine = (localizer: Localizer, item: string, weigh: Weighing): Localized | undefined => localizer.prose('item', item, 'examine', weigh);
