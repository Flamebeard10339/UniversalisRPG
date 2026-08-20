const REGEX_PRECEDING_PUNCTUATION = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>',
]);

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'case', 'do', 'else', 'yield', 'await', 'new', 'delete', 'void', 'throw',
]);

const IDENTIFIER_CHARACTER = /[A-Za-z0-9_$]/;

const SEMANTIC_DIRECTIVE = [
  /^\/\/\/\s*<reference\s/,
  /^\/\/\s*(@ts-|@vitest-|eslint-|prettier-ignore|[vc]8 ignore)/,
  /^\/\*\s*(@vite-ignore|eslint-|prettier-ignore|webpackChunkName)/,
];

function isDirective(comment: string): boolean {
  return SEMANTIC_DIRECTIVE.some((pattern) => pattern.test(comment));
}

function startsRegexLiteral(previousToken: string): boolean {
  return previousToken === '' || REGEX_PRECEDING_PUNCTUATION.has(previousToken) || REGEX_PRECEDING_KEYWORDS.has(previousToken);
}

export function stripComments(source: string): string[] {
  const lines: string[] = [];
  let line = '';

  const write = (text: string) => {
    for (const character of text) {
      if (character === '\n') {
        lines.push(line);
        line = '';
      } else {
        line += character;
      }
    }
  };
  const blank = (text: string) => write(text.replace(/[^\n]/g, ' '));

  let mode: 'code' | 'template' = 'code';
  const templateExpressionDepths: number[] = [];
  let braceDepth = 0;
  let previousToken = '';
  let word = '';
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    const following = source[index + 1];

    if (mode === 'template') {
      if (character === '\\') {
        write(source.slice(index, index + 2));
        index += 2;
      } else if (character === '`') {
        mode = 'code';
        write(character);
        index += 1;
      } else if (character === '$' && following === '{') {
        templateExpressionDepths.push(braceDepth);
        mode = 'code';
        write('${');
        index += 2;
      } else {
        write(character);
        index += 1;
      }
      continue;
    }

    if (IDENTIFIER_CHARACTER.test(character)) {
      word += character;
      write(character);
      index += 1;
      continue;
    }

    if (word !== '') {
      previousToken = word;
      word = '';
    }

    if (character === '/' && following === '/') {
      const newline = source.indexOf('\n', index);
      const stop = newline === -1 ? source.length : newline;
      const comment = source.slice(index, stop);
      if (isDirective(comment)) write(comment);
      else blank(comment);
      index = stop;
      continue;
    }

    if (character === '/' && following === '*') {
      const terminator = source.indexOf('*/', index + 2);
      const stop = terminator === -1 ? source.length : terminator + 2;
      const comment = source.slice(index, stop);
      if (isDirective(comment)) write(comment);
      else blank(comment);
      index = stop;
      continue;
    }

    if (character === '"' || character === "'") {
      let cursor = index + 1;
      while (cursor < source.length && source[cursor] !== character && source[cursor] !== '\n') {
        cursor += source[cursor] === '\\' ? 2 : 1;
      }
      write(source.slice(index, Math.min(cursor + 1, source.length)));
      index = cursor + 1;
      previousToken = character;
      continue;
    }

    if (character === '`') {
      mode = 'template';
      write(character);
      index += 1;
      continue;
    }

    if (character === '/' && startsRegexLiteral(previousToken)) {
      let cursor = index + 1;
      let inCharacterClass = false;
      while (cursor < source.length && source[cursor] !== '\n') {
        const inner = source[cursor];
        if (inner === '\\') {
          cursor += 2;
          continue;
        }
        if (inner === '[') inCharacterClass = true;
        else if (inner === ']') inCharacterClass = false;
        else if (inner === '/' && !inCharacterClass) break;
        cursor += 1;
      }
      while (cursor + 1 < source.length && IDENTIFIER_CHARACTER.test(source[cursor + 1])) cursor += 1;
      write(source.slice(index, Math.min(cursor + 1, source.length)));
      index = cursor + 1;
      previousToken = '/';
      continue;
    }

    if (character === '{') {
      braceDepth += 1;
    } else if (character === '}') {
      const enclosing = templateExpressionDepths[templateExpressionDepths.length - 1];
      if (enclosing !== undefined && enclosing === braceDepth) {
        templateExpressionDepths.pop();
        mode = 'template';
      } else {
        braceDepth -= 1;
      }
    }

    if (!/\s/.test(character)) previousToken = character;
    write(character);
    index += 1;
  }

  if (word !== '') previousToken = word;
  if (line !== '') lines.push(line);
  return lines;
}

export function codeOnly(source: string): string[] {
  return stripComments(source)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
