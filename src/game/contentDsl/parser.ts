// Line-oriented recursive-descent parser: DSL source text -> DslModule AST.
// See docs/content-dsl-grammar.md for the syntax this implements.
import {
  DslParseError,
  parseCondition,
  parseEnemyField,
  parseTagLine,
  parseText,
} from './shared';
import type {
  DslActionDecl,
  DslDialogueNode,
  DslDialogueSection,
  DslDropEntry,
  DslDropTableSection,
  DslEntityDecl,
  DslFlagsSection,
  DslInfo,
  DslInteractionSection,
  DslItemSection,
  DslLocationSection,
  DslModule,
  DslQuestSection,
  DslQuestStage,
  DslRecipeIngredient,
  DslRecipeSection,
  DslSection,
  DslSkillSection,
  DslStatSection,
  DslTag,
  DslAdjacentDecl,
} from './types';

const leadingSpaces = (line: string): number => {
  const match = /^ */.exec(line);
  return match ? match[0].length : 0;
};

const isBlank = (line: string | undefined): boolean => line === undefined || line.trim().length === 0;

// Runs a shared.ts sub-parse (parseCondition/parseText/parseTagLine — all
// line-agnostic by design) and, if it throws, tags the error with which
// source line the failing text actually came from. Needed because by the
// time some sub-parses run, `cursor.index` has already advanced past the
// line whose text is being parsed (e.g. an action header's inline tags are
// parsed right after `cursor.index++`) — callers must pass the *correct*
// originating line, not just `cursor.index` blindly.
const withLine = <T>(lineIndex: number, fn: () => T): T => {
  try {
    return fn();
  } catch (error) {
    if (error instanceof DslParseError && error.line === undefined) error.line = lineIndex;
    throw error;
  }
};

class Cursor {
  lines: string[];
  index = 0;

  constructor(source: string) {
    this.lines = source.split(/\r?\n/);
  }

  get current(): string | undefined {
    return this.lines[this.index];
  }

  atEnd(): boolean {
    return this.index >= this.lines.length;
  }

  skipBlank(): void {
    while (!this.atEnd() && isBlank(this.current)) this.index++;
  }
}

export const parseDsl = (source: string): DslModule => {
  const cursor = new Cursor(source);
  let info: DslInfo | null = null;
  const sections: DslSection[] = [];

  cursor.skipBlank();
  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const headerMatch = /^#\s+(info|location|dialogue|advanced|item|quest|recipe|interaction|stat|skill|flags|droptable)\b\s*(.*)$/.exec(line);
    if (!headerMatch) {
      throw new DslParseError(`Expected a top-level "# ..." header, got: "${line}"`, cursor.index);
    }
    const [, keyword, rest] = headerMatch;
    cursor.index++;
    if (keyword === 'info') {
      info = parseInfoBlock(cursor);
    } else if (keyword === 'location') {
      sections.push(parseLocationSection(cursor, rest.trim()));
    } else if (keyword === 'dialogue') {
      sections.push(parseDialogueSection(cursor, rest.trim()));
    } else if (keyword === 'advanced') {
      sections.push({ kind: 'advanced', json: parseAdvancedBlock(cursor) });
    } else if (keyword === 'item') {
      sections.push(parseItemSection(cursor, rest.trim()));
    } else if (keyword === 'quest') {
      sections.push(parseQuestSection(cursor, rest.trim()));
    } else if (keyword === 'recipe') {
      sections.push(parseRecipeSection(cursor, rest.trim()));
    } else if (keyword === 'interaction') {
      sections.push(parseInteractionSection(cursor, rest.trim()));
    } else if (keyword === 'stat') {
      sections.push(parseStatSection(cursor, rest.trim()));
    } else if (keyword === 'skill') {
      sections.push(parseSkillSection(cursor, rest.trim()));
    } else if (keyword === 'flags') {
      sections.push(parseFlagsSection(cursor));
    } else if (keyword === 'droptable') {
      sections.push(parseDropTableSection(cursor, rest.trim()));
    }
    cursor.skipBlank();
  }

  if (!info) throw new DslParseError('Module is missing a "# info" block');
  return { info, sections };
};

