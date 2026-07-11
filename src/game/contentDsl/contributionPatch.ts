// Turns "the DSL source of a core module, before vs. after an author's edits"
// into a small, self-contained `# patch <targetModuleId>` module that captures
// only the changes — the DSL-native answer to "contribute an edit to content
// you don't own without shipping the whole file you touched". See
// docs/content-dsl-grammar.md's `# patch` section for the op grammar this
// emits, and the E2E-authoring backlog task for where it plugs in.
//
// Deliberately decompiler-free: entities/items are emitted as their *verbatim*
// current source block (just re-headed `## replace/upsert entity <id>`), never
// reconstructed from compiled objects — so it never has to round-trip the full
// action grammar. Locations are diffed field-by-field (the one case that needs
// structure, since `## upsert location` is field-level, not whole-object).
//
// Both inputs must be valid DSL (they always are in practice: `baselineSource`
// is a shipped file and `lastValidSource` only ever holds a source that
// compiled). Object kinds `# patch` can't express (dialogue/quest/stat/skill/
// interaction/recipe/droptable, and brand-new locations) are reported as
// `warnings` rather than silently dropped — the caller surfaces them so an
// author knows that part of their edit needs a different home (its own module).
import { parseDsl } from './parser';
import type { DslLocationSection, DslModule } from './types';

export type ContributionPatchResult = {
  // The full `<targetModuleId>-PATCHES` module source, or null when the two
  // sources are content-identical (nothing to contribute).
  moduleSource: string | null;
  warnings: string[];
};

type Block = { level: 1 | 2; kind: string; id: string; ownerLocationId?: string; text: string };

