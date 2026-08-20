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

export const defaultTitle = (self: { id: string }, { language }: HydrateContext): string => (language === DEFAULT_LANGUAGE ? humanizeEn(self.id) : lastSegment(self.id));

export const TITLE_FIELD = {
  parser: text,
  default: defaultTitle,
  generated: true,
} as const;
