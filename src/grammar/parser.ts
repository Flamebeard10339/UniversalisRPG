// The kind of thing a placeholder names, under the placeholder's own name. A placeholder is called after what it names — `<item>` names a # item — so only one that is not says so here, and `null` says one whose name reads like a kind names nothing.
export type Names = Readonly<Record<string, string | null>>;

// The parser that writes a placeholder's value, under the placeholder's own name, where the placeholder holds a grammar rather than a name. A thunk, because a grammar may be written out of itself.
export type Holds = () => Readonly<Record<string, Parser<unknown>>>;

// What a form's placeholders hold, which every form carries the same way whether it is one line an author writes or one value inside it.
export interface Filled {
  names?: Names;
  holds?: Holds;
}

// A form is what an author is shown: literal text, `<a placeholder>`, `[an optional part]`, and a trailing `, …` for a list.
export interface Parser<T> extends Filled {
  parse(cursor: Cursor): T;
  print(value: T): string;
  forms: readonly string[];
  examples: readonly string[];
  // What an author calls this grammar where a line points at it rather than writing its shapes out. A grammar that has one is written out once under that name, and every line taking a value of it says `<name>`; one without is short enough to read where it stands.
  called?: string;
}

// A block of lines that is one grammar wherever it is written, under the name an author calls it. Laid
// on the array rather than on each line, because it is the block that is the grammar and a line of it
// says nothing about where it stands; and read back by whatever writes the page out, so a block met a
// second time is pointed at rather than written again however its site parameterised it.
const CALLED = Symbol.for('grammar.block.called');

export const calledBlock = (called: string, lines: Written[]): Written[] => Object.defineProperty(lines, CALLED, { value: called });

export const blockCalled = (lines: readonly Written[]): string | undefined => (lines as { [CALLED]?: string })[CALLED];

// One line an author may write. A `block` says what its indented lines hold, and is a thunk because a result block holds results.
export interface Written extends Filled {
  form: string;
  example: string;
  family?: string;
  note?: string;
  needs?: string;
  block?: () => readonly Written[];
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
