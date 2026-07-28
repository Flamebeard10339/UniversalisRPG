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
