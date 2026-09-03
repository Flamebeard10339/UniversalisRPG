import { Dependency, dependency, PREFIX_MEANINGS, Version, version } from '../../grammar/dependency';
import { list } from '../../grammar/list';
import { DEFAULT_LANGUAGE, HydrateContext } from '../../grammar/section';
import { id, mintedName, text } from '../../grammar/values';
import { section } from './define';

export interface ModuleInfo {
  id: string;
  version: Version;
  dependencies: Dependency[];
  pack?: string;
  language: string;
}

export const info = section<ModuleInfo>()({
  kind: 'info',
  ids: 'none',
  vocabulary: 'declared',
  fields: {
    version: { parser: version, default: () => [0, 0, 0] },
    dependencies: {
      parser: list(dependency),
      default: () => [],
      note: `every module this one is written against, which makes them the only modules whose ids a line here may name, short or whole — a module one of these pulls in on its own is loaded, and stays out of reach until it is listed here too — and how: ${PREFIX_MEANINGS()}`,
    },
    pack: { parser: id, example: 'highland-expansion', note: 'the collection this module ships in, which is what a player installs and turns on as one thing' },
    language: { parser: text, default: () => DEFAULT_LANGUAGE, example: DEFAULT_LANGUAGE, note: 'the language every line this module says to a player is written in' },
  },
});

export const defaultTitle = (self: { id: string }, { language }: HydrateContext): string => mintedName(self.id, language);

export const TITLE_FIELD = {
  parser: text,
  default: defaultTitle,
  generated: true,
} as const;