const HEADER = /^(#{1,2})\s+([a-z]+)(?:\s+(\S.*?))?\s*$/i;

// Splits a module source into its top-level (`#`) and nested (`##`) blocks,
// each carried as verbatim text (header line + body, trailing blanks trimmed).
// Nested `## entity` blocks record the `# location` they sit under as
// `ownerLocationId`. Kinds without an id (`# info`, `# flags`, `# advanced`)
// get an empty id and are ignored by the diff.
const extractBlocks = (source: string): Block[] => {
  const lines = source.split(/\r?\n/);
  const blocks: Block[] = [];
  let currentLocationId: string | undefined;
  let pending: { level: 1 | 2; kind: string; id: string; ownerLocationId?: string; body: string[] } | null = null;

  const flush = () => {
    if (!pending) return;
    while (pending.body.length > 0 && pending.body[pending.body.length - 1].trim() === '') pending.body.pop();
    blocks.push({ level: pending.level, kind: pending.kind, id: pending.id, ownerLocationId: pending.ownerLocationId, text: pending.body.join('\n') });
    pending = null;
  };

  for (const line of lines) {
    const match = HEADER.exec(line);
    if (match) {
      flush();
      const level = (match[1].length === 1 ? 1 : 2) as 1 | 2;
      const kind = match[2].toLowerCase();
      const id = (match[3] ?? '').trim();
      if (level === 1) currentLocationId = kind === 'location' ? id : undefined;
      pending = { level, kind, id, ownerLocationId: level === 2 ? currentLocationId : undefined, body: [line] };
      continue;
    }
    if (pending) pending.body.push(line);
  }
  flush();
  return blocks;
};

const blocksByKey = (blocks: Block[], predicate: (block: Block) => boolean): Map<string, Block> =>
  new Map(blocks.filter(predicate).map((block) => [block.id, block]));

const locationsById = (module: DslModule): Map<string, DslLocationSection> =>
  new Map(module.sections.filter((section): section is DslLocationSection => section.kind === 'location').map((section) => [section.id, section]));

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && a.every((value, index) => value === b[index]);

// Field-level location diff → the body lines of a `## upsert location`, in a
// fixed order. Position/tags/entities are structural (they become JSON-Patch
// ops); title/examine/exhausted are text (they become locale overrides). Only
// fields that actually changed are emitted.
const locationPatchBody = (base: DslLocationSection, cur: DslLocationSection): string[] => {
  const lines: string[] = [];
  const position: string[] = [];
  if (base.x !== cur.x) position.push(`x: ${cur.x}`);
  if (base.y !== cur.y) position.push(`y: ${cur.y}`);
  if (base.z !== cur.z && cur.z !== undefined) position.push(`z: ${cur.z}`);
  if (position.length > 0) lines.push(position.join(', '));
  if (base.starting !== cur.starting && cur.starting) lines.push('starting');
  if ((base.title ?? '') !== (cur.title ?? '') && cur.title !== undefined) lines.push(`title: ${cur.title}`);
  if ((base.examine ?? '') !== (cur.examine ?? '') && cur.examine !== undefined) lines.push(`examine: ${cur.examine}`);
  if ((base.exhausted ?? '') !== (cur.exhausted ?? '') && cur.exhausted !== undefined) lines.push(`exhausted: ${cur.exhausted}`);
  if (!sameSet(base.tags, cur.tags)) lines.push(`tags: ${cur.tags.join(' ')}`);
  const baseEntities = base.entities.map((entity) => entity.id);
  const curEntities = cur.entities.map((entity) => entity.id);
  if (!sameSet(baseEntities, curEntities)) lines.push(`entities: ${curEntities.join(', ')}`);
  return lines;
};

// Re-heads a verbatim `## entity <id>` / `# item <id>` block to a patch op
// header (`## replace entity <id>` etc.), keeping the body untouched. `# item`
// is top-level (`#`) in its own module but a `##` sub-op inside a patch.
const reheadBlock = (block: Block, op: 'replace' | 'upsert'): string => {
  const bodyLines = block.text.split('\n');
  bodyLines[0] = `## ${op} ${block.kind} ${block.id}`;
  return bodyLines.join('\n');
};

export const diffModuleToPatch = (
  baselineSource: string,
  currentSource: string,
  targetModuleId: string,
): ContributionPatchResult => {
  const baseModule = parseDsl(baselineSource);
  const curModule = parseDsl(currentSource);
  const baseBlocks = extractBlocks(baselineSource);
  const curBlocks = extractBlocks(currentSource);

  const warnings: string[] = [];
  const ops: string[] = [];

  // --- Locations (field-level) ------------------------------------------
  const baseLocs = locationsById(baseModule);
  const curLocs = locationsById(curModule);
  for (const [id, cur] of curLocs) {
    const base = baseLocs.get(id);
    if (!base) {
      warnings.push(`New location "${id}" can't be a patch op — put brand-new locations in their own module.`);
      continue;
    }
    const body = locationPatchBody(base, cur);
    if (body.length > 0) ops.push([`## upsert location ${id}`, ...body].join('\n'));
  }
  for (const id of baseLocs.keys()) if (!curLocs.has(id)) ops.push(`## remove location ${id}`);

  // --- Entities & items (whole-object, verbatim) ------------------------
  for (const kind of ['entity', 'item'] as const) {
    const level = kind === 'entity' ? 2 : 1;
    const baseMap = blocksByKey(baseBlocks, (block) => block.level === level && block.kind === kind);
    const curMap = blocksByKey(curBlocks, (block) => block.level === level && block.kind === kind);
    for (const [id, cur] of curMap) {
      const base = baseMap.get(id);
      if (!base) ops.push(reheadBlock(cur, 'upsert'));
      else if (base.text.trimEnd() !== cur.text.trimEnd()) ops.push(reheadBlock(cur, 'replace'));
    }
    for (const id of baseMap.keys()) if (!curMap.has(id)) ops.push(`## remove ${kind} ${id}`);
  }

  // --- Flags ------------------------------------------------------------
  // A flag op in a patch must carry a fully-qualified id: a bare id would
  // re-scope to the patch module's own pack (`<target>-PATCHES`), not the
  // core module's, so resolve bare ids against the source module's pack here
  // (a dotted id is already absolute and used as-is, same rule as everywhere).
  const packOf = (module: DslModule) => module.info.pack ?? module.info.id;
  const qualify = (id: string, pack: string) => (id.includes('.') ? id : `${pack}.${id}`);
  const flagIds = (module: DslModule) =>
    new Map(module.sections.flatMap((section) => (section.kind === 'flags' ? section.flags.map((flag) => [qualify(flag.id, packOf(module)), flag.initialValue] as const) : [])));
  const baseFlags = flagIds(baseModule);
  const curFlags = flagIds(curModule);
  for (const [id, value] of curFlags) {
    if (!baseFlags.has(id)) ops.push(value === false ? `## upsert flag ${id}` : `## upsert flag ${id}: ${value}`);
  }
  for (const id of baseFlags.keys()) if (!curFlags.has(id)) ops.push(`## remove flag ${id}`);

  // --- Unsupported kinds (report, don't drop silently) ------------------
  const unsupportedKinds = new Set(['dialogue', 'quest', 'stat', 'skill', 'interaction', 'recipe', 'droptable', 'advanced']);
  const signatureByKind = (blocks: Block[], kind: string) => new Map(blocks.filter((block) => block.level === 1 && block.kind === kind).map((block) => [block.id, block.text.trimEnd()]));
  for (const kind of unsupportedKinds) {
    const base = signatureByKind(baseBlocks, kind);
    const cur = signatureByKind(curBlocks, kind);
    for (const [id, text] of cur) if (base.get(id) !== text) warnings.push(`Change to ${kind} "${id || kind}" can't be expressed as a patch — edit it in ${targetModuleId} directly, or move it to your own module.`);
    for (const id of base.keys()) if (!cur.has(id)) warnings.push(`Removal of ${kind} "${id || kind}" can't be expressed as a patch.`);
  }

  if (ops.length === 0) return { moduleSource: null, warnings };

  // The patch module inherits universe/author/game_version from the module it
  // targets (a fresh 1.0.0 of its own), so it slots into the same universe
  // without the caller having to supply them.
  const header = [
    '# info',
    `id: ${targetModuleId}-PATCHES`,
    'version: 1.0.0',
    `universe: ${baseModule.info.universe}`,
    `author: ${baseModule.info.author}`,
    `game_version: ${baseModule.info.gameVersion}`,
    `dependencies: ${targetModuleId}`,
    '',
    `# patch ${targetModuleId}`,
    '',
  ].join('\n');

  return { moduleSource: `${header}${ops.join('\n\n')}\n`, warnings };
};
