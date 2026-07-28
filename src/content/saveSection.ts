import { DslError } from '../grammar/parser';
import { RawSection } from '../grammar/structure';

export interface ParsedSave {
  version: number;
  diff: Record<string, unknown>;
}

// The body is one line of JSON; the grammar has no multi-line support.
export function parseSaveSection(section: RawSection): { id: string; saved: ParsedSave } {
  if (!section.id) throw new DslError('# save requires an id', section.span);

  const raw = section.body.map((line) => line.text).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DslError(`# save ${section.id}: invalid JSON: ${raw}`, section.span);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new DslError(`# save ${section.id}: must be a JSON object`, section.span);
  }

  const { version, ...diff } = parsed as { version?: unknown } & Record<string, unknown>;
  if (typeof version !== 'number') throw new DslError(`# save ${section.id}: requires a numeric version`, section.span);

  return { id: section.id, saved: { version, diff } };
}
