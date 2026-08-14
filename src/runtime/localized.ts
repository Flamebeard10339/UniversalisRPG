import { EngineKey, localeKey, Locales } from '../content/locale';
import { parseSegments, TextSegment } from '../content/dialogue';
import { Registry } from '../content/registry';
import { articleEn } from '../grammar/values';
import { GameState, RuntimeError } from './state';

declare const LOCALIZED: unique symbol;

// Text that has been through the localizer, and the only thing a player-visible
// field will hold. It is a string at runtime — a driver prints it, a save that
// never stores one is unaffected — and a string literal does not satisfy it, so
// writing prose into one of those fields does not compile.
export type Localized = string & { readonly [LOCALIZED]: true };

// The other half of what a published field may hold: a value that is a protocol
// rather than words — a content id, an engine verb, a directive tail, a
// dialogue index, or free text the player typed. It is spelled the same in
// every language, which is why nothing localizes one and why a `# test` can
// replay one. Plainly `string`, because an instance id, a slot and a save path
// are all genuinely strings and a wrapper around each would be ceremony: what
// this declares is which of the two a field is, at the field, by whoever built
// it.
export type Answer = string;

// A published dictionary in which nothing is words: an id to a count, an id to
// another id, a flag to what it holds. Declared at the field rather than read
// off the shape, because `stats` had exactly this shape and its keys were the
// row names on a screen — so which of the two a map is, is the builder's to say
// (c10). A published `Record` keyed by an `Answer` is refused, because a key is
// not a field and the walk that checks the published surface cannot see one; a
// value a driver draws as a word travels in a row beside the id it belongs to
// instead.
export type AnswerTable<V extends Answer | number | boolean> = Readonly<Record<Answer, V>>;

// What a pattern substitutes. A localized value, because a name inside a
// sentence is as translatable as the sentence; or a number, which no language
// spells with letters here.
export type Params = Readonly<Record<string, Localized | number>>;

// Named, `{like-this}`, by the same grammar keys and ids already use.
const PARAM = /\{([a-z][a-z0-9-]*)\}/g;

function substitute(pattern: string, key: string, params: Params): string {
  return pattern.replace(PARAM, (_whole, name: string) => {
    const value = params[name];
    if (value === undefined) throw new RuntimeError(`${key} takes a {${name}} the call site did not supply`);
    return typeof value === 'number' ? String(value) : value;
  });
}

// One language, no fallback to another. A key with no entry in the language
// being played renders as itself: unmistakable on screen, reportable by the
// player, and exactly the string a translator needs in order to fix it (c3).
function pattern(locales: Locales, language: string, key: string): string | undefined {
  const declared = locales.declared.get(language)?.get(key);
  if (declared !== undefined) return declared;
  const base = locales.base.get(key);
  return base?.language === language ? base.text : undefined;
}

export interface Localizer {
  readonly language: Answer;
  // The engine speaking for itself. The key comes from a closed union, so a
  // string with no key does not compile and a mistyped one does not either (c2).
  engine(key: EngineKey, params?: Params): Localized;
  // Content speaking. Addressed by what it is rather than by what it says, so
  // no prose can enter through this door either.
  content(kind: string, id: string, field: string, params?: Params): Localized;
  // The same, and nothing where the played language has none. Every other door
  // answers a missing entry with the key, which is the right answer for a thing
  // that has one; this is for the caller that has something else to show (c1).
  words(kind: string, id: string, field: string, params?: Params): Localized | undefined;
  title(kind: string, id: string): Localized;
  // An action's display, keyed on what addresses it under its owner.
  actionLabel(kind: string, ownerId: string, slug: string): Localized;
  // Prose the DSL wrote, at the address the load path stamped on it: the object
  // that authored it and its place in that object (c6). The key is whole
  // already, so this is the one door that is handed one rather than told how to
  // build one. Nothing is substituted into the words — the braces in a `say:`
  // are the author's own punctuation — and no prose can enter here either,
  // because what comes back is a locale entry or the key and never the caller's
  // argument.
  spoken(key: string): Localized;
  // A dialogue line, whose braces belong to the segment grammar it was authored
  // in: the words come from the played language and are read back by the same
  // reader that read the author's, so a translation carries `{player.name}`
  // where the English carried it rather than pasting whatever the author's
  // language resolved to. What a segment resolves to is a question about live
  // state, which the caller holds and this file does not.
  line(key: string, render: (segments: TextSegment[]) => string): Localized;
  // A value that is an id rather than words: a slot, an instance, a path into
  // the save. It belongs to no language, so it goes into the pattern verbatim
  // in every one of them — which is what keeps a translated warning naming the
  // record it is about.
  identifier(id: string): Localized;
}

// The language every engine pattern is written in and the one a module declares
// by default. What is answered rather than read is spelled in it, because an
// answer a `# test` replays cannot move with the player's setting.
export const BASE_LANGUAGE = 'en';

const contentKey = (registry: Registry, kind: string, id: string, field: string): string => localeKey(registry.namespace.ownerOf(kind, id) ?? null, kind, id, field);

export function localizerFor(registry: Registry, language: string): Localizer {
  const { locales } = registry;
  const self: Localizer = {
    language,
    engine: (key, params = {}) => {
      const found = pattern(locales, language, key);
      return (found === undefined ? key : substitute(found, key, params)) as Localized;
    },
    content: (kind, id, field, params = {}) => self.words(kind, id, field, params) ?? (contentKey(registry, kind, id, field) as Localized),
    words: (kind, id, field, params = {}) => {
      const key = contentKey(registry, kind, id, field);
      const found = pattern(locales, language, key);
      return found === undefined ? undefined : (substitute(found, key, params) as Localized);
    },
    title: (kind, id) => self.content(kind, id, 'title'),
    actionLabel: (kind, ownerId, slug) => self.content(kind, ownerId, slug),
    spoken: (key) => (pattern(locales, language, key) ?? key) as Localized,
    line: (key, render) => render(parseSegments(self.spoken(key), 0)) as Localized,
    identifier: (id) => id as Localized,
  };
  return self;
}

export const localizerOf = (registry: Registry, state: GameState): Localizer => localizerFor(registry, state.language);

// The sentence an item with no `examine:` of its own gets. English supplies the
// article from the title it is about to precede; no other language is asked to,
// because `articleEn` is English grammar and a pattern that does not name
// `{article}` never sees it (c5).
export function itemExamine(localizer: Localizer, item: { id: string; title: string; examine?: string }): Localized {
  if (item.examine !== undefined) return localizer.content('item', item.id, 'examine');
  const title = localizer.title('item', item.id);
  const params: Record<string, Localized> = { item: title };
  if (localizer.language === BASE_LANGUAGE) params.article = articleEn(title) as Localized;
  return localizer.engine('engine.item.examine', params);
}
