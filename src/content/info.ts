import { Dependency, dependency, Version, version } from '../grammar/dependency';
import { list } from '../grammar/list';
import { DEFAULT_LANGUAGE, HydrateContext, SectionSchema } from '../grammar/section';
import { humanizeEn, id, lastSegment, text } from '../grammar/values';

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

export const infoSchema: SectionSchema<ModuleInfo> = {
  kind: 'info',
  fields: {
    version: { parser: version, default: () => [0, 0, 0] },
    dependencies: { parser: list(dependency), default: () => [] },
    pack: { parser: id },
    language: { parser: text, default: () => DEFAULT_LANGUAGE },
  },
};

// The title an unauthored section gets. `humanizeEn` is English grammar, so it
// supplies one only where the module says it is writing English; anywhere else
// the bare id stands in and no locale entry is recorded for it, which is what
// puts the key on screen instead of a machine-made English phrase.
export const defaultTitle = (self: { id: string }, { language }: HydrateContext): string =>
  language === DEFAULT_LANGUAGE ? humanizeEn(self.id) : lastSegment(self.id);
