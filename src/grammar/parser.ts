// Text is the canonical form and is never regenerated, so a parser only reads.
export interface Parser<T> {
  parse(cursor: Cursor): T;
}

export interface Span {
  start: number;
  end: number;
}

export class DslError extends Error {
  constructor(
    message: string,
    readonly span?: Span,
  ) {
    super(message);
    this.name = 'DslError';
  }
}

export class Cursor {
  constructor(
    readonly src: string,
    public pos = 0,
    readonly base = 0,
  ) {}

  get done(): boolean {
    return this.pos >= this.src.length;
  }

  abs(local: number): number {
    return this.base + local;
  }

  rest(): string {
    return this.src.slice(this.pos);
  }

  peek(re: RegExp): RegExpExecArray | null {
    const anchored = new RegExp(re.source, re.flags.replace(/[yg]/g, '') + 'y');
    anchored.lastIndex = this.pos;
    return anchored.exec(this.src);
  }

  take(re: RegExp): string | null {
    const match = this.peek(re);
    if (match) this.pos += match[0].length;
    return match ? match[0] : null;
  }
}

// A sub-parser stops at the first thing it does not understand and hands back
// what it did read, so a caller that does not demand the rest of the line drops
// the author's typo instead of reporting it.
export function requireEnd(cursor: Cursor, what: string): void {
  cursor.take(/[ \t]*/);
  if (cursor.done) return;
  const leftover = cursor.rest();
  throw new DslError(`unexpected content after ${what}: ${JSON.stringify(leftover)}`, { start: cursor.abs(cursor.pos), end: cursor.abs(cursor.pos + leftover.length) });
}

export function parseWhole<T>(parser: Parser<T>, text: string, base: number, what: string): T {
  const cursor = new Cursor(text, 0, base);
  const value = parser.parse(cursor);
  requireEnd(cursor, what);
  return value;
}
