export type Names = Readonly<Record<string, string | null>>;

export type Holds = () => Readonly<Record<string, Parser<unknown>>>;

export interface Filled {
  names?: Names;
  holds?: Holds;
}

export type Sited = (value: never) => string;

export type ValueWalk = { how: 'ref'; field: string; names: string; at?: Sited } | { how: 'condition'; field: string; at?: Sited };

export interface Parser<T> extends Filled {
  parse(cursor: Cursor): T;
  print(value: T): string;
  forms: readonly string[];
  examples: readonly string[];
  called?: string;
  notes?: Readonly<Record<string, string>>;
  lands?: readonly ValueWalk[];
}

const CALLED = Symbol.for('grammar.block.called');

export const calledBlock = (called: string, lines: Written[]): Written[] => Object.defineProperty(lines, CALLED, { value: called });

export const blockCalled = (lines: readonly Written[]): string | undefined => (lines as { [CALLED]?: string })[CALLED];

export type Overwritten = 'replaced' | 'listed' | 'by name';

export interface Written extends Filled {
  form: string;
  example: string;
  over?: Overwritten;
  of?: string;
  family?: string;
  note?: string;
  needs?: readonly string[];
  block?: () => readonly Written[];
}

export interface Span {
  start: number;
  end: number;
}

export interface Blamed {
  kind: string;
  id: string;
}

export class DslError extends Error {
  constructor(
    message: string,
    readonly span?: Span,
    readonly at?: Blamed,
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

export function requireEnd(cursor: Cursor, what: string): void {
  cursor.take(/[ \t]*/);
  if (cursor.done) return;
  const leftover = cursor.rest();
  throw new DslError(`unexpected content after ${what}: ${JSON.stringify(leftover)}`, {
    start: cursor.abs(cursor.pos),
    end: cursor.abs(cursor.pos + leftover.length),
  });
}

export function parseWhole<T>(parser: Parser<T>, text: string, base: number, what: string): T {
  const cursor = new Cursor(text, 0, base);
  const value = parser.parse(cursor);
  requireEnd(cursor, what);
  return value;
}
