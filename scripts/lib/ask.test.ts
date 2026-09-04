import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { answer, ask, questionIn, stopAsking, takeAnswer, waitForAnswer } from './ask';

describe('a run standing still on a question', () => {
  let workdir = '';

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), 'universalis-ask-'));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it('has asked nothing until it asks, so a watcher does not invent a question', () => {
    expect(questionIn(workdir)).toBeUndefined();
  });

  it('says what it reached with and for, since that is the whole of what the answer is about', () => {
    ask(workdir, 'Bash', 'grep -rn "replenish" src/');

    expect(questionIn(workdir)).toMatchObject({ tool: 'Bash', asked: 'grep -rn "replenish" src/' });
  });

  it('takes an answer once and leaves nothing behind, so the next reach is a new question', () => {
    ask(workdir, 'Read', 'src/runtime/session.ts');
    answer(workdir, 'It was just implemented; the flag is --world.');

    expect(takeAnswer(workdir)).toBe('It was just implemented; the flag is --world.');
    expect(takeAnswer(workdir)).toBeUndefined();
    expect(questionIn(workdir)).toBeUndefined();
  });

  it('reads an empty answer as no answer, rather than telling the run nothing in a sentence', () => {
    ask(workdir, 'Read', 'a.ts');
    answer(workdir, '   ');

    expect(takeAnswer(workdir)).toBeUndefined();
  });

  it('waits until the answer lands and returns it', async () => {
    ask(workdir, 'Read', 'a.ts');
    const waiting = waitForAnswer(workdir, 5, 1, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    answer(workdir, 'yes, and it is called on refused:');

    await expect(waiting).resolves.toBe('yes, and it is called on refused:');
  });

  it('gives up after the minutes it was given, so an unwatched run is delayed and not stopped', async () => {
    ask(workdir, 'Read', 'a.ts');
    let clock = 0;
    const said = await waitForAnswer(
      workdir,
      10,
      1,
      async () => {
        clock += 60_000;
      },
      () => clock,
    );

    expect(said).toBeUndefined();
  });

  it('clears a question nobody answered, so the next watcher is not shown a stale one', () => {
    ask(workdir, 'Read', 'a.ts');
    stopAsking(workdir);

    expect(questionIn(workdir)).toBeUndefined();
  });
});