const parseInfoBlock = (cursor: Cursor): DslInfo => {
  const fields: Record<string, string> = {};
  while (!cursor.atEnd() && !isBlank(cursor.current) && !/^#/.test(cursor.current!)) {
    const match = /^(\w+):\s*(.*)$/.exec(cursor.current!.trim());
    if (!match) throw new DslParseError(`Invalid info field: "${cursor.current}"`, cursor.index);
    fields[match[1]] = match[2].trim();
    cursor.index++;
  }
  return {
    id: fields.id,
    version: fields.version,
    universe: fields.universe,
    author: fields.author,
    gameVersion: fields.game_version,
    dependencies: fields.dependencies ? fields.dependencies.split(',').map((s) => s.trim()).filter(Boolean) : [],
    pack: fields.pack || undefined,
  };
};

const parseAdvancedBlock = (cursor: Cursor): Record<string, unknown> => {
  const jsonLines: string[] = [];
  let depth = 0;
  let started = false;
  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (!started && isBlank(line)) {
      cursor.index++;
      continue;
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    jsonLines.push(line);
    started = true;
    cursor.index++;
    if (depth <= 0) break;
  }
  return JSON.parse(jsonLines.join('\n')) as Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Location: metadata may span multiple non-blank lines before the first
// `wall`/`## entity`. Recognized fields are `x:`/`y:`/`z:`, the optional flat
// text fields `title:`/`examine:`/`exhausted:`, the labeled `tags:` field
// (space/comma-separated words), and the bare keyword `starting`. Unlike an
// earlier version of this grammar, an unrecognized bare word here is an
// error, same as everywhere else in the DSL — tags need the `tags:` label.
// `examine:` (not `description:`) matches the same "prints to chat via an
// Examine button" mechanism items/stats/skills all share — see CLAUDE.md.
// ---------------------------------------------------------------------------
type LocationMeta = { x: number; y: number; z?: number; tags: string[]; starting: boolean; title?: string; examine?: string; exhausted?: string };

const applyLocationMetadataLine = (line: string, meta: LocationMeta, lineIndex: number): void => {
  const textFieldMatch = /^(title|examine|exhausted):\s*(.*)$/i.exec(line);
  if (textFieldMatch) {
    const key = textFieldMatch[1].toLowerCase();
    const value = textFieldMatch[2].trim();
    if (key === 'title') meta.title = value;
    else if (key === 'examine') meta.examine = value;
    else meta.exhausted = value;
    return;
  }

  const tagsFieldMatch = /^tags:\s*(.*)$/i.exec(line);
  if (tagsFieldMatch) {
    meta.tags.push(...tagsFieldMatch[1].split(/[\s,]+/).filter(Boolean));
    return;
  }

  for (const segment of line.split(',').map((part) => part.trim()).filter(Boolean)) {
    const fieldMatch = /^(x|y|z):\s*(.+)$/i.exec(segment);
    if (fieldMatch) {
      const key = fieldMatch[1].toLowerCase();
      const value = Number(fieldMatch[2].trim());
      if (key === 'x') meta.x = value;
      else if (key === 'y') meta.y = value;
      else meta.z = value;
      continue;
    }
    if (/^starting$/i.test(segment)) {
      meta.starting = true;
      continue;
    }
    throw new DslParseError(`Unrecognized location metadata "${segment}" — location tags need a "tags:" label`, lineIndex);
  }
};

// One line inside a location's `adjacent:` block: a bare `<locationId>` is an
// unconditional edge; `<locationId> while <condition>` gates it.
const ADJACENT_ENTRY_LINE = /^([\w-]+)(?:\s+while\s+(.+))?$/i;

const parseAdjacentEntries = (cursor: Cursor, baseIndent: number, locationId: string): DslAdjacentDecl[] => {
  const entries: DslAdjacentDecl[] = [];
  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (line.trim().length === 0) {
      cursor.index++;
      continue;
    }
    if (leadingSpaces(line) <= baseIndent) break;
    const trimmed = line.trim();
    if (/^#/.test(trimmed)) break;

    const match = ADJACENT_ENTRY_LINE.exec(trimmed);
    if (!match) throw new DslParseError(`Expected "<locationId>" or "<locationId> while <condition>" in location "${locationId}"'s adjacent: list, got: "${line}"`, cursor.index);
    const cond = match[2] ? withLine(cursor.index, () => parseCondition(match[2], 'flag')) : undefined;
    entries.push({ toLocationId: match[1], cond });
    cursor.index++;
  }
  return entries;
};

const parseLocationSection = (cursor: Cursor, id: string): DslLocationSection => {
  const meta: LocationMeta = { x: 0, y: 0, tags: [], starting: false };
  cursor.skipBlank();
  while (!cursor.atEnd()) {
    const trimmed = cursor.current!.trim();
    if (/^adjacent:\s*$/i.test(trimmed) || /^##\s+entity\b/i.test(trimmed) || /^#\s/.test(trimmed)) break;
    applyLocationMetadataLine(trimmed, meta, cursor.index);
    cursor.index++;
  }

  const adjacent: DslAdjacentDecl[] = [];
  const entities: DslEntityDecl[] = [];
  cursor.skipBlank();

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (/^#\s/.test(trimmed) && !/^##/.test(trimmed)) break;

    const adjacentMatch = /^adjacent:\s*$/i.exec(trimmed);
    if (adjacentMatch) {
      const indent = leadingSpaces(line);
      cursor.index++;
      adjacent.push(...parseAdjacentEntries(cursor, indent, id));
      cursor.skipBlank();
      continue;
    }

    const entityHeaderMatch = /^##\s+entity\s+([\w-]+)\s*$/i.exec(trimmed);
    if (entityHeaderMatch) {
      cursor.index++;
      entities.push(parseEntity(cursor, entityHeaderMatch[1]));
      cursor.skipBlank();
      continue;
    }

    throw new DslParseError(`Unexpected line in location "${id}": "${line}"`, cursor.index);
  }

  return { kind: 'location', id, x: meta.x, y: meta.y, z: meta.z, tags: meta.tags, starting: meta.starting, title: meta.title, examine: meta.examine, exhausted: meta.exhausted, adjacent, entities };
};

const parseEntity = (cursor: Cursor, id: string): DslEntityDecl => {
  cursor.skipBlank();
  let title: string | undefined;
  const actions: DslActionDecl[] = [];
  while (!cursor.atEnd()) {
    const trimmed = cursor.current!.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;
    const titleMatch = /^title:\s*(.*)$/i.exec(trimmed);
    if (titleMatch) {
      title = titleMatch[1].trim();
      cursor.index++;
      continue;
    }
    actions.push(parseAction(cursor));
  }
  return { id, title, actions };
};

// ---------------------------------------------------------------------------
// Actions: `<title>:[ <inline tags>]` followed by zero or more further-
// indented continuation lines (each itself a tag-line, or a nested
// `enemy:`/`on success:` field). No bullet — a new action is just any
// non-indented, colon-terminated line inside an entity body. `examine:` is
// pure sugar: its inline text (only) is treated as `say: <text>` rather than
// a generic tag-line — `examine: foo` and `examine:\n  say: foo` compile
// identically.
// ---------------------------------------------------------------------------
const parseAction = (cursor: Cursor): DslActionDecl => {
  const headerLineIndex = cursor.index;
  const headerLine = cursor.current!;
  const headerIndent = leadingSpaces(headerLine);
  const trimmed = headerLine.trim();
  const headerMatch = /^(.+?):\s*(.*)$/.exec(trimmed);
  if (!headerMatch) throw new DslParseError(`Expected an action declaration ending in ":", got: "${headerLine}"`, headerLineIndex);
  const title = headerMatch[1].trim();
  const inlineText = headerMatch[2].trim();
  cursor.index++;

  const isExamine = title.toLowerCase() === 'examine';
  const inlineTags: DslTag[] = inlineText.length === 0
    ? []
    : isExamine
      ? [{ keyword: 'say', text: withLine(headerLineIndex, () => parseText(inlineText)) }]
      : withLine(headerLineIndex, () => parseTagLine(inlineText));

  const { tags: continuationTags, onSuccessTags, onFailTags } = parseActionBody(cursor, headerIndent);
  return { title, tags: [...inlineTags, ...continuationTags], onSuccessTags, onFailTags };
};

const parseActionBody = (cursor: Cursor, baseIndent: number): { tags: DslTag[]; onSuccessTags: DslTag[]; onFailTags: DslTag[] } => {
  const tags: DslTag[] = [];
  const onSuccessTags: DslTag[] = [];
  const onFailTags: DslTag[] = [];

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (line.trim().length === 0) {
      cursor.index++;
      continue;
    }
    if (leadingSpaces(line) <= baseIndent) break;
    const indent = leadingSpaces(line);
    const trimmed = line.trim();
    if (/^#/.test(trimmed)) break;

    const enemyMatch = /^enemy:\s*(.*)$/i.exec(trimmed);
    if (enemyMatch) {
      cursor.index++;
      const raw = readRawContinuation(cursor, indent, enemyMatch[1]);
      const { interactionTypeId, stats } = parseEnemyField(raw);
      tags.push({ keyword: 'enemy', interactionTypeId, stats });
      continue;
    }

    const onSuccessMatch = /^on success:\s*(.*)$/i.exec(trimmed);
    if (onSuccessMatch) {
      const fieldLineIndex = cursor.index;
      cursor.index++;
      onSuccessTags.push(...readTagLines(cursor, indent, onSuccessMatch[1], fieldLineIndex));
      continue;
    }

    const onFailMatch = /^on fail:\s*(.*)$/i.exec(trimmed);
    if (onFailMatch) {
      const fieldLineIndex = cursor.index;
      cursor.index++;
      onFailTags.push(...readTagLines(cursor, indent, onFailMatch[1], fieldLineIndex));
      continue;
    }

    const dropTableMatch = /^droptable:\s*$/i.exec(trimmed);
    if (dropTableMatch) {
      cursor.index++;
      tags.push({ keyword: 'droptable', entries: parseDropEntries(cursor, indent) });
      continue;
    }

    tags.push(...withLine(cursor.index, () => parseTagLine(trimmed)));
    cursor.index++;
  }

  return { tags, onSuccessTags, onFailTags };
};

// Joins an inline value with every further-indented raw continuation line
// (used by `enemy:`, whose value is a flat comma list that may be split
// across lines).
const readRawContinuation = (cursor: Cursor, baseIndent: number, inlineValue: string): string => {
  const parts: string[] = [];
  if (inlineValue.trim()) parts.push(inlineValue.trim());
  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (line.trim().length === 0) {
      cursor.index++;
      continue;
    }
    if (leadingSpaces(line) <= baseIndent) break;
    if (/^#/.test(line.trim())) break;
    parts.push(line.trim());
    cursor.index++;
  }
  return parts.join(', ');
};

// Parses an inline value plus every further-indented continuation line, each
// as its own tag-line (used by `on success:`, whose value is itself a
// sequence of tags — including, deliberately, multiple `say:` lines in a
// row for chunked dialogue). `inlineLineIndex` is the header field's own
// line (`cursor.index` has typically already moved past it by the time this
// runs) — continuation lines use their own, already-correct `cursor.index`.
const readTagLines = (cursor: Cursor, baseIndent: number, inlineValue: string, inlineLineIndex: number): DslTag[] => {
  const tags: DslTag[] = [];
  if (inlineValue.trim()) tags.push(...withLine(inlineLineIndex, () => parseTagLine(inlineValue.trim())));
  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (line.trim().length === 0) {
      cursor.index++;
      continue;
    }
    if (leadingSpaces(line) <= baseIndent) break;
    if (/^#/.test(line.trim())) break;
    tags.push(...withLine(cursor.index, () => parseTagLine(line.trim())));
    cursor.index++;
  }
  return tags;
};

const parseDialogueSection = (cursor: Cursor, id: string): DslDialogueSection => {
  cursor.skipBlank();
  const nodes: DslDialogueNode[] = [];
  while (!cursor.atEnd()) {
    const trimmed = cursor.current!.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#\s/.test(trimmed)) break;
    nodes.push(parseDialogueNode(cursor));
  }
  return { kind: 'dialogue', id, nodes };
};

const parseDialogueNode = (cursor: Cursor): DslDialogueNode => {
  const headerLine = cursor.current!.trim();
  const startMatch = /^start\s*(?:\(([\w-]+)\))?:\s*(.*)$/i.exec(headerLine);
  const namedMatch = /^\[\[([\w-]+)\]\]\s*(?:\(([\w-]+)\))?:\s*(.*)$/.exec(headerLine);
  if (!startMatch && !namedMatch) throw new DslParseError(`Expected a dialogue node header, got: "${headerLine}"`, cursor.index);
  const id = startMatch ? 'start' : namedMatch![1];
  const speakerId = startMatch ? startMatch[1] : namedMatch![2];
  const text = startMatch ? startMatch[2] : namedMatch![3];
  cursor.index++;

  const options: DslDialogueNode['options'] = [];
  const enterTags: DslTag[] = [];
  let gotoNodeId: string | undefined;

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (line.trim().length === 0) {
      cursor.index++;
      break;
    }
    if (leadingSpaces(line) === 0) break;
    const body = line.trim();

    const optionMatch = /^->\s*(.+?)\s*\[\[([\w-]+)\]\]\s*(?::\s*(.+))?$/.exec(body);
    if (optionMatch) {
      const [, label, targetNodeId, tagLineStr] = optionMatch;
      const tags = tagLineStr ? withLine(cursor.index, () => parseTagLine(tagLineStr)) : [];
      options.push({ label, targetNodeId, tags });
      cursor.index++;
      continue;
    }

    const gotoMatch = /^goto\s*\[\[([\w-]+)\]\]\s*$/.exec(body);
    if (gotoMatch) {
      gotoNodeId = gotoMatch[1];
      cursor.index++;
      continue;
    }

    enterTags.push(...withLine(cursor.index, () => parseTagLine(body)));
    cursor.index++;
  }

  return { id, speakerId, text, options, gotoNodeId, enterTags };
};

// ---------------------------------------------------------------------------
// Items: reuse the same action-declaration grammar as entities. `tags:`/
// `offensiveTags:`/`defensiveTags:` are metadata fields whose value is a raw
// pass-through string (the existing equipment tag-string grammar from
// src/game/equipment.ts, untouched and unrelated to this DSL's own tags) —
// not parsed as DSL tags themselves. There's deliberately no `description:`/
// `examine:` metadata field here — an item's examine text is just its own
// `examine:` action (identical to an entity's), not a separate field, so
// there's exactly one "show descriptive text" mechanism to learn, not two.
// ---------------------------------------------------------------------------
const parseItemSection = (cursor: Cursor, id: string): DslItemSection => {
  cursor.skipBlank();
  let title: string | undefined;
  let maxQuantity: number | undefined;
  let tagsString: string | undefined;
  let offensiveTagsString: string | undefined;
  let defensiveTagsString: string | undefined;
  const actions: DslActionDecl[] = [];

  while (!cursor.atEnd()) {
    const trimmed = cursor.current!.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;

    const metaMatch = /^(title|maxQuantity|tags|offensiveTags|defensiveTags):\s*(.*)$/i.exec(trimmed);
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      if (key === 'title') title = metaMatch[2].trim();
      else if (key === 'maxquantity') maxQuantity = Number(metaMatch[2].trim());
      else if (key === 'tags') tagsString = metaMatch[2].trim();
      else if (key === 'offensivetags') offensiveTagsString = metaMatch[2].trim();
      else defensiveTagsString = metaMatch[2].trim();
      cursor.index++;
      continue;
    }

    actions.push(parseAction(cursor));
  }

  return { kind: 'item', id, title, maxQuantity, tagsString, offensiveTagsString, defensiveTagsString, actions };
};

