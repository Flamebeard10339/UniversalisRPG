import { createInterface, type Interface } from 'node:readline';

export interface Prompter {
  ask: (prompt: string) => Promise<string>;
  // True once stdin ended; `ask` then answers '' without blocking, and the
  // caller decides what a walked-away-from question means.
  exhausted: () => boolean;
  close: () => void;
}

// rl.question()'s once('line') listener drops any line that arrives before
// the next question() call registers it — real under piped/batched input,
// where every answer can already be buffered before we ask for the first
// one. The async iterator's internal queue does not have that race.
export function stdinPrompter(): Prompter {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  const lines = rl[Symbol.asyncIterator]();
  let exhausted = false;
  return {
    ask: async (prompt: string): Promise<string> => {
      process.stdout.write(prompt);
      const next = await lines.next();
      if (next.done) exhausted = true;
      return next.done ? '' : next.value;
    },
    exhausted: () => exhausted,
    close: () => rl.close(),
  };
}

// The same contract over lines handed in as data. What an in-process test
// run installs, so the interactive commands never touch the real stdin —
// exhaustion means the list ran out, exactly as EOF does on a pipe.
export function linePrompter(lines: readonly string[], echo: (prompt: string) => void = (prompt) => process.stdout.write(prompt)): Prompter {
  let at = 0;
  let exhausted = false;
  return {
    ask: async (prompt: string): Promise<string> => {
      echo(prompt);
      if (at >= lines.length) {
        exhausted = true;
        return '';
      }
      return lines[at++];
    },
    exhausted: () => exhausted,
    close: () => {},
  };
}

// The one place stdin enters the CLI. The interactive commands ask for
// their prompter here, so installing a replacement is the whole seam.
let installed: (() => Prompter) | null = null;

export function installPrompter(make: (() => Prompter) | null): void {
  installed = make;
}

export function activePrompter(): Prompter {
  return installed === null ? stdinPrompter() : installed();
}
