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

const parseLocationMetadata = (line: string): { x: number; y: number; z?: number; tags: string[]; starting: boolean } => {
  const segments = line.split(',').map((segment) => segment.trim()).filter(Boolean);
  let x = 0;
  let y = 0;
  let z: number | undefined;
  let tags: string[] = [];
  let starting = false;
  for (const segment of segments) {
    const match = /^([a-zA-Z]+):?\s*(.*)$/.exec(segment);
    if (!match) throw new DslParseError(`Invalid location metadata segment: "${segment}"`);
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'x') x = Number(value);
    else if (key === 'y') y = Number(value);
    else if (key === 'z') z = Number(value);
    else if (key === 'tags') tags = value.split(/\s+/).filter(Boolean);
    else if (key === 'starting' && !value) starting = true;
    else throw new DslParseError(`Unknown location metadata key: "${key}"`);
  }
  return { x, y, z, tags, starting };
};

const parseLocationSection = (cursor: Cursor, id: string): DslLocationSection => {
  cursor.skipBlank();
  const meta = parseLocationMetadata(cursor.current!);
  cursor.index++;
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
  let examine: DslEntityDecl['examine'];
  const examineMatch = !cursor.atEnd() ? /^examine:\s*(.*)$/i.exec(cursor.current!.trim()) : null;
  if (examineMatch) {
    examine = parseText(examineMatch[1]);
    cursor.index++;
    cursor.skipBlank();
  }

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
  return { id, examine, actions };
};

const parseAction = (cursor: Cursor): DslActionDecl => {
  const headerLine = cursor.current!;
  const headerIndent = leadingSpaces(headerLine);
  const trimmed = headerLine.trim();
  const bulletMatch = /^-\s+(.+)$/.exec(trimmed);
  if (!bulletMatch) throw new DslParseError(`Expected an action bullet, got: "${headerLine}"`);
  const body = bulletMatch[1];
  cursor.index++;

  const colonIndex = body.indexOf(':');
  if (colonIndex !== -1) {
    const title = body.slice(0, colonIndex).trim();
    const tags = parseTagLine(body.slice(colonIndex + 1).trim());
    return { title, tags, onSuccessTags: [] };
  }

  const title = body.trim();
  const tags: DslTag[] = [];
  const onSuccessTags: DslTag[] = [];
  while (!cursor.atEnd()) {
    const fieldLine = cursor.current!;
    if (fieldLine.trim().length === 0) {
      cursor.index++;
      break;
    }
    if (leadingSpaces(fieldLine) <= headerIndent) break;
    const field = fieldLine.trim();

    const enemyMatch = /^enemy:\s*(.+)$/i.exec(field);
    if (enemyMatch) {
      const { interactionTypeId, stats } = parseEnemyField(enemyMatch[1]);
      tags.push({ keyword: 'enemy', interactionTypeId, stats });
      cursor.index++;
      continue;
    }
    const onSuccessMatch = /^on success:\s*(.+)$/i.exec(field);
    if (onSuccessMatch) {
      onSuccessTags.push(...parseTagLine(onSuccessMatch[1]));
      cursor.index++;
      continue;
    }
    // Any other field line is itself a single tag ("requires: lockpick",
    // "hidden if: x", "xp: thieving 4", bare "once", ...).
    tags.push(...parseTagLine(field));
    cursor.index++;
  }
  return { title, tags, onSuccessTags };
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