// ---------------------------------------------------------------------------
// Quests: `stage <id>: <condition>` header, followed by a narrative
// description spread across one or more further-indented lines (joined with
// a space — descriptions are prose, not a tag-line).
// ---------------------------------------------------------------------------
const parseQuestSection = (cursor: Cursor, id: string): DslQuestSection => {
  cursor.skipBlank();
  let title = '';
  const stages: DslQuestStage[] = [];

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;

    const titleMatch = /^title:\s*(.*)$/i.exec(trimmed);
    if (titleMatch) {
      title = titleMatch[1].trim();
      cursor.index++;
      continue;
    }

    const stageMatch = /^stage\s+([\w-]+):\s*(.+)$/i.exec(trimmed);
    if (!stageMatch) throw new DslParseError(`Expected "stage <id>: <condition>" in quest "${id}", got: "${line}"`, cursor.index);
    const stageIndent = leadingSpaces(line);
    const stageId = stageMatch[1];
    const cond = withLine(cursor.index, () => parseCondition(stageMatch[2], 'flag'));
    cursor.index++;

    const descriptionLines: string[] = [];
    while (!cursor.atEnd()) {
      const bodyLine = cursor.current!;
      if (bodyLine.trim().length === 0) {
        cursor.index++;
        continue;
      }
      if (leadingSpaces(bodyLine) <= stageIndent) break;
      descriptionLines.push(bodyLine.trim());
      cursor.index++;
    }
    stages.push({ id: stageId, cond, description: descriptionLines.join(' ') });
  }

  return { kind: 'quest', id, title, stages };
};

