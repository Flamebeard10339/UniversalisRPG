import { Dependency, dependency, Version, version } from '../../grammar/dependency';
import { list } from '../../grammar/list';
import { DEFAULT_LANGUAGE, HydrateContext } from '../../grammar/section';
import { humanizeEn, id, lastSegment, text } from '../../grammar/values';
import { section } from './define';

export interface ModuleInfo {
  id: string;
  version: Version;
  dependencies: Dependency[];
  pack?: string;
  // The language every string this module authors is written in. Unvalidated:
  // nothing reads the tag but the gate below, so a tag the engine has never
  // heard of is a language it ships no locale for rather than an error.
  language: string;
}

export const info = section<ModuleInfo>()({
  kind: 'info',
  ids: 'none',
  fields: {
    version: { parser: version, default: () => [0, 0, 0] },
    dependencies: { parser: list(dependency), default: () => [] },
    pack: { parser: id },
    language: { parser: text, default: () => DEFAULT_LANGUAGE },
  },
});

// The title an unauthored section gets. `humanizeEn` is English grammar, so it
// supplies one only where the module says it is writing English; anywhere else
// the bare id stands in and no locale entry is recorded for it, which is what
// puts the key on screen instead of a machine-made English phrase.
export const defaultTitle = (self: { id: string }, { language }: HydrateContext): string => (language === DEFAULT_LANGUAGE ? humanizeEn(self.id) : lastSegment(self.id));

// The title field, whole: how it reads, what the engine mints when nobody wrote
// one, and the fact that it mints one — which is what a printer has to know to
// avoid writing a minted title back as an authored one. Spread rather than
// restated, so a kind cannot carry half of it.
export const TITLE_FIELD = {
  parser: text,
  default: defaultTitle,
  generated: true,
} as const;
