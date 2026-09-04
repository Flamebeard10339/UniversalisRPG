import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const QUESTION_FILE = 'question.json';
const ANSWER_FILE = 'answer.txt';

export const ASKED_FOR_MINUTES = 10;

export interface Question {
  readonly at: number;
  readonly tool: string;
  readonly asked: string;
}

export const questionFile = (workdir: string): string => path.join(workdir, QUESTION_FILE);

export const answerFile = (workdir: string): string => path.join(workdir, ANSWER_FILE);

export function ask(workdir: string, tool: string, asked: string): void {
  mkdirSync(workdir, { recursive: true });
  rmSync(answerFile(workdir), { force: true });
  writeFileSync(questionFile(workdir), JSON.stringify({ at: Date.now(), tool, asked } satisfies Question));
}

export function questionIn(workdir: string): Question | undefined {
  if (!existsSync(questionFile(workdir))) return undefined;
  try {
    return JSON.parse(readFileSync(questionFile(workdir), 'utf8')) as Question;
  } catch {
    return undefined;
  }
}

export function answer(workdir: string, said: string): void {
  writeFileSync(answerFile(workdir), said);
}

export function takeAnswer(workdir: string): string | undefined {
  if (!existsSync(answerFile(workdir))) return undefined;
  const said = readFileSync(answerFile(workdir), 'utf8').trim();
  rmSync(answerFile(workdir), { force: true });
  rmSync(questionFile(workdir), { force: true });
  return said === '' ? undefined : said;
}

export function stopAsking(workdir: string): void {
  rmSync(questionFile(workdir), { force: true });
  rmSync(answerFile(workdir), { force: true });
}

export const answeredBy = (said: string): string => `The engine worker was asked and says: ${said}\n\nTake that as the answer and carry on; the engine's own source is still not yours to read.`;

export const nobodyAnswered = (minutes: number): string =>
  `The engine worker was asked and did not answer inside ${String(minutes)} minute(s), so nobody is watching this run.`;

export const ENGINE_IS_OFF_LIMITS =
  "the engine's source is off limits in this run. What may be written in the language is printed by `npm run oracle`, so ask it instead. A reach for the engine is put to the engine worker, who may answer it in a sentence, so say plainly in your next message what you were hoping to find — but it is never a way to read the source, and what comes back is one sentence or nothing.";

export const ASK_LINE = `**The engine's source code is off limits.** Nothing under src/, scripts/ or docs/, and no .ts file, may be read — ${ENGINE_IS_OFF_LIMITS}`;

export const BRIEF_IS_NOT_AUTHORITATIVE =
  'Nothing in the brief is authoritative about what already exists. It says what to build and why, and where it names an id, a route, a module or a dependency, that is a guess by somebody who was not looking at the world when they wrote it. Check before you lean on one: the corpus and the oracle are what is true.';

export const waitForAnswer = async (
  workdir: string,
  minutes: number,
  every: number,
  sleep: (ms: number) => Promise<void>,
  now: () => number = Date.now,
): Promise<string | undefined> => {
  const until = now() + minutes * 60_000;
  for (;;) {
    const said = takeAnswer(workdir);
    if (said !== undefined) return said;
    if (now() >= until) return undefined;
    await sleep(every);
  }
};