// ---------------------------------------------------------------------------
// Recipes: flat metadata fields (`station:`, `in:`, `out:`, `skill:`) — `in:`
// and `out:` may repeat across lines, each contributing more ingredients
// (needed for e.g. smelting bronze from two separate ore inputs). `on
// success:` is the same nested tag-block as an action's, becoming the
// recipe's `extraResults`.
// ---------------------------------------------------------------------------
const parseIngredientList = (value: string): DslRecipeIngredient[] =>
  value.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [itemId, amountRaw] = part.split(/\s+/);
    return { itemId, amount: amountRaw ? Number(amountRaw) : 1 };
  });

const parseRecipeSection = (cursor: Cursor, id: string): DslRecipeSection => {
  cursor.skipBlank();
  let stationId = '';
  const inputs: DslRecipeIngredient[] = [];
  const outputs: DslRecipeIngredient[] = [];
  let skillId: string | undefined;
  let xpAmount: number | undefined;
  let onSuccessTags: DslTag[] = [];

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;

    const stationMatch = /^station:\s*(.*)$/i.exec(trimmed);
    if (stationMatch) {
      stationId = stationMatch[1].trim();
      cursor.index++;
      continue;
    }

    const inMatch = /^in:\s*(.*)$/i.exec(trimmed);
    if (inMatch) {
      inputs.push(...parseIngredientList(inMatch[1]));
      cursor.index++;
      continue;
    }

    const outMatch = /^out:\s*(.*)$/i.exec(trimmed);
    if (outMatch) {
      outputs.push(...parseIngredientList(outMatch[1]));
      cursor.index++;
      continue;
    }

    const skillMatch = /^skill:\s*(.*)$/i.exec(trimmed);
    if (skillMatch) {
      const [sid, amountRaw] = skillMatch[1].trim().split(/\s+/);
      skillId = sid;
      xpAmount = amountRaw ? Number(amountRaw) : undefined;
      cursor.index++;
      continue;
    }

    const onSuccessMatch = /^on success:\s*(.*)$/i.exec(trimmed);
    if (onSuccessMatch) {
      const indent = leadingSpaces(line);
      const fieldLineIndex = cursor.index;
      cursor.index++;
      onSuccessTags = readTagLines(cursor, indent, onSuccessMatch[1], fieldLineIndex);
      continue;
    }

    throw new DslParseError(`Unexpected line in recipe "${id}": "${line}"`, cursor.index);
  }

  return { kind: 'recipe', id, stationId, inputs, outputs, skillId, xpAmount, onSuccessTags };
};

