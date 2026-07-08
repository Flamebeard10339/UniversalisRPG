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
  DslEntityDecl,
  DslInfo,
  DslLocationSection,
  DslModule,
  DslSection,
  DslTag,
  DslWallDecl,
} from './types';

const leadingSpaces = (line: string): number => {
  const match = /^ */.exec(line);
  return match ? match[0].length : 0;
};

const isBlank = (line: string | undefined): boolean => line === undefined || line.trim().length === 0;

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
    const headerMatch = /^#\s+(info|location|dialogue|advanced)\b\s*(.*)$/.exec(line);
    if (!headerMatch) {
      throw new DslParseError(`Expected a top-level "# ..." header, got: "${line}"`);
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
    if (!match) throw new DslParseError(`Invalid info field: "${cursor.current}"`);
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
// `wall`/`## entity`. Recognized fields are `x:`/`y:`/`z:` and the bare
// keyword `starting`; any other bare word (or space-separated run of words)
// is a location tag — there's no `tags:` label, unlike every other DSL
// keyword this is the one place a bare, unrecognized word is *not* an error.
// ---------------------------------------------------------------------------
type LocationMeta = { x: number; y: number; z?: number; tags: string[]; starting: boolean };

const applyLocationMetadataLine = (line: string, meta: LocationMeta): void => {
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
    meta.tags.push(...segment.split(/\s+/).filter(Boolean));
  }
};

const parseLocationSection = (cursor: Cursor, id: string): DslLocationSection => {
  const meta: LocationMeta = { x: 0, y: 0, tags: [], starting: false };
  cursor.skipBlank();
  while (!cursor.atEnd()) {
    const trimmed = cursor.current!.trim();
    if (/^wall\s*->/i.test(trimmed) || /^##\s+entity\b/i.test(trimmed) || /^#\s/.test(trimmed)) break;
    applyLocationMetadataLine(trimmed, meta);
    cursor.index++;
  }

  const walls: DslWallDecl[] = [];
  const entities: DslEntityDecl[] = [];
  cursor.skipBlank();

  while (!cursor.atEnd()) {
    const line = cursor.current!;
    const trimmed = line.trim();
    if (/^#\s/.test(trimmed) && !/^##/.test(trimmed)) break;

    const wallMatch = /^wall\s*->\s*([\w-]+)\s+while\s+(.+)$/i.exec(trimmed);
    if (wallMatch) {
      walls.push({ toLocationId: wallMatch[1], cond: parseCondition(wallMatch[2], 'flag') });
      cursor.index++;
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

    throw new DslParseError(`Unexpected line in location "${id}": "${line}"`);
  }

  return { kind: 'location', id, x: meta.x, y: meta.y, z: meta.z, tags: meta.tags, starting: meta.starting, walls, entities };
};

const parseEntity = (cursor: Cursor, id: string): DslEntityDecl => {
  cursor.skipBlank();
  const actions: DslActionDecl[] = [];
  while (!cursor.atEnd()) {
    const trimmed = cursor.current!.trim();
    if (trimmed.length === 0) {
      cursor.index++;
      continue;
    }
    if (/^#/.test(trimmed)) break;
    actions.push(parseAction(cursor));
  }
  return { id, actions };
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
  const headerLine = cursor.current!;
  const headerIndent = leadingSpaces(headerLine);
  const trimmed = headerLine.trim();
  const headerMatch = /^(.+?):\s*(.*)$/.exec(trimmed);
  if (!headerMatch) throw new DslParseError(`Expected an action declaration ending in ":", got: "${headerLine}"`);
  const title = headerMatch[1].trim();
  const inlineText = headerMatch[2].trim();
  cursor.index++;

  const isExamine = title.toLowerCase() === 'examine';
  const inlineTags: DslTag[] = inlineText.length === 0
    ? []
    : isExamine
      ? [{ keyword: 'say', text: parseText(inlineText) }]
      : parseTagLine(inlineText);

  const { tags: continuationTags, onSuccessTags } = parseActionBody(cursor, headerIndent);
  return { title, tags: [...inlineTags, ...continuationTags], onSuccessTags };
};

const parseActionBody = (cursor: Cursor, baseIndent: number): { tags: DslTag[]; onSuccessTags: DslTag[] } => {
  const tags: DslTag[] = [];
  const onSuccessTags: DslTag[] = [];

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
      cursor.index++;
      onSuccessTags.push(...readTagLines(cursor, indent, onSuccessMatch[1]));
      continue;
    }

    tags.push(...parseTagLine(trimmed));
    cursor.index++;
  }

  return { tags, onSuccessTags };
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
// row for chunked dialogue).
const readTagLines = (cursor: Cursor, baseIndent: number, inlineValue: string): DslTag[] => {
  const tags: DslTag[] = [];
  if (inlineValue.trim()) tags.push(...parseTagLine(inlineValue.trim()));
  while (!cursor.atEnd()) {
    const line = cursor.current!;
    if (line.trim().length === 0) {
      cursor.index++;
      continue;
    }
    if (leadingSpaces(line) <= baseIndent) break;
    if (/^#/.test(line.trim())) break;
    tags.push(...parseTagLine(line.trim()));
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
  if (!startMatch && !namedMatch) throw new DslParseError(`Expected a dialogue node header, got: "${headerLine}"`);
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
      options.push({ label, targetNodeId, tags: tagLineStr ? parseTagLine(tagLineStr) : [] });
      cursor.index++;
      continue;
    }

    const gotoMatch = /^goto\s*\[\[([\w-]+)\]\]\s*$/.exec(body);
    if (gotoMatch) {
      gotoNodeId = gotoMatch[1];
      cursor.index++;
      continue;
    }

    enterTags.push(...parseTagLine(body));
    cursor.index++;
  }

  return { id, speakerId, text, options, gotoNodeId, enterTags };
};
