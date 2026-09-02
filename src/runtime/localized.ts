import { RuntimeError } from './error';
import { Action } from '../grammar/action';
import { actionTextKey, actionTextOwner } from '../content/sections/action';
import { EngineKey, localeKey, Locales } from '../content/locale';
import { parseSegments, TextSegment } from '../grammar/segment';
import { Registry } from '../content/registry';
import { withoutNote } from '../grammar/note';
import { mintedName, PARAM } from '../grammar/values';

declare const LOCALIZED: unique symbol;

export type Localized = string & { readonly [LOCALIZED]: true };

export type Answer = string;

export type AnswerTable<V extends Answer | number | boolean> = Readonly<Record<Answer, V>>;

export type Params = Readonly<Record<string, Localized | number>>;


function substitute(pattern: string, key: string, params: Params): string {
  return pattern.replace(PARAM, (_whole, name: string) => {
    const value = params[name];
    if (value === undefined) throw new RuntimeError(`${key} takes a {${name}} the call site did not supply`);
    return typeof value === 'number' ? String(value) : value;
  });
}

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
    return (found === undefined ? key : substitute(found, key, params)) as Localized;
  };
  const self: Localizer = {
    language,
    engine: (key, params = {}) => keyed(key, params),
    content: (kind, id, field, params = {}) => keyed(contentKey(registry, kind, id, field), params),
    words: (kind, id, field, params = {}) => {
      const key = contentKey(registry, kind, id, field);
      const found = pattern(locales, language, key);
      return found === undefined ? undefined : (substitute(found, key, params) as Localized);
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
