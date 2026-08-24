import { printDirective, type Directive } from '../content/sections/test';

// Watching a recorded run happen. The engine's half of this is walkTest, which steps a `# test`
// against a session; this is the half about a person watching — how fast, how far, what each step
// reads as, and which page of the app the run was on when it took that step.

// Seconds between steps while a replay runs itself. A replay is watched rather than run, so the
// figures are what a person can follow, not what the engine can manage.
export const REPLAY_SPEEDS: readonly number[] = [0.1, 0.3, 1, 3];

export const REPLAY_SPEED = 0.3;

// What a step is, for a reader rather than for the engine: a line the game took, something the
// player said about it, a move between the app's own pages, or the mark saying the line above
// bounced. The engine has no such division — it is the reader who needs one.
export type StepKind = 'played' | 'said' | 'moved' | 'refused';

export const stepKind = (directive: Directive): StepKind => {
  if (directive.kind === 'note') return 'said';
  if (directive.kind === 'page') return 'moved';
  if (directive.kind === 'refused') return 'refused';
  return 'played';
};

export interface ReplayLine {
  readonly at: number;
  readonly kind: StepKind;
  // The step in the words the file writes it in. A replay shows a run in its own language, so what
  // is watched and what is read afterwards are the same lines.
  readonly text: string;
}

export const replayLines = (steps: readonly Directive[]): ReplayLine[] => steps.map((directive, at) => ({ at, kind: stepKind(directive), text: printDirective(directive) }));

export const clamped = (at: number, steps: readonly unknown[]): number => Math.max(0, Math.min(steps.length, Math.round(at)));

export interface Standing {
  readonly at: number;
  readonly steps: readonly unknown[];
  readonly failure: string | null;
}

// A replay running itself stops where the record runs out, and where the record and the world have
// parted. Carrying on past a divergence would be feeding an old script to a world that has stopped
// answering to it, which reads as a replay working while it says nothing true.
export const advances = (standing: Standing): boolean => standing.failure === null && standing.at < standing.steps.length;

export interface Where {
  readonly layer: string;
  readonly subpage: string;
}

// Which page of the app the run was on at a given step: the last one it moved to at or before that
// step. The page is a function of the cursor exactly as the game state is, so scrubbing backwards
// lands on the page the author was looking at rather than the last one the replay walked through.
export function pageAt(steps: readonly Directive[], at: number): Where | null {
  for (let index = clamped(at, steps) - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.kind === 'page') return { layer: step.layer, subpage: step.subpage };
  }
  return null;
}
