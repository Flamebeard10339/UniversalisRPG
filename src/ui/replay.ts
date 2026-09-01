import { printDirective, type Directive } from '../content/sections/test';

export const REPLAY_SPEEDS: readonly number[] = [0.1, 0.3, 1, 3];

export const REPLAY_SPEED = 0.3;

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
  readonly text: string;
}

export const replayLines = (steps: readonly Directive[]): ReplayLine[] => steps.map((directive, at) => ({ at, kind: stepKind(directive), text: printDirective(directive) }));

export const clamped = (at: number, steps: readonly unknown[]): number => Math.max(0, Math.min(steps.length, Math.round(at)));

export interface Standing {
  readonly at: number;
  readonly steps: readonly unknown[];
  readonly failure: string | null;
}

export const advances = (standing: Standing): boolean => standing.failure === null && standing.at < standing.steps.length;

export interface Where {
  readonly layer: string;
  readonly subpage: string;
}

export function pageAt(steps: readonly Directive[], at: number): Where | null {
  for (let index = clamped(at, steps) - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.kind === 'page') return { layer: step.layer, subpage: step.subpage };
  }
  return null;
}
