import { DslError } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { RawSection, sectionParser } from '../../grammar/structure';
import { section } from './define';

export interface ParsedSave {
  version: number;
  diff: Record<string, unknown>;
}

export interface SaveSection extends ParsedSave {
  id: string;
}

export const parseSaveSection = sectionParser((raw: RawSection): SaveSection => {
  if (!raw.id) throw new DslError('# save requires an id', raw.span);

  const written = raw.body.map((line) => line.text).join('');
  let parsed: unknown;
  try {
    parsed = JSON.parse(written);
  } catch {
    throw new DslError(`# save ${raw.id}: invalid JSON: ${written}`, raw.span);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new DslError(`# save ${raw.id}: must be a JSON object`, raw.span);

  const { version, ...diff } = parsed as { version?: unknown } & Record<string, unknown>;
  if (typeof version !== 'number') throw new DslError(`# save ${raw.id}: requires a numeric version`, raw.span);

  return { id: raw.id, version, diff };
});

export const save = section<SaveSection>()({
  kind: 'save',
  ids: 'owned',
  vocabulary: 'declared',
  maps: {
    saves: (value): readonly (readonly [string, ParsedSave])[] => [[value.id, { version: value.version, diff: value.diff }]],
  },
  grammar: [{ form: '{"version": <number>[, <the rest of a saved game>]}', example: '{"version": 1}' }],
  parse: parseSaveSection,
  print: (value, { moduleId, id }) => [`# save ${moduleLocalId(moduleId, id)}`, JSON.stringify({ version: value.version, ...value.diff })],
});
