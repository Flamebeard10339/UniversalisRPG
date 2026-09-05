import { DslError } from '../../grammar/parser';
import { moduleLocalId } from '../../grammar/section';
import { RawLine, RawSection, REFERENCE, sectionParser, takeBlock } from '../../grammar/structure';
import { keyedBy, put, strings, type Loose, type Visit } from '../refs';
import { section, writtenWhole } from './define';

export interface ParsedSave {
  version: number;
  over?: string[];
  diff: Record<string, unknown>;
}

export interface SaveSection extends ParsedSave {
  id: string;
}

const OVER_LAYERS =
  'the saves this one is written over, laid down left to right with this body on top. A field holding ids — what is carried, which flags are set — takes the ids every layer writes, and every other field is taken from the last layer that writes it. Only one layer may carry item copies, since two layers mint the same copy ids';

const OVER_VERB = /^over:/;
const OVER = /^over:[ \t]*(?<ids>.*)$/;
const SAVE_ID = new RegExp(`^${REFERENCE.source}$`);

export const isOverLine = (text: string): boolean => OVER_VERB.test(text);

export const overLines = (over: readonly string[] | undefined): string[] => (over?.length ? [`over: ${over.join(', ')}`] : []);

const overIds = (line: RawLine): string[] => [
  ...OVER.exec(line.text)!
    .groups!.ids.split(',')
    .map((each) => each.trim())
    .filter((each) => each !== ''),
  ...takeBlock(line).map((child) => child.text.trim()),
];

export const parseSaveSection = sectionParser((raw: RawSection): SaveSection => {
  if (!raw.id) throw new DslError('# save requires an id', raw.span);

  const over: string[] = [];
  const body: string[] = [];
  for (const line of raw.body) {
    if (!isOverLine(line.text)) {
      body.push(line.text);
      continue;
    }
    if (body.length > 0) throw new DslError(`# save ${raw.id}: over: stands above the saved game, not below it`, line.span);
    for (const child of line.children) if (child.children.length > 0) throw new DslError(`# save ${raw.id}: over: names one save to a line`, child.span);
    const named = overIds(line);
    if (named.length === 0) throw new DslError(`# save ${raw.id}: over: names no save`, line.span);
    for (const id of named) {
      if (!SAVE_ID.test(id)) throw new DslError(`# save ${raw.id}: over: names ${JSON.stringify(id)}, which is no save id`, line.span);
      over.push(id);
    }
  }

  const written = body.join('');
  if (written === '' && over.length > 0) throw new DslError(`# save ${raw.id}: over: names ${OVER_LAYERS}, and the saved game laid on top is written under it`, raw.span);

  let parsed: unknown;
  try {
    parsed = JSON.parse(written);
  } catch {
    throw new DslError(`# save ${raw.id}: invalid JSON: ${written}`, raw.span);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new DslError(`# save ${raw.id}: must be a JSON object`, raw.span);

  const { version, ...diff } = parsed as { version?: unknown } & Record<string, unknown>;
  if (typeof version !== 'number') throw new DslError(`# save ${raw.id}: requires a numeric version`, raw.span);

  return { id: raw.id, version, ...(over.length > 0 ? { over } : {}), diff };
});

const asFarAsItGoes =
  (visit: Visit): Visit =>
  (kind, id, where) => {
    try {
      return visit(kind, id, where);
    } catch (error) {
      if (error instanceof DslError) return id;
      throw error;
    }
  };

export const SAVE_IDS: Readonly<Record<string, { kind: string; at: 'value' | 'key' }>> = {
  location: { kind: 'location', at: 'value' },
  inventory: { kind: 'item', at: 'key' },
  flags: { kind: 'flag', at: 'key' },
  bundles: { kind: 'flag', at: 'key' },
  visits: { kind: 'node', at: 'key' },
  xp: { kind: 'skill', at: 'key' },
  resources: { kind: 'resource', at: 'key' },
  resourceRateRemainders: { kind: 'resource', at: 'key' },
  shops: { kind: 'shop', at: 'key' },
};

export const save = section<SaveSection>()({
  kind: 'save',
  ids: 'owned',
  vocabulary: 'declared',
  opaqueBody: true,
  merge: writtenWhole,
  maps: {
    saves: (value): readonly (readonly [string, ParsedSave])[] => [[value.id, value]],
  },
  grammar: [
    {
      form: 'over: <save>, …',
      example: 'over: in-town',
      note: OVER_LAYERS,
    },
    {
      form: '{"version": <int>[, <the rest of a saved game>]}',
      example: '{"version": 1}',
      note: 'an id in here may be written short, as `bread`, and is written out whole when the world is read. One the world no longer holds is left as it stands and pruned when the save is loaded, which is what `npm run repair-saves` looks through history to mend',
    },
  ],
  parse: parseSaveSection,
  print: (value, { moduleId, id }) => [`# save ${moduleLocalId(moduleId, id)}`, ...overLines(value.over), JSON.stringify({ version: value.version, ...value.diff })],
  visit: (value, where, visit) => {
    strings(value as unknown as Loose, 'over', 'save', `${where} over:`, visit);
    const diff = (value as unknown as { diff: Loose }).diff;
    for (const [field, held] of Object.entries(SAVE_IDS)) {
      if (held.at === 'value') put(diff, field, held.kind, `${where} ${field}`, asFarAsItGoes(visit));
      else keyedBy(diff, field, held.kind, `${where} ${field}`, asFarAsItGoes(visit));
    }
  },
});