// ---------------------------------------------------------------------------
// Interactions: flat metadata fields sugar for InteractionTypeDefinition +
// its locale entries — replaces hand-writing this shape as raw JSON via
// `# advanced`. Every message field (`player hit:`, `entity kill:`, ...) is
// optional: an interaction like lockpicking where the lock never fights back
// (`targets player health: false`) has no real "the lock hit you" moment, so
// the compiler fills in a generic default for whichever ones are omitted
// (see compiler.ts) rather than forcing the author to invent flavor text for
// an outcome that will never occur.
// ---------------------------------------------------------------------------
const interactionFieldPattern = /^(source|target|targets player health|title|player hit|player miss|player kill|entity hit|entity miss|entity kill):\s*(.*)$/i;

const parseInteractionSection = (cursor: Cursor, id: string): DslInteractionSection => {
  cursor.skipBlank();
  let sourceStatId = '';
  let targetStatId = '';
  let targetPlayerHealth = true;
  let title: string | undefined;
  let playerHit: string | undefined;
  let playerMiss: string | undefined;
  let playerKill: string | undefined;
  let entityHit: string | undefined;
  let entityMiss: string | undefined;
  let entityKill: string | undefined;

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;

    const match = interactionFieldPattern.exec(trimmed);
    if (!match) throw new DslParseError(`Unexpected line in interaction "${id}": "${line}"`, cursor.index);
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'source') sourceStatId = value;
    else if (key === 'target') targetStatId = value;
    else if (key === 'targets player health') targetPlayerHealth = /^true$/i.test(value);
    else if (key === 'title') title = value;
    else if (key === 'player hit') playerHit = value;
    else if (key === 'player miss') playerMiss = value;
    else if (key === 'player kill') playerKill = value;
    else if (key === 'entity hit') entityHit = value;
    else if (key === 'entity miss') entityMiss = value;
    else if (key === 'entity kill') entityKill = value;
    cursor.index++;
  }

  return { kind: 'interaction', id, sourceStatId, targetStatId, targetPlayerHealth, title, playerHit, playerMiss, playerKill, entityHit, entityMiss, entityKill };
};

