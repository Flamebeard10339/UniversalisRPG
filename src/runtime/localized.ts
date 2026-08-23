import { RuntimeError } from './error';
import { Action } from '../grammar/action';
import { actionTextKey, actionTextOwner } from '../content/sections/action';
import { EngineKey, localeKey, Locales } from '../content/locale';
import { parseSegments, TextSegment } from '../grammar/segment';
import { Registry } from '../content/registry';
import { withoutNote } from '../grammar/note';

declare const LOCALIZED: unique symbol;

export type Localized = string & { readonly [LOCALIZED]: true };

export type Answer = string;

export type AnswerTable<V extends Answer | number | boolean> = Readonly<Record<Answer, V>>;

export type Params = Readonly<Record<string, Localized | number>>;

const PARAM = /\{([a-z][a-z0-9-]*)\}/g;

function substitute(pattern: string, key: string, params: Params): string {
  return pattern.replace(PARAM, (_whole, name: string) => {
    const value = params[name];
    if (value === undefined) throw new RuntimeError(`${key} takes a {${name}} the call site did not supply`);
    return typeof value === 'number' ? String(value) : value;
  });
}

// Every player-facing string the engine says is resolved here, which is why a note an author left in one is dropped here and nowhere else.
function pattern(locales: Locales, language: string, key: string): string | undefined {
  const declared = locales.declared.get(language)?.get(key);
  if (declared !== undefined) return withoutNote(declared);
  const base = locales.base.get(key);
  return base?.language === language ? withoutNote(base.text) : undefined;
}

export interface Localizer {
  readonly language: Answer;
  engine(key: EngineKey, params?: Params): Localized;
  content(kind: string, id: string, field: string, params?: Params): Localized;
  words(kind: string, id: string, field: string, params?: Params): Localized | undefined;
  title(kind: string, id: string): Localized;
  actionLabel(kind: string, ownerId: string, action: Action): Localized;
  spoken(key: string): Localized;
  line(key: string, render: (segments: TextSegment[]) => string): Localized;
  identifier(id: string): Localized;
}

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
    spoken: (key) => (pattern(locales, language, key) ?? key) as Localized,
    line: (key, render) => render(parseSegments(self.spoken(key), 0)) as Localized,
    identifier: (id) => id as Localized,
  };
  return self;
}

export interface LanguageChoice {
  readonly language: string;
}

export const localizerOf = (registry: Registry, playing: LanguageChoice): Localizer => localizerFor(registry, playing.language);

export const itemExamine = (localizer: Localizer, item: string): Localized | undefined => localizer.words('item', item, 'examine');
