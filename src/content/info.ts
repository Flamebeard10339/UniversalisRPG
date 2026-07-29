import { Dependency, dependency, Version, version } from '../grammar/dependency';
import { list } from '../grammar/list';
import { SectionSchema } from '../grammar/section';
import { id } from '../grammar/values';

export interface ModuleInfo {
  id: string;
  version: Version;
  dependencies: Dependency[];
  pack?: string;
}

export const infoSchema: SectionSchema<ModuleInfo> = {
  kind: 'info',
  fields: {
    version: { parser: version, default: () => [0, 0, 0] },
    dependencies: { parser: list(dependency), default: () => [] },
    pack: { parser: id },
  },
};