// ---------------------------------------------------------------------------
// Stats/skills/flags: flat metadata sugar for what used to require a raw
// `# advanced` block. `# stat`/`# skill` are one-per-declaration, like
// `# item`; `# flags` is a single bulk section (one id per line) since flags
// are almost always declared many-at-once with no other body content.
// ---------------------------------------------------------------------------
const parseStatSection = (cursor: Cursor, id: string): DslStatSection => {
  cursor.skipBlank();
  let base = 0;
  let title: string | undefined;
  let examine: string | undefined;

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;

    const match = /^(base|title|examine):\s*(.*)$/i.exec(trimmed);
    if (!match) throw new DslParseError(`Unexpected line in stat "${id}": "${line}"`, cursor.index);
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'base') base = Number(value);
    else if (key === 'title') title = value;
    else examine = value;
    cursor.index++;
  }

  return { kind: 'stat', id, base, title, examine };
};

const parseSkillSection = (cursor: Cursor, id: string): DslSkillSection => {
  cursor.skipBlank();
  let statId: string | undefined;
  let maxLevel: number | undefined;
  let title: string | undefined;
  let examine: string | undefined;

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;

    const match = /^(stat|max level|title|examine):\s*(.*)$/i.exec(trimmed);
    if (!match) throw new DslParseError(`Unexpected line in skill "${id}": "${line}"`, cursor.index);
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'stat') statId = value;
    else if (key === 'max level') maxLevel = Number(value);
    else if (key === 'title') title = value;
    else examine = value;
    cursor.index++;
  }

  return { kind: 'skill', id, statId, maxLevel, title, examine };
};

