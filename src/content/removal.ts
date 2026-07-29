import { DslError } from '../grammar/parser';
import { RawSection } from '../grammar/structure';

export interface Removal {
  id: string;
  kind: string;
  target: string;
}

// Merge-by-omission cannot express removal — there is no partial section that
// means "this is gone" — so exactly one keyword survives inference.
export function parseRemoval(section: RawSection): Removal {
  // The kind leads and the rest is a path, as long as the author cared to make
  // it: `entity.mirror` and `entity.tutorial-island.mirror` both name one thing.
  const [kind, ...path] = section.id?.split('.') ?? [];
  if (path.length === 0) throw new DslError('# remove names a kind and an id, as in `# remove entity.mirror`', section.span);
  if (section.body.length > 0) throw new DslError('# remove takes no body', section.span);
  return { id: section.id!, kind, target: path.join('.') };
}