const parseFlagsSection = (cursor: Cursor): DslFlagsSection => {
  cursor.skipBlank();
  const flags: DslFlagsSection['flags'] = [];

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;

    const match = /^([\w.-]+)(?:\s*:\s*(.*))?$/.exec(trimmed);
    if (!match) throw new DslParseError(`Expected a flag id (optionally ": <initial value>"), got: "${line}"`, cursor.index);
    const rawValue = match[2]?.trim();
    let initialValue: boolean | number = false;
    if (rawValue !== undefined && rawValue.length > 0) {
      if (/^true$/i.test(rawValue)) initialValue = true;
      else if (/^false$/i.test(rawValue)) initialValue = false;
      else initialValue = Number(rawValue);
    }
    flags.push({ id: match[1], initialValue });
    cursor.index++;
  }

  return { kind: 'flags', flags };
};

// ---------------------------------------------------------------------------
// Droptables: recursive entry-list grammar shared by an action's `droptable:`
// tag and a standalone `# droptable <id>` (named, reusable) section. Each
// entry is `[<amount|min-max> ]<id>[ (<weight>)]` (amount/weight both default
// to 1; `<id>` is left unresolved here — item vs. named-droptable reference
// is a compiler-time decision, since it needs to have seen every section
// first) or a nested `dependent droptable (<weight>):` block, recursively.
// ---------------------------------------------------------------------------
const DROP_ENTRY_LINE = /^(?:(\d+)(?:-(\d+))?\s+)?([\w.-]+)(?:\s*\((\d+)\))?\s*$/;
const DEPENDENT_DROPTABLE_LINE = /^dependent droptable\s*\((\d+)\)\s*:\s*$/i;

const parseDropEntries = (cursor: Cursor, baseIndent: number): DslDropEntry[] => {
  const entries: DslDropEntry[] = [];

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (line.trim().length === 0) {
      cursor.index++;
      continue;
    }
    if (leadingSpaces(line) <= baseIndent) break;
    const indent = leadingSpaces(line);
    const trimmed = line.trim();
    if (/^#/.test(trimmed)) break;

    const dependentMatch = DEPENDENT_DROPTABLE_LINE.exec(trimmed);
    if (dependentMatch) {
      cursor.index++;
      entries.push({ weight: Number(dependentMatch[1]), nested: parseDropEntries(cursor, indent) });
      continue;
    }

    const entryMatch = DROP_ENTRY_LINE.exec(trimmed);
    if (!entryMatch) throw new DslParseError(`Expected a droptable entry, got: "${line}"`, cursor.index);
    const [, minRaw, maxRaw, id, weightRaw] = entryMatch;
    const amount = minRaw === undefined ? undefined : maxRaw === undefined ? Number(minRaw) : { min: Number(minRaw), max: Number(maxRaw) };
    entries.push({ weight: weightRaw ? Number(weightRaw) : 1, id, amount });
    cursor.index++;
  }

  return entries;
};

const parseDropTableSection = (cursor: Cursor, id: string): DslDropTableSection => {
  cursor.skipBlank();
  return { kind: 'droptable', id, entries: parseDropEntries(cursor, -1) };
};
